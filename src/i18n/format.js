// 表示書式（金額・率・日付・曜日・年月・時刻）をここに集約する。
//
// 以前は Intl の呼び出しが 5 ファイルに散っていた。同じ「日付を出す」でも
// 呼ぶ場所ごとにオプションが違い、timeZone を書き忘れた 1 か所だけが
// 1 日ずれる、という壊れ方をする。書式の知識はこのファイルの中だけに置き、
// 呼び出し側は「何を出したいか」だけを選ぶ。
//
// --- 日付の扱いの方針 -----------------------------------------------------
//
// "YYYY-MM-DD" はカレンダー上の日付であって時刻ではない。
// Date.parse("2026-08-28") は仕様上 UTC 深夜として解釈されるので、これを
// ローカルタイムゾーンで整形すると、UTC より西の地域では 1 日前
// （8月27日）が表示される。ズレが出るのは「UTC で解釈してローカルで
// 整形する」組み合わせだけなので、解釈と整形の基準を必ず揃える。
//
// この実装では UTC に揃える（timeZone: 'UTC' を必ず指定する）。理由は 2 つ。
//
//   1. 既存の日付計算がすでに UTC 基準になっている。booking.js の addDays /
//      calcNights は Date.parse と toISOString を、grid.js は Date.UTC を
//      使ってマス目を作る。表示だけローカルに寄せるとそこが継ぎ目になり、
//      「泊数は 3 泊なのに日付表示は 2 泊ぶん」のようなズレを生む。
//   2. チェックイン日はそもそもタイムゾーンを持たない情報。ホテルの
//      「8月28日」は宿泊者がどこから予約しても 8月28日であって、
//      閲覧者の現在地で変わってはいけない。
//
// 例外は「実在の瞬間」を表す値 ＝ サーバーが返す更新時刻で、これは
// 閲覧者のローカル時刻で出すのが正しい。区別は引数の型で強制する。
//
//   "YYYY-MM-DD" 文字列を取る関数 … 必ず UTC で整形する（カレンダー上の日付）
//   Date を取る関数               … ローカルで整形する（実在の瞬間）
//
// 呼び出し側に timeZone を選ばせない。選べるようにすると、書き忘れた
// 1 か所がまたずれる。

import { getIntlLocale } from './index.js';

/** 既定の通貨。多通貨対応はここを起点に広げる。 */
const DEFAULT_CURRENCY = 'JPY';

// 既定のロケール。
//
// 現在の表示言語（getLocale() が返す 'ja' / 'en'）に対応する BCP 47 の
// タグを使う。言語コードをそのまま Intl に渡さないのは、'en' の地域が
// 実装任せになり、日付の並びや通貨記号の位置をこちらから選べなくなるため。
// 対応表は i18n/index.js が 1 つだけ持つ（getIntlLocale がそれを引く）。
function defaultLocale() {
  return getIntlLocale();
}

/**
 * 書式オプション。すべての関数が同じ形で受け取る。
 *
 * @typedef {object} FormatOptions
 * @property {string} [locale]   例: 'ja-JP' / 'en-US'。省略時は現在の表示言語
 * @property {string} [currency] ISO 4217 の通貨コード。省略時は 'JPY'
 */

/* ---------- Intl インスタンスのキャッシュ ---------- */
//
// Intl.NumberFormat / DateTimeFormat の生成は、ロケールデータの読み込みを
// 伴うため安くない。カレンダーは 1 か月ぶんで 42 マスあり、その各マスで
// 金額と読み上げラベルを作るので、素直に new すると 1 回の月送りで
// 100 個以上のインスタンスを作っては捨てることになる。
//
// オプションは各関数が固定の値で組み立てており、呼び出し側から任意の
// オブジェクトが渡ることはない。そのためキーは JSON 文字列で足りる
// （プロパティの並び順がぶれない）。
const numberFormats = new Map();
const dateFormats = new Map();

function cached(store, Ctor, locale, options) {
  const key = `${locale} ${JSON.stringify(options)}`;
  let format = store.get(key);
  if (!format) {
    format = new Ctor(locale, options);
    store.set(key, format);
  }
  return format;
}

function numberFormat(locale, options) {
  return cached(numberFormats, Intl.NumberFormat, locale, options);
}

function dateFormat(locale, options) {
  return cached(dateFormats, Intl.DateTimeFormat, locale, options);
}

/* ---------- 金額・率 ---------- */

/**
 * 金額を通貨表記にする。
 *
 * 円は最小単位が1円なので小数は出さない。他通貨に切り替えたときは
 * Intl 側が持つ通貨ごとの小数桁を使う（JPY だけの決め打ちにしない）。
 *
 * 記号は narrowSymbol（地域名を伴わない短い形）を使う。ja-JP では全角の
 * 「￥」が、en-US では半角の「¥」が選ばれる。これは Intl が持つその言語の
 * 慣習であって、手で半角に直すとロケールを切り替えたときに再び自前の
 * 判断が混ざるので直さない。
 *
 * @param {number} value 金額
 * @param {FormatOptions} [options]
 * @returns {string} 例: 12800 → "￥12,800"
 */
