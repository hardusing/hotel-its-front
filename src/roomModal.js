import { resolveImageUrl } from './api/rooms';
import { createReservation } from './api/reservations';
import { todayStr, addDays, calcNights } from './booking';
import { calculatePrice } from './pricing/calculator.js';
import { createPriceBreakdown } from './pricing/breakdownView.js';
import { loadPricingRules } from './pricing/rulesStore.js';
import {
  toNightlyDisplayPrice,
  nightlyPriceNote,
  totalPriceNote,
} from './pricing/displayPrice.js';
import { createMonthCalendar } from './calendar/monthCalendar';
import { formatMoney, formatDate } from './i18n/format.js';
import { isBookable, readStock } from './inventory/stockLevel';
import { ROOM_MODAL_HTML } from './modal/roomModalTemplate.js';
import { track, toPriceBand, EVENTS } from './analytics/tracker.js';
import { syncDeepLinkUrl } from './deeplink/urlSync.js';
import { showToast } from './ui/toast.js';
import { t, tPlural, onLocaleChange } from './i18n/index.js';
import { applyTranslations } from './lang.js';
import { roomName, roomDescription } from './api/rooms';

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
// 料金ルール（税率・割引条件）。起動時に一度取得して使い回す。
// 取得前は料金を出せないので、内訳は隠したままにする。
let pricingRules = null;
// 料金内訳ビュー。モーダルは1つなので使い回す。
let breakdown = null;
// 直近の計算結果。フォームビューの要約と、再計算せずに参照したい場面で使う。
let lastBreakdown = null;
// 「適用」を押して確定したクーポンコード。入力欄の値そのものではない。
// 入力途中の文字列で金額が揺れないよう、確定した値だけを計算に渡す。
let appliedCoupon = '';

// ディープリンクで受け取った初期値（日付・人数・クーポン）。
// モーダルは閉じるたびに状態を捨てる作りなので、URL 由来の値を
// 「開くたびに適用する既定値」としてモジュール側に置いておく。
// 利用者が通知バーで取り消したら null に戻す。
let deepLinkDefaults = null;

// 言語変更の購読解除。initRoomModal を 2 度呼んでも購読が積み上がらないよう持つ。
let unsubscribeLocale = null;

// OUT_OF_STOCK 後に自動で閉じるためのタイマー。
// 持っておかないと、1.8 秒以内に別の部屋を開いたとき、
// 開いたばかりのモーダルをこのタイマーが閉じてしまう。
let autoCloseTimer = null;

// いま画面に出ている日程。言語が変わったときに同じ日付を書式だけ変えて
// 出し直すために持つ。DOM の文字列から日付を読み戻すことはできない
// （書式が言語で変わるので、書いた文字列を解釈し直す羽目になる）。
let currentRange = null;

// フォームビューで満室の警告を出しているか。
//
// 以前は「表示中の文言が満室のメッセージと一致するか」で判別していたが、
// 文言が言語で変わる以上、文字列の一致では判断できない
// （日本語で警告を出したあと英語に切り替えると、自分が出した警告を
// 他人のものと見なして消せなくなる）。状態として持つ方が確実。
let showingSoldOutError = false;

