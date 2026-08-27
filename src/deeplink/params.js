import { translations } from '../i18n.js';

/**
 * ディープリンクのクエリパラメータを解釈・生成する純粋関数群。
 *
 * ここは DOM も API も時計も触らない。現在日付は today 引数で受け取る。
 * 「URL をどう読むか」だけを担当し、読んだ結果を画面に反映するのは呼び出し側の仕事。
 *
 * 仕様は docs/url-spec.md を参照。方針の要点は次の 2 つ。
 * - 不正値はエラーにせず、その項目だけを null にして既定の挙動へ戻す。
 *   広告リンクは配信管理画面の手入力・代理店のテンプレート置換・リダイレクタでの
 *   再エンコード・SNS での URL 途中切断など、日常的に壊れる経路を通ってくる。
 *   壊れた 1 項目でランディングを落とすと、費用を払って連れてきた人をその場で失う。
 * - 捨てた事実は invalid に残す。黙って消えると、配信側は自分のリンクが
 *   効いていないことに気付けない。
 */

/** 予約フローに影響するパラメータの既定値。この値と等しいものは URL に出さない。 */
const BOOKING_KEYS = ['room', 'checkIn', 'checkOut', 'guests', 'promo', 'lang'];

/** URL 上の名前と内部キーの対応。URL 側の名前は仕様として固定する。 */
const QUERY_NAME = {
  room: 'room',
  checkIn: 'checkin',
  checkOut: 'checkout',
  guests: 'guests',
  promo: 'promo',
  lang: 'lang',
};

const GUESTS_MIN = 1;
const GUESTS_MAX = 10;
const PROMO_MAX_LENGTH = 32;
const PROMO_PATTERN = /^[A-Za-z0-9-]+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** utm_ 以外に拾う計測パラメータ。増えたらここに 1 行足す（docs/url-spec.md 参照）。 */
const TRACKING_ALLOWLIST = ['gclid', 'fbclid', 'msclkid'];
/** 計測パラメータの上限。URL は外部から任意に付けられるので、無制限に持たない。 */
const TRACKING_MAX_ENTRIES = 20;
const TRACKING_MAX_VALUE_LENGTH = 255;

/* ---------- 個別の検証 ---------- */

/**
 * 実在する YYYY-MM-DD かどうかを判定する。
 * 正規表現だけでは 2026-02-30 のような存在しない日付を通してしまうため、
 * 組み立て直した日付が元の数値と一致するかまで見る。
 */
function isRealDate(value) {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

/**
 * 日付として解釈する。実在しない書式・過去日は null。
 * YYYY-MM-DD は辞書順と時系列が一致するので、比較は文字列のままで足りる。
 */
function parseDate(value, today) {
  if (!isRealDate(value)) return { value: null, reason: 'not a real YYYY-MM-DD date' };
  if (today && value < today) return { value: null, reason: 'date is in the past' };
  return { value, reason: null };
}

/** 正の整数のみ。'3.0' や '03' のような表記ゆれは通さない（ID は表記が一意である前提）。 */
function parseRoom(value) {
  if (!/^[1-9]\d*$/.test(value)) return { value: null, reason: 'not a positive integer' };
  return { value: Number(value), reason: null };
}

/** 1〜10 の整数。範囲外は上限に丸めず null に倒す（意図しない人数で見積もりを出さない）。 */
function parseGuests(value) {
  if (!/^\d+$/.test(value)) return { value: null, reason: 'not an integer' };
  const n = Number(value);
  if (n < GUESTS_MIN || n > GUESTS_MAX) {
    return { value: null, reason: `out of range (${GUESTS_MIN}-${GUESTS_MAX})` };
  }
  return { value: n, reason: null };
}

/**
 * クーポンコード。英数字とハイフンのみ、最大 32 文字。
 * 「そのコードが実在するか」はここでは判定しない。使えるかどうかを決めるのは
 * 料金計算側であり、正解を 2 箇所に置かないため。
 */
function parsePromo(value) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return { value: null, reason: 'empty' };
  if (trimmed.length > PROMO_MAX_LENGTH) {
    return { value: null, reason: `longer than ${PROMO_MAX_LENGTH} characters` };
  }
  if (!PROMO_PATTERN.test(trimmed)) {
    return { value: null, reason: 'contains characters other than A-Z, 0-9 and hyphen' };
  }
  return { value: trimmed, reason: null };
}

