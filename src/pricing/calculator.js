// 料金計算の中心。DOM にも fetch にも依存しない純粋関数として保つ。
//
// 単一の合計金額ではなく内訳オブジェクトを返す理由：
// 1. 明細表示・予約確認・領収書がそれぞれ同じ計算を再実行せずに済み、数字がずれない。
// 2. 「なぜこの金額か」を利用者に示せる。割引の採用/不採用まで返すので
//    「あと1泊で STAY3 が使えます」といった案内も表示側だけで作れる。
// 3. 各ステップの中間値が見えるので、サーバーの確定金額と突き合わせて
//    どの段階で食い違ったかを特定できる（合計だけでは切り分けられない）。
// 4. 丸めを各ステップで完結させた結果をそのまま持つため、
//    明細行の合計と総額が必ず一致する（表示側で再計算しないから）。
// 5. テストが中間値ごとに書け、税率や割引の改定時に壊れた箇所が即座に分かる。
//
// 不正入力を throw ではなく { error } で返す理由：
// 1. 日付や人数の不正は「利用者が入力途中」というごく普通の状態で、例外にすべき異常ではない。
// 2. 呼び出し側は表示更新のたびに呼ぶため、try/catch で囲うより戻り値で分岐する方が素直。
// 3. error.code をそのままフィールドのエラー表示に対応づけられ、文言も表示側で差し替えられる。

import { calcNights, addDays } from '../booking.js';
import { roundAmount } from './rounding.js';
import { applyTaxes } from './taxes.js';

/**
 * 計算対象の客室。price は「基準人数（rules.occupancy.baseGuests）で泊まったときの
 * 1泊単価」であり、nightlyRates が与えられた場合はそちらが優先される。
 *
 * @typedef {object} Room
 * @property {number} id       客室タイプ ID
 * @property {string} name     客室名（lines の label に使う）
 * @property {number} price    既定の1泊単価（円・税抜）
 * @property {number} capacity 定員。guests がこれを超える入力は不正
 */

/**
 * 日別単価。連休・繁忙期で単価が変わるため、泊ごとに単価を持てるようにする。
 * 省略時は全泊 room.price として扱う。
 *
 * @typedef {object} NightlyRate
 * @property {string} date  その泊の宿泊日（チェックイン日から数えて "YYYY-MM-DD"）
 * @property {number} price その日の1泊単価（円・税抜、基準人数分）
 */

/**
 * calculatePrice の入力。today を引数で受け取るのは、EARLY30 の
 * 「30日前まで」判定に現在時刻が要るため。関数内で new Date() を呼ぶと
 * 実行日によって結果が変わり、純粋関数でなくなりテストも書けない。
 *
 * @typedef {object} PriceInput
 * @property {Room} room                        対象客室
 * @property {NightlyRate[]} [nightlyRates]     日別単価。省略時は room.price を全泊に適用
 * @property {string} checkIn                   チェックイン日 "YYYY-MM-DD"
 * @property {string} checkOut                  チェックアウト日 "YYYY-MM-DD"
 * @property {number} guests                    宿泊人数（1 以上 room.capacity 以下）
 * @property {string} [couponCode]              利用者が入力したクーポンコード（WELCOME 等）
 * @property {object} rules                     fetchPricingRules() が返す料金ルール
 * @property {string} today                     基準日 "YYYY-MM-DD"。日数条件の判定に使う
 */

/**
 * 1泊分の内訳。日別単価と人数加算を泊ごとに持つ。
 * 「3泊目だけ単価が高い」といった内訳をそのまま表示できる。
 *
 * @typedef {object} NightBreakdown
 * @property {string} date              その泊の宿泊日
 * @property {number} baseRate          基準人数分の単価（円・税抜）
 * @property {number} extraGuestCharge  追加人数分の加算（円）
 * @property {number} singleDiscount    1名利用割引の減額（円・0 以上の正の値で保持）
 * @property {number} subtotal          その泊の室料 = baseRate + extraGuestCharge - singleDiscount
 */

/**
 * 割引1件の評価結果。条件を満たしたが採用されなかったものも同じ形で返す。
 *
 * @typedef {object} DiscountResult
 * @property {string} code       割引コード（'EARLY30' 等）
 * @property {string} label      表示名
 * @property {number} amount     この割引を適用した場合の値引き額（円・切り捨て後）
 * @property {boolean} applied   実際に採用されたか。併用不可なので true は最大1件
 * @property {string} [reason]   不採用の理由（'not_best' 等）。表示の出し分けに使う
 */

