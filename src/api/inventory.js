import { SERVER_URL } from './rooms';
import { mockRooms } from '../mock/rooms';

// バックエンド未完成のためモックを使う。完成後は false にするだけでよい。
const USE_MOCK = true;

/**
 * 在庫スナップショットの形。
 *
 *   {
 *     updatedAt: "2026-08-25T04:12:33.000Z", // サーバー側の集計時刻（ISO 8601）
 *     rooms: [
 *       { id: 1, stock: 5, available: true },
 *       ...
 *     ]
 *   }
 *
 * 客室名や料金は含めない。定期取得で流れるのは「変わるもの」だけにして、
 * 表示側は fetchRooms() で取った静的な情報に在庫だけを重ねる。
 * 本番 fetch 版も同じ形に正規化するので、呼び出し側は変更せず差し替えられる。
 */

// --- モック実装 -------------------------------------------------------------
// 呼ばれるたびに在庫が揺れる「動く在庫」。ポーリングの表示更新を確認するため、
// 遅延と失敗も混ぜて実際の通信に近づけてある。
//   - 各部屋ごとに 40% で 1 減、15% で 1 増、残り 45% は変化なし
//   - 150〜400ms の遅延
//   - 5% の確率で通信失敗（本番の fetch 失敗と同じく例外を投げる）

// 在庫の上限。増加が続いて非現実的な数字にならないよう頭を押さえる。
const MAX_STOCK = 10;

// 1 ティックあたりの増減確率。減少に寄せてあるので、放っておくと
// 全室が 0（満室）に落ち着く。増減を長く観察したいときはここを調整する。
const P_DECREASE = 0.4;
const P_INCREASE = 0.15;

// mock/rooms.js の stock を初期値としてコピーし、以降はこちらだけを書き換える。
// mockRooms 自体は fetchRooms や fetchMonthlyRates も参照しているため、
// 元のオブジェクトには触らない。
const mockStock = new Map(mockRooms.map((room) => [room.id, room.stock]));

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// 150〜400ms の範囲でランダムな待ち時間を返す
function randomLatency() {
  return 150 + Math.floor(Math.random() * 251);
}

// 1 部屋分の在庫を 1 ティック進める。0 と MAX_STOCK で頭打ちにする。
function nextStock(stock) {
  const roll = Math.random();
  if (roll < P_DECREASE) {
    return Math.max(0, stock - 1);
  }
  if (roll < P_DECREASE + P_INCREASE) {
    return Math.min(MAX_STOCK, stock + 1);
  }
  return stock;
}

async function mockFetchInventory() {
  await delay(randomLatency());

  // 通信そのものが失敗した想定なので、在庫は進めずに例外を投げる
  if (Math.random() < 0.05) {
    throw new Error('Failed to fetch inventory: network error (mock)');
  }

  const rooms = mockRooms.map((room) => {
    const stock = nextStock(mockStock.get(room.id));
    mockStock.set(room.id, stock);

    return {
      id: room.id,
      stock,
      // available はサーバーでも stock から導出される値。
      // 表示側が両方を見て食い違わないよう、ここでも必ず stock から作る。
      available: stock > 0,
    };
  });

  return { updatedAt: new Date().toISOString(), rooms };
}

// --- 本番実装（差し替え用） -------------------------------------------------
async function apiFetchInventory() {
  const res = await fetch(`${SERVER_URL}/api/inventory`);
  if (!res.ok) {
    throw new Error(`Failed to fetch inventory: ${res.status}`);
  }
  return res.json();
}

/**
 * 全客室タイプの在庫スナップショットを取得する。
 * 失敗時は例外を投げるので、呼び出し側（ポーリング）は catch で
 * バックオフや stale 表示に切り替える。
 *
 * @returns {Promise<{updatedAt: string, rooms: Array<{id: number, stock: number, available: boolean}>}>}
 */
export async function fetchInventory() {
  if (USE_MOCK) {
    return mockFetchInventory();
  }
  return apiFetchInventory();
}

/**
 * 検証用に在庫を指定の値へ固定する（モック時のみ意味を持つ）。
 * 「満室になった瞬間の表示」など、揺らぎ任せでは再現しづらい状態を作るために使う。
 *
 * @param {number} id    客室タイプ ID
 * @param {number} stock 設定する在庫数（0 以上）
 */
export function __setMockStock(id, stock) {
  mockStock.set(Number(id), Math.max(0, Number(stock)));
}
