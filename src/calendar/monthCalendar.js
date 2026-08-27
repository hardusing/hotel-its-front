// 月間料金カレンダーのビュー層。
// 料金取得は api/calendar.js、マス目の生成と日付の比較・列挙は calendar/grid.js、
// 「今日」と泊数の計算は booking.js、金額の書式は format.js に任せ、
// ここは描画と選択状態だけを持つ。
// 外部からは createMonthCalendar 1 つだけを公開する。
//
// 呼び出し側は返ってきた el を好きな場所に appendChild し、
// 不要になったら destroy() を呼ぶだけでよい。

import { fetchMonthlyRates } from '../api/calendar';
import { todayStr, calcNights, addDays } from '../booking';
import { formatMoney, formatMoneyShort } from '../pricing/format.js';
import { loadPricingRules, getPricingRules } from '../pricing/rulesStore.js';
import { toNightlyDisplayPrice, nightlyPriceNote } from '../pricing/displayPrice.js';
import {
  buildMonthGrid,
  shiftMonth,
  isSameOrAfter,
  eachDateBetween,
} from './grid';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// 満室・休館を含む期間を選んだときの警告を出しておく時間（ミリ秒）
const WARNING_DURATION = 3000;

/**
 * 読み上げ用のラベルを組み立てる。
 * 色分けとセル内の短い表記だけでは伝わらない情報（何月何日か、何曜日か、
 * いくらか、空いているか）を、1 文にまとめて持たせる。
 *
 * @param {{date: string, inMonth: boolean, weekday: number}} cell グリッドのマス
 * @param {Object|undefined} rate その日の料金情報
 * @param {boolean} isPast 今日より前か
 * @returns {string} 例: "2026年8月28日 金曜日 14,720円 空室あり 残り5室"
 */
function buildDayLabel(cell, rate, isPast) {
  const [y, m, d] = cell.date.split('-').map(Number);
  const parts = [`${y}年${m}月${d}日`, `${WEEKDAY_LABELS[cell.weekday]}曜日`];

  if (!cell.inMonth) {
    parts.push('表示中の月以外');
  } else if (!rate) {
    parts.push('料金未取得');
  } else if (rate.closed) {
    parts.push('休館日');
  } else if (!rate.available) {
    parts.push(formatMoney(toNightlyDisplayPrice(rate.price, getPricingRules())), '満室');
  } else {
    parts.push(formatMoney(toNightlyDisplayPrice(rate.price, getPricingRules())), '空室あり', `残り${rate.stock}室`);
  }

  if (isPast) parts.push('受付終了');

  return parts.join(' ');
}

/**
 * 1 マス分の <button> を組み立てる。
 *
 * 状態は BEM の修飾子で表現し、色や装飾はすべて CSS 側に任せる。
 *   --outside … 前月・翌月の埋め（範囲外）
 *   --past    … 今日より前
 *   --closed  … 休館日
 *   --soldout … 満室
 *   --today   … 今日
 *   --low / --mid / --high … 月内価格の三分位
 *
 * 選べないマスは disabled ではなく aria-disabled にする。
 * disabled にするとフォーカスが当たらず、矢印キーで読み飛ばされてしまい、
 * 「なぜ選べないのか（満室なのか休館なのか）」を知る手段がなくなるため。
 * クリックとキー操作の側で弾く。
 *
 * @param {{date: string, inMonth: boolean, weekday: number}} cell グリッドのマス
 * @param {Object|undefined} rate その日の料金情報（範囲外の日は undefined）
 * @param {string} today "YYYY-MM-DD"
 * @returns {HTMLButtonElement}
 */