// 日付未選択のときに表示欄へ出す文言。
// 定数ではなく関数にしてある。定数にすると読み込み時の言語で焼き付く。
function noDatesText() {
  return t('modal.noDates');
}

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
    // 予約ボタンの活性は updatePricing が一手に引き受けているので、そちらに任せる。
    updatePricing();
    return;
  }

  if (currentView === 'form') {
    if (soldOut) {
      // 入力欄には一切触れない。ここで reset や再描画をすると、
      // 入力済みの内容が消えて利用者の手間が丸ごと失われる。
      showGeneralError(t('form.error.soldOut'));
      showingSoldOutError = true;
      els.formBrowse.hidden = false;
    } else if (showingSoldOutError) {
      // 自分が出した満室メッセージのときだけ消す。
      // 無条件に消すと、同時に出ていた入力エラーまで拭ってしまう。
      showingSoldOutError = false;
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

/**
 * 宿泊人数の値を1か所に集める。
 *
 * 保持役はフォーム側の #guests ひとつだけと決めている。送信ペイロードも
 * バリデーションもすでにこの select を読んでいるため、保持役を別に立てると
 * 参照先が二重になり「どちらが最新か」を呼び出し順で決めることになる。
 * 詳細ビューの select は、この値を映すだけの入力口として扱う。
 *
 * @param {string|number} [value] 設定する人数。省略時は現在値の読み出しのみ
 * @returns {number} 確定した人数
 */
function syncGuests(value) {
  if (value !== undefined) {
    els.form.guests.value = String(value);
  }
  // 詳細ビューの select は常に保持役へ合わせる（片方向に流すので循環しない）。
  els.bookingGuests.value = els.form.guests.value;
  return Number(els.form.guests.value) || 1;
}

/** 人数の選択肢を capacity を上限に生成する。2 つの select に同じものを入れる。 */
function renderGuestOptions(room) {
  [els.bookingGuests, els.guests].forEach((select) => {
    select.innerHTML = '';
    for (let n = 1; n <= room.capacity; n += 1) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = tPlural('guests', n);
      select.appendChild(opt);
    }
  });
}

/**
 * 料金を計算し直して画面に反映する。
 * 日付確定・人数変更・クーポン適用の 3 つの入口から、必ずここを通す。
 */
function updatePricing() {
  const { checkin, checkout, reserveBtn } = els;

  // 部屋もルールも揃っていなければ計算しない（起動直後・閉じている間）。
  if (!currentRoom || !pricingRules) {
    lastBreakdown = null;
    breakdown.clear();
    reserveBtn.disabled = true;
    return;
  }

  const guests = syncGuests();
  const nights = calcNights(checkin.value, checkout.value);

  // 日別単価はカレンダーが持っている。ここで渡さないと、カレンダーのセルに
  // 出ている曜日ごとの金額と内訳の合計が食い違う（既定単価で計算されるため）。
  const nightlyRates = calendar ? calendar.getNightlyRates(checkin.value, nights) : null;

  const result = calculatePrice({
    room: currentRoom,
    nightlyRates,
    checkIn: checkin.value,
    checkOut: checkout.value,
    guests,
    couponCode: appliedCoupon,
    rules: pricingRules,
    // 現在時刻は calculatePrice の外で決める（純粋関数のまま保つため）。
    today: todayStr(),
  });

  lastBreakdown = result.error ? null : result;
  breakdown.update(result, guests);

  // 日付が揃っていても、在庫切れの間は先へ進ませない。
  // 人数やクーポンを変えるたびにここを通るので、無効化が上書きで解除されることもない。
  reserveBtn.disabled = soldOut || Boolean(result.error);
}

/**
 * クーポンの「適用」。押した時点の入力値を確定させ、再計算する。
 * 効いたかどうかは計算結果から判断する（コードの正否をここで判定しない）。
 */
function applyCoupon() {
  // 入力欄の見た目を整えるための正規化。判定そのものは calculatePrice が
  // 内部で同じ正規化をしてから行うので、ここでの整形は表示上の親切に過ぎない。
  appliedCoupon = els.couponCode.value.trim().toUpperCase();
  els.couponCode.value = appliedCoupon;
  updatePricing();
  syncUrl();

  const applied = lastBreakdown && lastBreakdown.appliedDiscount;

  if (!appliedCoupon) {
    els.couponMsg.hidden = true;
    return;
  }
  if (applied && applied.code === appliedCoupon) {
    // 割引名は言語別フィールドのまま渡す。t() が現在の言語に解く。
    els.couponMsg.textContent = t('modal.coupon.applied', { label: applied.label });
    track(EVENTS.COUPON_APPLIED, {
      code: appliedCoupon,
      roomId: currentRoom ? Number(currentRoom.id) : null,
      priceBand: lastBreakdown ? toPriceBand(lastBreakdown.total) : null,
    });
  } else if (applied) {
    // 併用不可なので、より値引き額の大きい割引が既に効いている場合はそちらが残る。
    els.couponMsg.textContent = t('modal.coupon.superseded', { label: applied.label });
    // 別の割引に負けた場合も「そのコードは効かなかった」ことに変わりはない。
    // どのコードが期待外れだったかは配信側が知る必要がある。
    track(EVENTS.COUPON_REJECTED, {
      code: appliedCoupon,
      reason: 'superseded',
      roomId: currentRoom ? Number(currentRoom.id) : null,
    });
  } else {
    els.couponMsg.textContent = t('modal.coupon.invalid');
    track(EVENTS.COUPON_REJECTED, {
      code: appliedCoupon,
      reason: 'invalid',
      roomId: currentRoom ? Number(currentRoom.id) : null,
    });
  }
  els.couponMsg.hidden = false;
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
  updatePricing();
}

/**
 * カレンダーで日付が確定／解除されたときに呼ばれる。
 *
 * 隠してある input[type=date] が引き続き値の保持役なので、
 * ここで value を書き戻してから updatePricing() を呼ぶ。
 * value の代入では change イベントが発火せず onCheckinChange は動かないため、
 * 料金の再計算はこの明示的な呼び出しに任せる。
 *
 * @param {?{checkIn: string, checkOut: string, nights: number}} range 解除時は null
 */
function onCalendarSelect(range) {
  const { checkin, checkout } = els;

  currentRange = range || null;

  if (!range) {
    checkin.value = '';
    checkout.value = '';
  } else {
    checkin.value = range.checkIn;
    checkout.value = range.checkOut;
  }

  renderSelectedDates();

  updatePricing();
  syncUrl();

  // 解除は送らない。選び直しの途中で必ず一度 null が来るので、
  // 送ると「選択をやめた」ように見えるイベントが選択のたびに混ざる。
  if (range) {
    track(EVENTS.DATES_SELECTED, {
      roomId: currentRoom ? Number(currentRoom.id) : null,
      nights: range.nights,
      guests: Number(els.form.guests.value) || null,
      // 何日先の予約かは分析に使うが、日付そのものは客室・人数と
      // 組み合わせると予約 1 件を指せてしまうので送らない。
      leadDays: calcNights(todayStr(), range.checkIn),
      priceBand: lastBreakdown ? toPriceBand(lastBreakdown.total) : null,
    });
  }
}

/**
 * 選択中の日程を表示欄に出す。
 * 日付の書式は言語で変わるので、保持しているのは "YYYY-MM-DD" のままにして、
 * 表示のたびにここで整形する。
 */
function renderSelectedDates() {
  if (!els) return;

  if (!currentRange) {
    els.dates.textContent = noDatesText();
    return;
  }

  els.dates.textContent = t('modal.selectedDates', {
    checkIn: formatDate(currentRange.checkIn),
    checkOut: formatDate(currentRange.checkOut),
    nights: tPlural('nights', currentRange.nights),
  });
}

/* ---------- URL への反映 ---------- */

/**
 * いま画面に出ている条件を URL に書き戻す。
 *
 * 日付確定・人数変更・クーポン適用の 3 つの入口から呼ぶ。updatePricing と
 * 同じ場所から呼ぶことで、「金額が変わったのに URL が古いまま」が起きない。
 */
function syncUrl() {
  if (!currentRoom || !els) return;

  syncDeepLinkUrl({
    room: Number(currentRoom.id),
    // 日付は確定している（checkOut まで埋まっている）ときだけ載せる。
    // 片側だけの URL は parseDeepLink 側で捨てられるので出す意味がない。
    checkIn: els.checkin.value || null,
    checkOut: els.checkout.value || null,
    guests: Number(els.form.guests.value) || null,
    promo: appliedCoupon || null,
  });
}

/**
 * いまの条件の URL をクリップボードへコピーする。
 *
 * URL は条件が変わるたびに書き換えてあるので、組み立て直さず location.href を渡す。
 * ここで作り直すと「画面の URL」と「共有した URL」が食い違う余地ができる。
 */
async function shareCurrentUrl() {
  // 押した時点の URL を確実にするため、一度書き戻してから読む。
  syncUrl();

  try {
    // clipboard API は https（と localhost）でしか使えず、権限も拒否され得る。
    // 使えない環境では例外になるので、成否は必ず利用者に返す。
    if (!navigator.clipboard) throw new Error('clipboard API unavailable');
    await navigator.clipboard.writeText(window.location.href);
    showToast(t('modal.shareCopied'));
  } catch (err) {
    showToast(t('modal.shareFailed'), {
      type: 'error',
    });
    // eslint-disable-next-line no-console
    console.warn(err);
  }
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
  showingSoldOutError = false;
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
    showingSoldOutError = false;
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
    showFieldError('guestName', t('form.error.guestNameRequired'));
    ok = false;
  }
  if (!values.email.trim()) {
    showFieldError('email', t('form.error.emailRequired'));
    ok = false;
  }
  return ok;
}

