// 料金内訳の表示部品。計算はしない（calculatePrice の結果を受け取って描くだけ）。
// 金額の意味づけは calculator が lines として確定させているので、
// ここでは「どう見せるか」だけを扱う。
//
// 折りたたみは <details>/<summary> をそのまま使う。開閉のための JS を持たないので、
// 状態変数も、開閉中に update が走ったときの整合も考えずに済む。
// 利用者が開いたまま日付を変えても、details の open は DOM に残るため
// 中身だけ差し替えれば開いたまま更新される。

import { formatMoney, formatMoneySigned } from './format.js';
import { TOTAL_PRICE_NOTE } from './displayPrice.js';

/**
 * 明細の金額を表示用の文字列にする。
 * 割引だけは符号付き（マイナス表記）にし、それ以外は符号なしで揃える。
 * 全行に符号を付けると加算側に「+」が並び、かえって差額が読み取りにくくなる。
 */
function formatSigned(amount) {
  return amount < 0 ? formatMoneySigned(amount) : formatMoney(amount);
}

/** 明細1行分の要素を作る。 */
function createRow(line) {
  const row = document.createElement('div');
  row.className = 'breakdown__row';
  if (line.key === 'total') row.classList.add('breakdown__row--total');
  if (line.amount < 0) row.classList.add('breakdown__row--discount');

  const label = document.createElement('span');
  label.className = 'breakdown__label';
  label.textContent = line.label;

  // 補足（計算根拠）は薄く小さく、ラベルの下にぶら下げる。
  if (line.note) {
    const note = document.createElement('small');
    note.className = 'breakdown__note';
    note.textContent = line.note;
    label.appendChild(note);
  }

  const amount = document.createElement('span');
  amount.className = 'breakdown__amount';
  amount.textContent = formatSigned(line.amount);

  row.append(label, amount);
  return row;
}

/** 日別内訳を、さらに内側の <details> として作る。 */
function createNightlyDetails(nightly) {
  const details = document.createElement('details');
  details.className = 'breakdown__nightly';

  const summary = document.createElement('summary');
  summary.textContent = `日別の室料（${nightly.length}泊）`;
  details.appendChild(summary);

  nightly.forEach((night) => {
    // 1泊ごとの内訳。加算・割引があるときだけ note に出す。
    const parts = [];
    if (night.extraGuestCharge > 0) parts.push(`人数加算 ${formatMoney(night.extraGuestCharge)}`);
    if (night.singleDiscount > 0) parts.push(`1名利用割引 ${formatMoneySigned(-night.singleDiscount)}`);

    details.appendChild(
      createRow({
        key: `night-${night.date}`,
        label: night.date,
        amount: night.subtotal,
        note: parts.length > 0 ? `基本 ${formatMoney(night.baseRate)} / ${parts.join(' / ')}` : undefined,
      }),
    );
  });

  return details;
}

/**
 * 料金内訳ビューを作る。
 *
 * 常時見えるのは合計と一行の要約だけで、明細は開いたときに読ませる。
 * 金額を隠さず、かつ選択の邪魔をしないための折衷。
 *
 * @returns {{el: HTMLElement, update: Function, clear: Function}}
 */
export function createPriceBreakdown() {
  const el = document.createElement('details');
  el.className = 'breakdown';
  el.hidden = true;

  // summary は常時表示される部分。合計と、その金額が何を含むかの一行。
  const summary = document.createElement('summary');
  summary.className = 'breakdown__summary';

  const total = document.createElement('span');
  total.className = 'breakdown__total';

  const meta = document.createElement('span');
  meta.className = 'breakdown__meta';

  summary.append(total, meta);

  // 明細の入れ物。更新のたびにここだけを作り直す。
  const body = document.createElement('div');
  body.className = 'breakdown__body';

  el.append(summary, body);

  /**
   * 計算結果を反映する。
   *
   * @param {object} breakdown calculatePrice の戻り値
   * @param {number} guests    人数（要約の「◯名◯泊」に使う）
   */
  function update(breakdown, guests) {
    // エラーや 0 泊のときは何も見せない。中途半端な金額を出すより黙る方が誤解がない。
    if (!breakdown || breakdown.error || breakdown.nights <= 0) {
      clear();
      return;
    }

    total.textContent = formatMoney(breakdown.total);
    meta.textContent = `${TOTAL_PRICE_NOTE} / ${guests}名${breakdown.nights}泊`;

    body.textContent = '';

    // 合計以外の行を順に並べ、最後に合計を置く（区切り線と太字は CSS 側で付ける）。
    breakdown.lines
      .filter((line) => line.key !== 'total')
      .forEach((line) => body.appendChild(createRow(line)));

    // 日別明細は室料の直後ではなく末尾に置く。まず総額の構成を読み、
    // 必要な人だけがさらに内側を開く、という深さの順序にする。
    body.appendChild(createNightlyDetails(breakdown.nightly));

    const totalLine = breakdown.lines.find((line) => line.key === 'total');
    if (totalLine) body.appendChild(createRow(totalLine));

    el.hidden = false;
  }

  /** 表示を消す。open は保持したままにして、次に出したときの開閉を引き継ぐ。 */
  function clear() {
    el.hidden = true;
    total.textContent = '';
    meta.textContent = '';
    body.textContent = '';
  }

  return { el, update, clear };
}
