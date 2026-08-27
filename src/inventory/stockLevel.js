// 在庫数の「意味づけ」を一箇所に集めたモジュール。
// DOM も API も参照しない純粋関数だけを置く。
//
// 残室数をどこで何室以下と呼ぶか、どう表示するか、どの修飾子を当てるかが
// カード・モーダル・カレンダーに散ると、同じ在庫でも画面ごとに表記が食い違う。
// 判断はここに閉じ込め、呼び出し側は stock を渡して結果を受け取るだけにする。

// 在庫の状態。CSS の修飾子名とも対応する。
export const STOCK_LEVELS = {
  SOLDOUT: 'soldout',
  LAST: 'last',
  FEW: 'few',
  PLENTY: 'plenty',
};

// 「残りわずか」と扱う上限。閾値を変えたくなったときに触るのはここだけ。
const FEW_THRESHOLD = 3;

/**
 * 在庫数を状態に分類する。
 * 数値でない値（未取得・通信エラーなど）は満室と同じ扱いにする。
 * 判断がつかないときに「予約できる」側へ倒すと、押せてしまうボタンが残るため。
 *
 * @param {number} stock 残室数
 * @returns {string} STOCK_LEVELS のいずれか
 */
export function getStockLevel(stock) {
  const n = Number(stock);
  if (!Number.isFinite(n) || n <= 0) return STOCK_LEVELS.SOLDOUT;
  if (n === 1) return STOCK_LEVELS.LAST;
  if (n <= FEW_THRESHOLD) return STOCK_LEVELS.FEW;
  return STOCK_LEVELS.PLENTY;
}

/**
 * 予約を受け付けられる在庫かどうか。
 * ボタンの活性・満室バッジ・カードの装飾はすべてこの 1 関数を見る。
 * room.available と stock を別々に見ると、両者がずれた瞬間に
 * 「満室と書いてあるのに押せるボタン」が生まれる。
 *
 * @param {number} stock 残室数
 * @returns {boolean}
 */
export function isBookable(stock) {
  return getStockLevel(stock) !== STOCK_LEVELS.SOLDOUT;
}

/**
 * 在庫数を利用者向けの文言にする。
 * 残り 4 室以上を実数で出さないのは、多いときに具体的な数字を見せても
 * 判断の役に立たず、数字が動くたび画面が騒がしくなるため。
 *
 * @param {number} stock 残室数
 * @returns {string} 満室 / 残り1室 / 残り{n}室 / 空室あり
 */
export function getStockLabel(stock) {
  const level = getStockLevel(stock);

  if (level === STOCK_LEVELS.SOLDOUT) return '満室';
  if (level === STOCK_LEVELS.LAST) return '残り1室';
  if (level === STOCK_LEVELS.FEW) return `残り${Number(stock)}室`;
  return '空室あり';
}

/**
 * BEM 修飾子の接尾辞を返す。
 * 呼び出し側で `room-card__stock` などのエレメント名に連結して使う。
 * 状態名と CSS のクラス名の対応をここだけに持たせ、
 * 表示側が文字列を組み立てて綴りを間違える余地をなくす。
 *
 * @param {number} stock 残室数
 * @returns {string} 例: "--few"
 */
export function getStockModifier(stock) {
  return `--${getStockLevel(stock)}`;
}

/**
 * 外部から届いた在庫の値を数値に正規化する。
 * 解釈できない値は null を返し、呼び出し側に「使わない」と判断させる。
 *
 * Number() 単体に任せないのは、null / '' / true が 0 や 1 に化けるため。
 * 在庫が欠けているだけなのに 0 と解釈すると、満室でない部屋を満室として
 * 表示し、予約できるはずの客を追い返すことになる。
 *
 * @param {*} value API から届いた stock
 * @returns {?number} 解釈できなければ null
 */
export function readStock(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
