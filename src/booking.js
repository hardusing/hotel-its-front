// 日付選択・料金計算まわりの純粋ロジック。
// input[type=date] の値は "YYYY-MM-DD" 形式で、
// new Date("YYYY-MM-DD") / Date.parse は UTC 深夜として解釈されるため、
// 泊数は自動的に UTC 基準で計算される（タイムゾーンによるズレが出ない）。

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * ローカルの「今日」を YYYY-MM-DD で返す（input の min 用）。
 */
export function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * "YYYY-MM-DD" に日数を加算して "YYYY-MM-DD" を返す（UTC 基準）。
 */
export function addDays(dateStr, days) {
  const base = Date.parse(dateStr);
  if (Number.isNaN(base)) return '';
  return new Date(base + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * 泊数を UTC 基準で計算する。
 * 未入力・逆転している場合は 0 を返す。
 */
export function calcNights(checkin, checkout) {
  if (!checkin || !checkout) return 0;
  const inMs = Date.parse(checkin);
  const outMs = Date.parse(checkout);
  if (Number.isNaN(inMs) || Number.isNaN(outMs)) return 0;
  const nights = Math.round((outMs - inMs) / MS_PER_DAY);
  return nights > 0 ? nights : 0;
}

/**
 * 合計金額を計算する。
 */
export function calcTotal(price, nights) {
  return price * nights;
}
