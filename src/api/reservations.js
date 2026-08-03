import { SERVER_URL } from './rooms';

// バックエンド未完成のためモックを使う。完成後は false にするだけでよい。
const USE_MOCK = true;

/**
 * 予約 API のレスポンスを正規化した形。
 * 本番 fetch 版もこの形に揃えることで、呼び出し側を変更せず差し替えられる。
 *
 *   成功:   { ok: true,  status: 201, data: { orderNumber } }
 *   失敗:   { ok: false, status,      error: { code, message, details? } }
 *     - VALIDATION_ERROR: error.details = [{ field, message }, ...]
 *     - OUT_OF_STOCK / その他: error.message を利用
 */

// --- モック実装 -------------------------------------------------------------
// 動作確認用に、入力値でレスポンスを分岐させる簡易ロジック。
//   - notes に "stock" を含む  → OUT_OF_STOCK
//   - notes に "fail" を含む   → 予期しないエラー
//   - email が不正な形式        → VALIDATION_ERROR(email)
//   - それ以外                  → 201 成功
function mockCreateReservation(payload) {
  const notes = payload.notes || '';

  if (notes.includes('stock')) {
    return {
      ok: false,
      status: 409,
      error: { code: 'OUT_OF_STOCK', message: '満室です' },
    };
  }

  if (notes.includes('fail')) {
    return {
      ok: false,
      status: 500,
      error: { code: 'INTERNAL_ERROR', message: 'サーバーエラーが発生しました。時間をおいて再度お試しください。' },
    };
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email || '');
  if (!emailOk) {
    return {
      ok: false,
      status: 400,
      error: {
        code: 'VALIDATION_ERROR',
        message: '入力内容に誤りがあります。',
        details: [{ field: 'email', message: 'メールアドレスの形式が正しくありません。' }],
      },
    };
  }

  // 予約番号を発番（モック）
  const orderNumber = `ITS-${new Date().getFullYear()}-${String(
    Math.floor(Math.random() * 100000)
  ).padStart(5, '0')}`;

  return { ok: true, status: 201, data: { orderNumber } };
}

// --- 本番実装（差し替え用） -------------------------------------------------
async function apiCreateReservation(payload) {
  const res = await fetch(`${SERVER_URL}/api/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (res.status === 201) {
    return { ok: true, status: 201, data: body };
  }
  return { ok: false, status: res.status, error: body.error || body };
}

/**
 * 予約を作成する。
 * @param {Object} payload roomTypeId / guests は数値、料金は含めない
 * @returns {Promise<Object>} 正規化済みレスポンス
 */
export async function createReservation(payload) {
  if (USE_MOCK) {
    return Promise.resolve(mockCreateReservation(payload));
  }
  return apiCreateReservation(payload);
}