// 詳細 → フォームへ遷移。日付と金額の要約を出す。
// 人数 select は詳細ビューと共有しており openRoomModal で作り済みなので、ここでは触らない。
function goToForm() {
  const nights = calcNights(els.checkin.value, els.checkout.value);

  renderFormSummary();
  clearErrors();
  setView('form');

  track(EVENTS.FORM_REACHED, {
    roomId: Number(currentRoom.id),
    nights,
    guests: Number(els.form.guests.value) || null,
    priceBand: lastBreakdown ? toPriceBand(lastBreakdown.total) : null,
    coupon: appliedCoupon || null,
  });
}

/**
 * フォーム上部の「部屋・日程・金額」の1行を組み立てる。
 * 言語が変わったときにも同じ内容を作り直せるよう、関数に分けてある。
 */
function renderFormSummary() {
  if (!els || !currentRoom) return;

  const nights = calcNights(els.checkin.value, els.checkout.value);
  const totalText = lastBreakdown
    ? t('form.summaryTotal', {
        amount: formatMoney(lastBreakdown.total),
        note: totalPriceNote(),
      })
    : '';

  els.formSummary.textContent = t('form.summary', {
    room: roomName(currentRoom),
    checkIn: formatDate(els.checkin.value),
    checkOut: formatDate(els.checkout.value),
    nights: tPlural('nights', nights),
    total: totalText,
  });
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

  // 送信ペイロード。roomTypeId / guests は必ず数値に変換。
  // 料金は送らない。画面の計算はあくまで見積もりで、税率も割引も変わり得るため、
  // 請求額はサーバーが同じルールで計算し直した値を唯一の正とする。
  // クライアントが金額を送れる作りにすると、改ざんされた金額で予約が通る余地も残る。
  const payload = {
    roomTypeId: Number(currentRoom.id),
    guests: Number(values.guests),
    // 金額ではなく「どのクーポンを使ったか」だけを渡す。割引の適用可否はサーバーが決める。
    couponCode: appliedCoupon,
    checkIn: els.checkin.value,
    checkOut: els.checkout.value,
    guestName: values.guestName.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    notes: values.notes.trim(),
  };

  submitting = true;
  updateSubmitDisabled();
  els.submitBtn.textContent = t('form.submitting');

  try {
    const res = await createReservation(payload);

    if (res.ok && res.status === 201) {
      // 成功：予約番号を完了画面に表示
      els.completeOrder.textContent = res.data.orderNumber;
      setView('complete');

      // 予約番号は送らない。それ 1 つで予約と利用者を名指しでき、
      // 計測側に渡った時点で「誰がいつ何を予約したか」の索引になる。
      // 成約の分析に要るのは件数と条件の分布であって、個別の予約ではない。
      track(EVENTS.RESERVATION_COMPLETED, {
        roomId: Number(currentRoom.id),
        nights: calcNights(els.checkin.value, els.checkout.value),
        guests: Number(values.guests) || null,
        priceBand: lastBreakdown ? toPriceBand(lastBreakdown.total) : null,
        coupon: appliedCoupon || null,
      });
      return;
    }

    const error = res.error || {};
    switch (error.code) {
      case 'VALIDATION_ERROR':
        // details の field ごとに対応項目へエラー表示
        (error.details || []).forEach((d) => showFieldError(d.field, d.message));
        // サーバーのメッセージがあればそれを出す（項目ごとの事情はサーバーが持つ）。
        // 無ければこちらの汎用文。サーバー由来の文言の翻訳は API 側の責務で、
        // フロントの辞書には置けない（何が返るか事前に分からない）。
        showGeneralError(error.message || t('form.error.validation'));
        break;
      case 'OUT_OF_STOCK':
        // 満室：メッセージを表示し、一覧を更新してモーダルを閉じる。
        // 在庫のポーリング（notifyInventoryChange）を入れた後もこの分岐は残す。
        // ポーリングはあくまで数十秒遅れの予測であり、在庫を確定できるのは
        // 予約を実際に処理したサーバーの応答だけ ＝ こちらが最終的な真実。
        showGeneralError(t('form.error.outOfStock'));
        if (onStockChange) onStockChange();
        autoCloseTimer = window.setTimeout(closeRoomModal, 1800);
        break;
      default:
        // その他：サーバーのメッセージをそのまま表示
        showGeneralError(error.message || t('form.error.failed'));
    }
  } catch (err) {
    showGeneralError(t('form.error.network'));
    // eslint-disable-next-line no-console
    console.error(err);
  } finally {
    submitting = false;
    // 送信中に満室になっていた場合、ここで無条件に有効化すると
    // 押せる送信ボタンが戻ってしまうので、両方の理由を見て決め直す。
    updateSubmitDisabled();
    els.submitBtn.textContent = t('form.submit');
  }
}

