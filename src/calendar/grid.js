// 月間カレンダーのマス目を組み立てる純粋ロジック。
// DOM も API も扱わないので、そのままテストできる。
//
// 日付はすべて booking.js と同じ "YYYY-MM-DD" 文字列で受け渡しし、
// 加減算は addDays に委ねて UTC 基準に統一する。
// ローカルの Date で計算するとタイムゾーンによって月境界が 1 日ズレるため、
// この規約はモジュールをまたいで必ず守ること。

import { addDays, daysInMonth } from '../booking';

/**
 * 月初の "YYYY-MM-DD" を返す。
 *
 * @param {number} year  西暦
 * @param {number} month 月（1〜12）
 * @returns {string} 例: "2026-09-01"
 */
function firstOfMonth(year, month) {
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
}

/**
 * 月間カレンダーのマス目を 1 次元配列で返す。
 *
 * 週の始まりは日曜（weekday: 0=日 … 6=土）。
 * 週の形を崩さないよう、前後の空きは前月・翌月の「実際の日付」で埋め、
 * その分のマスは inMonth: false になる。
 * 返る配列の長さは必ず 7 の倍数（35 または 42、2 月が日曜始まりなら 28）。
 *
 * 呼び出し側は 7 個ずつ chunk するだけで週の行を作れる。
 *
 * @param {number} year  西暦（例: 2026）
 * @param {number} month 月（1〜12。JS の getMonth() と違い 1 始まり）
 * @returns {Array<{date: string, inMonth: boolean, weekday: number}>}
 *   date    … "YYYY-MM-DD"
 *   inMonth … 当月の日なら true、前後の月の埋めなら false
 *   weekday … 0=日 … 6=土
 */
export function buildMonthGrid(year, month) {
  const first = firstOfMonth(year, month);
  // 月初が何曜日か。この日数だけ前月から遡ってグリッドを始める。
  const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const start = addDays(first, -leading);

  // 前月の埋め + 当月の日数 を 7 の倍数に切り上げる
  const total = Math.ceil((leading + daysInMonth(year, month)) / 7) * 7;

  // 当月かどうかは "YYYY-MM" の前方一致で判定する（Date を作り直さずに済む）
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  const cells = [];
  for (let i = 0; i < total; i += 1) {
    const date = addDays(start, i);
    cells.push({
      date,
      inMonth: date.startsWith(prefix),
      weekday: i % 7,
    });
  }
  return cells;
}

/**
 * 年月を delta か月ずらす。年をまたぐ境界も正しく処理する。
 *
 * 「年 * 12 + 月」の通し番号に直してから加算することで、
 * 12 月 → 翌年 1 月、1 月 → 前年 12 月の繰り上がり／繰り下がりを
 * 条件分岐なしで扱える。
 *
 * @param {number} year  西暦
 * @param {number} month 月（1〜12）
 * @param {number} delta ずらす月数（負数で過去方向）
 * @returns {{year: number, month: number}} 例: shiftMonth(2026, 12, 1) → { year: 2027, month: 1 }
 */
export function shiftMonth(year, month, delta) {
  const index = year * 12 + (month - 1) + delta;
  // JS の % は負数で負を返すため、+12 して正に寄せてから剰余を取る
  const normalized = ((index % 12) + 12) % 12;
  return {
    year: Math.floor(index / 12),
    month: normalized + 1,
  };
}

/**
 * a が b と同じ日、または b より後かを判定する。
 * カレンダーの「今日より前は選べない」「チェックイン以降のみ選べる」判定に使う。
 *
 * どちらかが不正な日付文字列なら false を返す（calcNights と同じ扱い）。
 *
 * @param {string} a 比較する日付 "YYYY-MM-DD"
 * @param {string} b 基準の日付 "YYYY-MM-DD"
 * @returns {boolean} a >= b なら true
 */
export function isSameOrAfter(a, b) {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) return false;
  return aMs >= bMs;
}

/**
 * from から to までの日付を 1 日刻みで列挙する。to は含まない。
 *
 * 宿泊の考え方（チェックアウト日は課金対象外）とそのまま対応するので、
 * 戻り値の配列がそのまま「泊まる日 = 料金を合算する日」の一覧になる。
 * 例: eachDateBetween("2026-09-01", "2026-09-03") → ["2026-09-01", "2026-09-02"]
 *
 * 不正な日付、または from >= to の場合は空配列を返す。
 *
 * @param {string} from 開始日 "YYYY-MM-DD"（含む）
 * @param {string} to   終了日 "YYYY-MM-DD"（含まない）
 * @returns {string[]} 日付文字列の配列
 */
export function eachDateBetween(from, to) {
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return [];

  const dates = [];
  let cursor = from;
  while (!isSameOrAfter(cursor, to)) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}
