// 金額の表示形式をここに集約する。
// 通常・短縮・符号付きの3つを Intl.NumberFormat で組み立てる。手で「¥」と
// カンマを繋ぐと、桁区切りの位置も通貨記号の前後も日本語以外で崩れるため、
// 書式の知識は全てこのファイルの中だけに置く。
//
// ロケールと通貨コードを引数で上書きできるようにしてあるのは、表示言語の
// 切り替え（<html lang>）と、将来の多通貨対応の入口を1か所に閉じるため。

/** 既定のロケール。<html lang> に追随させ、未設定なら日本語。 */
function defaultLocale() {
  return (typeof document !== 'undefined' && document.documentElement.lang) || 'ja-JP';
}

const DEFAULT_CURRENCY = 'JPY';

/**
 * 書式オプション。全ての関数が同じ形で受け取る。
 *
 * @typedef {object} MoneyOptions
 * @property {string} [locale]   例: 'ja-JP' / 'en-US'。省略時は <html lang>
 * @property {string} [currency] ISO 4217 の通貨コード。省略時は 'JPY'
 */

/**
 * 金額を通貨表記にする。
 *
 * 円は最小単位が1円なので小数は出さない。他通貨に切り替えたときは
 * Intl 側が持つ通貨ごとの小数桁を使う（JPY だけの決め打ちにしない）。
 *
 * @param {number} value 金額
 * @param {MoneyOptions} [options]
 * @returns {string} 例: 12800 → "￥12,800"
 */
export function formatMoney(value, options = {}) {
  const { locale = defaultLocale(), currency = DEFAULT_CURRENCY } = options;
  // 記号は narrowSymbol（地域名を伴わない短い形）を使う。ja-JP では全角の
  // 「￥」が選ばれる。これは Intl が持つその言語の慣習であって、手で半角に
  // 直すとロケールを切り替えたときに再び自前の判断が混ざるので直さない。
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(value);
}

/**
 * 狭い画面向けの短縮表記。1万円以上は「1.3万」のように万単位へ丸める。
 * セル幅が 40px 前後まで縮んでも収まり、かつ日ごとの差は読み取れる粒度。
 *
 * 丸めた金額なので、読み上げや合計金額には使わないこと。
 * 「万」は日本語圏の数え方なので、それ以外のロケールでは Intl の
 * compact 表記（1.3K など）に委ね、桁の区切り方を現地の慣習に任せる。
 *
 * @param {number} value 金額
 * @param {MoneyOptions} [options]
 * @returns {string} 例: 12800 → "1.3万" / 8000 → "8,000"
 */
export function formatMoneyShort(value, options = {}) {
  const { locale = defaultLocale(), currency = DEFAULT_CURRENCY } = options;

  if (locale.startsWith('ja')) {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万`;
    }
    return new Intl.NumberFormat(locale).format(value);
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
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
 * @param {MoneyOptions} [options]
 * @returns {string} 例: -3000 → "-￥3,000"
 */
export function formatMoneySigned(value, options = {}) {
  const { locale = defaultLocale(), currency = DEFAULT_CURRENCY } = options;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    signDisplay: 'exceptZero',
  }).format(value);
}