/* ---------- 開閉 ---------- */

function clearAutoClose() {
  if (autoCloseTimer !== null) {
    window.clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

/**
 * ディープリンク由来の初期値を設定する。
 *
 * ここで保持するのは「次にモーダルを開いたときに適用する値」であって、
 * いま画面に出ている状態ではない。予約フォームまで進んだ後の再オープンや、
 * 一覧から別の部屋を開いた場合にも同じ初期値が効く。
 *
 * @param {?{checkIn: ?string, checkOut: ?string, guests: ?number, promo: ?string}} defaults
 *   null を渡すと解除（通知バーの「取り消す」から呼ばれる）
 */
export function setDeepLinkDefaults(defaults) {
  deepLinkDefaults = defaults || null;
}

/**
 * 見出し（画像・客室名・単価・説明）を現在の言語で組み立てる。
 *
 * innerHTML をやめて要素を組み立てている。単価は formatMoney が数値から
 * 作った文字列なので安全だが、注記は辞書の値で、辞書は将来 CMS 由来に
 * なり得る。文字列連結で HTML を作る経路を 1 つでも残すと、そこが
 * そのまま持ち込みの入口になる。
 */
function renderRoomHeading() {
  if (!els || !currentRoom) return;

  els.img.src = resolveImageUrl(currentRoom.imagePath);
  els.img.alt = roomName(currentRoom);
  els.name.textContent = roomName(currentRoom);
  els.desc.textContent = roomDescription(currentRoom);

  // 見出しの単価もカード・カレンダーと同じ基準（税込・宿泊税別）で出す。
  els.price.textContent = formatMoney(
    toNightlyDisplayPrice(currentRoom.price, pricingRules),
  );

  const unit = document.createElement('span');
  unit.textContent = t('rooms.perNight');

  const note = document.createElement('small');
  note.className = 'modal__tax-note';
  note.textContent = nightlyPriceNote(pricingRules);

  els.price.append(unit, note);
}

export function openRoomModal(room) {
  if (!els) return;
  currentRoom = room;

  // 前回の自動クローズ待ちを打ち切る。残っていると、いま開いた部屋が
  // 前回の満室応答を理由に閉じられる。
  clearAutoClose();

  // 前回開いた部屋の在庫切れ状態を持ち越さない。
  // updatePricing より先に落としておかないと、予約ボタンが無効のまま開く。
  soldOut = !isBookable(room.stock);
  submitting = false;

  renderRoomHeading();

  // 月間料金カレンダー。部屋ごとに料金が違うので、開くたびに作り直す。
  // 前回のものが残っていれば先に破棄してから差し込む。
  // ディープリンクの日付は、カレンダーの初期選択と初期表示月の両方に渡す。
  // 選択だけ渡して表示月を渡さないと、今月のマス目に「どこにも無い選択」が
  // 塗られた状態で開くことになる。
  const linkDates =
    deepLinkDefaults && deepLinkDefaults.checkIn && deepLinkDefaults.checkOut
      ? { checkIn: deepLinkDefaults.checkIn, checkOut: deepLinkDefaults.checkOut }
      : null;

  if (calendar) calendar.destroy();
  calendar = createMonthCalendar({
    roomId: room.id,
    onSelect: onCalendarSelect,
    initialRange: linkDates,
    initialMonth: linkDates ? linkDates.checkIn.slice(0, 7) : null,
  });
  els.calendarMount.appendChild(calendar.el);
  currentRange = null;
  renderSelectedDates();

  // 人数の選択肢は部屋ごとに上限が違うので、開くたびに作り直す。
  renderGuestOptions(room);
  // ディープリンクの人数は定員を超えていたら使わない。
  // 定員に丸めると、URL で指定したはずの人数と違う金額を黙って出すことになる。
  const linkGuests =
    deepLinkDefaults &&
    deepLinkDefaults.guests &&
    deepLinkDefaults.guests <= room.capacity
      ? deepLinkDefaults.guests
      : null;
  syncGuests(linkGuests || Math.min(2, room.capacity));

  // クーポンは部屋をまたいで持ち越さない。
  // ただしディープリンクの promo は「開くたびに適用する既定値」なので、
  // 部屋を変えても効き続ける（取り消されるまで）。
  appliedCoupon = (deepLinkDefaults && deepLinkDefaults.promo) || '';
  els.couponCode.value = appliedCoupon;
  els.couponMsg.hidden = true;

  const today = todayStr();
  els.checkin.min = today;
  els.checkin.value = '';
  els.checkout.min = addDays(today, 1);
  els.checkout.value = '';
  updatePricing();

  els.form.reset();
  clearErrors();
  setView('detail');

  els.modal.hidden = false;
  document.body.style.overflow = 'hidden';

  // 開いた時点で客室を URL に載せる。
  // ただしディープリンクの日付を持って開いた場合は、ここでは触らない。
  // この時点の入力欄はまだ空なので、書き戻すと URL の日付を一度消してしまい、
  // カレンダーの検証が終わるまでの間に再読み込みされると日付が失われる。
  // 検証を通れば onCalendarSelect 経由で、落ちれば同じく null 経由で反映される。
  if (!linkDates) syncUrl();

  track(EVENTS.ROOM_VIEW, {
    roomId: Number(room.id),
    // 単価も帯で送る。客室ごとの実額はモックでも本番でも公開情報だが、
    // 送る金額の粒度をイベントごとに変えると集計側で混ざる。
    priceBand: toPriceBand(room.price),
    stock: readStock(room.stock),
    // ディープリンクの初期値が効いている状態で開いたか。
    // 「自動で開いた」ではない（取り消されるまでは、一覧から手で開いても真になる）。
    // 名前を auto にすると集計側が自動オープン数と読み違える。
    deepLinkActive: Boolean(deepLinkDefaults),
  });
}

export function closeRoomModal() {
  if (!els) return;
  clearAutoClose();
  els.modal.hidden = true;
  document.body.style.overflow = '';

  // 予約条件だけを URL から外す。計測パラメータと言語は残す
  // （閉じただけで流入元が消えると、以降の行動が計測から切れる）。
  syncDeepLinkUrl(null);

  currentRoom = null;
  soldOut = false;
  lastBreakdown = null;
  appliedCoupon = '';
  breakdown.clear();

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
/**
 * モーダルの器を用意する。すでにページ内にあればそれを使い、
 * 無ければテンプレートから生成して body の末尾に差す。
 *
 * 既存要素を優先するのは、将来どこかのページが独自の位置にモーダルを
 * 置きたくなった場合に、この関数を書き換えずに済ませるため。
 *
 * @returns {?HTMLElement}
 */
function mountModal() {
  const existing = document.getElementById('room-modal');
  if (existing) return existing;

  // テンプレートは要素 1 つ分なので、仮の親に流し込んで最初の要素だけ取り出す。
  const host = document.createElement('div');
  host.innerHTML = ROOM_MODAL_HTML.trim();
  const modal = host.firstElementChild;
  if (!modal) return null;

  document.body.appendChild(modal);
  return modal;
}

/**
 * モーダルの中で、言語が変わったときに作り直しが要るものをすべて描き直す。
 *
 * 静的なラベルは data-i18n が付いているので applyTranslations が面倒を見る。
 * ここで扱うのはそれ以外 ＝ 実行時に値が決まるもの。
 *
 * 入力欄の値には触れない。言語を変えただけで入力途中の内容が消えるのは、
 * 満室の警告で入力を消さないのと同じ理由で避ける。人数の選択肢だけは
 * 作り直すが、選択中の値は syncGuests が保持役から書き戻す。
 */
function refreshLocalizedContent() {
  if (!els) return;

  // 差し込み済みのモーダル全体に、静的ラベルの翻訳を当て直す。
  applyTranslations(els.modal);

  // 閉じている間は中身を作り直さない。次に開くとき openRoomModal が
  // その時点の言語で組み直すので、先回りしても無駄になる。
  if (els.modal.hidden || !currentRoom) return;

  renderRoomHeading();
  renderSelectedDates();
  renderFormSummary();

  // 人数の選択肢（「2名」/「2 guests」）。保持役の値を控えて作り直し、書き戻す。
  const selected = els.form.guests.value;
  renderGuestOptions(currentRoom);
  syncGuests(selected);

  // 送信ボタンの文言は送信中かどうかで変わる。状態から導き直す。
  els.submitBtn.textContent = submitting ? t('form.submitting') : t('form.submit');

  // 満室の警告を出している最中なら、その文言も新しい言語で出し直す。
  if (showingSoldOutError) showGeneralError(t('form.error.soldOut'));

  // 料金内訳は自分で購読しているので、ここからは触らない。
}

export function initRoomModal(opts = {}) {
  const modal = mountModal();
  if (!modal) return;

  // 差し込んだ直後に翻訳を当てる。文書全体の走査（lang.js の購読）は
  // モーダルが body に入る前に済んでいることがあり、その順番だと
  // テンプレートに書いた日本語がそのまま残る。差し込んだ側が
  // 自分の要素を渡して呼ぶ形にすれば、起動の順番に左右されない。
  applyTranslations(modal);

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
    bookingGuests: document.getElementById('booking-guests'),
    couponCode: document.getElementById('coupon-code'),
    couponApply: document.getElementById('coupon-apply'),
    couponMsg: document.getElementById('coupon-msg'),
    breakdownMount: document.getElementById('breakdown-mount'),
    bookingAlert: document.getElementById('booking-alert'),
    reserveBtn: document.getElementById('booking-reserve'),
    shareBtn: document.getElementById('booking-share'),
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

  // 料金内訳はモーダルと同じ寿命なので、ここで一度だけ作って差し込む。
  // 作り直す場合は前のものを破棄する（内訳も言語変更を購読しているため、
  // 捨てただけだと DOM から外れた要素を相手に描き直しが走り続ける）。
  if (breakdown) breakdown.destroy();
  breakdown = createPriceBreakdown();
  els.breakdownMount.appendChild(breakdown.el);

  // 日付入力
  els.checkin.addEventListener('change', onCheckinChange);
  els.checkout.addEventListener('change', updatePricing);

  // 再入力を始めた時点で、その項目のエラー表示をリセットする
  els.form.querySelectorAll('[name]').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => clearFieldError(input.name));
  });

  // 詳細→フォーム、フォーム→詳細、送信
  els.reserveBtn.addEventListener('click', goToForm);
  els.shareBtn.addEventListener('click', shareCurrentUrl);
  els.form
    .querySelector('[data-form-back]')
    .addEventListener('click', () => setView('detail'));
  els.form.addEventListener('submit', handleSubmit);

  // 人数変更。どちらの select から入力されても、保持役へ書いてから再計算する。
  els.bookingGuests.addEventListener('change', () => {
    syncGuests(els.bookingGuests.value);
    updatePricing();
    syncUrl();
  });
  els.guests.addEventListener('change', () => {
    syncGuests(els.guests.value);
    updatePricing();
    syncUrl();
  });

  // クーポンは「適用」を押したときだけ効かせる。
  els.couponApply.addEventListener('click', applyCoupon);

  // 言語が変わったら自分の中身を描き直す。モーダルはページと同じ寿命なので
  // 通常は解除する場面がないが、initRoomModal が 2 度呼ばれたときに
  // 購読が積み上がらないよう、前回ぶんを外してから張る。
  if (unsubscribeLocale) unsubscribeLocale();
  unsubscribeLocale = onLocaleChange(refreshLocalizedContent);

  // 料金ルールの取得。一覧カードやカレンダーと同じ1件を共有する（rulesStore）。
  // 取れるまで料金は出せないので、届いた時点で計算し直す。
  loadPricingRules().then((rules) => {
    pricingRules = rules;
    if (!els.modal.hidden) updatePricing();
  });
}
