// 簡体字中国語の辞書。
//
// UI ラベル（ボタン・入力欄のラベル・状態表示・エラー文言）は訳してある。
//
// 一方、宣伝文とページのメタ情報（キャッチコピー・住所・館内案内・
// og:description など）は、まだ入れていない。原稿が要る性質のもので、
// 機械的に置き換えられるものではないため。
//
// 未訳のキーは「原文をコピーして埋める」ことをせず、キーごと落としてある。
// 埋めてしまうと、その値が訳なのか原稿待ちなのかを機械が区別できなくなる。
// 落としておけば t() が ja へフォールバックして日本語を表示しつつ、
// 開発時のコンソールと npm run check:i18n が未訳の一覧を出し続ける。
//
// 未訳のまま残しているキー（check:i18n が毎回一覧に出す）:
//   meta.title / meta.description / meta.ogTitle / meta.ogDescription
//   hero.title / hero.subtitle / rooms.lead / reserve.text
//   access.address.desc / access.station.desc / access.hours.desc
export default {
  /* ---------- ページのメタ情報 ---------- */
  // og:locale だけは原稿ではなく決まった値なので先に入れる。
  'meta.ogLocale': 'zh_CN',

  /* ---------- 共通 ---------- */
  'common.langSwitch': '语言',
  'common.close': '关闭',
  'common.required': '必填',
  'common.optional': '选填',
  'common.back': '← 返回',
  'common.retry': '重试',

  /* ---------- ナビゲーション ---------- */
  'nav.home': '首页',
  'nav.rooms': '客房',
  'nav.access': '交通',
  'nav.reserve': '预订',

  /* ---------- ヒーロー ---------- */
  'hero.cta': '立即预订',

  /* ---------- 客室一覧 ---------- */
  'rooms.title': '客房介绍',
  'rooms.perNight': '/晚',
  'rooms.perNightFrom': '/晚起',
  'rooms.reserve': '预订',
  'rooms.soldOut': '客满',
  'rooms.variesByWeekday': '价格因星期而异',
  // 区切りは読点。日本語の中黒も英語のカンマも使わない。
  'rooms.priceNote': '{taxNote}，{varies}',
  'rooms.error': '客房信息获取失败。请稍后重试。',
  'rooms.lastUpdated': '最后更新 {time}',

  /* ---------- 在庫の状態 ---------- */
  'stock.soldOut': '客满',
  'stock.last': '仅剩 1 间',
  'stock.few': '仅剩 {count} 间',
  'stock.plenty': '有空房',

  /* ---------- 料金の注記 ---------- */
  'price.nightlyNote': '含税及服务费 / 不含住宿税',
  'price.nightlyNoteFallback': '不含税及服务费',
  'price.totalNote': '含税、服务费及住宿税',

  /* ---------- アクセス ---------- */
  'access.title': '交通',
  'access.address.term': '地址',
  'access.station.term': '最近车站',
  'access.hours.term': '营业信息',

  /* ---------- 予約セクション ---------- */
  'reserve.title': '在此预订',
  'reserve.cta': '预订',

  'footer.copy': '© 2026 Hotel ITS. All rights reserved.',

  /* ---------- 予約モーダル：日付選択ビュー ---------- */
  'modal.noDates': '请选择日期',
  'modal.selectedDates': '{checkIn} – {checkOut}（{nights}）',
  'modal.checkIn': '入住',
  'modal.checkOut': '退房',
  'modal.guests': '入住人数',
  'modal.couponCode': '优惠码',
  'modal.couponApply': '应用',
  'modal.coupon.applied': '已应用{label}。',
  'modal.coupon.superseded': '{label}的折扣金额更大，因此已改为应用该优惠。',
  'modal.coupon.invalid': '此优惠码无法使用。',
  'modal.soldOutAlert': '您浏览期间该客房已订满。请考虑其他日期或其他客房。',
  'modal.browseOtherRooms': '查看其他客房',
  'modal.reserve': '预订',
  'modal.share': '分享此条件',
  'modal.shareCopied': '已复制此条件的网址',
  'modal.shareFailed': '复制失败。请从地址栏复制网址',

  /* ---------- 予約モーダル：フォームビュー ---------- */
  'form.title': '填写预订信息',
  'form.summary': '{room}｜{checkIn} – {checkOut}（{nights} / {total}）',
  'form.summaryTotal': '合计 {amount}（{note}）',
  'form.guestName': '预订人姓名',
  'form.email': '电子邮箱',
  'form.phone': '电话号码',
  'form.notes': '备注',
  'form.submit': '确认预订',
  'form.submitting': '发送中...',
  'form.error.guestNameRequired': '请输入预订人姓名。',
  'form.error.emailRequired': '请输入电子邮箱。',
  'form.error.validation': '请确认填写内容。',
  'form.error.soldOut': '办理过程中该客房已订满。请考虑其他日期或其他客房。',
  'form.error.outOfStock': '客满。您希望的客房已订满，将返回客房列表。',
  'form.error.failed': '预订失败。',
  'form.error.network': '通信失败。请稍后重试。',

  /* ---------- 予約モーダル：完了ビュー ---------- */
  'complete.title': '预订已完成',
  'complete.orderLabel': '预订编号',
  'complete.note': '确认邮件已发送。请妥善保管预订编号。',

  /* ---------- 料金内訳 ---------- */
  'breakdown.meta': '{note} / {guests}{nights}',
  'breakdown.nightlyTitle': '每日房费（{nights}）',
  'breakdown.nightlyBase': '基本 {amount}',
  'breakdown.nightlyExtraGuest': '加人费 {amount}',
  'breakdown.nightlySingleDiscount': '单人入住折扣 {amount}',
  'breakdown.roomCharge': '{room} 房费',
  'breakdown.roomCharge.nights': '{nights} / {guests}',
  'breakdown.roomCharge.extraGuests': '（加{count}位）',
  'breakdown.roomCharge.singleUse': '（已适用单人入住折扣）',
  'breakdown.serviceCharge': '服务费（{rate}）',
  'breakdown.consumptionTax': '消费税（{rate}）',
  'breakdown.accommodationTax': '住宿税',
  'breakdown.accommodationTax.note': '每人每晚 {amount} × {guests} × {nights}',
  'breakdown.total': '合计',

  /* ---------- 料金カレンダー ---------- */
  'calendar.prevMonth': '上个月',
  'calendar.nextMonth': '下个月',
  'calendar.gridLabel': '{month}的价格日历',
  'calendar.taxNote': '每晚，{note}',
  'calendar.loading': '正在加载价格…',
  'calendar.error': '价格获取失败。',
  'calendar.closedShort': '休',
  'calendar.soldOutShort': '满',
  'calendar.blockedWarning': '所选期间包含客满或休馆日，无法选择。请选择其他日期。',
  'calendar.day.outside': '非当前显示月份',
  'calendar.day.noRate': '价格未获取',
  'calendar.day.closed': '休馆日',
  'calendar.day.soldOut': '客满',
  'calendar.day.available': '有空房',
  'calendar.day.past': '已截止',

  /* ---------- ディープリンクの通知バー ---------- */
  'notice.applied': '已应用{items}。',
  'notice.cancel': '撤销',
  'notice.close': '关闭通知',
  'notice.item.dates': '{checkIn} – {checkOut}',
  'notice.item.promo': '优惠码 {code}',
  'notice.separator': '、',

  /* ---------- 泊数・人数（単複） ---------- */
  // 中国語も日本語と同じく数で語形が変わらないので other だけ。
  'nights.other': '{count}晚',
  'guests.other': '{count}位',
};