function createDayCell(cell, rate, today) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'calendar__day';
  btn.dataset.date = cell.date;
  btn.setAttribute('role', 'gridcell');
  // roving tabindex。0 になるマスは applyRoving が 1 つだけ選ぶ。
  btn.tabIndex = -1;

  const isPast = !isSameOrAfter(cell.date, today);
  const modifiers = [];

  if (!cell.inMonth) modifiers.push('outside');
  if (isPast) modifiers.push('past');
  if (cell.date === today) modifiers.push('today');
  if (rate) {
    if (rate.closed) modifiers.push('closed');
    // 休館日は「満室」ではないので、満室の修飾子は付けない
    else if (!rate.available) modifiers.push('soldout');
    else modifiers.push(rate.level); // low | mid | high
  }

  modifiers.forEach((m) => btn.classList.add(`calendar__day--${m}`));

  // 選べないマス：範囲外・過去・休館・満室
  const selectable = cell.inMonth && !isPast && rate && rate.available;
  btn.setAttribute('aria-disabled', String(!selectable));

  // 日付の数字
  const dateEl = document.createElement('span');
  dateEl.className = 'calendar__date';
  dateEl.textContent = String(Number(cell.date.slice(8, 10)));
  btn.appendChild(dateEl);

  // 料金（当月のみ表示。休館日は「休」、満室は「満」を出す）。
  // 通常表記と短縮表記の両方を持たせ、どちらを見せるかは CSS の
  // メディアクエリに任せる。画面幅の変化で作り直す必要がなくなる。
  let full = '';
  let short = '';
  if (cell.inMonth && rate) {
    if (rate.closed) {
      full = '休';
      short = '休';
    } else if (!rate.available) {
      full = '満';
      short = '満';
    } else {
      // セルに出すのは税込単価。色分けや選択の判定には税抜の rate.price を
      // 使い続ける（換算しても大小関係は変わらないので、判定側は触らない）。
      const shown = toNightlyDisplayPrice(rate.price, getPricingRules());
      full = formatMoney(shown);
      short = formatMoneyShort(shown);
    }
  }

  const priceEl = document.createElement('span');
  priceEl.className = 'calendar__price calendar__price--full';
  priceEl.textContent = full;
  btn.appendChild(priceEl);

  const shortEl = document.createElement('span');
  shortEl.className = 'calendar__price calendar__price--short';
  shortEl.textContent = short;
  btn.appendChild(shortEl);

  // 読み上げ用に、視覚的な色分けと同じ情報を文字で持たせる。
  // 短縮表記（1.3万）は丸めた金額なので読み上げには使わない。
  btn.setAttribute('aria-label', buildDayLabel(cell, rate, isPast));

  return btn;
}

/**
 * 月間料金カレンダーを生成する。
 *
 * 生成した時点では DOM に挿入されていないので、呼び出し側が
 * 任意の親要素へ appendChild すること。初回の料金取得は
 * createMonthCalendar の中で自動的に始まる。
 *
 * @param {Object} options
 * @param {number} options.roomId 表示する客室タイプ ID
 * @param {Function} [options.onSelect] 選択が確定したとき
 *   { checkIn, checkOut, nights } を、選択が解除されたとき null を受け取る
 * @param {?{checkIn: string, checkOut: string}} [options.initialRange]
 *   最初から選択済みにしておく期間（ディープリンク経由の起動で使う）。
 *   実際に泊まれるかは料金が届くまで判定できないので、初回取得の完了時に
 *   検証し、満室・休館をまたぐ場合は選択を解除して onSelect(null) を呼ぶ。
 * @param {?string} [options.initialMonth] 最初に表示する月 "YYYY-MM"。
 *   省略時は今日の属する月。過去の月を渡された場合も今月に丸める。
 * @returns {{el: HTMLElement, destroy: Function}}
 *   el      … カレンダーのルート要素
 *   destroy … イベント解除・DOM 破棄。取得中の通信結果も無視するようになる
 */
