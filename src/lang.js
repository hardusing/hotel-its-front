// 言語の決定・DOM への適用・URL への反映。
//
// 「いまどの言語か」を持つのは i18n/index.js（setLocale / getLocale）で、
// このファイルはそこに乗る DOM 側の層に徹する。
//
// 以前はここに applyLanguage() があり、「言語を変える」＝「data-i18n を
// 走査して差し替える」だった。そのため翻訳が当たるのは、走査した瞬間に
// 存在する要素だけで、JS が後から組み立てるカード・モーダル・カレンダーは
// 日本語のまま取り残されていた。しかも取り残しに気付くたび、applyLanguage の
// 末尾に「あれも直す」を足していく形になっていた。
//
// いまは向きが逆になっている。言語の変更を知らせるのは setLocale で、
// data-i18n の走査は onLocaleChange に登録された購読者の 1 つでしかない。
// 静的な HTML はこの購読者が、動的に描かれる部分は各モジュールが自分の
// 購読で面倒を見る。どちらも同じ 1 つの通知にぶら下がるので、
// 「言語を変えたのにここだけ変わらない」を 1 か所で足し忘れることがない。

import {
  t,
  setLocale,
  getLocale,
  onLocaleChange,
  isSupportedLocale,
  getTextDirection,
  devLog,
} from './i18n/index.js';
import { detectLocale, storeLocale, LOCALE_SOURCES } from './i18n/detect.js';

// 言語変更の購読解除。initLanguage を 2 度呼んでも購読が積み上がらないよう持つ。
let unsubscribeDomListener = null;

// 属性を翻訳するときの指定を分解する。
// data-i18n-attr="aria-label:common.close" のように "属性名:キー" を並べ、
// 複数あればセミコロンで区切る。
//
// textContent と属性で仕組みを分けているのは、翻訳が要る属性
// （aria-label・placeholder・title・meta の content）が要素ごとに違い、
// 「この要素のどの属性か」を HTML 側に書かせないと決められないため。
function parseAttrSpec(spec) {
  return spec
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf(':');
      if (index < 0) return null;
      return {
        attr: part.slice(0, index).trim(),
        key: part.slice(index + 1).trim(),
      };
    })
    .filter((pair) => pair && pair.attr && pair.key);
}

/**
 * data-i18n / data-i18n-attr を持つ要素を、現在の言語に合わせる。
 *
 * 差し込みは textContent と setAttribute だけで行い、innerHTML は使わない。
 * 辞書の値が将来 CMS 由来になったとき、HTML として解釈される経路が
 * 1 つでも残っていると、そこがそのまま持ち込みの入口になる。
 *
 * @param {ParentNode} [root] 走査の起点。既定は document 全体。
 *   後から DOM に差し込む部品（予約モーダル）は、差し込んだ直後に
 *   自分の要素を渡して呼ぶ。文書全体の走査を待つ形にすると、
 *   差し込みの順番によって翻訳が当たったり当たらなかったりする。
 */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });

  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    parseAttrSpec(el.dataset.i18nAttr).forEach(({ attr, key }) => {
      el.setAttribute(attr, t(key));
    });
  });
}

/**
 * 文書そのものが持つ言語の情報を、現在の言語に合わせる。
 *
 * ここで扱うのは data-i18n では表せないもの ＝ 要素の中身ではなく
 * 文書の属性やメタ情報。翻訳対象のテキストを 1 つも持たないページ
 * （キャンペーン LP）でも、これらは正しくなければならない。
 */
function applyDocumentLanguage() {
  const locale = getLocale();
  const root = document.documentElement;

  // 読み上げの発音と、ブラウザの翻訳提案の判断材料になる。
  root.lang = locale;

  // 文字を書き進める向き。いまの対応言語はどちらも ltr なので表示は
  // 変わらないが、属性は常に出しておく。RTL の言語を足す日に
  // 「dir をどこで出すか」を探さずに済む。
  root.dir = getTextDirection(locale);

  // <title> は textContent を持つので data-i18n でも差し替わるが、
  // タブに出る名前は document.title を通した方が確実なので明示する。
  document.title = t('meta.title');

  // og:locale は "ja_JP" の形で、<html lang> の値とは別物。
  // data-i18n-attr ではなくここで書くのは、LP のように data-i18n を
  // 1 つも持たないページでも更新する必要があるため。
  const ogLocale = document.querySelector('meta[property="og:locale"]');
  if (ogLocale) ogLocale.setAttribute('content', t('meta.ogLocale'));

  // 言語ボタンが無いページ（キャンペーン LP）では単に 0 件になる。
  document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
    btn.classList.toggle('lang-switch__btn--active', btn.dataset.lang === locale);
  });
}

