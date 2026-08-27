// 料金計算の境界値テスト。追加パッケージは使わず node:test で動かす。
// package.json に "type": "module" があるので、src/ の ESM をそのまま import できる。
//
// 期待値は全て手計算で出したものを直書きしている。
// 実装の出力を貼り直してはいけない（それでは何も検証したことにならない）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrice } from '../src/pricing/calculator.js';
import { mockPricingRules } from '../src/mock/pricingRules.js';
import { toNightlyDisplayPrice } from '../src/pricing/displayPrice.js';

const TODAY = '2026-08-27';

// 4名まで泊まれる標準的な部屋。単価は手計算しやすい 20,000 円にしてある。
const ROOM = { id: 1, name: 'テスト部屋', price: 20000, capacity: 4 };

// 割引条件を意図的に外した日程（29日後・2泊）。割引の影響を受けたくないケースで使う。
const NO_DISCOUNT_IN = '2026-09-10';
const NO_DISCOUNT_OUT = '2026-09-12';

/** 既定のルールを使い、指定分だけ上書きして計算する。 */
function calc(overrides) {
  return calculatePrice({
    room: ROOM,
    checkIn: NO_DISCOUNT_IN,
    checkOut: NO_DISCOUNT_OUT,
    guests: 2,
    rules: mockPricingRules,
    today: TODAY,
    ...overrides,
  });
}

/** 端数処理の方式だけ差し替えたルールを作る。 */
function rulesWithRounding(mode) {
  return {
    ...mockPricingRules,
    discounts: { ...mockPricingRules.discounts, rounding: mode },
  };
}

// --- 基本ケース -------------------------------------------------------------
test('基本ケース: 基準人数2名・2泊・割引なし', () => {
  // 手計算：
  //   室料      20,000 × 2泊               = 40,000
  //   人数調整  2名は基準ちょうどなので     ±0
  //   割引      29日前・2泊なのでどれも不成立 = 0
  //   サービス料 40,000 × 10%              = 4,000
  //   課税対象  40,000 + 4,000             = 44,000
  //   消費税    44,000 × 10%               = 4,400
  //   宿泊税    40,000 ÷ 2泊 ÷ 2名 = 10,000 → 100円 × 2名 × 2泊 = 400
  //   合計      44,000 + 4,400 + 400       = 48,800
  const r = calc({});
  assert.equal(r.nights, 2);
  assert.equal(r.roomCharge, 40000);
  assert.equal(r.appliedDiscount, null);
  assert.equal(r.discountAmount, 0);
  assert.equal(r.serviceCharge, 4000);
  assert.equal(r.taxableBase, 44000);
  assert.equal(r.consumptionTax, 4400);
  assert.equal(r.accommodationTax, 400);
  assert.equal(r.total, 48800);
});

test('基本ケース: 日別内訳が泊数分あり、明細行の合計が総額と一致する', () => {
  const r = calc({});
  assert.equal(r.nightly.length, 2);
  assert.deepEqual(r.nightly.map((n) => n.date), ['2026-09-10', '2026-09-11']);
  assert.equal(r.nightly[0].subtotal, 20000);

  // 合計行を除いた明細の総和が total に一致する（丸めが各行で完結している証拠）。
  const sum = r.lines.filter((l) => l.key !== 'total').reduce((s, l) => s + l.amount, 0);
  assert.equal(sum, r.total);
  assert.equal(r.lines.at(-1).emphasis, true);
});

// --- 人数の境界 -------------------------------------------------------------
// いずれも1泊で比較する。室料だけを見たいので割引の立たない日程を使う。
const ONE_NIGHT = { checkIn: '2026-09-10', checkOut: '2026-09-11' };

test('人数1名: 基準単価から15%引き', () => {
  // 20,000 × 15% = 3,000 → 室料 20,000 - 3,000 = 17,000
  const r = calc({ ...ONE_NIGHT, guests: 1 });
  assert.equal(r.roomCharge, 17000);
  assert.equal(r.nightly[0].singleDiscount, 3000);
});

test('人数2名（基準ちょうど）: 加算も割引もなし', () => {
  const r = calc({ ...ONE_NIGHT, guests: 2 });
  assert.equal(r.roomCharge, 20000);
  assert.equal(r.nightly[0].extraGuestCharge, 0);
  assert.equal(r.nightly[0].singleDiscount, 0);
});

test('人数3名（基準+1名）: 5,000円加算', () => {
  // 20,000 + 5,000 × 1名 = 25,000
  const r = calc({ ...ONE_NIGHT, guests: 3 });
  assert.equal(r.roomCharge, 25000);
  assert.equal(r.nightly[0].extraGuestCharge, 5000);
});

test('人数4名（定員ちょうど）: 5,000円 × 2名を加算し、エラーにしない', () => {
  // 20,000 + 5,000 × 2名 = 30,000
  const r = calc({ ...ONE_NIGHT, guests: 4 });
  assert.equal(r.error, undefined);
  assert.equal(r.roomCharge, 30000);
});

