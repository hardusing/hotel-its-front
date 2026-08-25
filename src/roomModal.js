import { resolveImageUrl } from './api/rooms';
import { createReservation } from './api/reservations';
import { todayStr, addDays, calcNights, calcTotal } from './booking';
import { createMonthCalendar } from './calendar/monthCalendar';
import { formatYen } from './format';

let currentRoom = null;
let els = null;
// 一覧を再描画するためのコールバック（OUT_OF_STOCK 時に使う）
let onStockChange = null;
// 月間料金カレンダーのインスタンス（開くたびに作り直す）
let calendar = null;

// 日付未選択のときに表示欄へ出す文言
const NO_DATES_TEXT = '日付を選択してください';

// ビュー（detail / form / complete）を切り替える
function setView(view) {
  els.views.forEach((el) => {
    el.hidden = el.dataset.view !== view;
  });
  // 画像は詳細ビューのみ表示
  els.media.hidden = view !== 'detail';
  els.dialog.scrollTop = 0;
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
  reserveBtn.disabled = false;
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
  // フォーム共通エラーも再入力で消す
  els.generalError.hidden = true;
  els.generalError.textContent = '';
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

  els.submitBtn.disabled = true;
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
        // 満室：メッセージを表示し、一覧を更新してモーダルを閉じる
        showGeneralError('満室です。ご希望のお部屋は満室になりました。一覧に戻ります。');
        if (onStockChange) onStockChange();
        window.setTimeout(closeRoomModal, 1800);
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
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = 'この内容で予約する';
  }
}

/* ---------- 開閉 ---------- */

export function openRoomModal(room) {
  if (!els) return;
  currentRoom = room;

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
  els.modal.hidden = true;
  document.body.style.overflow = '';
  currentRoom = null;

  // カレンダーは開くたびに作り直すので、閉じる時点で破棄する
  if (calendar) {
    calendar.destroy();
    calendar = null;
  }
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
    reserveBtn: document.getElementById('booking-reserve'),
    form: document.querySelector('.reservation-form'),
    formSummary: document.getElementById('form-summary'),
    guests: document.getElementById('guests'),
    generalError: document.getElementById('form-general-error'),
    submitBtn: document.getElementById('form-submit'),
    completeOrder: document.getElementById('complete-order'),
  };

  // 閉じる（×・オーバーレイ・完了画面の閉じるボタン）
  modal.querySelectorAll('[data-modal-close]').forEach((el) => {
    el.addEventListener('click', closeRoomModal);
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
