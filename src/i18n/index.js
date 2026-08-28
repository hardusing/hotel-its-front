// 翻訳の基盤。辞書の保持・現在言語の保持・文言の取得・言語変更の通知を持つ。
//
// これまで（src/i18n.js）は辞書オブジェクトを公開するだけで、文言を「引く」
// 手段が無かった。そのため翻訳を当てられるのは、起動時に HTML へ書かれていて
// data-i18n の一括走査に引っかかる要素だけで、JS が後から組み立てるカード・
// モーダル・カレンダーは日本語のままだった。描画側が辞書を引けないのだから、
// 描画コードをいくら直しても翻訳は入らない。
//
// そこでこのモジュールは 3 つを公開する。
//   t()              … 描画のその場で文言を引く（DOM 走査に依存しない）
//   getLocale()      … 「いまどの言語か」を DOM ではなくここから読む
//   onLocaleChange() … 言語が変わったことを購読する
//
// 3 つ目が要になる。各モジュールが自分の描き直し方を自分で知っている状態に
// しておかないと、言語切り替えのたびに「あれも直す・これも直す」を 1 か所に
// 足し続けることになり、画面が増えるほど抜けが出る。
//
// このモジュールは DOM に触らない。<html lang> の更新や data-i18n の適用は
// lang.js の役目で、ここは「文言と言語」だけを持つ。

import ja from './ja.js';
import en from './en.js';
import zh from './zh.js';

/** 対応言語と辞書。ここに足せば t() も購読も自動的に対応する。 */
const dictionaries = { ja, en, zh };

/**
 * 翻訳が見つからないときに最後に頼る言語。
 * 原文（日本語）を正とし、英語の訳が未整備でも画面が空にならないようにする。
 */
export const FALLBACK_LOCALE = 'ja';

/** 何も指定されなかったときの言語。 */
export const DEFAULT_LOCALE = 'ja';

/**
 * 対応言語コードの一覧。言語ボタンや ?lang= の検証に使う。
 *
 * 関数にしてあるのは、開発時に疑似ロケール（i18n/pseudo.js）が後から
 * 登録されるため。定数の配列にすると、読み込んだ瞬間の顔ぶれが
 * import した側に焼き付いて、あとで足した言語が見えない。
 *
 * @returns {Array<string>}
 */
export function getSupportedLocales() {
  return Object.keys(dictionaries);
}

// いまの表示言語。DOM ではなくこの変数が唯一の正とする。
// <html lang> を正にすると、DOM がまだ無い時点（テスト・起動直後）で
// 言語が引けず、モジュールごとに「無ければ ja」の判断が散らばる。
let currentLocale = DEFAULT_LOCALE;

// 言語変更の購読者。Set にしてあるのは、同じ関数を二重登録しても
// 一度しか呼ばれないようにするため。
const listeners = new Set();

// 開発時だけ警告を出す。本番でコンソールを埋めても直す人が見ないうえ、
// 翻訳漏れの箇所（＝キー名）が利用者の画面に出ている以上、
// 気付くべきなのは開発中の側。
function isDev() {
  return (
    typeof process === 'undefined' ||
    !process.env ||
    process.env.NODE_ENV !== 'production'
  );
}

/**
 * 開発時かどうか。開発専用の仕組み（疑似ロケール）が判定を共有するために公開する。
 *
 * @returns {boolean}
 */
export function isDevMode() {
  return isDev();
}

function warn(message) {
  if (!isDev()) return;
  // eslint-disable-next-line no-console
  console.warn(`[i18n] ${message}`);
}

/**
 * 開発時だけの記録。警告ではなく「何が起きたか」の説明に使う。
 *
 * 言語の決定は、URL・保存値・ブラウザ設定・既定値のどれが効いたのかが
 * 画面からは一切分からない。「なぜか英語で開く」という報告を受けたとき、
 * 順番のどこで決まったかを追える経路が要る。本番では出さない
 * （利用者のコンソールを埋めても直す人は見ない）。
 *
 * @param {string} message
 */
export function devLog(message) {
  if (!isDev()) return;
  // eslint-disable-next-line no-console
  console.info(`[i18n] ${message}`);
}

