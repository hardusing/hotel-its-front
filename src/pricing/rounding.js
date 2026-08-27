// 端数処理をここ1か所に集める。
// 税・サービス料・割引はそれぞれ小数を生むが、丸め方が場所ごとにばらつくと
// 明細行の合計と総額が一致しなくなる。どの丸めをどこで通したかを追えるよう、
// 計算側は必ずこの関数を経由させる（rules.discounts.rounding で方式を切り替える）。

/**
 * 金額を指定の方式で整数（円）に丸める。
 *
 * 既定は 'floor'（切り捨て）。税額・サービス料の端数を利用者に不利な方向へ
 * 積み上げないため。'round' 'ceil' は自治体や施設の運用が異なる場合の逃げ道。
 *
 * @param {number} value 丸める前の金額
 * @param {'floor'|'round'|'ceil'} [mode='floor'] 丸め方式
 * @returns {number} 整数の金額
 */
export function roundAmount(value, mode = 'floor') {
  if (!Number.isFinite(value)) return 0;
  if (mode === 'ceil') return Math.ceil(value);
  if (mode === 'round') return Math.round(value);
  return Math.floor(value);
}
