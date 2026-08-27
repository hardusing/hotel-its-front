// パース済みのディープリンクを画面に適用する。
//
// URL の解釈は deeplink/params.js（純粋関数）、実際に何をするかはここ、
// という分担にしてある。ここは DOM とアプリの状態を触るが、
// 「どのページか」は知らない。トップページも LP も同じ経路を通る。

import { applyLanguage, resolveInitialLanguage } from '../lang';
import { openRoomModal, setDeepLinkDefaults } from '../roomModal';
import { isBookable } from '../inventory/stockLevel';
import { showDeepLinkNotice } from './notice';

/** 日付の見出し表記（2026-09-12 → 9/12）。通知バーの文言用。 */
function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 無視したパラメータをコンソールに記録する。
 *
 * 画面には出さない。理由は 2 つ。
 * - 利用者にとっては自分の入力ミスではない。広告のリンクが壊れていたことを
 *   知らされても、直せるのは配信側だけで、その場で取れる行動が何も無い。
 * - 「URL の checkin が不正です」のような文言は、初めて来た人に
 *   「このサイトは何か壊れている」という印象だけを残す。適用できなかった項目は
 *   単に既定値のまま出せばよく、画面は普通に使える状態になっている。
 * 配信側が気付く必要はあるので、記録そのものは残す。
 *
 * @param {Array<{param: string, value: string, reason: string}>} invalid
 */
function reportInvalid(invalid) {
  if (!invalid || invalid.length === 0) return;
  invalid.forEach((item) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[deeplink] ignored ?${item.param}=${item.value} — ${item.reason}`
    );
  });
}

/**
 * ディープリンクを画面に適用する。
 *
 * @param {{booking: Object, tracking: Object, invalid: Array}} state
 *   parseDeepLink の戻り値
 * @param {Object} ctx
 * @param {Array<Object>} [ctx.rooms] 描画済みの客室一覧。room の解決に使う。
 *   渡されない、または該当が無ければモーダルは開かない。
 * @returns {{opened: boolean, applied: Array<string>}}
 */
export function applyDeepLink(state, ctx = {}) {
  const { booking, invalid } = state;
  const { rooms = [] } = ctx;

  reportInvalid(invalid);

  // --- 言語 ---------------------------------------------------------------
  // 言語の切り替えは lang.js の 1 実装だけを使う。ここで
  // document.documentElement.lang を直接書くと、ボタン経由と URL 経由で
  // 「言語を変えるとは何をすることか」の定義が 2 つできてしまう。
  //
  // ただし、翻訳対象を持たないページ（キャンペーン LP）でブラウザ判定だけを
  // 根拠に <html lang> を書き換えない。日本語のまま表示される内容に
  // lang="en" が付くと、読み上げの発音がその時点で崩れる。
  // URL で明示された場合は、翻訳が無くてもその指定に従う。
  const translatable = document.querySelector('[data-i18n]') !== null;
  if (booking.lang || translatable) {
    applyLanguage(resolveInitialLanguage(booking.lang));
  }

  // 言語は通知の対象にしない。ボタンで即座に戻せるうえ、
  // 表示言語が変わったことは画面を見れば分かる。
  const applied = [];

  // --- 日付・人数・クーポン -------------------------------------------------
  // モーダルを開いた時点で適用される既定値として預ける。
  const defaults = {
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guests: booking.guests,
    promo: booking.promo,
  };
  const hasDefaults = Object.values(defaults).some((v) => v !== null);
  if (hasDefaults) setDeepLinkDefaults(defaults);

  if (booking.checkIn && booking.checkOut) {
    applied.push(`${shortDate(booking.checkIn)}〜${shortDate(booking.checkOut)}`);
  }
  if (booking.guests) applied.push(`${booking.guests}名`);
  if (booking.promo) applied.push(`クーポン ${booking.promo}`);

  // --- 客室 ---------------------------------------------------------------
  // 予約できない部屋のモーダルは開かない。開いても最初から満室の警告が出て、
  // 「別の客室を見る」を押させるだけになる。一覧を見せた方が早い。
  const room = booking.room
    ? rooms.find((r) => Number(r.id) === Number(booking.room))
    : null;

  let opened = false;
  if (room && isBookable(room.stock)) {
    openRoomModal(room);
    opened = true;
  } else if (booking.room && !room) {
    // eslint-disable-next-line no-console
    console.warn(`[deeplink] room=${booking.room} is not on this page`);
  }

  // --- 通知 ---------------------------------------------------------------
  if (applied.length > 0) {
    showDeepLinkNotice({
      items: applied,
      onCancel: () => {
        // 預けた既定値を捨て、開いているモーダルがあれば素の状態で開き直す。
        // 日付・人数・クーポンを個別に巻き戻すより、初期化の経路を
        // openRoomModal の 1 本に揃える方が、消し忘れが起きない。
        setDeepLinkDefaults(null);
        if (opened && room) openRoomModal(room);
      },
    });
  }

  return { opened, applied };
}