/**
 * 対応している言語コードか。
 *
 * @param {*} locale
 * @returns {boolean}
 */
export function isSupportedLocale(locale) {
  return typeof locale === 'string' && Object.hasOwn(dictionaries, locale);
}

/**
 * 現在の表示言語を返す。
 *
 * @returns {string} 'ja' | 'en'
 */
export function getLocale() {
  return currentLocale;
}

/**
 * 表示言語を切り替え、購読者全員に通知する。
 *
 * 対応していない言語は無視する（呼び出し側で弾く必要はない）。
 * 同じ言語を指定したときも通知しない。通知が「本当に変わったとき」だけに
 * 限られていないと、購読側が再描画の回数を自分で数える羽目になる。
 *
 * @param {string} locale 'ja' | 'en'
 * @returns {boolean} 実際に変わったら true
 */
export function setLocale(locale) {
  if (!isSupportedLocale(locale)) {
    warn(`未対応の言語です: ${String(locale)}`);
    return false;
  }
  if (locale === currentLocale) return false;

  currentLocale = locale;

  // 1 つの購読者が例外を投げても、残りの購読者への通知は続ける。
  // ここで止まると「一部だけ翻訳が変わった画面」が残り、
  // 原因が最初の例外だったことが画面から読み取れなくなる。
  listeners.forEach((listener) => {
    try {
      listener(currentLocale);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  });

  return true;
}

/**
 * 言語が変わったときに呼ばれるコールバックを登録する。
 *
 * 各モジュールはここで自分の描き直しを登録する。呼ばれた時点で
 * getLocale() は新しい言語を返すので、コールバックは引数を無視して
 * 「いまの言語で描き直す」だけ書けばよい。
 *
 * @param {(locale: string) => void} listener
 * @returns {() => void} 解除する関数。使い捨ての画面はこれを呼んで後始末する
 *   （呼ばないと、閉じたモーダルの描き直しが言語を変えるたびに走り続ける）。
 */
export function onLocaleChange(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// 与えられた言語の辞書から生の文言を引く。無ければ undefined。
function lookup(locale, key) {
  const dict = dictionaries[locale];
  if (!dict) return undefined;
  // Object.hasOwn で確かめてから読む。'constructor' のようなキーを
  // 渡されたときにプロトタイプ側の値を拾わないため。
  return Object.hasOwn(dict, key) ? dict[key] : undefined;
}

/**
 * データ側の言語別フィールドを、現在の言語の文字列にする。
 *
 * 辞書（t()）が受け持つのは「画面の構造に属する文言」＝ボタン・ラベル・
 * 見出しで、これらは画面を作り変えるとき一緒に変わるのでコードと同じ場所に
 * ある方がよい。一方、客室名・説明・割引名は運営が足したり書き換えたりする
 * コンテンツで、フロントの辞書に置くと部屋を 1 つ増やすたびに辞書の編集と
 * 再デプロイが要る。そこでこちらは API の値としてそのまま持ち回り、
 * 表示の直前にこの関数で解く。
 *
 * 文字列をそのまま返すのは、単一言語しか返さない API に差し替わっても
 * 呼び出し側を書き換えずに済ませるため。
 *
 * @param {string|Object<string, string>|number|null|undefined} value
 * @returns {string}
 */
export function localizeField(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);

  if (Object.hasOwn(value, currentLocale)) return String(value[currentLocale]);
  if (Object.hasOwn(value, FALLBACK_LOCALE)) {
    warn(`言語別フィールドに ${currentLocale} がありません`);
    return String(value[FALLBACK_LOCALE]);
  }

  // どちらも無ければ、入っている最初の値を出す。画面を空にするより、
  // 読めない言語でも何か出ている方が「翻訳が抜けている」と気付ける。
  const first = Object.values(value)[0];
  warn('言語別フィールドに ja も現在の言語もありません');
  return first === undefined ? '' : String(first);
}

// Intl に渡す BCP 47 のロケールタグ。
//
// 内部の言語コード（'ja' / 'en'）をそのまま Intl に渡さないのは、
// 'en' が実装依存で en-US 相当に解決され、日付や通貨の慣習を
// こちらから選べなくなるため。「表示言語」と「地域の書式」は別の概念なので、
// 対応表をここに 1 つだけ持つ。
const INTL_LOCALES = {
  ja: 'ja-JP',
  en: 'en-US',
  // 簡体字は中国本土の慣習に合わせる（繁体字を足すときは zh-TW を別に足す）。
  zh: 'zh-CN',
};

/**
 * 現在の言語に対応する Intl 用のロケールタグを返す。
 * 金額・日付・曜日・複数形の書式は、必ずこれを通して決める。
 *
 * @returns {string} 例: 'ja-JP'
 */
export function getIntlLocale() {
  return INTL_LOCALES[currentLocale] || currentLocale;
}

// 文字を書き進める向き。<html dir> に入れる。
//
// いまの対応言語はどちらも左から右なので、実際の表示は変わらない。
// それでも表に持って毎回書き出すのは、アラビア語やヘブライ語を足す日に
// 「dir を出す場所」を探し回らずに済ませるため。属性が常に付いていれば、
// 言語を増やす作業はこの表に 1 行足すことに閉じる
// （CSS 側は margin-left ではなく margin-inline-start のような論理
//   プロパティへ寄せる必要があり、そちらは別の作業になる）。
const TEXT_DIRECTIONS = {
  ja: 'ltr',
  en: 'ltr',
  zh: 'ltr',
};

/**
 * 指定した言語（省略時は現在の言語）の文字方向を返す。
 *
 * @param {string} [locale]
 * @returns {'ltr'|'rtl'}
 */
export function getTextDirection(locale = currentLocale) {
  return TEXT_DIRECTIONS[locale] || 'ltr';
}

/**
 * 辞書を後から登録する。開発用の疑似ロケールのための入口。
 *
 * 本番では何もしない。翻訳は辞書ファイルとして置き、ビルドに含めるのが
 * 本筋で、実行時に差し込む経路を製品に残すと「画面の文言がどこから来たか」
 * がコードから追えなくなる。
 *
 * @param {string} locale 言語コード
 * @param {Object<string, string>} dictionary
 * @param {Object} [meta]
 * @param {string} [meta.intlLocale] Intl に渡すタグ（省略時は locale そのもの）
 * @param {'ltr'|'rtl'} [meta.dir] 文字方向（省略時は ltr）
 * @returns {boolean} 登録したら true
 */
export function registerDictionary(locale, dictionary, meta = {}) {
  if (!isDev()) return false;
  if (typeof locale !== 'string' || locale === '' || !dictionary) return false;

  dictionaries[locale] = dictionary;
  INTL_LOCALES[locale] = meta.intlLocale || locale;
  TEXT_DIRECTIONS[locale] = meta.dir || 'ltr';
  return true;
}

// "{name}" 形式のプレースホルダを params の値で置き換える。
//
// 置き換えは 1 回の走査で行い、埋め込んだ値の中身は二度と見ない。
// 置換結果をもう一度走査すると、利用者が入力した文字列に "{...}" が
// 含まれていた場合に、それが次のプレースホルダとして解釈されてしまう。
function interpolate(text, params, key) {
  if (!params) return text;

  return text.replace(/\{(\w+)\}/g, (match, name) => {
    if (!Object.hasOwn(params, name)) {
      warn(`"${key}" のプレースホルダ {${name}} に対応する値がありません`);
      // 値が無いときはプレースホルダをそのまま残す。空文字にすると
      // 「文が欠けている」ことが画面から分からなくなる。
      return match;
    }
    const value = params[name];
    // 数値の桁区切りや通貨記号はロケールごとに違う。ここで String() に
    // 任せると ja でも en でも "12800" になるので、書式が要る値は
    // 呼び出し側が i18n/format.js で整形した「文字列」を渡すこと。
    //
    // 言語別フィールド（{ja: '...', en: '...'}）はここで解決する。
    // 呼び出し側が先に文字列へ潰してから渡す形にすると、その時点の言語が
    // 焼き付いてしまい、あとで言語が変わっても文が古いままになる。
    // 生の値のまま持ち回り、描画のたびにここで解く。
    return localizeField(value);
  });
}

/**
 * キーに対応する文言を返す。
 *
 * 返すのは常にプレーンテキストで、HTML は返さない。
 * 辞書の値は将来 CMS や翻訳サービスから来るようになる可能性があり、
 * その時点で「外部から来た文字列」になる。t() の戻り値が HTML として
 * 扱われる前提だと、辞書に <img onerror=...> が 1 つ紛れ込んだだけで
 * 画面を描くたびにスクリプトが動く。呼び出し側は必ず textContent に
 * 入れること（innerHTML に渡さない）。強調や改行のようにマークアップが
 * 要る箇所は、文言を分けて要素を組み立てる側で表現する。
 *
 * フォールバックの順は 現在言語 → ja → キー名。
 * 最後にキー名を返すのは、画面を空白にしないためと、
 * 出ている文字列がそのまま探すべきキーになるため。
 *
 * @param {string} key 例: 'rooms.title'
 * @param {Object<string, string|number>} [params] {name} を置き換える値
 * @returns {string} プレーンテキスト
 */
export function t(key, params) {
  if (typeof key !== 'string' || key === '') {
    warn(`キーが不正です: ${String(key)}`);
    return '';
  }

  let text = lookup(currentLocale, key);

  if (text === undefined) {
    text = lookup(FALLBACK_LOCALE, key);
    if (text !== undefined) {
      warn(`"${key}" が ${currentLocale} に未定義のため ${FALLBACK_LOCALE} を表示します`);
    }
  }

  if (text === undefined) {
    warn(`"${key}" はどの辞書にも定義されていません`);
    return key;
  }

  return interpolate(text, params, key);
}

// Intl.PluralRules はロケールごとに使い回す。生成はロケールデータの
// 読み込みを伴うので安くない。tPlural は人数プルダウン（定員の数だけ）、
// 料金内訳の各行、日程の表示から呼ばれ、1 画面で何十回も通る。
// 書式側（i18n/format.js）はキャッシュしてあるのに、ここだけ毎回
// new していた。
const pluralRulesCache = new Map();

function pluralRules(locale) {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

/**
 * 数に応じた文言を返す。
 *
 * "nights.one" / "nights.other" のように、基準キーへ複数形カテゴリを
 * サフィックスとして足したキーを引く。カテゴリの判定は Intl.PluralRules に
 * 任せる。英語は 1 と 2 で語形が変わり、日本語は変わらず、ロシア語は
 * 3 種類ある。この分岐を自前の if で書くと、言語を足すたびに
 * 呼び出し側の全箇所を見直すことになる。
 *
 * count は {count} として自動で params に入るので、辞書側は
 *   'nights.other': '{count} nights'
 * のように書ける。
 *
 * @param {string} baseKey サフィックスを除いたキー 例: 'nights'
 * @param {number} count 数
 * @param {Object<string, string|number>} [params] 追加の置換値
 * @returns {string} プレーンテキスト
 */
export function tPlural(baseKey, count, params) {
  const merged = { count, ...params };

  // 判定は現在言語で行う。フォールバックで ja の文言が出る場合でも
  // ここを ja に寄せてはいけない。日本語には other しか無いので、
  // 英語の "one" があっても永久に選ばれなくなる。
  let category = 'other';
  try {
    category = pluralRules(getIntlLocale()).select(count);
  } catch {
    // ロケール名が Intl に渡せない形でも、other だけは必ず引けるので続ける。
  }

  const key = `${baseKey}.${category}`;

  // 選ばれたカテゴリのキーが無ければ other に落とす。
  // 辞書に one だけ書き忘れた状態でも、数の合わない文が出るだけで済み、
  // キー名が画面に出るよりは読める。
  if (
    lookup(currentLocale, key) === undefined &&
    lookup(FALLBACK_LOCALE, key) === undefined &&
    category !== 'other'
  ) {
    warn(`"${key}" が無いため "${baseKey}.other" を使います`);
    return t(`${baseKey}.other`, merged);
  }

  return t(key, merged);
}

/**
 * 辞書そのもの。言語コードの検証など、文言を引く以外の用途に使う。
 * 文言を取り出すのは必ず t() を通すこと（フォールバックと補間が効かなくなる）。
 */
export const translations = dictionaries;