/**
 * 表示言語を決めて画面に適用し、以降の言語変更も拾えるようにする。
 *
 * 起動時に 1 度だけ呼ぶ。手順は次の 3 つで、順番に意味がある。
 *
 *   1. 購読を先に登録する。setLocale より後に登録すると、その setLocale が
 *      起こした通知を受け取れず、初期表示だけ翻訳が当たらない。
 *   2. 言語を決めて setLocale する。
 *   3. 変化が無かった場合（決まった言語が既定の ja と同じ）に備えて、
 *      最後に 1 度自分で当て込む。setLocale は「本当に変わったとき」しか
 *      通知しないので、これが無いと <html lang> や dir が初期表示で
 *      置いていかれる。
 *
 * 自動判定の結果は保存しない（理由は i18n/detect.js の storeLocale を参照）。
 *
 * @param {Object} [options]
 * @param {?string} [options.paramLang] URL の ?lang= を解釈した値
 * @returns {{locale: string, source: string}} 決定の結果
 */
export function initLanguage(options = {}) {
  const { paramLang = null } = options;

  // 購読は 1 回だけ張る。initLanguage が 2 度呼ばれても購読者が増えないよう、
  // 解除する関数を持っておいて張り直す。解除できる形にしておかないと、
  // 呼び出しの回数だけ同じ走査が走り、要素の数に比例して無駄が増える。
  if (unsubscribeDomListener) unsubscribeDomListener();
  unsubscribeDomListener = onLocaleChange(() => {
    applyDocumentLanguage();
    applyTranslations();
  });

  const decision = detectLocale({ paramLang });

  // 翻訳対象を 1 つも持たないページ（キャンペーン LP）では、ブラウザ設定の
  // 推測だけを根拠に表示言語を切り替えない。日本語のまま表示される内容に
  // lang="en" が付くと、読み上げの発音がその時点で崩れる。
  // URL で明示された場合は、訳が無くてもその指定に従う。
  const translatable = document.querySelector('[data-i18n]') !== null;
  if (decision.source === LOCALE_SOURCES.URL || translatable) {
    setLocale(decision.locale);
  } else {
    devLog(
      `翻訳対象を持たないページなので、${decision.locale}（${decision.source}）は適用しません`,
    );
  }

  applyDocumentLanguage();
  applyTranslations();

  return decision;
}

// URL のクエリパラメータ（?lang=...）を現在の言語に書き換える。
//
// 履歴を増やさないよう replaceState を使う。pushState にすると、
// 言語を切り替えた回数だけ「戻る」を押させることになる。
//
// 呼ぶのは明示的な切り替えのときだけ。自動判定の結果まで URL に書くと、
// その URL を共有された相手が「送り主のブラウザ設定」で開くことになる。
export function updateUrlParam(lang) {
  const url = new URL(window.location.href);
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url);
}

/**
 * 言語切り替えボタンを配線する。ボタンが無いページでは何もしない。
 *
 * ここが「明示的な切り替え」の唯一の入口。利用者がこのサイトについて
 * 下した決定なので、ここでだけ保存する。
 */
export function initLangSwitch() {
  document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      // 対応していない言語なら setLocale は何もしない。それでも
      // URL だけ書き換えると、?lang=xx が付いた URL を共有した相手が
      // 「指定は効いていないのに指定が載っている」状態を受け取ることになる。
      // 画面と URL は必ず同時に変える。
      if (!isSupportedLocale(lang)) return;

      setLocale(lang);
      updateUrlParam(lang);
      storeLocale(lang);
    });
  });
}
