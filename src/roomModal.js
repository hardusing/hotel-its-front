import { resolveImageUrl } from './api/rooms';
import { createReservation } from './api/reservations';
import { todayStr, addDays, calcNights, calcTotal } from './booking';
import { createMonthCalendar } from './calendar/monthCalendar';
import { formatYen } from './format';
import { isBookable, readStock } from './inventory/stockLevel';

let currentRoom = null;
let els = null;
// 一覧を再描画するためのコールバック（OUT_OF_STOCK 時に使う）
let onStockChange = null;
// 月間料金カレンダーのインスタンス（開くたびに作り直す）
let calendar = null;
// いま表示しているビュー。在庫切れの知らせ方をビューごとに変えるために持つ。
let currentView = 'detail';
// 表示中の部屋が在庫切れになっているか。
// ボタンの活性やエラー表示は、この 1 つの状態から毎回導出する。
let soldOut = false;
// 送信中かどうか。在庫切れによる無効化と送信中の無効化が
// 互いを打ち消さないよう、活性の判断をひとまとめにするために持つ。
let submitting = false;
// OUT_OF_STOCK 後に自動で閉じるためのタイマー。
// 持っておかないと、1.8 秒以内に別の部屋を開いたとき、
// 開いたばかりのモーダルをこのタイマーが閉じてしまう。
let autoCloseTimer = null;

// 日付未選択のときに表示欄へ出す文言
const NO_DATES_TEXT = '日付を選択してください';

// フォームビューで満室になったときの文言。
// 復帰時に「自分が出したメッセージか」を判別するため、定数として持つ。
const SOLD_OUT_FORM_TEXT =
  '手続き中に満室となりました。恐れ入りますが、別の日程か他の客室をご検討ください。';

// ビュー（detail / form / complete）を切り替える
function setView(view) {
  currentView = view;
  els.views.forEach((el) => {
    el.hidden = el.dataset.view !== view;
  });
  // 画像は詳細ビューのみ表示
  els.media.hidden = view !== 'detail';
  els.dialog.scrollTop = 0;
  // 満室のままビューを移動しても警告が引き継がれるようにする
  // （フォームから「戻る」で詳細に戻った場合など）。
  applySoldOutState();
}

/* ---------- 在庫切れの反映 ---------- */

// 送信ボタンの活性をまとめて決める。
// 送信中と在庫切れの 2 つの理由があり、片方の解除で
// もう片方まで押せるようにならないよう、必ずここを通す。
function updateSubmitDisabled() {
  if (!els) return;
  els.submitBtn.disabled = submitting || soldOut;
}

// いまの soldOut を、表示中のビューに合わせて画面へ反映する。
function applySoldOutState() {
  if (!els) return;

  if (currentView === 'detail') {
    els.bookingAlert.hidden = !soldOut;
    // 予約ボタンの活性は updateSummary が一手に引き受けているので、そちらに任せる。
    updateSummary();
    return;
  }

  if (currentView === 'form') {
    if (soldOut) {
      // 入力欄には一切触れない。ここで reset や再描画をすると、
      // 入力済みの内容が消えて利用者の手間が丸ごと失われる。
      showGeneralError(SOLD_OUT_FORM_TEXT);
      els.formBrowse.hidden = false;
    } else if (els.generalError.textContent === SOLD_OUT_FORM_TEXT) {
      // 自分が出した満室メッセージのときだけ消す。
      // 無条件に消すと、同時に出ていた入力エラーまで拭ってしまう。
      els.generalError.hidden = true;
      els.generalError.textContent = '';
      els.formBrowse.hidden = true;
    } else {
      els.formBrowse.hidden = true;
    }
    updateSubmitDisabled();
    return;
  }

  // complete ビューでは何もしない。予約はすでに成立しており、
  // その後の在庫の増減は完了した予約に影響しない。
}

/* ---------- 詳細ビュー：日付選択・料金計算 ---------- */

function updateSummary() {
  const { checkin, checkout, summary, reserveBtn } = els;
  const nights = calcNights(checkin.value, checkout.value);

  if (nights <= 0 || !currentRoom) {
    summary.hidden = true;
    summary.textContent = '';
    reserveBtn.disabled = true;
    return;
  }

  const total = calcTotal(currentRoom.price, nights);
  summary.textContent = `${nights}泊 / 合計 ${formatYen(total)}`;
  summary.hidden = false;
  // 日付が揃っていても、在庫切れの間は先へ進ませない。
  // 日付を選び直すたびにここを通るので、無効化が上書きで解除されることもない。
  reserveBtn.disabled = soldOut;
}

