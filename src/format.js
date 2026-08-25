// 金額の表示形式をまとめる。
// 一覧カード・モーダル・カレンダーで同じ書式を使うため、
// 各所に同じ関数を置かずここに集約する。

/**
 * 料金を「¥12,800」形式にフォーマットする。
 *
 * @param {number} value 金額
 * @returns {string} 例: 12800 → "¥12,800"
 */
export function formatYen(value) {
  return `¥${value.toLocaleString('ja-JP')}`;
}

/**
 * 狭い画面向けの短縮表記。1 万円以上は「1.3万」のように万単位へ丸める。
 * セル幅が 40px 前後まで縮んでも収まり、かつ日ごとの差は読み取れる粒度。
 *
 * 丸めた金額なので、読み上げや合計金額には使わないこと。
 *
 * @param {number} value 金額
 * @returns {string} 例: 12800 → "1.3万" / 8000 → "8,000"
 */
export function formatYenShort(value) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value.toLocaleString('ja-JP');
}