test('人数5名（定員超過）: CAPACITY_EXCEEDED を返し、金額は 0', () => {
  const r = calc({ ...ONE_NIGHT, guests: 5 });
  assert.equal(r.error.code, 'CAPACITY_EXCEEDED');
  assert.equal(r.error.field, 'guests');
  assert.equal(r.total, 0);
  assert.deepEqual(r.lines, []);
});

// --- 割引の境界 -------------------------------------------------------------
test('EARLY30: 29日前は不成立', () => {
  // TODAY 2026-08-27 の29日後 = 2026-09-25
  const r = calc({ checkIn: '2026-09-25', checkOut: '2026-09-27' });
  assert.equal(r.appliedDiscount, null);
  assert.deepEqual(r.rejectedDiscounts, []);
});

test('EARLY30: 30日前ちょうどで成立し、15%引き', () => {
  // TODAY の30日後 = 2026-09-26。室料 20,000 × 2泊 = 40,000 の15% = 6,000
  const r = calc({ checkIn: '2026-09-26', checkOut: '2026-09-28' });
  assert.equal(r.appliedDiscount.code, 'EARLY30');
  assert.equal(r.discountAmount, 6000);
  assert.equal(r.discountedRoomCharge, 34000);
});

test('STAY3: 2泊では不成立', () => {
  const r = calc({ checkIn: '2026-09-10', checkOut: '2026-09-12' });
  assert.equal(r.appliedDiscount, null);
});

test('STAY3: 3泊ちょうどで成立し、10%引き', () => {
  // 20,000 × 3泊 = 60,000 の10% = 6,000
  const r = calc({ checkIn: '2026-09-10', checkOut: '2026-09-13' });
  assert.equal(r.appliedDiscount.code, 'STAY3');
  assert.equal(r.discountAmount, 6000);
});

test('併用不可: 両方成立したら値引き額が大きい EARLY30 だけを適用する', () => {
  // 30日後から3泊。室料 60,000。EARLY30 = 9,000 / STAY3 = 6,000 → EARLY30 を採用。
  const r = calc({ checkIn: '2026-09-26', checkOut: '2026-09-29' });
  assert.equal(r.appliedDiscount.code, 'EARLY30');
  assert.equal(r.discountAmount, 9000);
  assert.deepEqual(r.rejectedDiscounts.map((d) => d.code), ['STAY3']);
  assert.equal(r.rejectedDiscounts[0].amount, 6000);
  assert.equal(r.rejectedDiscounts[0].applied, false);
});

test('WELCOME: 正しいコードで3,000円引き', () => {
  const r = calc({ couponCode: 'WELCOME' });
  assert.equal(r.appliedDiscount.code, 'WELCOME');
  assert.equal(r.discountAmount, 3000);
});

test('無効なコード: 何も適用されず、候補にも入らない', () => {
  const r = calc({ couponCode: 'NOPE' });
  assert.equal(r.appliedDiscount, null);
  assert.deepEqual(r.rejectedDiscounts, []);
});

test('割引額が室料を超える場合: 室料でクランプし、総額をマイナスにしない', () => {
  // 単価 2,000 円の部屋に1名1泊：2,000 - 15%(300) = 1,700 が室料。
  // WELCOME の 3,000 円は室料を超えるので 1,700 に丸められ、割引後室料は 0。
  // 以降のサービス料・消費税・宿泊税も全て 0 になる。
  const cheap = { id: 9, name: '格安', price: 2000, capacity: 2 };
  const r = calc({ ...ONE_NIGHT, room: cheap, guests: 1, couponCode: 'WELCOME' });
  assert.equal(r.roomCharge, 1700);
  assert.equal(r.discountAmount, 1700);
  assert.equal(r.discountedRoomCharge, 0);
  assert.equal(r.serviceCharge, 0);
  assert.equal(r.consumptionTax, 0);
  assert.equal(r.accommodationTax, 0);
  assert.equal(r.total, 0);
});

// --- 宿泊税の段階境界 -------------------------------------------------------
// 2名1泊で判定額 = 室料 ÷ 1泊 ÷ 2名 = 単価の半分。割引が立たない日程を使う。
test('宿泊税: 1人1泊 9,999円は免税', () => {
  // 単価 19,998 → 19,998 ÷ 1 ÷ 2 = 9,999 → 0円
  const r = calc({ ...ONE_NIGHT, room: { ...ROOM, price: 19998 } });
  assert.equal(r.accommodationTax, 0);
});

test('宿泊税: 1人1泊 10,000円で100円', () => {
  // 単価 20,000 → 10,000 → 100円 × 2名 × 1泊 = 200
  const r = calc({ ...ONE_NIGHT, room: { ...ROOM, price: 20000 } });
  assert.equal(r.accommodationTax, 200);
});

