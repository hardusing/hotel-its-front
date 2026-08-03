import './style.css';
import { translations } from './i18n';
import { renderRooms } from './renderRooms';
import { initRoomModal } from './roomModal';

const langButtons = document.querySelectorAll('.lang-switch__btn');

function applyLanguage(lang) {
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

  // 選択中の言語ボタンを強調表示
  langButtons.forEach((btn) => {
    btn.classList.toggle('lang-switch__btn--active', btn.dataset.lang === lang);
  });
}

// URL のクエリパラメータ（?lang=...）を現在の言語に書き換える。
// 履歴を増やさないよう replaceState を使う。
function updateUrlParam(lang) {
  const url = new URL(window.location.href);
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url);
}

langButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    applyLanguage(btn.dataset.lang);
    updateUrlParam(btn.dataset.lang);
  });
});

// ブラウザの言語設定から初期表示言語を決定する。
// 日本語環境（ja, ja-JP など）なら JP、それ以外は EN。
function detectLanguage() {
  const browserLang = navigator.language || 'en';
  return browserLang.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

// 初期表示言語を決定する。
// 1. URL の ?lang=（対応言語のみ有効）
// 2. なければブラウザの言語検出にフォールバック
function resolveInitialLanguage() {
  const param = new URLSearchParams(window.location.search).get('lang');
  if (param && translations[param]) {
    return param;
  }
  return detectLanguage();
}

applyLanguage(resolveInitialLanguage());

// 客室詳細モーダルを初期化し、客室一覧を API（現在はモック）から取得して描画する。
// OUT_OF_STOCK 時は在庫が変わったとみなして一覧を再取得する。
initRoomModal({ onStockChange: renderRooms });
renderRooms();