function onCheckinChange() {
  const { checkin, checkout } = els;
  if (checkin.value) {
    const minOut = addDays(checkin.value, 1);
    checkout.min = minOut;
    if (checkout.value && checkout.value < minOut) {
      checkout.value = '';
    }
  }
  updateSummary();
}

/**
 * カレンダーで日付が確定／解除されたときに呼ばれる。
 *
 * 隠してある input[type=date] が引き続き値の保持役なので、
 * ここで value を書き戻してから updateSummary() を呼ぶ。
 * value の代入では change イベントが発火せず onCheckinChange は動かないため、
 * 料金の再計算はこの明示的な呼び出しに任せる。
 *
 * @param {?{checkIn: string, checkOut: string, nights: number}} range 解除時は null
 */
function onCalendarSelect(range) {
  const { checkin, checkout, dates } = els;

  if (!range) {
    checkin.value = '';
    checkout.value = '';
    dates.textContent = NO_DATES_TEXT;
  } else {
    checkin.value = range.checkIn;
    checkout.value = range.checkOut;
    dates.textContent = `${range.checkIn} 〜 ${range.checkOut}（${range.nights}泊）`;
  }

  updateSummary();
}

/* ---------- フォームビュー ---------- */

// エラー表示をすべてクリアする
function clearErrors() {
  els.form
    .querySelectorAll('.field__error')
    .forEach((el) => {
      el.textContent = '';
    });
  els.form
    .querySelectorAll('.field__input--error')
    .forEach((el) => el.classList.remove('field__input--error'));
  els.generalError.hidden = true;
  els.generalError.textContent = '';
}

// 特定フィールドのエラー表示だけを消す（再入力時に呼ぶ）
function clearFieldError(field) {
  const errorEl = els.form.querySelector(`[data-error-for="${field}"]`);
  const inputEl = els.form.querySelector(`[name="${field}"]`);
  if (errorEl) errorEl.textContent = '';
  if (inputEl) inputEl.classList.remove('field__input--error');
  // フォーム共通エラーも再入力で消す。
  // ただし満室の警告だけは残す。入力を続けるだけで消えてしまうと、
  // 満室に気付かないまま最後まで入力させることになる。
  if (!soldOut) {
    els.generalError.hidden = true;
    els.generalError.textContent = '';
  }
}

// 特定フィールドにエラーメッセージを表示する
function showFieldError(field, message) {
  const errorEl = els.form.querySelector(`[data-error-for="${field}"]`);
  const inputEl = els.form.querySelector(`[name="${field}"]`);
  if (errorEl) errorEl.textContent = message;
  if (inputEl) inputEl.classList.add('field__input--error');
}

// フォーム上部の共通エラー
function showGeneralError(message) {
  els.generalError.textContent = message;
  els.generalError.hidden = false;
}

// 送信前のクライアント側必須チェック（予約者名・メール）
function validateClient(values) {
  let ok = true;
  if (!values.guestName.trim()) {
    showFieldError('guestName', '予約者名を入力してください。');
    ok = false;
  }
  if (!values.email.trim()) {
    showFieldError('email', 'メールアドレスを入力してください。');
    ok = false;
  }
  return ok;
}

// 詳細 → フォームへ遷移。日付サマリを表示し、人数 select を capacity で生成
function goToForm() {
  const nights = calcNights(els.checkin.value, els.checkout.value);
  const total = calcTotal(currentRoom.price, nights);
  els.formSummary.textContent =
    `${currentRoom.name}｜${els.checkin.value} 〜 ${els.checkout.value}` +
    `（${nights}泊 / 合計 ${formatYen(total)}）`;

  // 宿泊人数の選択肢を room.capacity を上限として生成
  els.guests.innerHTML = '';
  for (let n = 1; n <= currentRoom.capacity; n += 1) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = `${n}名`;
    els.guests.appendChild(opt);
  }

  clearErrors();
  setView('form');
}