/**
 * 表示専用の明細行。金額の意味を表示側が解釈し直さずに済むよう、
 * ラベルと注記まで含めてここで確定させる。
 *
 * @typedef {object} PriceLine
 * @property {string} key          行の識別子（'roomCharge' | 'discount' | 'serviceCharge'
 *                                 | 'consumptionTax' | 'accommodationTax' | 'total' 等）
 * @property {string} label        表示名。例: 'サービス料（10%）'
 * @property {number} amount       金額（円）。割引はマイナス値で持つ
 * @property {string} [note]       補足。例: '1人1泊 12,000円 × 2名 × 3泊'
 * @property {boolean} [emphasis]  合計行など強調表示する行に true
 */

/**
 * 計算結果。金額は全て円（整数）。
 *
 * @typedef {object} PriceBreakdown
 * @property {number} nights                     泊数
 * @property {NightBreakdown[]} nightly          日別内訳
 * @property {number} roomCharge                 室料合計（人数加算・1名割引を反映、割引前）
 * @property {DiscountResult|null} appliedDiscount    採用された割引。なければ null
 * @property {DiscountResult[]} rejectedDiscounts     条件は満たしたが不採用だった割引
 * @property {number} discountAmount             値引き額（円・正の値）
 * @property {number} discountedRoomCharge       割引後室料 = roomCharge - discountAmount
 * @property {number} serviceCharge              サービス料
 * @property {number} taxableBase                消費税の課税対象額 = 割引後室料 + サービス料
 * @property {number} consumptionTax             消費税
 * @property {number} accommodationTax           宿泊税（不課税。課税対象額には含めない）
 * @property {number} total                      請求総額
 * @property {PriceLine[]} lines                 表示用の明細行
 * @property {PriceError} [error]                入力が不正な場合のみ設定。他の値は 0 / 空配列
 */

/**
 * 入力エラー。例外ではなく戻り値として返す（冒頭の理由を参照）。
 *
 * @typedef {object} PriceError
 * @property {'INVALID_DATES'|'INVALID_GUESTS'|'CAPACITY_EXCEEDED'|'MISSING_RULES'} code エラー種別
 * @property {string} message  開発者向けの説明。利用者への文言は表示側が code から作る
 * @property {string} [field]  原因となった入力欄の名前。エラー表示の対応づけに使う
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 全項目 0 の内訳を作る。エラー時と 0 泊時の戻り値の形を、
 * 正常時とそろえるために使う（表示側が存在チェックをしなくて済む）。
 *
 * @param {PriceError} [error]
 * @returns {PriceBreakdown}
 */
function emptyBreakdown(error) {
  const breakdown = {
    nights: 0,
    nightly: [],
    roomCharge: 0,
    appliedDiscount: null,
    rejectedDiscounts: [],
    discountAmount: 0,
    discountedRoomCharge: 0,
    serviceCharge: 0,
    taxableBase: 0,
    consumptionTax: 0,
    accommodationTax: 0,
    total: 0,
    lines: [],
  };
  if (error) breakdown.error = error;
  return breakdown;
}

/**
 * 2つの "YYYY-MM-DD" の差を日数で返す（UTC 基準）。
 * EARLY30 の「何日前か」の判定に使う。new Date() は使わない。
 */
function daysBetween(fromStr, toStr) {
  const from = Date.parse(fromStr);
  const to = Date.parse(toStr);
  if (Number.isNaN(from) || Number.isNaN(to)) return NaN;
  return Math.round((to - from) / MS_PER_DAY);
}

/**
 * 宿泊料金を計算する。純粋関数（同じ入力なら常に同じ結果）。
 * 現在時刻を関数内で取らないため、today を必ず引数で受け取る。
 *
 * @param {PriceInput} input
 * @returns {PriceBreakdown}
 */
