import { mockRooms } from '../mock/rooms';

// バックエンドの API ベース URL。画像パス（imagePath）との連結にも使う想定。
export const SERVER_URL = '';

// モックを使うかどうかのフラグ。
// バックエンド完成後は false にする（または環境変数で切り替える）だけでよい。
const USE_MOCK = true;

/**
 * 客室タイプ一覧を取得する。
 * 現在はモックデータを返すが、呼び出し側のインターフェース
 * （Promise<Room[]> を返す）は本番と同じなので、
 * USE_MOCK を切り替えるだけで fetch に移行できる。
 *
 * @returns {Promise<Array>} 客室データの配列
 */
export async function fetchRooms() {
  if (USE_MOCK) {
    // 実際の通信を模して非同期で返す
    return Promise.resolve(mockRooms);
  }

  const res = await fetch(`${SERVER_URL}/api/rooms`);
  if (!res.ok) {
    throw new Error(`Failed to fetch rooms: ${res.status}`);
  }
  return res.json();
}

/**
 * imagePath をサーバー URL と連結して絶対 URL にする。
 * @param {string} imagePath
 * @returns {string}
 */
export function resolveImageUrl(imagePath) {
  return `${SERVER_URL}${imagePath}`;
}