test('宿泊税: 1人1泊 14,999円はまだ100円', () => {
  // 単価 29,998 → 14,999 → 100円 × 2名 × 1泊 = 200
  const r = calc({ ...ONE_NIGHT, room: { ...ROOM, price: 29998 } });
  assert.equal(r.accommodationTax, 200);
});

test('宿泊税: 1人1泊 15,000円で200円', () => {
  // 単価 30,000 → 15,000 → 200円 × 2名 × 1泊 = 400
  const r = calc({ ...ONE_NIGHT, room: { ...ROOM, price: 30000 } });
  assert.equal(r.accommodationTax, 400);
});

// --- 端数処理 ---------------------------------------------------------------
// 単価 12,343 円・2名1泊。サービス料と消費税の両方に端数が出る。
//   floor: SC 1,234.3→1,234 / 課税対象 13,577 / 消費税 1,357.7→1,357 / 合計 14,934
//   round: SC 1,234.3→1,234 / 課税対象 13,577 / 消費税 1,357.7→1,358 / 合計 14,935
//   ceil : SC 1,234.3→1,235 / 課税対象 13,578 / 消費税 1,357.8→1,358 / 合計 14,936
// 宿泊税は 12,343 ÷ 2 = 6,171.5 で、どの丸めでも免税帯に収まるため 0 円。
const ODD_ROOM = { id: 8, name: '端数部屋', price: 12343, capacity: 4 };

test('端数処理 floor: 合計 14,934', () => {
  const r = calc({ ...ONE_NIGHT, room: ODD_ROOM, rules: rulesWithRounding('floor') });
  assert.equal(r.serviceCharge, 1234);
  assert.equal(r.consumptionTax, 1357);
  assert.equal(r.accommodationTax, 0);
  assert.equal(r.total, 14934);
});

test('端数処理 round: 合計 14,935', () => {
  const r = calc({ ...ONE_NIGHT, room: ODD_ROOM, rules: rulesWithRounding('round') });
  assert.equal(r.serviceCharge, 1234);
  assert.equal(r.consumptionTax, 1358);
  assert.equal(r.total, 14935);
});

test('端数処理 ceil: 合計 14,936', () => {
  const r = calc({ ...ONE_NIGHT, room: ODD_ROOM, rules: rulesWithRounding('ceil') });
  assert.equal(r.serviceCharge, 1235);
  assert.equal(r.consumptionTax, 1358);
  assert.equal(r.total, 14936);
});

// --- 異常系 -----------------------------------------------------------------
test('同日チェックアウト: INVALID_DATES', () => {
  const r = calc({ checkIn: '2026-09-10', checkOut: '2026-09-10' });
  assert.equal(r.error.code, 'INVALID_DATES');
  assert.equal(r.nights, 0);
  assert.equal(r.total, 0);
});

test('日付の逆転: INVALID_DATES', () => {
  const r = calc({ checkIn: '2026-09-12', checkOut: '2026-09-10' });
  assert.equal(r.error.code, 'INVALID_DATES');
  assert.equal(r.total, 0);
});

test('0名: INVALID_GUESTS', () => {
  const r = calc({ guests: 0 });
  assert.equal(r.error.code, 'INVALID_GUESTS');
  assert.equal(r.error.field, 'guests');
  assert.equal(r.total, 0);
});

test('ルール未取得: MISSING_RULES', () => {
  const r = calc({ rules: null });
  assert.equal(r.error.code, 'MISSING_RULES');
  assert.equal(r.total, 0);
});

// --- セルフレビューで追加した回帰テスト -------------------------------------
test('クーポンコードは小文字・前後の空白があっても適用される', () => {
  // 正規化を calculatePrice の内部に寄せたことの確認。
  // 呼び出し側が整形しなくても、同じ割引が同じ額で立つ。
  const r = calc({ couponCode: '  welcome  ' });
  assert.equal(r.appliedDiscount.code, 'WELCOME');
  assert.equal(r.discountAmount, 3000);
});

test('日別単価を渡した場合、泊ごとに違う単価で室料を積み上げる', () => {
  // カレンダーのセルと内訳の合計を一致させるための経路。
  // 20,000 + 23,000 = 43,000（既定単価 20,000 × 2泊 = 40,000 とは異なる）
  const r = calc({
    nightlyRates: [
      { date: '2026-09-10', price: 20000 },
      { date: '2026-09-11', price: 23000 },
    ],
  });
  assert.equal(r.nightly[1].baseRate, 23000);
  assert.equal(r.roomCharge, 43000);
});

test('単価の税込表示は、同じ額を1泊1名分として計算した内訳と一致する', () => {
  // カード／カレンダーの単価（applyTaxes）と内訳（calculatePrice）が
  // 同じ処理を通っていることの確認。宿泊税は単価に含めないので差し引く。
  const price = 12343;
  const shown = toNightlyDisplayPrice(price, mockPricingRules);
  const r = calc({
    ...ONE_NIGHT,
    room: { id: 7, name: '検証', price, capacity: 4 },
    guests: 2,
  });
  assert.equal(shown, r.total - r.accommodationTax);
});
