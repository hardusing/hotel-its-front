// いまの予約条件を URL に書き戻す。
//
// 目的は 2 つ。リロードしても条件が消えないこと、URL をそのまま人に渡せること。
// 履歴は増やさない（pushState は使わない）。日付や人数を変えるたびに履歴が
// 積まれると、戻るボタンが「1 つ前の条件」を延々と辿る操作になり、
// ページから出るために何十回も押させることになる。

import { parseDeepLink, buildDeepLink } from './params.js';
import { todayStr } from '../booking';

/**
 * 予約条件を URL に反映する。
 *
 * 計測パラメータと言語は現在の URL から引き継ぐ。
 * - utm を落とすと、広告から来た人の以降の遷移で流入元が消える。
 * - lang の書き込みは lang.js（言語切り替え）の担当なので、ここでは
 *   いま付いている値をそのまま持ち回るだけにする。書き手を 2 つにしない。
 *
 * @param {?Object} booking { room, checkIn, checkOut, guests, promo }。
 *   null を渡すと予約条件だけを URL から取り除く（モーダルを閉じたとき）。
 * @returns {string} 反映後の URL 全体
 */
export function syncDeepLinkUrl(booking) {
  const today = todayStr();

  // 現在の URL から引き継ぐ分を取り出す。計測パラメータの許可リストと
  // 上限の判断は params.js に任せる（ここで別の規則を持たない）。
  const current = parseDeepLink(window.location.search, { today });

  const next = {
    booking: { ...(booking || {}), lang: current.booking.lang },
    tracking: current.tracking,
  };

  const url = new URL(window.location.href);
  // search を丸ごと置き換える。個別に delete していくと、
  // 条件が減ったとき（クーポンを外したときなど）に消し忘れが残る。
  url.search = buildDeepLink(next, { today });
  window.history.replaceState({}, '', url);

  return url.toString();
}
