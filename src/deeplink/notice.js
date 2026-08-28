// ディープリンクで自動適用した内容を知らせる通知バー。
//
// 黙って日付やクーポンが入っていると、利用者は「自分が選んだつもりのない条件」で
// 金額を見ることになる。かといって確認ダイアログで止めると、広告から来た人に
// 最初の 1 アクションを強いることになる。適用は済ませたうえで、
// 何をしたかを控えめに出し、その場で取り消せるようにする。

import { t } from '../i18n/index.js';

const NOTICE_ID = 'deeplink-notice';

/**
 * 通知バーを表示する。
 *
 * @param {Object} options
 * @param {Array<string>} options.items 適用した内容の説明（例: '9/12〜9/14'）
 * @param {Function} options.onCancel 「取り消す」が押されたときに呼ばれる
 * @returns {?{remove: Function}}
 */
export function showDeepLinkNotice({ items, onCancel }) {
  if (!items || items.length === 0) return null;

  // 二重に出さない（言語だけ先に適用してから再度呼ばれる場合に備える）。
  const previous = document.getElementById(NOTICE_ID);
  if (previous) previous.remove();

  const el = document.createElement('div');
  el.className = 'deeplink-notice';
  el.id = NOTICE_ID;
  // role="status" は割り込まずに読み上げられる。適用はすでに済んでおり、
  // 利用者の操作を止める必要がないので alert ではなく status にする。
  el.setAttribute('role', 'status');

  const text = document.createElement('p');
  text.className = 'deeplink-notice__text';
  // 項目の区切りも言語で変わる（日本語は中黒、英語はカンマ）ので辞書から引く。
  text.textContent = t('notice.applied', { items: items.join(t('notice.separator')) });
  el.appendChild(text);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'deeplink-notice__cancel';
  cancelBtn.textContent = t('notice.cancel');
  cancelBtn.addEventListener('click', () => {
    el.remove();
    onCancel();
  });
  el.appendChild(cancelBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'deeplink-notice__close';
  closeBtn.setAttribute('aria-label', t('notice.close'));
  closeBtn.textContent = '×';
  // 閉じるだけ。適用した内容はそのまま残す（取り消しとは別の操作）。
  closeBtn.addEventListener('click', () => el.remove());
  el.appendChild(closeBtn);

  // 画面上部に出す。body の先頭に入れるので、ページ側の構造に依存しない。
  document.body.insertBefore(el, document.body.firstChild);

  return {
    remove() {
      el.remove();
    },
  };
}
