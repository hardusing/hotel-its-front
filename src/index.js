import './style.css';
import { translations } from './i18n';
import { renderRooms, applyInventory } from './renderRooms';
import { initRoomModal, notifyInventoryChange } from './roomModal';
import { createInventoryPoller } from './inventory/poller';
import {
  initLastUpdated,
  setLastUpdated,
  refreshLastUpdated,
} from './inventory/lastUpdated';

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

  // 最終更新時刻は data-i18n では差し替えられない（値が実行時に決まる）ので、
  // <html lang> を変えた後にこちらから書式を作り直す。
  refreshLastUpdated();
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
initLastUpdated();

// 在庫の定期取得。取得した値は一覧カードの差分更新と、
// 開いているモーダルへの通知の両方に配る。
const inventoryPoller = createInventoryPoller({
  onUpdate: (payload) => {
    // 取得できた時刻を先に出す。以降の反映で例外が出ても、
    // 「いつのデータか」の表示だけは正しく残る。
    setLastUpdated(payload && payload.updatedAt);
    applyInventory(payload);
    // モーダル側は表示中の部屋だけを見て、それ以外は無視する。
    if (payload && Array.isArray(payload.rooms)) {
      payload.rooms.forEach((item) => notifyInventoryChange(item));
    }
  },
  onError: (err) => {
    // 取得できなかったときは前回の在庫を出したままにする。
    // ポーラー側が間隔を空けて自動で再試行するので、ここでは記録だけ。
    // eslint-disable-next-line no-console
    console.error(err);
  },
});

// 一覧の描画が終わってから開始する。カードが無いうちに在庫が届いても
// 反映先が無く、その回の取得が丸ごと無駄になるため。
// renderRooms は内部で失敗を捕まえるので、描画に失敗しても start は走る
// （反映先が無い間 applyInventory は何もせず、再描画されれば次の取得から乗る）。
renderRooms().then(() => inventoryPoller.start());
