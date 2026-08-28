// 開発用の疑似ロケール。すべての値を 1.4 倍の長さに引き伸ばした辞書を作る。
//
// 何のためか
// ----------
// 翻訳が入るのは開発の終盤で、そのころには画面ができあがっている。
// 「日本語では収まっていたボタンが、ドイツ語で 2 行になって器を突き破る」
// のような壊れ方は、その言語の訳が届いて初めて見つかる。届いたときには
// 直す時間が無い、というのが毎回の順番になる。
//
// 疑似ロケールは、訳を待たずに「いま作っている画面は、いまより長い文言に
// 耐えられるか」を確かめるための道具。実在しない言語なので誰の訳も要らず、
// 画面を作っているその日に試せる。
//
// 何を 1.4 倍するか
// -----------------
// 日本語を起点にはしない。この画面の英語はすでに日本語の平均 1.5 倍、
// 料金の注記に至っては 1.9 倍あるので、日本語の 1.4 倍では英語より短い
// キーが出てしまい、いま実在する言語すら再現できない。
// 基準は「キーごとに、いま存在する訳の中でいちばん長いもの」にする。
// そのうえで 1.4 倍するので、結果は必ず現状の最長を上回る。
//
// 1.4 倍という値は「いま対応している言語より更に長い言語が来る」ことの
// 見積もり。倍率は引数で変えられるので、余裕を見たいときは 2.0 で試す。
//
// 表示のきまり
// ------------
//   ・値の前後を ⟦ ⟧ で囲む。器から溢れて切れたとき、どちらの端が
//     切れたのかが一目で分かる（末尾だけ見ていると気付けない）。
//   ・{name} のプレースホルダは一切触らない。伸ばした結果 {count} が
//     壊れると、確かめたいレイアウトではなく置換の失敗を見ることになる。
//   ・埋める文字は元の文字の幅に合わせる。日本語や中国語の全角文字を
//     半角の記号で伸ばすと、文字数は 1.4 倍でも表示幅はほとんど増えず、
//     肝心の「はみ出すかどうか」が確かめられない。
//
// この辞書は本番に載せない。enablePseudoLocale() は開発時にしか登録せず、
// 本番ビルドでは process.env.NODE_ENV の判定ごと畳まれて消える。

import { registerDictionary, isDevMode, devLog, translations } from './index.js';

/**
 * 疑似ロケールの言語コード。
 * 'qps' は疑似ロケール用に慣習的に使われる私用コードで、実在の言語と
 * ぶつからない。?lang=qps で開ける。
 */
export const PSEUDO_LOCALE = 'qps';

/** 既定の伸長率。 */
export const DEFAULT_FACTOR = 1.4;

// 伸ばす対象から外すキー。
//
// 画面に文として出ない、決まった形の値。伸ばすと単に壊れる。
const EXCLUDED_KEYS = new Set([
  // <meta property="og:locale"> の値。"ja_JP" の形でなければ意味を持たない。
  'meta.ogLocale',
]);

// 全角の文字かどうか。CJK と全角記号をまとめて見る。
const isWide = (ch) => /[　-鿿＀-￯]/.test(ch);

// 埋め草。全角には全角を、半角には半角を足す。
// 「〜」と「~」を使うのは、伸ばされた部分だと見て分かり、かつ
// 行の折り返し位置を余計に増やさないため（英数字を足すと、そこが
// 単語の切れ目になって本来と違う折り返しになる）。
const WIDE_FILLER = '〜';
const NARROW_FILLER = '~';

/**
 * 1 つの値を伸ばす。
 *
 * プレースホルダを境に切り分け、literal の部分だけを伸ばす。
 * 伸ばす量は literal 部分の合計の長さから決めるので、
 * プレースホルダが多い文でも全体としておよそ factor 倍になる。
 *
 * @param {string} text 元の文言
 * @param {number} factor 伸長率
 * @returns {string}
 */