async function handleSubmit(e) {
  e.preventDefault();

  // 在庫切れ中は送信そのものを止める。ボタンは無効化してあるが、
  // 入力欄での Enter など別経路の送信もここで塞ぐ。
  if (soldOut) return;

  clearErrors();

  const values = {
    guestName: els.form.guestName.value,
    email: els.form.email.value,
    phone: els.form.phone.value,
    guests: els.form.guests.value,
    notes: els.form.notes.value,
  };

  if (!validateClient(values)) return;

  // 送信ペイロード。roomTypeId / guests は必ず数値に変換。料金は送らない。
  const payload = {
    roomTypeId: Number(currentRoom.id),
    guests: Number(values.guests),
    checkIn: els.checkin.value,
    checkOut: els.checkout.value,
    guestName: values.guestName.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    notes: values.notes.trim(),
  };

  submitting = true;
  updateSubmitDisabled();
  els.submitBtn.textContent = '送信中...';

  try {
    const res = await createReservation(payload);

    if (res.ok && res.status === 201) {
      // 成功：予約番号を完了画面に表示
      els.completeOrder.textContent = res.data.orderNumber;
      setView('complete');
      return;
    }

    const error = res.error || {};
    switch (error.code) {
      case 'VALIDATION_ERROR':
        // details の field ごとに対応項目へエラー表示
        (error.details || []).forEach((d) => showFieldError(d.field, d.message));
        showGeneralError(error.message || '入力内容をご確認ください。');
        break;
      case 'OUT_OF_STOCK':
        // 満室：メッセージを表示し、一覧を更新してモーダルを閉じる。
        // 在庫のポーリング（notifyInventoryChange）を入れた後もこの分岐は残す。
        // ポーリングはあくまで数十秒遅れの予測であり、在庫を確定できるのは
        // 予約を実際に処理したサーバーの応答だけ ＝ こちらが最終的な真実。
        showGeneralError('満室です。ご希望のお部屋は満室になりました。一覧に戻ります。');
        if (onStockChange) onStockChange();
        autoCloseTimer = window.setTimeout(closeRoomModal, 1800);
        break;
      default:
        // その他：サーバーのメッセージをそのまま表示
        showGeneralError(error.message || '予約に失敗しました。');
    }
  } catch (err) {
    showGeneralError('通信に失敗しました。時間をおいて再度お試しください。');
    // eslint-disable-next-line no-console
    console.error(err);
  } finally {
    submitting = false;
    // 送信中に満室になっていた場合、ここで無条件に有効化すると
    // 押せる送信ボタンが戻ってしまうので、両方の理由を見て決め直す。
    updateSubmitDisabled();
    els.submitBtn.textContent = 'この内容で予約する';
  }
}

/* ---------- 開閉 ---------- */

