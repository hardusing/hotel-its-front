// 表示言語を「どう決めるか」と「どう覚えるか」だけを持つモジュール。
//
// 決め方は 4 段の優先順位で、上から順に最初に決まったものを採る。
//
//   1. URL の ?lang=            … その 1 回の訪問に対する明示的な指定
//   2. localStorage に保存した値 … 利用者がこのサイトで下した決定
//   3. navigator.languages       … ブラウザ（OS）の設定からの推測
//   4. 既定の ja                 … 何も分からないときの原文
//
// この順番には理由がある。
//
// URL を最上位に置くのは、?lang=en 付きのリンクを開いた人に英語を見せられないと
// リンクを配る意味がなくなるため。保存値が URL に勝つ作りだと、一度でも
// 日本語を選んだ人には英語のリンクが効かなくなる。
//
// 保存値をブラウザ設定より上に置くのは、こちらが「このサイトについての決定」で、
// ブラウザ設定は「一般的な好みからの推測」だから。日本語環境の人が英語で
// 読むと決めたなら、次に来たときも英語で開くべきで、OS の設定で上書き
// してはいけない。
//
// navigator.languages（複数形）を見るのは、利用者が優先順位を付けて並べた
// 一覧だから。navigator.language 単体は先頭 1 つしか見ないので、
// 「第一希望はフランス語、第二希望は英語」の人に日本語を出してしまう。
//
// DOM には触らない。<html lang> や ?lang= の書き換えは lang.js の役目で、
// ここは「どの言語にすべきか」を答えるところまで。

import { getSupportedLocales, DEFAULT_LOCALE, isSupportedLocale, devLog } from './index.js';

/**
 * 保存先のキー。
 * 他のアプリと同じドメインに載る可能性を考えて接頭辞を付ける。
 */
export const STORAGE_KEY = 'hotel-its.lang';

/** 決定の出どころ。開発時のログと、呼び出し側の判断に使う。 */
export const LOCALE_SOURCES = {
  URL: 'url',
  STORED: 'stored',
  BROWSER: 'browser',
  DEFAULT: 'default',
};

// localStorage は「あるとは限らない」ものとして扱う。
//
// プライベートブラウジング、サイトデータをブロックする設定、
// 埋め込み iframe の制限などで、参照した瞬間に例外を投げる環境がある。
// 言語を覚えられないのは不便だが、そのせいでページ全体が落ちるのは論外なので、
// 読み書きの両方を必ず包む。
function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 保存済みの言語を読む。
 * 保存されていない、読めない、対応していない値なら null。
 *
 * @returns {?string}
 */
export function readStoredLocale() {
  const storage = safeStorage();
  if (!storage) return null;

  let value = null;
  try {
    value = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  if (value === null) return null;

  // 保存値も検証する。localStorage は利用者が自由に書き換えられるうえ、
  // 対応言語を減らしたときに古い値が残る。信用して setLocale に渡すと、
  // 辞書の無い言語で開こうとして画面がキー名だらけになる。
  if (!isSupportedLocale(value)) {
    devLog(`保存されていた言語 "${value}" は対応外なので無視します`);
    // 消さずに残す。対応言語を一時的に外して後から戻す場合、消してしまうと
    // 利用者が選んだ設定まで一緒に失われる。無視するだけなら実害は無い。
    return null;
  }

  return value;
}

/**
 * 言語を保存する。
 *
 * 呼ぶのは、利用者が言語ボタンを押したときだけ。
 * URL の ?lang= やブラウザ設定による自動判定では保存しない。理由は 2 つ。
 *
 *   ?lang= は「その人の好み」ではなく「そのリンクの指定」でしかない。
 *   広告や誰かが共有したリンクを 1 度開いただけで、以降ずっとこのサイトが
 *   その言語になるのは行き過ぎで、しかも本人には理由が分からない
 *   （URL のパラメータはもう画面のどこにも見えていない）。
 *
 *   ブラウザ設定からの推測は、そもそも訪問のたびに読み直せる。保存すると
 *   その時点の推測が固定され、あとで OS やブラウザの言語を変えても
 *   古い推測が残り続ける。再計算できる値を保存すると、更新する責任が
 *   こちらに生まれるだけで、得るものがない。
 *
 * 保存してよいのは、画面上の言語ボタンを押すという、このサイトに向けた
 * 明示的な意思表示があったときに限る。
 *
 * @param {string} locale
 * @returns {boolean} 保存できたら true
 */
export function storeLocale(locale) {
  if (!isSupportedLocale(locale)) return false;

  const storage = safeStorage();
  if (!storage) {
    devLog('localStorage が使えないため、言語の選択は保存しません');
    return false;
  }

  try {
    storage.setItem(STORAGE_KEY, locale);
    devLog(`言語の選択を保存しました: ${locale}`);
    return true;
  } catch {
    // 容量超過など。保存できなくても表示は続けられる。
    devLog('言語の選択を保存できませんでした（容量制限など）');
    return false;
  }
}

/**
 * 保存済みの言語を消す。
 * 「ブラウザの設定に従う」へ戻す操作を用意するときの入口。
 *
 * @returns {void}
 */
export function clearStoredLocale() {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
    devLog('保存していた言語を削除しました');
  } catch {
    // 消せなくても実害はない（次回も同じ値で開くだけ）。
  }
}