export function stretch(text, factor = DEFAULT_FACTOR) {
  const parts = String(text).split(/(\{\w+\})/);

  // 伸ばす対象は literal だけ（奇数番目はプレースホルダ）。
  const literal = parts.filter((part, i) => i % 2 === 0).join('');
  const extra = Math.max(1, Math.ceil(literal.length * (factor - 1)));

  // 元の文字の幅の比率に合わせて、全角と半角の埋め草を混ぜる。
  const wideCount = [...literal].filter(isWide).length;
  const wideShare = literal.length === 0 ? 0 : wideCount / literal.length;
  const wide = Math.round(extra * wideShare);
  const filler = WIDE_FILLER.repeat(wide) + NARROW_FILLER.repeat(extra - wide);

  // 埋め草は末尾にまとめる。文の途中に挟むと、単語の途中で切れて
  // 折り返しの検証にならない。
  return `⟦${parts.join('')}${filler}⟧`;
}

// 表示上のおよその幅。全角を 2、半角を 1 として数える。
// 文字数で比べると「残り3室」(4) が "3 rooms left" (12) より短いことになり、
// 実際の見た目と逆の判断をする。
const displayWidth = (text) =>
  [...String(text)].reduce((n, ch) => n + (isWide(ch) ? 2 : 1), 0);

/**
 * キーごとに、いちばん長い訳を集めた辞書を作る。
 *
 * @param {Object<string, Object<string, string>>} dicts 言語コード → 辞書
 * @param {Array<string>} [skip] 対象から外す言語（疑似ロケール自身）
 * @returns {Object<string, string>}
 */
export function createWorstCaseBase(dicts, skip = [PSEUDO_LOCALE]) {
  const worst = {};

  for (const [locale, dict] of Object.entries(dicts)) {
    if (skip.includes(locale)) continue;
    for (const [key, value] of Object.entries(dict)) {
      if (
        !Object.hasOwn(worst, key) ||
        displayWidth(value) > displayWidth(worst[key])
      ) {
        worst[key] = value;
      }
    }
  }

  return worst;
}

/**
 * 辞書全体を伸ばした写しを作る。
 *
 * @param {Object<string, string>} base 元の辞書
 * @param {number} [factor] 伸長率
 * @returns {Object<string, string>}
 */
export function createPseudoDictionary(base, factor = DEFAULT_FACTOR) {
  const result = {};
  for (const [key, value] of Object.entries(base)) {
    result[key] = EXCLUDED_KEYS.has(key) ? value : stretch(value, factor);
  }
  return result;
}

/**
 * 疑似ロケールを対応言語として登録する。
 *
 * 登録すると SUPPORTED_LOCALES に入るので、?lang=qps で開けるようになり、
 * setLocale('qps') も通る。言語ボタンには出さない（開発者が URL か
 * コンソールから使うもので、利用者に見せるものではない）。
 *
 * 本番では何もしない。判定をこの中に閉じ込めてあるので、呼び出し側は
 * 環境を気にせず呼べる。
 *
 * @param {number} [factor] 伸長率
 * @returns {boolean} 登録したら true
 */
export function enablePseudoLocale(factor = DEFAULT_FACTOR) {
  if (!isDevMode()) return false;

  const base = createWorstCaseBase(translations);

  registerDictionary(PSEUDO_LOCALE, createPseudoDictionary(base, factor), {
    // Intl には英語として扱わせる。疑似ロケールを Intl に渡しても
    // 対応するデータが無く、金額や日付の書式が実行環境任せになって、
    // 確かめたいレイアウトと違う原因で崩れる。en-US を選ぶのは、
    // 日付が "August 28, 2026" と最も長くなる側だから。
    intlLocale: 'en-US',
    dir: 'ltr',
  });

  devLog(`疑似ロケール ${PSEUDO_LOCALE} を登録しました（${factor} 倍）。?lang=${PSEUDO_LOCALE} で開けます`);
  return true;
}
