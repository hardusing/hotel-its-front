// 計測イベントの送出口。
//
// 個人情報は一切送らない。氏名・メール・電話・備考は予約成立に必要なだけの
// 情報であって、計測の役には立たない（分析に使うのは「何名で何泊したか」の側）。
// 一度でも計測基盤へ渡れば、こちら側の削除だけでは取り消せず、
// 送信先の保存期間・所在地・再委託先まで丸ごとこちらの責任になる。
//
// ---------------------------------------------------------------------------
// 特定の計測サービスに依存しない。このファイルの外には track / initTracker と
// イベント名の定数しか公開せず、送信先の都合（SDK の初期化、イベント名の規約、
// プロパティの型）はすべてここで吸収する。GA4 でも他社製でも自前の収集APIでも、
// 差し替えるのは下の pushToDataLayer 1 つだけで済む。
// 現在の実装は window.dataLayer への push のみ（タグマネージャ経由を想定）。
// ---------------------------------------------------------------------------

/** イベント名。呼び出し側が文字列を直接書かないよう、ここで一覧にする。 */
export const EVENTS = {
  PAGE_VIEW: 'page_view',
  ROOM_VIEW: 'room_view',
  DATES_SELECTED: 'dates_selected',
  COUPON_APPLIED: 'coupon_applied',
  COUPON_REJECTED: 'coupon_rejected',
  FORM_REACHED: 'form_reached',
  RESERVATION_COMPLETED: 'reservation_completed',
};

/**
 * 送ってはいけないキー。
 *
 * 名前で落とすのは、payload の組み立て側が「うっかり丸ごと渡す」のを
 * 止めるため。呼び出し側のレビューに頼ると、フォームの項目が増えた日に
 * 静かに漏れる。
 */
const BLOCKED_KEYS = [
  'guestname',
  'name',
  'email',
  'mail',
  'phone',
  'tel',
  'notes',
  'note',
  'address',
  'ordernumber',
  'order',
  'reservationid',
  'password',
  'token',
];

/**
 * 値そのものが個人情報に見えるかどうかの最後の網。
 *
 * 電話番号の判定は「区切りを除いた数字が 10〜15 桁」で見る。
 * 文字数だけで見ると、金額の帯（100000-199999 のような値）まで
 * 電話番号と見なして落としてしまう。桁で見ても紛れる余地は残るので、
 * 帯の区切りにはハイフンではなく '〜' を使い、形の上でも重ならないようにしてある。
 */
const EMAIL_LIKE = /@/;
const PHONE_SHAPE = /^[\d+\-() ]+$/;

function looksLikePhone(value) {
  if (!PHONE_SHAPE.test(value)) return false;
  const digits = value.replace(/\D/g, '').length;
  return digits >= 10 && digits <= 15;
}

// セッション中ずっと付けて回る共通プロパティ（utm など）。
let sessionProps = {};

// sessionStorage のキー。タブを閉じるまでが有効期間。
const STORAGE_KEY = 'hotel-its.tracking';

/**
 * payload から個人情報を取り除く。
 *
 * ネストしたオブジェクトも辿る。フォームの値をそのまま入れ子で渡された場合、
 * 浅い検査だけでは素通りしてしまう。
 *
 * @param {Object} payload
 * @returns {Object} 除外後の新しいオブジェクト（元は書き換えない）
 */
export function stripPersonalData(payload) {
  if (!payload || typeof payload !== 'object') return {};

  const safe = {};

  Object.keys(payload).forEach((key) => {
    // キー名で判定する。camelCase / snake_case の違いを吸収するため、
    // 小文字化して区切り記号を落としてから比べる。
    const normalized = key.toLowerCase().replace(/[_-]/g, '');
    if (BLOCKED_KEYS.some((blocked) => normalized.includes(blocked))) return;

    const value = payload[key];

    if (value === null || value === undefined) return;

    if (typeof value === 'object') {
      if (Array.isArray(value)) return; // 配列は計測に使わないので通さない
      const nested = stripPersonalData(value);
      if (Object.keys(nested).length > 0) safe[key] = nested;
      return;
    }

    // キー名を変えて忍び込ませても、値の形で止める。
    if (typeof value === 'string' && (EMAIL_LIKE.test(value) || looksLikePhone(value))) {
      return;
    }

    safe[key] = value;
  });

  return safe;
}

