// 「1泊いくら」として画面に出す金額の基準を、このファイルだけで決める。
//
// 基準：税込み（総額表示）に統一する。
//   1. 消費者向けの価格表示には総額表示が求められる（消費税法63条）。
//      カードとカレンダーの単価はまさにその価格表示にあたる。
//   2. カードが税抜・内訳が税込だと、同じ部屋の金額が場所によって 1.21 倍
//      違って見え、「聞いていた額と違う」が予約の最後で起きる。
//   3. サービス料は必ず掛かるので単価に含める。一方で宿泊税と入湯税は
//      人数で決まる実費であり、1泊単価の時点では確定できない。
//      そのため単価には含めず、「宿泊税別」と添えて別建てにする。
//
// 内訳ビューの合計だけは宿泊税まで含んだ請求総額なので、注記の文言を分けている。

import { applyTaxes } from './taxes.js';

/** 単価表示（カード・カレンダー・モーダル見出し）に添える注記。 */
export const NIGHTLY_PRICE_NOTE = '税・サービス料込 / 宿泊税別';

/** ルールが取れず税込に換算できなかったときの注記。 */
export const NIGHTLY_PRICE_NOTE_FALLBACK = '税・サービス料別';

/** 請求総額（内訳の合計・フォームの要約）に添える注記。 */
export const TOTAL_PRICE_NOTE = '税・サービス料・宿泊税込';

/**
 * 税抜の1泊単価を、表示用の税込単価に換算する。
 *
 * 税の積み上げは calculatePrice と同じ applyTaxes を通す。ここに式を写すと、
 * 税率やサービス料の扱いを変えたときに片方だけ直って表示がずれる。
 *
 * @param {number} baseRate 税抜の1泊単価（基準人数）
 * @param {?object} rules   料金ルール。null なら換算せずそのまま返す
 * @returns {number} 税込の1泊単価（宿泊税は含まない）
 */
export function toNightlyDisplayPrice(baseRate, rules) {
  if (!rules) return baseRate;

  // 税の乗せ方は calculatePrice と同じ applyTaxes に任せる。
  return applyTaxes(baseRate, rules).taxIncluded;
}

/**
 * 単価表示に添える注記を、換算できたかどうかで選ぶ。
 * 文言と換算処理を同じファイルに置き、片方だけ直して食い違うのを防ぐ。
 *
 * @param {?object} rules
 * @returns {string}
 */
export function nightlyPriceNote(rules) {
  return rules ? NIGHTLY_PRICE_NOTE : NIGHTLY_PRICE_NOTE_FALLBACK;
}