export function calculatePrice(input) {
  const { room, nightlyRates, checkIn, checkOut, guests, couponCode, rules, today } = input;

  // ルール未取得のまま呼ばれた場合。計算そのものが成立しないので即返す。
  if (!rules || !room) {
    return emptyBreakdown({ code: 'MISSING_RULES', message: 'pricing rules or room is missing' });
  }

  // 端数処理の方式をルールから取り出す。以降の丸めは全てこれを通す。
  const roundingMode = rules.discounts.rounding;

  // --- Step 1. 宿泊日を列挙する -------------------------------------------
  // 泊数を UTC 基準で数える。未入力・逆転はここで 0 になる。
  const nights = calcNights(checkIn, checkOut);

  // 0 泊は入力途中か日付の逆転。エラーとして返し、計算は進めない。
  if (nights <= 0) {
    return emptyBreakdown({ code: 'INVALID_DATES', message: 'checkOut must be after checkIn', field: 'checkOut' });
  }

  // チェックイン日から1日ずつ進めて、泊数分の宿泊日を並べる。
  const stayDates = [];
  for (let i = 0; i < nights; i += 1) {
    stayDates.push(addDays(checkIn, i));
  }

  // 日別単価を日付で引けるようにする。nightlyRates 未指定なら空のまま。
  const rateByDate = new Map((nightlyRates || []).map((rate) => [rate.date, rate.price]));

  // --- Step 2. 人数を確認し、調整の内容を決める ---------------------------
  // 人数が 1 未満、または整数でない入力は不正。
  if (!Number.isInteger(guests) || guests < 1) {
    return emptyBreakdown({ code: 'INVALID_GUESTS', message: 'guests must be a positive integer', field: 'guests' });
  }

  // 定員超過は料金を出さずエラーにする（加算し続けても正しい金額にならないため）。
  if (guests > room.capacity) {
    return emptyBreakdown({ code: 'CAPACITY_EXCEEDED', message: `guests ${guests} exceeds capacity ${room.capacity}`, field: 'guests' });
  }

  // 基準人数を超えた人数。ここが 0 なら加算は発生しない。
  const extraGuests = Math.max(0, guests - rules.occupancy.baseGuests);

  // 1名利用かどうか。該当する場合だけ室料に割引率を掛ける。
  const isSingleUse = guests === 1;

  // --- Step 3. 室料を積み上げる -------------------------------------------
  // 泊ごとに 基準単価 → 人数加算 → 1名割引 の順で内訳を作る。
  const nightly = stayDates.map((date) => {
    // その日の基準単価。日別単価があれば優先し、なければ客室の既定単価。
    const baseRate = rateByDate.has(date) ? rateByDate.get(date) : room.price;

    // 基準人数を超えた分の加算。
    const extraGuestCharge = rules.occupancy.extraGuestFee * extraGuests;

    // 1名利用の割引額。基準単価に対して掛け、その場で丸める。
    const singleDiscount = isSingleUse
      ? roundAmount(baseRate * rules.occupancy.singleGuestDiscountRate, roundingMode)
      : 0;

    // この泊の室料。
    const subtotal = baseRate + extraGuestCharge - singleDiscount;

    return { date, baseRate, extraGuestCharge, singleDiscount, subtotal };
  });

  // 全泊の室料合計。キャンペーン割引はまだ引いていない。
  const roomCharge = nightly.reduce((sum, night) => sum + night.subtotal, 0);

  // --- Step 4. 割引を判定する ---------------------------------------------
  // チェックイン日が基準日の何日後か。EARLY30 の判定に使う。
  const daysBefore = daysBetween(today, checkIn);

  // クーポンコードの正規化はここで行う。呼び出し側が整えて渡す約束にすると、
  // 呼び出し口が増えたときに片方だけ大文字化を忘れて「効かないクーポン」になる。
  const normalizedCoupon = (couponCode || '').trim().toUpperCase();

  // 条件を満たした割引だけを、値引き額を計算しながら集める。
  const candidates = [];
  rules.discounts.rules.forEach((rule) => {
    // コード必須の割引は、入力されたコードが一致したときだけ候補にする。
    if (rule.requiresCode && normalizedCoupon !== rule.code) return;

    // 日数条件（EARLY30）。基準日が不明なら成立させない。
    if (rule.minDaysBefore != null && !(daysBefore >= rule.minDaysBefore)) return;

    // 泊数条件（STAY3）。
    if (rule.minNights != null && nights < rule.minNights) return;

    // 値引き額。率引きは室料（税抜）に掛けてその場で丸め、定額はそのまま。
    const rawAmount = rule.type === 'rate' ? roundAmount(roomCharge * rule.value, roundingMode) : rule.value;

    // 室料を超える値引きで総額がマイナスにならないようクランプする。
    const amount = Math.min(rawAmount, roomCharge);

    candidates.push({ code: rule.code, label: rule.label, amount, applied: false });
  });

  // 併用不可なので、値引き額が最大のものを1つだけ選ぶ（同額なら先に定義された方）。
  const best = candidates.reduce((top, cur) => (top === null || cur.amount > top.amount ? cur : top), null);

  // 採用された割引に印を付ける。
  const appliedDiscount = best ? { ...best, applied: true } : null;

  // 条件は満たしたが選ばれなかったものを、理由付きで残す。
  const rejectedDiscounts = candidates
    .filter((candidate) => candidate !== best)
    .map((candidate) => ({ ...candidate, reason: 'not_best' }));

  // 実際の値引き額。
  const discountAmount = appliedDiscount ? appliedDiscount.amount : 0;

  // 割引後の室料。以降の計算とサービス料・宿泊税の基準になる。
  const discountedRoomCharge = roomCharge - discountAmount;

  // --- Step 5-6. サービス料と消費税 ---------------------------------------
  // 割引後の室料に、サービス料 → 消費税の順で乗せる。丸めは applyTaxes が
  // 各ステップの直後に1回ずつ行う（単価の税込表示とまったく同じ処理を通す）。
  const { serviceCharge, taxableBase, consumptionTax } = applyTaxes(discountedRoomCharge, rules);

  // --- Step 7. 宿泊税 ------------------------------------------------------
  // 判定額は 1人1泊あたりの室料。サービス料も消費税も含めない。
  const roomChargePerNight = roundAmount(discountedRoomCharge / nights / guests, roundingMode);

  // 段階テーブルを順に見て、判定額が収まる最初の帯の税額を取る。
  const bracket = rules.accommodationTax.brackets.find((b) => roomChargePerNight <= b.maxPerNight);

  // 1人1泊あたりの税額に、人数と泊数を掛ける（定額なので丸めは不要）。
  const accommodationTax = (bracket ? bracket.amount : 0) * guests * nights;

  // --- Step 8. 合計 --------------------------------------------------------
  // 課税対象額 + 消費税 + 宿泊税。全て丸め済みなので端数は残らない。
  const total = taxableBase + consumptionTax + accommodationTax;

  // --- Step 9. 表示用の明細行を作る ---------------------------------------
  //
  // ここでは文言を組み立てず、「どの辞書キーを、どの値で引くか」だけを返す。
  // 文字列にしてしまうと、計算した瞬間の言語が結果に焼き付く。内訳ビューは
  // 言語が変わったときに直近の計算結果を描き直すので、そのとき文言まで
  // 変わってくれないと、金額だけ英語・ラベルだけ日本語の表になる。
  //
  //   labelKey / noteParts … 画面の構造に属する文言。辞書から引く。
  //   labelText            … 客室名・割引名。運営が持つコンテンツなので
  //                          言語別フィールドのまま渡し、表示側で解く。
  //   money                … 金額。書式がロケールで変わるので生の数値で渡し、
  //                          表示側が formatMoney を通す。
  //
  // 率は Intl の percent 書式に任せられるよう、%表記ではなく小数のまま渡す。
  const lines = [
    {
      key: 'roomCharge',
      labelKey: 'breakdown.roomCharge',
      labelParams: { room: room.name },
      amount: roomCharge,
      noteParts: [
        { key: 'breakdown.roomCharge.nights', plurals: { nights, guests } },
        extraGuests > 0
          ? { key: 'breakdown.roomCharge.extraGuests', params: { count: extraGuests } }
          : null,
        isSingleUse ? { key: 'breakdown.roomCharge.singleUse' } : null,
      ].filter(Boolean),
    },
  ];

  // 割引。適用があるときだけ、マイナス値の行として差し込む。
  if (appliedDiscount) {
    lines.push({
      key: 'discount',
      labelText: appliedDiscount.label,
      amount: -appliedDiscount.amount,
      // クーポンコードは翻訳しない（利用者が入力する識別子そのもの）。
      note: appliedDiscount.code,
    });
  }

  // サービス料・消費税・宿泊税・合計を順に積む。合計だけ強調する。
  lines.push({
    key: 'serviceCharge',
    labelKey: 'breakdown.serviceCharge',
    labelPercents: { rate: rules.serviceCharge.rate },
    amount: serviceCharge,
  });
  lines.push({
    key: 'consumptionTax',
    labelKey: 'breakdown.consumptionTax',
    labelPercents: { rate: rules.tax.consumptionTaxRate },
    amount: consumptionTax,
  });
  lines.push({
    key: 'accommodationTax',
    labelKey: 'breakdown.accommodationTax',
    amount: accommodationTax,
    noteParts: [
      {
        key: 'breakdown.accommodationTax.note',
        money: { amount: bracket ? bracket.amount : 0 },
        plurals: { guests, nights },
      },
    ],
  });
  lines.push({
    key: 'total',
    labelKey: 'breakdown.total',
    amount: total,
    emphasis: true,
  });

  return {
    nights,
    nightly,
    roomCharge,
    appliedDiscount,
    rejectedDiscounts,
    discountAmount,
    discountedRoomCharge,
    serviceCharge,
    taxableBase,
    consumptionTax,
    accommodationTax,
    total,
    lines,
  };
}
