// 料金ルールの取得を1か所に集める。
// カード・カレンダー・モーダルがそれぞれ fetchPricingRules() を呼ぶと、
// 同じ画面の中で別々のルールを持つ瞬間ができ、表示が食い違う。
// ここで Promise ごとキャッシュし、何度呼ばれても取得は一度だけにする。

import { fetchPricingRules } from '../api/pricing.js';

let rulesPromise = null;
let cachedRules = null;

/**
 * 料金ルールを取得する（2回目以降は同じ Promise を返す）。
 * 取得に失敗した場合は null を返す。料金表示は落とさず、
 * 税抜であることを明示する表記へ切り替えるため（displayPrice.js 参照）。
 *
 * @returns {Promise<?object>}
 */
export function loadPricingRules() {
  if (!rulesPromise) {
    rulesPromise = fetchPricingRules()
      .then((rules) => {
        cachedRules = rules;
        return rules;
      })
      .catch((err) => {
        // 失敗を握り潰さずに記録だけして、呼び出し側には null を渡す。
        // eslint-disable-next-line no-console
        console.error(err);
        // 次に呼ばれたときに再取得できるよう、失敗した Promise は捨てる。
        rulesPromise = null;
        return null;
      });
  }
  return rulesPromise;
}

/**
 * 取得済みのルールを同期的に返す（未取得なら null）。
 * すでに取得済みであることが分かっている場所からの読み出し専用。
 */
export function getPricingRules() {
  return cachedRules;
}
