// ディープリンクの往復テスト。追加パッケージは使わず node:test で動かす。
//
// 「URL に書き戻す → リロードで復元される」を、ブラウザを使わずに確かめる。
// リロードで起きることは buildDeepLink が作った文字列を parseDeepLink が
// 読み直すことに等しいので、その 2 つを繋いで元の条件に戻るかを見る。

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeepLink, buildDeepLink } from '../src/deeplink/params.js';

const TODAY = '2026-08-27';

/** 書き戻し → 読み直し。リロードの往復に相当する。 */
function roundTrip(booking, tracking = {}) {
  const query = buildDeepLink({ booking, tracking }, { today: TODAY });
  return { query, restored: parseDeepLink(query, { today: TODAY }) };
}

test('条件を書き戻した URL は、読み直すと同じ条件に戻る', () => {
  const booking = {
    room: 3,
    checkIn: '2026-09-12',
    checkOut: '2026-09-14',
    guests: 2,
    promo: 'EARLY30',
    lang: 'en',
  };

  const { restored } = roundTrip(booking, { utm_source: 'google' });

  assert.deepEqual(restored.booking, booking);
  assert.deepEqual(restored.tracking, { utm_source: 'google' });
  assert.deepEqual(restored.invalid, []);
});

test('指定していない項目は URL に出ない（短い URL ほど共有されやすい）', () => {
  const { query } = roundTrip({
    room: 1,
    checkIn: null,
    checkOut: null,
    guests: null,
    promo: null,
    lang: null,
  });

  assert.equal(query, 'room=1');
});

test('クーポンを外した条件を書き戻すと、URL から promo が消える', () => {
  const withPromo = roundTrip({ room: 2, guests: 2, promo: 'WELCOME' }).query;
  const without = roundTrip({ room: 2, guests: 2, promo: null }).query;

  assert.ok(withPromo.includes('promo=WELCOME'));
  assert.ok(!without.includes('promo'));
});

test('モーダルを閉じた状態（予約条件なし）でも計測パラメータは残る', () => {
  const { query, restored } = roundTrip(
    { room: null, checkIn: null, checkOut: null, guests: null, promo: null, lang: 'ja' },
    { utm_source: 'mail', utm_campaign: 'remarketing' }
  );

  assert.equal(restored.booking.room, null);
  assert.ok(query.includes('utm_source=mail'));
  assert.ok(query.includes('utm_campaign=remarketing'));
  assert.equal(restored.booking.lang, 'ja');
});

test('書き戻し側でも検証する（読み直すと捨てられる URL を作らない）', () => {
  // 逆転した日付をそのまま渡しても、URL には出さない。
  const { query, restored } = roundTrip({
    room: 2,
    checkIn: '2026-09-14',
    checkOut: '2026-09-12',
  });

  assert.ok(!query.includes('checkin'));
  assert.ok(!query.includes('checkout'));
  assert.equal(restored.invalid.length, 0);
});