/** 対応言語のみ。判定の正は i18n の translations 側に置く。 */
function parseLang(value) {
  if (!Object.prototype.hasOwnProperty.call(translations, value)) {
    return { value: null, reason: 'unsupported language' };
  }
  return { value, reason: null };
}

/** 計測パラメータとして拾う名前か。utm_ は前方一致で全件拾う（utm_term などの後発項目に備える）。 */
function isTrackingName(name) {
  return name.startsWith('utm_') || TRACKING_ALLOWLIST.includes(name);
}

/* ---------- parse ---------- */

/**
 * クエリ文字列をディープリンクの入力として解釈する。
 *
 * @param {string|URLSearchParams} search '?room=3&...' 形式の文字列、または URLSearchParams
 * @param {Object} [options]
 * @param {string} [options.today] 現在日付 'YYYY-MM-DD'。過去日の判定に使う。
 *   省略すると過去日チェックだけを行わない（書式検証は変わらない）。
 * @returns {{
 *   booking: {room: ?number, checkIn: ?string, checkOut: ?string,
 *             guests: ?number, promo: ?string, lang: ?string},
 *   tracking: Object<string, string>,
 *   invalid: Array<{param: string, value: string, reason: string}>
 * }}
 *   booking の各項目は、指定が無い場合も無視した場合も null。
 *   両者は invalid に記録があるかどうかで区別できる。
 */
export function parseDeepLink(search, options = {}) {
  const { today = null } = options;
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search || '');

  const booking = {
    room: null,
    checkIn: null,
    checkOut: null,
    guests: null,
    promo: null,
    lang: null,
  };
  const tracking = {};
  const invalid = [];

  // 捨てた項目を 1 箇所で記録する。理由の文面はログと開発時の確認用。
  const reject = (param, value, reason) => {
    invalid.push({ param, value, reason });
  };

  const read = (name) => {
    const raw = params.get(name);
    return raw === null ? null : raw;
  };

  // --- 予約フローに影響するもの ---

  const rawRoom = read(QUERY_NAME.room);
  if (rawRoom !== null) {
    const { value, reason } = parseRoom(rawRoom);
    if (value === null) reject(QUERY_NAME.room, rawRoom, reason);
    else booking.room = value;
  }

  const rawCheckIn = read(QUERY_NAME.checkIn);
  if (rawCheckIn !== null) {
    const { value, reason } = parseDate(rawCheckIn, today);
    if (value === null) reject(QUERY_NAME.checkIn, rawCheckIn, reason);
    else booking.checkIn = value;
  }

  const rawCheckOut = read(QUERY_NAME.checkOut);
  if (rawCheckOut !== null) {
    const { value, reason } = parseDate(rawCheckOut, today);
    if (value === null) reject(QUERY_NAME.checkOut, rawCheckOut, reason);
    else booking.checkOut = value;
  }

  // チェックイン無しのチェックアウトは意味を持たないので落とす。
  if (booking.checkOut !== null && booking.checkIn === null) {
    reject(QUERY_NAME.checkOut, booking.checkOut, 'checkout without a valid checkin');
    booking.checkOut = null;
  }

  // 逆転・同日は範囲として成立しない。片方だけ残すと「1 泊のつもりが 0 泊」のような
  // 中途半端な状態になるため、両方まとめて捨てて日付未選択に戻す。
  if (
    booking.checkIn !== null &&
    booking.checkOut !== null &&
    booking.checkOut <= booking.checkIn
  ) {
    reject(QUERY_NAME.checkIn, booking.checkIn, 'checkout is not after checkin');
    reject(QUERY_NAME.checkOut, booking.checkOut, 'checkout is not after checkin');
    booking.checkIn = null;
    booking.checkOut = null;
  }

  const rawGuests = read(QUERY_NAME.guests);
  if (rawGuests !== null) {
    const { value, reason } = parseGuests(rawGuests);
    if (value === null) reject(QUERY_NAME.guests, rawGuests, reason);
    else booking.guests = value;
  }

  const rawPromo = read(QUERY_NAME.promo);
  if (rawPromo !== null) {
    const { value, reason } = parsePromo(rawPromo);
    if (value === null) reject(QUERY_NAME.promo, rawPromo, reason);
    else booking.promo = value;
  }

  const rawLang = read(QUERY_NAME.lang);
  if (rawLang !== null) {
    const { value, reason } = parseLang(rawLang);
    if (value === null) reject(QUERY_NAME.lang, rawLang, reason);
    else booking.lang = value;
  }

  // --- 計測にしか使わないもの ---
  // 値の中身は検証しない。判定すべき正解を持たないうえ、弾いた分だけ計測が欠ける。
  // 上限を超えた分だけは捨て、捨てた事実を invalid に残す。
  params.forEach((value, name) => {
    if (!isTrackingName(name)) return;
    if (Object.prototype.hasOwnProperty.call(tracking, name)) return;
    if (!value) return;
    if (Object.keys(tracking).length >= TRACKING_MAX_ENTRIES) {
      reject(name, value, `more than ${TRACKING_MAX_ENTRIES} tracking parameters`);
      return;
    }
    tracking[name] = value.slice(0, TRACKING_MAX_VALUE_LENGTH);
  });

  return { booking, tracking, invalid };
}

