// 短い結果通知（トースト）。
//
// 成否だけを伝えて自然に消える表示に使う。押して閉じる必要がある通知は
// deeplink/notice.js の側（取り消せる通知バー）を使う。

const DURATION = 2600;

/**
 * トーストを表示する。
 *
 * @param {string} message 表示する文言
 * @param {Object} [options]
 * @param {'success'|'error'} [options.type] 見た目の別（既定: success）
 */
export function showToast(message, options = {}) {
  const { type = 'success' } = options;

  // 連打されたら前のものを片付ける。積み上がると画面を覆う。
  const previous = document.querySelector('.toast');
  if (previous) previous.remove();

  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  // 操作を止めない通知なので alert ではなく status。
  el.setAttribute('role', 'status');
  el.textContent = message;

  document.body.appendChild(el);

  window.setTimeout(() => el.remove(), DURATION);
}
