import { SERVER_URL } from './rooms';
import { mockRooms } from '../mock/rooms';
import { daysInMonth } from '../booking';

// バックエンド未完成のためモックを使う。完成後は false にするだけでよい。
const USE_MOCK = true;

/**
 * 月間料金カレンダーの 1 日分の形。
 *
 *   {
 *     date:      "2026-08-01", // YYYY-MM-DD
 *     price:     16640,        // その日の 1 泊料金
 *     stock:     5,            // 残室数
 *     available: true,         // 予約可能か（closed または stock 0 なら false）
 *     level:     "high",       // 月内価格の三分位 low | mid | high
 *     closed:    false,        // 休館日か
 *   }
 *
 * fetchMonthlyRates はこれを日付キーの辞書にして返す。
 * 本番 fetch 版も同じ形に正規化するので、呼び出し側は変更せず差し替えられる。
 */

// --- 日付ユーティリティ -----------------------------------------------------
// booking.js と同じく "YYYY-MM-DD" 文字列 + UTC 基準で扱う。
// ローカルの Date と混ぜるとタイムゾーンによって月境界がズレるため、
// 曜日の判定にも getUTCDay() を使う。

// (2026, 8, 1) → "2026-08-01"
function toDateStr(year, month, day) {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

// 曜日番号（0=日 … 6=土）を UTC 基準で返す。
function weekdayOf(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// --- 価格レベル（三分位）----------------------------------------------------

/**
 * 月内の価格分布から low / mid / high の境界値を求める。
 * 休館日は販売対象外なので分位の計算から除外する。
 *
 * 境界は「以下」で判定する（price <= q1 なら low）。
 * 平日料金のように同額の日が偏って存在する場合、
 * 「未満」で判定すると最安値グループが丸ごと mid に寄ってしまうため。
 *
 * @param {Array} days level 未設定の 1 日分オブジェクトの配列
 * @returns {{ q1: number, q2: number }}
 */
function calcTertiles(days) {
  const prices = days
    .filter((d) => !d.closed)
    .map((d) => d.price)
    .sort((a, b) => a - b);

  // 営業日が無い月は全日 low 扱いにする（境界を +Infinity にする）
  if (prices.length === 0) {
    return { q1: Infinity, q2: Infinity };
  }

  const q1 = prices[Math.floor(prices.length / 3)];
  const q2 = prices[Math.floor((prices.length * 2) / 3)];
  return { q1, q2 };
}

/**
 * 各日に level を付与して、日付キーの辞書に組み直す。
 * モック・本番 fetch の両方でこれを通し、level の意味を揃える。
 *
 * @param {Array} days level 未設定の 1 日分オブジェクトの配列
 * @returns {Object} { "YYYY-MM-DD": {...}, ... }
 */
function buildCalendar(days) {
  const { q1, q2 } = calcTertiles(days);

  return days.reduce((acc, day) => {
    let level = 'high';
    if (day.price <= q1) {
      level = 'low';
    } else if (day.price <= q2) {
      level = 'mid';
    }

    acc[day.date] = {
      date: day.date,
      price: day.price,
      stock: day.stock,
      available: day.available,
      level,
      closed: day.closed,
    };
    return acc;
  }, {});
}

// --- モック実装 -------------------------------------------------------------
// mock/rooms.js の price / stock を基準に、1 か月分を機械的に生成する。
//   - 土曜        → 1.3 倍
//   - 金曜・日曜  → 1.15 倍
//   - 3 の倍数の日 → 満室（stock 0）
//   - 毎月 15 日  → 休館日（closed: true、販売しないので stock 0）
// ※ 15 は 3 の倍数でもあるため、15 日は休館かつ満室の状態になる。

// 曜日ごとの料金倍率を返す。
function rateOf(weekday) {
  if (weekday === 6) return 1.3; // 土
  if (weekday === 5 || weekday === 0) return 1.15; // 金・日
  return 1;
}

function mockMonthlyRates(roomId, year, month) {
  const room = mockRooms.find((r) => r.id === Number(roomId));
  // 本番の 404 相当。呼び出し側は fetchRooms と同じく catch で拾える。
  if (!room) {
    throw new Error(`Unknown roomId: ${roomId}`);
  }

  const total = daysInMonth(year, month);
  const days = [];

  for (let day = 1; day <= total; day += 1) {
    const closed = day === 15;
    const soldOut = day % 3 === 0;
    const stock = closed || soldOut ? 0 : room.stock;

    days.push({
      date: toDateStr(year, month, day),
      price: Math.round(room.price * rateOf(weekdayOf(year, month, day))),
      stock,
      available: !closed && stock > 0,
      closed,
    });
  }

  return buildCalendar(days);
}

// --- 本番実装（差し替え用） -------------------------------------------------
// サーバーは日付順の配列を返す想定。level はクライアント側で
// buildCalendar が付け直すので、サーバーが返しても返さなくてもよい。
async function apiMonthlyRates(roomId, year, month) {
  const res = await fetch(
    `${SERVER_URL}/api/rooms/${roomId}/rates?year=${year}&month=${month}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch rates: ${res.status}`);
  }

  const body = await res.json();
  const days = Array.isArray(body) ? body : Object.values(body);
  return buildCalendar(days);
}

/**
 * 指定した客室・年月の日別料金カレンダーを取得する。
 *
 * @param {number} roomId 客室タイプ ID
 * @param {number} year   西暦（例: 2026）
 * @param {number} month  月（1〜12。JS の getMonth() と違い 1 始まり）
 * @returns {Promise<Object>} 日付（YYYY-MM-DD）をキーにした辞書
 */
export async function fetchMonthlyRates(roomId, year, month) {
  if (USE_MOCK) {
    // 実際の通信を模して非同期で返す
    return Promise.resolve(mockMonthlyRates(roomId, year, month));
  }
  return apiMonthlyRates(roomId, year, month);
}