/* ---------- build ---------- */

/**
 * ディープリンクのクエリ文字列を組み立てる。parseDeepLink の逆。
 *
 * null・未指定・検証を通らない値は出力しない。短い URL ほど共有されやすく、
 * 意味を持たない項目が並んだ URL は途中で切られたり、手で削られたりする。
 *
 * @param {Object} [input]
 * @param {Object} [input.booking] parseDeepLink().booking と同じ形
 * @param {Object} [input.tracking] 計測パラメータの key-value
 * @param {Object} [options]
 * @param {string} [options.today] 過去日を出力しないための現在日付
 * @returns {string} 'room=3&promo=EARLY30' 形式。出す項目が無ければ空文字
 */
export function buildDeepLink(input = {}, options = {}) {
  const { booking = {}, tracking = {} } = input;
  const { today = null } = options;
  const params = new URLSearchParams();

  // 出力側でも同じ検証を通す。呼び出し側が組み立てた値がそのまま
  // parseDeepLink に捨てられる URL を作らないため。
  const validated = {};
  BOOKING_KEYS.forEach((key) => {
    validated[key] = null;
  });

  if (booking.room !== null && booking.room !== undefined) {
    validated.room = parseRoom(String(booking.room)).value;
  }
  if (booking.checkIn !== null && booking.checkIn !== undefined) {
    validated.checkIn = parseDate(String(booking.checkIn), today).value;
  }
  if (booking.checkOut !== null && booking.checkOut !== undefined) {
    validated.checkOut = parseDate(String(booking.checkOut), today).value;
  }
  if (booking.guests !== null && booking.guests !== undefined) {
    validated.guests = parseGuests(String(booking.guests)).value;
  }
  if (booking.promo !== null && booking.promo !== undefined) {
    validated.promo = parsePromo(String(booking.promo)).value;
  }
  if (booking.lang !== null && booking.lang !== undefined) {
    validated.lang = parseLang(String(booking.lang)).value;
  }

  // parse 側と同じ整合条件を適用する。往復して同じ結果になる URL だけを出す。
  if (validated.checkIn === null) validated.checkOut = null;
  if (
    validated.checkIn !== null &&
    validated.checkOut !== null &&
    validated.checkOut <= validated.checkIn
  ) {
    validated.checkIn = null;
    validated.checkOut = null;
  }
  // 反映先が無いので、部屋の指定が無ければ部屋に紐づく項目は出さない。
  // lang は部屋と無関係なので残す。
  if (validated.room === null) {
    validated.checkIn = null;
    validated.checkOut = null;
    validated.guests = null;
    validated.promo = null;
  }

  BOOKING_KEYS.forEach((key) => {
    if (validated[key] === null) return;
    params.set(QUERY_NAME[key], String(validated[key]));
  });

  let count = 0;
  Object.keys(tracking).forEach((name) => {
    const value = tracking[name];
    if (!isTrackingName(name)) return;
    if (value === null || value === undefined || value === '') return;
    if (count >= TRACKING_MAX_ENTRIES) return;
    params.set(name, String(value).slice(0, TRACKING_MAX_VALUE_LENGTH));
    count += 1;
  });

  return params.toString();
}
