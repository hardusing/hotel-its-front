// 英語の辞書。キーの一覧は ja.js と 1 対 1 で対応させる。
//
// 欠けているキーがあっても画面は壊れない（t() が ja へフォールバックする）が、
// その箇所は英語表示のまま日本語が出るので、翻訳漏れは開発時の警告で気付く。
export default {
  /* ---------- ページのメタ情報 ---------- */
  'meta.title': 'Hotel ITS | The closest place to the sky',
  'meta.description':
    'A refined stay in the heart of the city. Choose from Single, Double and Suite, check availability and rates on the calendar, and book right away.',
  'meta.ogTitle': 'Hotel ITS | The closest place to the sky',
  'meta.ogDescription':
    'A refined stay in the heart of the city. Check availability and rates on the calendar and book right away.',
  'meta.ogLocale': 'en_US',

  /* ---------- 共通 ---------- */
  'common.langSwitch': 'Language',
  'common.close': 'Close',
  'common.required': 'Required',
  'common.optional': 'Optional',
  'common.back': '← Back',
  'common.retry': 'Retry',

  /* ---------- ナビゲーション ---------- */
  'nav.home': 'Home',
  'nav.rooms': 'Rooms',
  'nav.access': 'Access',
  'nav.reserve': 'Reserve',

  /* ---------- ヒーロー ---------- */
  'hero.title': 'The closest place to the sky, a moment of serenity',
  'hero.subtitle': 'A refined stay in the heart of the city.',
  'hero.cta': 'Book Now',

  /* ---------- 客室一覧 ---------- */
  'rooms.title': 'Our Rooms',
  'rooms.lead': 'Three room types to suit every kind of stay.',
  'rooms.perNight': '/night',
  'rooms.perNightFrom': '/night and up',
  'rooms.reserve': 'Reserve',
  'rooms.soldOut': 'Sold out',
  'rooms.variesByWeekday': 'varies by day of week',
  'rooms.priceNote': '{taxNote}, {varies}',
  'rooms.error': 'Could not load room information. Please try again in a moment.',
  'rooms.lastUpdated': 'Updated {time}',

  /* ---------- 在庫の状態 ---------- */
  'stock.soldOut': 'Sold out',
  'stock.last': 'Only 1 room left',
  'stock.few': '{count} rooms left',
  'stock.plenty': 'Available',

  /* ---------- 料金の注記 ---------- */
  'price.nightlyNote': 'Incl. tax & service charge / excl. accommodation tax',
  'price.nightlyNoteFallback': 'Excl. tax & service charge',
  'price.totalNote': 'Incl. tax, service charge & accommodation tax',

  /* ---------- アクセス ---------- */
  'access.title': 'Access',
  'access.address.term': 'Address',
  'access.address.desc': '1-2-3 Tower St., Skyline Ward, Tozora City',
  'access.station.term': 'Nearest Station',
  'access.station.desc': '5 min walk from Cloud Station',
  'access.hours.term': 'Hours',
  'access.hours.desc': 'Check-in 15:00 / Check-out 11:00',

  /* ---------- 予約セクション ---------- */
  'reserve.title': 'Make a Reservation',
  'reserve.text': 'Spend a special day at Hotel ITS.',
  'reserve.cta': 'Reserve',

  'footer.copy': '© 2026 Hotel ITS. All rights reserved.',

  /* ---------- 予約モーダル：日付選択ビュー ---------- */
  'modal.noDates': 'Please select your dates',
  'modal.selectedDates': '{checkIn} – {checkOut} ({nights})',
  'modal.checkIn': 'Check-in',
  'modal.checkOut': 'Check-out',
  'modal.guests': 'Guests',
  'modal.couponCode': 'Coupon code',
  'modal.couponApply': 'Apply',
  'modal.coupon.applied': '{label} has been applied.',
  'modal.coupon.superseded': '{label} gives a larger discount, so that one is applied instead.',
  'modal.coupon.invalid': 'This coupon code cannot be used.',
  'modal.soldOutAlert':
    'This room sold out while you were viewing it. Please consider other dates or another room.',
  'modal.browseOtherRooms': 'Browse other rooms',
  'modal.reserve': 'Reserve',
  'modal.share': 'Share these conditions',
  'modal.shareCopied': 'URL for these conditions copied',
  'modal.shareFailed': 'Could not copy. Please copy the URL from the address bar',

  /* ---------- 予約モーダル：フォームビュー ---------- */
  'form.title': 'Enter reservation details',
  'form.summary': '{room} | {checkIn} – {checkOut} ({nights} / {total})',
  'form.summaryTotal': 'Total {amount} ({note})',
  'form.guestName': 'Guest name',
  'form.email': 'Email address',
  'form.phone': 'Phone number',
  'form.notes': 'Notes',
  'form.submit': 'Confirm reservation',
  'form.submitting': 'Sending...',
  'form.error.guestNameRequired': 'Please enter the guest name.',
  'form.error.emailRequired': 'Please enter an email address.',
  'form.error.validation': 'Please check your input.',
  'form.error.soldOut':
    'This room sold out while you were booking. Please consider other dates or another room.',
  'form.error.outOfStock': 'Sold out. This room is no longer available. Returning to the room list.',
  'form.error.failed': 'The reservation could not be completed.',
  'form.error.network': 'Connection failed. Please try again in a moment.',

  /* ---------- 予約モーダル：完了ビュー ---------- */
  'complete.title': 'Your reservation is confirmed',
  'complete.orderLabel': 'Reservation number',
  'complete.note': 'A confirmation email has been sent. Please keep your reservation number.',

  /* ---------- 料金内訳 ---------- */
  'breakdown.meta': '{note} / {guests}, {nights}',
  'breakdown.nightlyTitle': 'Nightly room rates ({nights})',
  'breakdown.nightlyBase': 'Base {amount}',
  'breakdown.nightlyExtraGuest': 'Extra guest {amount}',
  'breakdown.nightlySingleDiscount': 'Single occupancy discount {amount}',
  'breakdown.roomCharge': '{room} room charge',
  'breakdown.roomCharge.nights': '{nights} / {guests}',
  'breakdown.roomCharge.extraGuests': '(+{count} extra)',
  'breakdown.roomCharge.singleUse': '(single occupancy discount applied)',
  'breakdown.serviceCharge': 'Service charge ({rate})',
  'breakdown.consumptionTax': 'Consumption tax ({rate})',
  'breakdown.accommodationTax': 'Accommodation tax',
  'breakdown.accommodationTax.note': '{amount} per guest per night × {guests} × {nights}',
  'breakdown.total': 'Total',

  /* ---------- 料金カレンダー ---------- */
  'calendar.prevMonth': 'Previous month',
  'calendar.nextMonth': 'Next month',
  'calendar.gridLabel': 'Rate calendar for {month}',
  'calendar.taxNote': 'Per night, {note}',
  'calendar.loading': 'Loading rates…',
  'calendar.error': 'Could not load rates.',
  'calendar.closedShort': 'Cls',
  'calendar.soldOutShort': 'Full',
  'calendar.blockedWarning':
    'A stay cannot span sold-out or closed days. Please choose different dates.',
  'calendar.day.outside': 'outside the displayed month',
  'calendar.day.noRate': 'rate unavailable',
  'calendar.day.closed': 'closed',
  'calendar.day.soldOut': 'sold out',
  'calendar.day.available': 'available',
  'calendar.day.past': 'no longer bookable',

  /* ---------- ディープリンクの通知バー ---------- */
  'notice.applied': 'Applied {items}.',
  'notice.cancel': 'Undo',
  'notice.close': 'Close notification',
  'notice.item.dates': '{checkIn} – {checkOut}',
  'notice.item.promo': 'coupon {code}',
  'notice.separator': ', ',

  /* ---------- 泊数（単複） ---------- */
  // 日本語は数で語形が変わらないので ja.js 側は other だけを持つ。
  // 英語は 1 泊だけ night になるため、ここで one を足す。
  'nights.one': '{count} night',
  'nights.other': '{count} nights',
  'guests.one': '{count} guest',
  'guests.other': '{count} guests',
};