/**
 * 金額を帯に丸める。
 *
 * 実額を送らないのは、日付・人数・客室と組み合わせると
 * 予約 1 件を特定できてしまうため。分析に必要なのは分布であって実額ではない。
 *
 * @param {?number} total 税込合計
 * @returns {?string} 例: '50000〜99999'
 */
export function toPriceBand(total) {
  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) return null;
  const bands = [10000, 30000, 50000, 100000, 200000];
  const index = bands.findIndex((limit) => total < limit);
  if (index === 0) return '0〜9999';
  if (index === -1) return '200000〜';
  return `${bands[index - 1]}〜${bands[index] - 1}`;
}

/**
 * 実際の送信。差し替えるのはこの関数だけでよい。
 *
 * window.dataLayer が無い環境（タグマネージャ未導入、SSR、テスト、
 * 広告ブロッカーが消した場合）でも落ちない。計測が動かないことは、
 * 予約が取れないことに比べれば何の問題でもない。
 *
 * @param {Object} event
 */
function pushToDataLayer(event) {
  try {
    if (typeof window === 'undefined') return;
    // 配列が無ければ作る。タグマネージャは後から読み込まれても
    // 既存の配列の中身を拾うので、先に積んでおいて問題ない。
    if (!Array.isArray(window.dataLayer)) {
      window.dataLayer = [];
    }
    window.dataLayer.push(event);
  } catch (err) {
    // 送信できないこと自体は利用者に何の関係もない。握って先へ進む。
    // eslint-disable-next-line no-console
    console.warn('[tracker] failed to send event', err);
  }
}

/**
 * イベントを 1 件送る。
 *
 * @param {string} name EVENTS のいずれか
 * @param {Object} [payload] イベント固有のプロパティ。個人情報は自動で除外される
 */
export function track(name, payload = {}) {
  if (!name) return;

  pushToDataLayer({
    event: name,
    // 共通プロパティを先に置き、イベント固有の値で上書きできるようにする。
    ...sessionProps,
    ...stripPersonalData(payload),
  });
}

/**
 * 計測を初期化し、utm をセッション中の共通プロパティとして保持する。
 *
 * 毎回のイベントに utm を引き回さない理由：
 * - 流入元は「このセッションがどこから来たか」の属性であって、個々の操作の
 *   属性ではない。日付選択やクーポン適用の呼び出し側が流入元を知っている必要は無く、
 *   知らせると計測のためだけの引数が画面の処理に生えることになる。
 * - URL は書き換わる。言語切り替えが replaceState を使う（lang.js）ので、
 *   イベントのたびに URL を読み直す作りにすると、後半のイベントだけ
 *   流入元が欠けるという最も気付きにくい壊れ方をする。
 * - タブを開いている間は同じ流入と見なしたい。ページを跨いでも
 *   （トップ ⇄ キャンペーン LP）同じ値を保つ必要がある。
 * このため、最初に一度だけ拾って sessionStorage に置き、以降は track が自動で足す。
 *
 * 最初に拾った値は上書きしない。同一セッション内での初回接触を残すため。
 *
 * @param {Object} [tracking] parseDeepLink().tracking（utm_* など）
 */
export function initTracker(tracking = {}) {
  let stored = null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch (err) {
    // プライベートモードや storage 無効環境。保持できないだけで動作は続く。
    stored = null;
  }

  if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) {
    sessionProps = stored;
    return sessionProps;
  }

  // 計測パラメータは params.js が件数・長さの上限まで済ませている。
  // ここでも個人情報の網は通しておく（utm に何が入れられるか分からないため）。
  sessionProps = stripPersonalData(tracking);

  try {
    if (Object.keys(sessionProps).length > 0) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionProps));
    }
  } catch (err) {
    // 保存できなくても、このページの間は sessionProps がメモリに残る。
  }

  return sessionProps;
}