function clearAutoClose() {
  if (autoCloseTimer !== null) {
    window.clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

export function openRoomModal(room) {
  if (!els) return;
  currentRoom = room;

  // 前回の自動クローズ待ちを打ち切る。残っていると、いま開いた部屋が
  // 前回の満室応答を理由に閉じられる。
  clearAutoClose();

  // 前回開いた部屋の在庫切れ状態を持ち越さない。
  // updateSummary より先に落としておかないと、予約ボタンが無効のまま開く。
  soldOut = !isBookable(room.stock);
  submitting = false;

  els.img.src = resolveImageUrl(room.imagePath);
  els.img.alt = room.name;
  els.name.textContent = room.name;
  els.price.innerHTML = `${formatYen(room.price)}<span>/泊</span>`;
  els.desc.textContent = room.description;

  // 月間料金カレンダー。部屋ごとに料金が違うので、開くたびに作り直す。
  // 前回のものが残っていれば先に破棄してから差し込む。
  if (calendar) calendar.destroy();
  calendar = createMonthCalendar({
    roomId: room.id,
    onSelect: onCalendarSelect,
  });
  els.calendarMount.appendChild(calendar.el);
  els.dates.textContent = NO_DATES_TEXT;

  const today = todayStr();
  els.checkin.min = today;
  els.checkin.value = '';
  els.checkout.min = addDays(today, 1);
  els.checkout.value = '';
  updateSummary();

  els.form.reset();
  clearErrors();
  setView('detail');

  els.modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

export function closeRoomModal() {
  if (!els) return;
  clearAutoClose();
  els.modal.hidden = true;
  document.body.style.overflow = '';
  currentRoom = null;
  soldOut = false;

  // カレンダーは開くたびに作り直すので、閉じる時点で破棄する
  if (calendar) {
    calendar.destroy();
    calendar = null;
  }
}

// 警告内の「他の客室を見る」導線。
// 満室と伝えるだけで行き止まりにせず、次の行動をその場に用意する。
function browseOtherRooms() {
  closeRoomModal();
  const rooms = document.getElementById('rooms');
  if (rooms) rooms.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- 在庫の変化を受け取る ---------- */

/**
 * 在庫スナップショットの 1 件を受け取り、表示中の部屋であれば画面に反映する。
 * 反映の仕方は表示中のビューによって変える（applySoldOutState 参照）。
 *
 * @param {{id: number, stock: number}} item 在庫 1 件分
 */
export function notifyInventoryChange(item) {
  // 閉じているモーダルには何もしない。開いた時点の在庫で openRoomModal が組み直す。
  if (!els || els.modal.hidden || !currentRoom) return;
  if (!item) return;

  // 表示中の部屋以外は無関係。他室の増減で警告を出しては誤報になる。
  if (Number(item.id) !== Number(currentRoom.id)) return;

  // 壊れた値で予約を止めないよう、解釈できなければ無視する。
  const stock = readStock(item.stock);
  if (stock === null) return;

  // currentRoom には書き込まない。room オブジェクトの在庫を更新するのは
  // 一覧側（applyInventory）だけと決めてあり、ここで二重に書くと
  // 呼ばれる順番によってどちらが最新か決まってしまう。
  // このモーダルは受け取った item から自分の表示状態だけを導く。
  const nextSoldOut = !isBookable(stock);
  // 状態が変わらないなら画面に触れない。残室数の増減そのものは、
  // 予約できるかどうかを左右しない限り利用者に知らせる必要がない。
  if (nextSoldOut === soldOut) return;

  soldOut = nextSoldOut;
  applySoldOutState();
}

/**
 * モーダルの初期化（起動時に一度だけ）。
 * @param {Object} [opts]
 * @param {Function} [opts.onStockChange] OUT_OF_STOCK 時に一覧を再取得するコールバック
 */
export function initRoomModal(opts = {}) {
  const modal = document.getElementById('room-modal');
  if (!modal) return;

  onStockChange = opts.onStockChange || null;

  els = {
    modal,
    dialog: modal.querySelector('.modal__dialog'),
    media: document.getElementById('modal-media'),
    views: modal.querySelectorAll('.modal__view'),
    img: document.getElementById('modal-img'),
    name: document.getElementById('modal-name'),
    price: document.getElementById('modal-price'),
    desc: document.getElementById('modal-desc'),
    calendarMount: document.getElementById('calendar-mount'),
    dates: document.getElementById('booking-dates'),
    checkin: document.getElementById('checkin'),
    checkout: document.getElementById('checkout'),
    summary: document.getElementById('booking-summary'),
    bookingAlert: document.getElementById('booking-alert'),
    reserveBtn: document.getElementById('booking-reserve'),
    form: document.querySelector('.reservation-form'),
    formSummary: document.getElementById('form-summary'),
    guests: document.getElementById('guests'),
    generalError: document.getElementById('form-general-error'),
    formBrowse: document.getElementById('form-browse-rooms'),
    submitBtn: document.getElementById('form-submit'),
    completeOrder: document.getElementById('complete-order'),
  };

  // 閉じる（×・オーバーレイ・完了画面の閉じるボタン）
  modal.querySelectorAll('[data-modal-close]').forEach((el) => {
    el.addEventListener('click', closeRoomModal);
  });

  // 満室の警告に置いた「他の客室を見る」導線（詳細ビュー・フォームビューの両方）
  modal.querySelectorAll('[data-browse-rooms]').forEach((el) => {
    el.addEventListener('click', browseOtherRooms);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeRoomModal();
  });

  // 日付入力
  els.checkin.addEventListener('change', onCheckinChange);
  els.checkout.addEventListener('change', updateSummary);

  // 再入力を始めた時点で、その項目のエラー表示をリセットする
  els.form.querySelectorAll('[name]').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => clearFieldError(input.name));
  });

  // 詳細→フォーム、フォーム→詳細、送信
  els.reserveBtn.addEventListener('click', goToForm);
  els.form
    .querySelector('[data-form-back]')
    .addEventListener('click', () => setView('detail'));
  els.form.addEventListener('submit', handleSubmit);
}