export function createMonthCalendar({ roomId, onSelect, initialRange, initialMonth }) {
  const today = todayStr();

  // --- 内部状態 -------------------------------------------------------------
  // 表示中の年月。初期値は今日の属する月。
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));

  // 初期表示月の指定。過去の月は前月ボタンが押せない領域なので今月に丸める
  // （"YYYY-MM" はゼロ埋め済みなので文字列比較がそのまま前後比較になる）。
  if (typeof initialMonth === 'string' && /^\d{4}-\d{2}$/.test(initialMonth)) {
    const key = initialMonth > today.slice(0, 7) ? initialMonth : today.slice(0, 7);
    year = Number(key.slice(0, 4));
    month = Number(key.slice(5, 7));
  }

  // 日付選択の状態は、この 2 つだけで表す。
  //
  //   selection === null                        … 未選択
  //   selection === { checkIn, checkOut: null }  … チェックインのみ選択済み
  //   selection === { checkIn, checkOut }        … 確定済み
  //
  // hoverDate は「チェックインのみ」の間だけ意味を持ち、
  // まだ確定していない範囲のプレビュー表示に使う。
  let selection = null;
  let hoverDate = null;

  // roving tabindex で tabIndex = 0 を持つマスの日付。
  // 矢印キーの移動元でもある。
  let focusDate = null;

  // 初期選択。ここで入れておくと最初の描画から範囲が塗られるが、
  // 泊まれる日かどうかは料金が届くまで判定できない。判定は初回取得の
  // 完了時に一度だけ行う（verifyInitialRange）。
  if (
    initialRange &&
    initialRange.checkIn &&
    initialRange.checkOut &&
    isSameOrAfter(initialRange.checkIn, today)
  ) {
    selection = { checkIn: initialRange.checkIn, checkOut: initialRange.checkOut };
    // 矢印キーの移動元も選択の始点に寄せておく。
    focusDate = initialRange.checkIn;
  }

  // 初期選択の検証が済んだか。初回の取得完了時にだけ走らせる。
  let initialRangeChecked = selection === null;

  // 取得済みの料金辞書。月送りのたびに上書きせず、既に読んだ月にマージしていく。
  // 月をまたいで日付を選んだとき、範囲内の満室・休館を検証するには
  // 前の月のデータが手元に残っている必要があるため。
  let rates = {};
  // 月送りを連打したときに、古い通信の結果で上書きしないための世代番号。
  // 通信開始時に採番し、完了時に最新でなければ結果を捨てる。
  let requestId = 0;
  let destroyed = false;

  // --- 骨組み ---------------------------------------------------------------
  // ヘッダと曜日行は作り直さず、月送りのたびに body だけを差し替える。
  const el = document.createElement('div');
  el.className = 'calendar';
  el.innerHTML = `
    <div class="calendar__header">
      <button type="button" class="calendar__nav calendar__nav--prev" data-nav="prev" aria-label="前の月">‹</button>
      <span class="calendar__title" data-title></span>
      <button type="button" class="calendar__nav calendar__nav--next" data-nav="next" aria-label="次の月">›</button>
    </div>
    <div class="calendar__weekdays" aria-hidden="true">
      ${WEEKDAY_LABELS.map(
        (label) => `<span class="calendar__weekday">${label}</span>`
      ).join('')}
    </div>
    <div class="calendar__body" data-body></div>
    <p class="calendar__tax-note" data-tax-note></p>
  `;

  const titleEl = el.querySelector('[data-title]');
  const bodyEl = el.querySelector('[data-body]');
  const prevBtn = el.querySelector('[data-nav="prev"]');
  const taxNoteEl = el.querySelector('[data-tax-note]');

  // 表示金額の基準（税込かどうか）はルールが届いて初めて確定するので、
  // 届いた時点で注記を出し、同時にセルを描き直して単価も税込に揃える。
  loadPricingRules().then(() => {
    if (destroyed) return;
    taxNoteEl.textContent = `1泊あたり・${nightlyPriceNote(getPricingRules())}`;
    // 料金の取得より先にルールが届いた場合、まだ読み込み表示が出ている。
    // そこへ空のグリッドを描くと読み込み中だと分からなくなるので、
    // 料金が手元にあるときだけ描き直す（無ければ load 側の描画に任せる）。
    if (Object.keys(rates).length > 0) renderGrid();
  });

  // --- 描画 -----------------------------------------------------------------

  // 月ヘッダの更新と、前月ボタンの活殺。
  // 過去の月は宿泊できないので、今月より前へは戻れないようにする。
  function renderHeader() {
    titleEl.textContent = `${year}年${month}月`;

    // 前月が今月より前なら戻れない。
    // "YYYY-MM" はゼロ埋め済みなので、文字列比較がそのまま年月の前後比較になる
    // （日付を組み立てて比較すると 2 月の末日などで存在しない日を作ってしまう）。
    const prev = shiftMonth(year, month, -1);
    const prevKey = `${prev.year}-${String(prev.month).padStart(2, '0')}`;
    prevBtn.disabled = prevKey < today.slice(0, 7);
  }

  // 取得中の表示
  function renderLoading() {
    bodyEl.innerHTML = `
      <p class="calendar__loading">
        <span class="calendar__spinner" aria-hidden="true"></span>
        料金を読み込んでいます…
      </p>
    `;
  }

  // 取得失敗の表示。再試行ボタンから同じ月を取り直す。
  function renderError() {
    bodyEl.innerHTML = `
      <div class="calendar__error">
        <p class="calendar__error-text">料金の取得に失敗しました。</p>
        <button type="button" class="calendar__retry" data-retry>再試行</button>
      </div>
    `;
  }

  /**
   * 選択状態をクラスの付け外しだけで反映する。
   * セルを作り直さないので、ホバーのたびに呼んでも DOM は再構築されない。
   */
  function paintSelection() {
    const checkIn = selection ? selection.checkIn : null;

    // 範囲の終端。確定済みなら checkOut、選択途中ならホバー中の日（プレビュー）。
    let end = null;
    if (selection) {
      if (selection.checkOut) {
        end = selection.checkOut;
      } else if (hoverDate && hoverDate !== checkIn && isSameOrAfter(hoverDate, checkIn)) {
        end = hoverDate;
      }
    }

    el.querySelectorAll('[data-date]').forEach((btn) => {
      const { date } = btn.dataset;
      // checkIn < date < end なら中間日
      const between =
        checkIn !== null &&
        end !== null &&
        date !== checkIn &&
        isSameOrAfter(date, checkIn) &&
        !isSameOrAfter(date, end);

      const isEnd = end !== null && date === end;
      btn.classList.toggle('calendar__day--checkin', date === checkIn);
      btn.classList.toggle('calendar__day--checkout', isEnd);
      btn.classList.toggle('calendar__day--in-range', between);

      // 色分けだけでなく、選択状態も読み上げに乗せる
      btn.setAttribute('aria-selected', String(date === checkIn || isEnd || between));
    });
  }

  /**
   * 警告を数秒だけ表示する。
   * タイマー ID を持たずに済むよう、生成した要素自身を閉包で覚えておき、
   * 時間が来たらその要素だけを消す。新しい警告に差し替わっていれば
   * 古い要素は既に外れているので、remove() は何も起こさない。
   *
   * @param {string} message 表示する文言
   */
  function showWarning(message) {
    const previous = el.querySelector('.calendar__warning');
    if (previous) previous.remove();

    const warnEl = document.createElement('p');
    warnEl.className = 'calendar__warning';
    warnEl.setAttribute('role', 'alert');
    warnEl.textContent = message;
    el.appendChild(warnEl);

    window.setTimeout(() => warnEl.remove(), WARNING_DURATION);
  }

  /**
   * roving tabindex を張り直す。
   * グリッド内で Tab が止まるマスは常に 1 つだけにし、
   * マス間の移動は矢印キーに任せる（グリッド全体を Tab で
   * 42 回踏まされるのを避けるため）。
   */
  function applyRoving() {
    const cells = [...el.querySelectorAll('[data-date]')];
    if (cells.length === 0) return;

    // 覚えている日が今の月に無ければ、選べる最初のマスへ寄せる
    let target = cells.find((c) => c.dataset.date === focusDate);
    if (!target) {
      target =
        cells.find((c) => c.getAttribute('aria-disabled') === 'false') || cells[0];
      focusDate = target.dataset.date;
    }

    cells.forEach((c) => {
      c.tabIndex = c === target ? 0 : -1;
    });
  }

  // 日付セルの描画。
  // buildMonthGrid は 7 の倍数の 1 次元配列を返すので、7 個ずつ切り出せば
  // そのまま 1 週間の行になる。行は role="row" のために必要で、
  // display: contents で 7 列グリッドの並びには影響させない。
  function renderGrid() {
    const cells = buildMonthGrid(year, month);

    const grid = document.createElement('div');
    grid.className = 'calendar__grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', `${year}年${month}月の料金カレンダー`);

    for (let i = 0; i < cells.length; i += 7) {
      const row = document.createElement('div');
      row.className = 'calendar__row';
      row.setAttribute('role', 'row');
      cells.slice(i, i + 7).forEach((cell) => {
        // 前後の月の埋めマスには、たとえ rates に残っていても料金を出さない
        const rate = cell.inMonth ? rates[cell.date] : undefined;
        row.appendChild(createDayCell(cell, rate, today));
      });
      grid.appendChild(row);
    }

    bodyEl.innerHTML = '';
    bodyEl.appendChild(grid);

    // 月をまたいで選択が続いていることがあるので、描画のたびに塗り直す
    paintSelection();
    applyRoving();
  }

  // --- 料金取得 -------------------------------------------------------------

  /**
   * 表示中の年月の料金を取り直して描画する。
   * 月送り・再試行のたびに呼ばれる。
   */
  async function load() {
    renderHeader();
    renderLoading();

    requestId += 1;
    const currentId = requestId;

    // 月が変わればホバー中のマスは画面から消えるので、プレビューも解除する
    hoverDate = null;

    try {
      const result = await fetchMonthlyRates(roomId, year, month);
      // 破棄済み、または後から始まった通信に追い越されていたら捨てる
      if (destroyed || currentId !== requestId) return;
      rates = { ...rates, ...result };
      renderGrid();
      verifyInitialRange();
    } catch (err) {
      if (destroyed || currentId !== requestId) return;
      renderError();
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }

  /**
   * ディープリンクで渡された初期選択を、料金が届いた時点で検証する。
   *
   * 選択そのものは描画前に入れてあるので、範囲はすでに塗られている。
   * ここで泊まれない日を含むと分かった場合だけ選択を落とす。
   * URL の日付が満室になっているのは普通のことなので、警告は出さず、
   * 「日付未選択の状態で開いた」のと同じ画面に戻す。
   *
   * 1 回きり。以降の月送りでは走らせない（利用者が選び直した結果を
   * 初期値の都合で消さないため）。
   */
  async function verifyInitialRange() {
    if (initialRangeChecked) return;
    initialRangeChecked = true;

    if (!selection || !selection.checkOut) return;

    const nights = eachDateBetween(selection.checkIn, selection.checkOut);

    // 月をまたぐ期間は、初回に取得した月だけでは判定できない。料金が無い日を
    // 「泊まれない日」と扱うと、月末発の連泊がすべて弾かれる。
    // 足りない月を先に取りにいってから判定する。
    const missingMonths = [
      ...new Set(
        nights.filter((d) => !rates[d]).map((d) => d.slice(0, 7))
      ),
    ];

    if (missingMonths.length > 0) {
      try {
        const results = await Promise.all(
          missingMonths.map((key) =>
            fetchMonthlyRates(roomId, Number(key.slice(0, 4)), Number(key.slice(5, 7)))
          )
        );
        if (destroyed) return;
        results.forEach((result) => {
          rates = { ...rates, ...result };
        });
      } catch (err) {
        // 取れなければ判定できない。選択は残さず未選択に戻す
        // （泊まれるか分からない期間で料金を出すよりは、選び直してもらう）。
        if (destroyed) return;
        selection = null;
        paintSelection();
        if (onSelect) onSelect(null);
        // eslint-disable-next-line no-console
        console.error(err);
        return;
      }
    }

    const blocked = nights.filter((d) => !isStayable(d));

    if (blocked.length > 0) {
      selection = null;
      paintSelection();
      if (onSelect) onSelect(null);
      return;
    }

    // 泊まれることが確かめられて初めて、呼び出し側に日付を渡す。
    // 検証前に渡すと、満室の期間で料金を計算した画面を一瞬見せることになる。
    if (onSelect) {
      onSelect({
        checkIn: selection.checkIn,
        checkOut: selection.checkOut,
        nights: calcNights(selection.checkIn, selection.checkOut),
      });
    }
  }

  // --- 日付選択 -------------------------------------------------------------

  /**
   * その日が宿泊できる日かどうか。
   * 料金が手元にない日（未取得の月）は判定できないので false 扱いにする。
   *
   * @param {string} date "YYYY-MM-DD"
   * @returns {boolean}
   */
  function isStayable(date) {
    const rate = rates[date];
    return Boolean(rate) && !rate.closed && rate.available;
  }

  /**
   * 日付セルがクリックされたときの状態遷移。
   *
   *   未選択            → その日を checkIn にする
   *   checkIn のみ
   *     ├ checkIn より後 → 範囲を検証して確定
   *     └ checkIn 以前   → checkIn を差し替える
   *   確定済み          → 選択をリセットし、その日から選び直す
   *
   * @param {string} date クリックされた日 "YYYY-MM-DD"
   */
  function selectDate(date) {
    // 過去の日と、泊まれない日はここでも弾く。
    // 呼び出し側でも aria-disabled を見ているが、選択の正しさを
    // DOM の状態だけに委ねないようにしておく。
    if (!isSameOrAfter(date, today) || !isStayable(date)) return;

    // 確定済みからのクリックは、まず今の選択を解除して最初からやり直す
    if (selection && selection.checkOut) {
      selection = { checkIn: date, checkOut: null };
      hoverDate = null;
      paintSelection();
      if (onSelect) onSelect(null);
      return;
    }

    // 未選択、または checkIn 以前を選び直した場合は checkIn を（差し替えて）セット
    if (!selection || date === selection.checkIn || !isSameOrAfter(date, selection.checkIn)) {
      selection = { checkIn: date, checkOut: null };
      hoverDate = null;
      paintSelection();
      return;
    }

    // checkIn より後 → 確定前に、実際に泊まる日すべてが予約可能か確かめる。
    // eachDateBetween は checkOut を含まないので、戻り値がそのまま宿泊日の一覧になる。
    const blocked = eachDateBetween(selection.checkIn, date).filter(
      (d) => !isStayable(d)
    );

    if (blocked.length > 0) {
      showWarning('満室・休館日をまたぐ期間は選択できません。別の日をお選びください。');
      // 確定はせず、チェックインだけ選んだ状態に戻す
      selection = { checkIn: selection.checkIn, checkOut: null };
      hoverDate = null;
      paintSelection();
      return;
    }

    selection = { checkIn: selection.checkIn, checkOut: date };
    hoverDate = null;
    paintSelection();
    if (onSelect) {
      onSelect({
        checkIn: selection.checkIn,
        checkOut: selection.checkOut,
        nights: calcNights(selection.checkIn, selection.checkOut),
      });
    }
  }

  // --- イベント -------------------------------------------------------------
  // すべてルート要素 1 つに委譲しておくと、月送りで中身を作り直しても
  // 個々のマスへの付け外しが要らず、destroy でもルートから外すだけで済む。
  function handleClick(e) {
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn) {
      const delta = navBtn.dataset.nav === 'next' ? 1 : -1;
      ({ year, month } = shiftMonth(year, month, delta));
      load();
      return;
    }

    if (e.target.closest('[data-retry]')) {
      load();
      return;
    }

    // 範囲外・過去・満室・休館のマスは aria-disabled が true なので無視する
    const dayBtn = e.target.closest('[data-date]');
    if (dayBtn && dayBtn.getAttribute('aria-disabled') === 'false') {
      selectDate(dayBtn.dataset.date);
    }
  }

  /**
   * フォーカスを delta マスぶん動かす。
   * 表示中のグリッドの外へは出さない（月送りはヘッダのボタンで行う）。
   *
   * @param {number} delta 移動量。±1 で 1 日、±7 で 1 週間
   */
  function moveFocus(delta) {
    const cells = [...el.querySelectorAll('[data-date]')];
    const index = cells.findIndex((c) => c.dataset.date === focusDate);
    if (index < 0) return;

    const next = Math.min(cells.length - 1, Math.max(0, index + delta));
    focusDate = cells[next].dataset.date;
    applyRoving();
    cells[next].focus();
  }

  /**
   * フォーカスが移ったマスを focusDate に反映する。
   * マウスでセルをクリックした場合もここを通るので、
   * その直後に矢印キーを押しても移動元がずれない。
   */
  function handleFocusIn(e) {
    const dayBtn = e.target.closest('[data-date]');
    if (!dayBtn || dayBtn.dataset.date === focusDate) return;
    focusDate = dayBtn.dataset.date;
    applyRoving();
  }

  /**
   * キーボード操作。
   *   ←→      前後の日
   *   ↑↓      前後の週
   *   Home/End その週の先頭・末尾
   *   Enter/Space 選択
   *
   * Enter と Space は <button> の既定動作でも click が飛ぶので、
   * preventDefault() で既定を止めて、ここでの 1 回だけにする。
   */
  function handleKeydown(e) {
    const dayBtn = e.target.closest('[data-date]');
    if (!dayBtn) return;

    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in steps) {
      e.preventDefault();
      moveFocus(steps[e.key]);
      return;
    }

    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const cells = [...el.querySelectorAll('[data-date]')];
      const index = cells.findIndex((c) => c.dataset.date === focusDate);
      if (index < 0) return;
      const column = index % 7;
      moveFocus(e.key === 'Home' ? -column : 6 - column);
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (dayBtn.getAttribute('aria-disabled') === 'false') {
        selectDate(dayBtn.dataset.date);
      }
    }
  }

  /**
   * ホバー中の日を差し替えて、範囲のプレビューを更新する。
   * クラスを付け替えるだけで、セルの作り直しはしない。
   */
  function handleHover(e) {
    // プレビューが要るのは「チェックインのみ選択済み」の間だけ
    if (!selection || selection.checkOut) return;

    const dayBtn = e.target.closest('[data-date]');
    const next =
      dayBtn && dayBtn.getAttribute('aria-disabled') === 'false'
        ? dayBtn.dataset.date
        : null;
    // 同じマスの中で動いただけなら何もしない
    if (next === hoverDate) return;

    hoverDate = next;
    paintSelection();
  }

  // カレンダーから出たらプレビューを消す
  function handleLeave() {
    if (hoverDate === null) return;
    hoverDate = null;
    paintSelection();
  }

  el.addEventListener('click', handleClick);
  el.addEventListener('keydown', handleKeydown);
  el.addEventListener('focusin', handleFocusIn);
  el.addEventListener('mouseover', handleHover);
  el.addEventListener('mouseleave', handleLeave);

  // 初回表示
  load();

  return {
    el,

    /**
     * 指定範囲の各泊の単価を返す。料金の計算に日別単価を渡すために使う。
     *
     * カレンダーのセルに出している金額と、内訳ビューの合計は同じ数字から
     * 導かれる必要がある。ここを経由せず room.price だけで計算すると、
     * 曜日ごとの単価差がそのまま食い違いになる。
     *
     * @param {string} checkIn  "YYYY-MM-DD"
     * @param {number} nights   泊数
     * @returns {?Array<{date: string, price: number}>} 1泊でも欠けていれば null
     */
    getNightlyRates(checkIn, nights) {
      if (!checkIn || nights <= 0) return null;

      const list = [];
      for (let i = 0; i < nights; i += 1) {
        const date = addDays(checkIn, i);
        const rate = rates[date];
        // 未取得の月にまたがっている場合は、部分的な単価で計算させない。
        // 一部だけ日別単価・残りは既定単価、という混ざった金額が一番わかりにくい。
        if (!rate) return null;
        list.push({ date, price: rate.price });
      }
      return list;
    },

    /**
     * カレンダーを破棄する。
     * イベントを外し、DOM を取り除き、取得中の通信結果も無視するようにする。
     */
    destroy() {
      destroyed = true;
      el.removeEventListener('click', handleClick);
      el.removeEventListener('keydown', handleKeydown);
      el.removeEventListener('focusin', handleFocusIn);
      el.removeEventListener('mouseover', handleHover);
      el.removeEventListener('mouseleave', handleLeave);
      el.remove();
    },
  };
}