export function formatMoney(value, options = {}) {
  const { locale = defaultLocale(), currency = DEFAULT_CURRENCY } = options;
  return numberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(value);
}

// 4 桁ごとに「万」で数える言語。日本語と中国語がこれにあたる。
// Intl の compact 表記は zh でも「1.3万」を出せるが、通貨記号が付いて
// セル幅に収まらないため、日本語と同じ自前の短縮に寄せる。
const MAN_UNIT_LOCALES = ['ja', 'zh'];

/**
 * 狭い画面向けの短縮表記。1万円以上は「1.3万」のように万単位へ丸める。
 * セル幅が 40px 前後まで縮んでも収まり、かつ日ごとの差は読み取れる粒度。
 *
 * 丸めた金額なので、読み上げや合計金額には使わないこと。
 * 「万」で数えるのは日本語と中国語（下の MAN_UNIT_LOCALES）で、
 * それ以外のロケールでは Intl の compact 表記（1.3K など）に委ね、
 * 桁の区切り方を現地の慣習に任せる。
 *
 * @param {number} value 金額
 * @param {FormatOptions} [options]
 * @returns {string} 例: 12800 → "1.3万" / 8000 → "8,000"
 */
export function formatMoneyShort(value, options = {}) {
  const { locale = defaultLocale(), currency = DEFAULT_CURRENCY } = options;

  if (MAN_UNIT_LOCALES.some((prefix) => locale.startsWith(prefix))) {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万`;
    }
    return numberFormat(locale, {}).format(value);
  }

  // 通貨記号は付けない。日本語側の「1.3万」も記号を持たないので、
  // ここで付けると同じセルの文字数が言語によって 1 つ増える。
  // カレンダーのマスは 320px 幅で約 36px しかなく、"¥12.8K"（6 文字）は
  // はみ出して切れる（親が overflow: hidden）。金額が黙って切れるのは
  // 一番避けたい壊れ方なので、短縮表記では記号を落として桁だけ見せ、
  // 記号付きの正確な額は通常表記と読み上げラベルの側に持たせる。
  return numberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * 符号付きの通貨表記。割引のようにマイナスであることが意味を持つ金額に使う。
 *
 * signDisplay を Intl に任せる。マイナス記号を自分で前置すると、
 * 記号を数字の後ろに置くロケールで位置がずれる。
 *
 * @param {number} value 金額（負数を含む）
 * @param {FormatOptions} [options]
 * @returns {string} 例: -3000 → "-￥3,000"
 */
export function formatMoneySigned(value, options = {}) {
  const { locale = defaultLocale(), currency = DEFAULT_CURRENCY } = options;
  return numberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    signDisplay: 'exceptZero',
  }).format(value);
}

/**
 * 率を百分率の表記にする。
 *
 * 記号を自分で足して `${rate * 100}%` と組み立てない。パーセント記号を
 * 数字の前に置く言語や、数字との間に空白を入れる言語があり、位置の判断が
 * 呼び出し側に散る。Intl に渡す値は 0.1 のような比率そのもの。
 *
 * @param {number} value 比率（0.1 = 10%）
 * @param {FormatOptions} [options] locale のみ使う
 * @returns {string} 例: 0.1 → "10%"
 */
export function formatPercent(value, options = {}) {
  const { locale = defaultLocale() } = options;
  return numberFormat(locale, {
    style: 'percent',
    // 15% のような 1 桁の小数は落とさず、10% に余計な ".0" も付けない。
    maximumFractionDigits: 2,
  }).format(value);
}

/* ---------- カレンダー上の日付（必ず UTC で整形する） ---------- */

// "YYYY-MM-DD" をタイムスタンプにする。
// 解釈できない値は null を返し、呼び出し側に元の文字列を出させる
// （Invalid Date を整形して "Invalid Date" と画面に出さない）。
function parseCalendarDate(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const time = Date.parse(dateStr);
  return Number.isNaN(time) ? null : time;
}

// カレンダー上の日付に共通の整形。timeZone: 'UTC' はここでだけ書く。
function formatCalendarDate(dateStr, locale, options) {
  const time = parseCalendarDate(dateStr);
  if (time === null) return typeof dateStr === 'string' ? dateStr : '';

  return dateFormat(locale, { ...options, timeZone: 'UTC' }).format(time);
}

/**
 * 日付を標準的な表記にする。日程の表示など、画面に出す既定の形。
 *
 * 月を数字で組み立てない（"3/4" は 3月4日にも 4月3日にも読める）。
 * 日と月のどちらが先か、月を略すかどうかは地域の慣習なので Intl に任せる。
 *
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {FormatOptions} [options]
 * @returns {string} 例: "2026年8月28日" / "Aug 28, 2026"
 */
export function formatDate(dateStr, options = {}) {
  const { locale = defaultLocale() } = options;
  return formatCalendarDate(dateStr, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 年を省いた短い日付。同じ年の中で並べる場面（通知バーの日程）に使う。
 *
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {FormatOptions} [options]
 * @returns {string} 例: "8月28日" / "Aug 28"
 */
export function formatDateShort(dateStr, options = {}) {
  const { locale = defaultLocale() } = options;
  return formatCalendarDate(dateStr, locale, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 月名を略さない日付。読み上げ用のラベルに使う。
 * 略語は読み上げると意味を取りにくいので、耳で聞く経路では長い形を出す。
 *
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {FormatOptions} [options]
 * @returns {string} 例: "2026年8月28日" / "August 28, 2026"
 */
export function formatDateLong(dateStr, options = {}) {
  const { locale = defaultLocale() } = options;
  return formatCalendarDate(dateStr, locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * 年月の見出し。カレンダーのヘッダに使う。
 *
 * 年と月を引数で受けるのは、カレンダーが「日を持たない年月」を扱うため。
 * "YYYY-MM-01" を組み立てて渡す形にすると、呼び出し側が日付文字列を
 * 作ることになり、月末の丸めのような判断がそちらに漏れる。
 *
 * @param {number} year  西暦（例: 2026）
 * @param {number} month 月（1〜12。JS の getMonth() と違い 1 始まり）
 * @param {FormatOptions} [options]
 * @returns {string} 例: "2026年8月" / "August 2026"
 */
export function formatMonth(year, month, options = {}) {
  const { locale = defaultLocale() } = options;
  return dateFormat(locale, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(Date.UTC(year, month - 1, 1));
}

/* ---------- 曜日 ---------- */

// 曜日名の基準になる週。2024-01-07 は日曜。
// 実在の 1 週間から 7 日ぶん取り出すことで、曜日と番号の対応表を
// 自前で持たずに済ませる。
const WEEKDAY_BASE = Date.UTC(2024, 0, 7);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 曜日名を 7 つ、日曜始まりで返す。
 *
 * 曜日名を辞書に持たないのは、7 語を言語ごとに書き写すことになるうえ、
 * 略し方（「日」/ "Sun" / "So"）そのものが地域の慣習だから。
 *
 * --- 将来の課題：週の開始曜日 ---
 * いまは日曜始まり固定で返す。calendar/grid.js の buildMonthGrid も
 * 日曜始まりでマス目を組んでおり、対応言語（ja / en-US）はどちらも
 * 日曜始まりなので現時点で実害はない。
 *
 * ただし欧州の多くは月曜始まりで、そこを対応言語に加えるときは
 * この関数だけでは足りない。マス目の生成（grid.js）とセルの並び、
 * さらに矢印キーの移動量（±7 の前提）まで見直す必要があり、
 * 日付計算のテストも書き直しになる。
 * 開始曜日そのものは Intl.Locale の weekInfo.firstDay から取れる
 * （まだ対応していない実行環境があるため、既定値を持つ形になる）。
 * 着手するのは対応言語を増やすときで、それまでこの固定は変えない。
 *
 * @param {'narrow'|'short'|'long'} width 見出し用は短く、読み上げ用は長く
 * @param {FormatOptions} [options]
 * @returns {Array<string>} index 0 が日曜、6 が土曜
 */
export function weekdayLabels(width, options = {}) {
  const { locale = defaultLocale() } = options;
  const format = dateFormat(locale, { weekday: width, timeZone: 'UTC' });

  return Array.from({ length: 7 }, (unused, i) =>
    format.format(WEEKDAY_BASE + i * MS_PER_DAY),
  );
}

/* ---------- 実在の瞬間（ローカルタイムゾーンで整形する） ---------- */

/**
 * 時刻を「時：分」で表す。
 *
 * カレンダー上の日付と違い、こちらはサーバーが返した実在の瞬間なので、
 * 閲覧者のローカルタイムゾーンで出す（timeZone を指定しない ＝ ローカル）。
 * 「最終更新 09:12」は閲覧者の時計と突き合わせて読むものなので、
 * UTC で出すと「更新されたばかりなのに 9 時間前に見える」ことになる。
 *
 * 手で ':' を組み立てると 12/24 時間制の違いを取りこぼす。
 *
 * @param {Date} date
 * @param {FormatOptions} [options]
 * @returns {string} 例: "09:12" / "9:12 AM"
 */
export function formatTime(date, options = {}) {
  const { locale = defaultLocale() } = options;
  return dateFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
