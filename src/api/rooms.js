import { mockRooms } from '../mock/rooms';
import { localizeField } from '../i18n/index.js';

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

/**
 * 客室名を現在の表示言語で返す。
 *
 * API の値は言語別フィールド（{ja, en}）で届く。画面側が room.name を
 * 直接読む形にすると、言語の解き方が読む場所の数だけ散る。入口をこの
 * 2 関数に絞り、解決は表示の直前に毎回行う（値を先に文字列へ潰すと、
 * その時点の言語が焼き付いて言語切り替えで変わらなくなる）。
 *
 * @param {Object} room
 * @returns {string}
 */
export function roomName(room) {
  return localizeField(room && room.name);
}

/**
 * 客室の説明文を現在の表示言語で返す。
 *
 * @param {Object} room
 * @returns {string}
 */
export function roomDescription(room) {
  return localizeField(room && room.description);
}
