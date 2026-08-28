// 料金内訳の表示部品。計算はしない（calculatePrice の結果を受け取って描くだけ）。
// 金額の意味づけは calculator が lines として確定させているので、
// ここでは「どう見せるか」だけを扱う。
//
// 折りたたみは <details>/<summary> をそのまま使う。開閉のための JS を持たないので、
// 状態変数も、開閉中に update が走ったときの整合も考えずに済む。
// 利用者が開いたまま日付を変えても、details の open は DOM に残るため
// 中身だけ差し替えれば開いたまま更新される。

import { formatMoney, formatMoneySigned, formatPercent } from '../i18n/format.js';
import { totalPriceNote } from './displayPrice.js';
import { t, tPlural, localizeField, onLocaleChange } from '../i18n/index.js';

/**
 * calculator が返した「キー + 値」の記述を、表示用の 1 文にする。
 *
 * 金額・率・単複は、値の種類ごとに解き方が違う。calculator の側で
 * 文字列にしてしまうと計算時の言語が焼き付くので、種類だけを伝えてもらい、
 * 解くのは描画のたびにこちらで行う。
 *
 *   params   … そのまま埋める値（個数など）
 *   money    … 金額。ロケールの通貨書式を通す
 *   percents … 率。0.1 → "10%"（記号の位置も Intl に任せる）
 *   plurals  … 数に応じて語形が変わる語。tPlural で "3泊" / "3 nights" にする
 *
 * @param {{key: string, params?: Object, money?: Object, percents?: Object, plurals?: Object}} part
 * @returns {string}
 */
function resolvePart(part) {
  const values = { ...(part.params || {}) };

  Object.entries(part.money || {}).forEach(([name, amount]) => {
    values[name] = formatMoney(amount);
  });
  Object.entries(part.percents || {}).forEach(([name, rate]) => {
    values[name] = formatPercent(rate);
  });
  Object.entries(part.plurals || {}).forEach(([name, count]) => {
    values[name] = tPlural(name, count);
  });

  return t(part.key, values);
}

/** 明細行のラベル。辞書のキーを持つ行と、データ由来の名前を持つ行がある。 */
function resolveLabel(line) {
  if (line.labelKey) {
    return resolvePart({
      key: line.labelKey,
      params: line.labelParams,
      percents: line.labelPercents,
    });
  }
  // 客室名・割引名は言語別フィールドのまま届くので、ここで現在の言語に解く。
  return localizeField(line.labelText);
}

/** 明細行の補足。複数の断片を空白で繋ぐ（断片ごとに括弧などは辞書側が持つ）。 */
function resolveNote(line) {
  if (line.noteParts) {
    const text = line.noteParts.map(resolvePart).join(' ');
    return text || undefined;
  }
  // 翻訳しない値（クーポンコードなど）はそのまま。
  return line.note;
}

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
  label.textContent = resolveLabel(line);

  // 補足（計算根拠）は薄く小さく、ラベルの下にぶら下げる。
  const noteText = resolveNote(line);
  if (noteText) {
    const note = document.createElement('small');
    note.className = 'breakdown__note';
    note.textContent = noteText;
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
  summary.textContent = t('breakdown.nightlyTitle', {
    nights: tPlural('nights', nightly.length),
  });
  details.appendChild(summary);

  nightly.forEach((night) => {
    // 1泊ごとの内訳。加算・割引があるときだけ note に出す。
    const parts = [];
    if (night.extraGuestCharge > 0) {
      parts.push(t('breakdown.nightlyExtraGuest', {
        amount: formatMoney(night.extraGuestCharge),
      }));
    }
    if (night.singleDiscount > 0) {
      parts.push(t('breakdown.nightlySingleDiscount', {
        amount: formatMoneySigned(-night.singleDiscount),
      }));
    }

    details.appendChild(
      createRow({
        key: `night-${night.date}`,
        // 日付そのものは書式が言語で変わるが、明細では並べて比べる列なので
        // ISO のまま出す（並び順が崩れず、桁も揃う）。
        labelText: night.date,
        amount: night.subtotal,
        note:
          parts.length > 0
            ? `${t('breakdown.nightlyBase', { amount: formatMoney(night.baseRate) })} / ${parts.join(' / ')}`
            : undefined,
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

  // 直近に描いた内容。言語が変わったときに同じ結果で描き直すために持つ。
  // 再計算はしない（金額は言語で変わらないし、計算のたびに通信も伴わない）。
  let lastArgs = null;

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

    lastArgs = { breakdown, guests };

    total.textContent = formatMoney(breakdown.total);
    meta.textContent = t('breakdown.meta', {
      note: totalPriceNote(),
      guests: tPlural('guests', guests),
      nights: tPlural('nights', breakdown.nights),
    });

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
    lastArgs = null;
    el.hidden = true;
    total.textContent = '';
    meta.textContent = '';
    body.textContent = '';
  }

  // 言語が変わったら、直近の結果でそのまま描き直す。
  // 隠れている（まだ計算していない）ときは何もしない。次に update が
  // 呼ばれた時点の言語で描かれるので、先回りする意味がない。
  const unsubscribeLocale = onLocaleChange(() => {
    if (lastArgs) update(lastArgs.breakdown, lastArgs.guests);
  });

  return {
    el,
    update,
    clear,

    /** 購読を外す。使い捨てにする場合は必ず呼ぶ。 */
    destroy() {
      unsubscribeLocale();
      el.remove();
    },
  };
}
