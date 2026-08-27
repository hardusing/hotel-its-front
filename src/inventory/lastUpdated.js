// 在庫を最後に取得できた時刻の表示。
// 在庫はポーリングで数十秒遅れて届く値なので、「いつ時点のものか」を
// 添えないと、画面の数字をどこまで信用してよいか利用者に判断できない。
// とくに通信が途切れているときは、古い数字が最新の顔をして残り続ける。

// これ以上古くなったら色を薄くする。バックオフの上限（5分）と揃えてあり、
// 「正常なら必ず更新されているはずの間隔」を過ぎたことを意味する。
const STALE_AFTER_MS = 5 * 60 * 1000;

// 古さの再判定の間隔。表示している時刻そのものは変わらなくても、
// 時間の経過だけで stale になるため、更新が止まった後も見直す必要がある。
const RECHECK_INTERVAL_MS = 30 * 1000;

const STALE_CLASS = 'rooms__updated--stale';

let el = null;
let lastUpdatedAt = null;
let recheckTimer = null;

// 表示に使うロケール。言語切り替え（<html lang>）に追随させる。
function currentLocale() {
  return (typeof document !== 'undefined' && document.documentElement.lang) || 'ja';
}

// 時刻部分だけを地域慣習に沿って整形する。
// 手で ':' を組み立てると 12/24 時間制の違いを取りこぼす。
function formatTime(date) {
  return new Intl.DateTimeFormat(currentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// いまの lastUpdatedAt を画面へ反映する。
function render() {
  if (!el) return;

  if (!lastUpdatedAt) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove(STALE_CLASS);
    return;
  }

  el.textContent = `最終更新 ${formatTime(lastUpdatedAt)}`;
  el.hidden = false;
  // 経過時間で判定する。表示中の時刻が変わらなくても古くはなっていく。
  el.classList.toggle(STALE_CLASS, Date.now() - lastUpdatedAt.getTime() >= STALE_AFTER_MS);
}

/**
 * 表示先の要素を掴む（起動時に一度だけ）。
 */
export function initLastUpdated() {
  el = document.getElementById('rooms-updated');
  render();
}

/**
 * 取得できた時刻を記録して表示を更新する。
 *
 * @param {string|Date} value サーバーの updatedAt（ISO 文字列）または Date
 */
export function setLastUpdated(value) {
  // new Date() に何でも渡さない。null / 0 / '' / false は Invalid Date にならず
  // 1970-01-01 として通ってしまい、「最終更新 09:00」のような嘘の時刻が出る。
  // API が返す updatedAt は ISO 文字列なので、受け取る型をそこまで絞る。
  let date = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' && value !== '') {
    date = new Date(value);
  }

  // 形式が合っていても解釈できない文字列は Invalid Date になる。
  if (!date || Number.isNaN(date.getTime())) return;

  lastUpdatedAt = date;
  render();
  startRecheck();
}

// 時間の経過だけで stale になるので、更新が止まった後も定期的に見直す。
// 中身はクラスの付け外しだけで、通信も再描画も伴わない。
function startRecheck() {
  if (recheckTimer !== null) return;
  recheckTimer = setInterval(render, RECHECK_INTERVAL_MS);
}

/**
 * 表示を今の状態で組み直す。
 * 言語切り替えで <html lang> が変わったときに、時刻の書式を追随させる用途。
 */
export function refreshLastUpdated() {
  render();
}

/**
 * 再判定タイマーを止める（後片付け・テスト用）。
 */
export function destroyLastUpdated() {
  if (recheckTimer !== null) {
    clearInterval(recheckTimer);
    recheckTimer = null;
  }
  lastUpdatedAt = null;
  render();
}