// ブラウザの言語設定から、対応している言語を 1 つ選ぶ。
//
// navigator.languages は "ja-JP" や "en-GB" のように地域を伴う。
// 前方一致で見るのは、"en-GB" の人に英語を出すため（完全一致だけを見ると
// 対応表に地域ごとの全組み合わせを並べる羽目になる）。
function detectFromBrowser() {
  const list =
    (typeof navigator !== 'undefined' &&
      (navigator.languages || (navigator.language ? [navigator.language] : []))) ||
    [];

  for (const tag of list) {
    if (typeof tag !== 'string') continue;
    const lower = tag.toLowerCase();
    const match = getSupportedLocales().find(
      (locale) => lower === locale || lower.startsWith(`${locale}-`),
    );
    if (match) return { locale: match, tag };
  }

  return null;
}

/**
 * 表示言語を決める。
 *
 * 副作用は開発時のログだけ。保存もしないし、DOM にも触らない
 * （保存するかどうかは呼び出し側が「明示的な切り替えか」で判断する）。
 *
 * @param {Object} [options]
 * @param {?string} [options.paramLang] URL の ?lang= を解釈した値。
 *   検証は parseDeepLink 側で済んでいるが、ここでも対応言語かを確かめる
 *   （この関数を単独で呼んでも安全にするため）。
 * @returns {{locale: string, source: string}}
 *   source は LOCALE_SOURCES のいずれか。呼び出し側が
 *   「自動判定なので保存しない」を判断するのに使う。
 */
export function detectLocale(options = {}) {
  const { paramLang = null } = options;

  // 1. URL
  if (paramLang) {
    if (isSupportedLocale(paramLang)) {
      devLog(`URL の ?lang=${paramLang} を採用しました`);
      return { locale: paramLang, source: LOCALE_SOURCES.URL };
    }
    devLog(`URL の ?lang=${paramLang} は対応外なので次の判定へ進みます`);
  } else {
    devLog('URL に ?lang= の指定はありません');
  }

  // 2. localStorage
  const stored = readStoredLocale();
  if (stored) {
    devLog(`保存されていた言語を採用しました: ${stored}`);
    return { locale: stored, source: LOCALE_SOURCES.STORED };
  }
  devLog('保存された言語はありません');

  // 3. navigator.languages
  const browser = detectFromBrowser();
  if (browser) {
    devLog(`ブラウザの言語設定 "${browser.tag}" から ${browser.locale} を選びました`);
    return { locale: browser.locale, source: LOCALE_SOURCES.BROWSER };
  }
  devLog('ブラウザの言語設定に対応する言語がありません');

  // 4. 既定
  devLog(`既定の ${DEFAULT_LOCALE} を使います`);
  return { locale: DEFAULT_LOCALE, source: LOCALE_SOURCES.DEFAULT };
}
