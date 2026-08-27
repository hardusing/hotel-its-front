// 言語の決定・適用・URL への反映。
//
// もともと index.js に直接書いていたものを、そのままここへ移した。
// ディープリンク（?lang=）からも同じ切り替えを呼ぶ必要があり、
// 呼び出し口が 2 つになった時点で実装を 2 つ持つ理由が無くなったため。
// トップページの言語ボタンも、ディープリンクも、入口はこのモジュールに揃える。

import { translations } from './i18n';
import { refreshLastUpdated } from './inventory/lastUpdated';

/**
 * 指定した言語を画面に適用する。
 * 対応していない言語は何もしない（呼び出し側で弾く必要はない）。
 *
 * @param {string} lang 'ja' | 'en'
 */
export function applyLanguage(lang) {
  const dict = translations[lang];
  if (!dict) return;

  // data-i18n を持つ全要素のテキストを差し替える
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) {
      el.textContent = dict[key];
    }
  });

  // <html lang="..."> も更新
  document.documentElement.lang = lang;

  // 選択中の言語ボタンを強調表示。
  // ボタンが無いページ（キャンペーン LP）では単に 0 件になる。
  document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
    btn.classList.toggle('lang-switch__btn--active', btn.dataset.lang === lang);
  });

  // 最終更新時刻は data-i18n では差し替えられない（値が実行時に決まる）ので、
  // <html lang> を変えた後にこちらから書式を作り直す。
  refreshLastUpdated();
}

// URL のクエリパラメータ（?lang=...）を現在の言語に書き換える。
// 履歴を増やさないよう replaceState を使う。
export function updateUrlParam(lang) {
  const url = new URL(window.location.href);
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url);
}

// ブラウザの言語設定から初期表示言語を決定する。
// 日本語環境（ja, ja-JP など）なら JP、それ以外は EN。
function detectLanguage() {
  const browserLang = navigator.language || 'en';
  return browserLang.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

/**
 * 初期表示言語を決定する。
 * 1. URL の ?lang=（対応言語のみ有効）
 * 2. なければブラウザの言語検出にフォールバック
 *
 * @param {?string} [preferred] ディープリンクで解釈済みの言語。
 *   検証は parseDeepLink 側で済んでいるので、あればそれを最優先する。
 */
export function resolveInitialLanguage(preferred) {
  if (preferred && translations[preferred]) return preferred;
  return detectLanguage();
}

/**
 * 言語切り替えボタンを配線する。ボタンが無いページでは何もしない。
 */
export function initLangSwitch() {
  document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      // 対応していない言語なら applyLanguage は何もしない。それでも
      // URL だけ書き換えると、?lang=xx が付いた URL を共有した相手が
      // 「指定は効いていないのに指定が載っている」状態を受け取ることになる。
      // 画面と URL は必ず同時に変える。
      if (!translations[lang]) return;
      applyLanguage(lang);
      updateUrlParam(lang);
    });
  });
}
