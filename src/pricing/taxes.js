// サービス料と消費税の積み上げだけを取り出した共通処理。
//
// 内訳の計算（calculator.js）と、単価の税込表示（displayPrice.js）は
// 同じ順序・同じ丸めで税を乗せる必要がある。式を2か所に書くと、税率改定や
// 「サービス料を課税対象から外す」といった変更のときに片方だけ直り、
// カードの単価と内訳の合計が静かにずれる。

import { roundAmount } from './rounding.js';

/**
 * 税抜額にサービス料と消費税を乗せる。
 * 丸めは各ステップの直後に1回ずつ行う（明細行の合計と総額を一致させるため）。
 *
 * @param {number} base  税抜の金額
 * @param {object} rules 料金ルール
 * @returns {{serviceCharge: number, taxableBase: number, consumptionTax: number, taxIncluded: number}}
 */
export function applyTaxes(base, rules) {
  const mode = rules.discounts.rounding;

  // サービス料は税抜額に対して掛け、直後に丸める。
  const serviceCharge = roundAmount(base * rules.serviceCharge.rate, mode);

  // 課税対象額。サービス料は課税対象なので加える（宿泊税は不課税なので含めない）。
  const taxableBase = base + (rules.serviceCharge.taxable ? serviceCharge : 0);

  // 消費税も課税対象額に掛けた直後に丸める。
  const consumptionTax = roundAmount(taxableBase * rules.tax.consumptionTaxRate, mode);

  return {
    serviceCharge,
    taxableBase,
    consumptionTax,
    // 宿泊税は含まない。人数で決まる実費なので、この関数の責務の外。
    taxIncluded: taxableBase + consumptionTax,
  };
}
