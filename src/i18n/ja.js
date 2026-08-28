// 日本語の辞書。
//
// キーは HTML 側の data-i18n、および t() の第1引数と対応する。
// 値は必ずプレーンテキストにする（HTML タグを書かない）。理由は
// i18n/index.js の t() のコメントを参照。
//
// ここに置くのは「画面の構造に属する文言」だけ。客室名・説明・割引名の
// ように運営が足し引きするコンテンツは API の言語別フィールドで持ち、
// localizeField() で解く（i18n/index.js のコメントを参照）。
//
// 単複を持つ語は "<base>.one" / "<base>.other" のようにサフィックスで
// 並べ、tPlural() から引く。日本語は数で語形が変わらないので other だけで
// 足りるが、キーの形は言語をまたいで揃えておく（en 側だけ別の名前になると、
// 呼び出し側が言語を意識することになる）。
export default {
  /* ---------- ページのメタ情報 ---------- */
  'meta.title': 'Hotel ITS｜空に一番近い、やすらぎのひととき',
  'meta.description':
    '都会の真ん中で過ごす、上質な滞在体験。シングル・ダブル・スイートの3タイプから、空室と料金をカレンダーで確かめてそのままご予約いただけます。',
  'meta.ogTitle': 'Hotel ITS｜空に一番近い、やすらぎのひととき',
  'meta.ogDescription':
    '都会の真ん中で過ごす、上質な滞在体験。空室と料金をカレンダーで確かめて、そのままご予約いただけます。',
  // og:locale は言語コードではなく地域つきの形式で書く決まりなので、
  // <html lang> とは別に辞書で持つ。
  'meta.ogLocale': 'ja_JP',

  /* ---------- 共通 ---------- */
  'common.langSwitch': '言語',
  'common.close': '閉じる',
  'common.required': '必須',
  'common.optional': '任意',
  'common.back': '← 戻る',
  'common.retry': '再試行',

  /* ---------- ナビゲーション ---------- */
  'nav.home': 'ホーム',
  'nav.rooms': '客室',
  'nav.access': 'アクセス',
  'nav.reserve': '予約',

  /* ---------- ヒーロー ---------- */
  'hero.title': '空に一番近い、やすらぎのひととき',
  'hero.subtitle': '都会の真ん中で過ごす、上質な滞在体験を。',
  'hero.cta': '今すぐ予約する',

  /* ---------- 客室一覧 ---------- */
  'rooms.title': '客室紹介',
  'rooms.lead': '用途に合わせてお選びいただける、3つの客室タイプ。',
  // カードの単価に添える単位。「〜」は最安値からという意味なので分けている。
  'rooms.perNight': '/泊',
  'rooms.perNightFrom': '/泊〜',
  'rooms.reserve': '予約する',
  'rooms.soldOut': '満室',
  'rooms.variesByWeekday': '曜日により変動',
  // 注記は「税の扱い・曜日で変わること」を並べたもの。区切り記号まで
  // 言語ごとに変わる（日本語は中黒、英語はカンマ）ので文ごと持つ。
  'rooms.priceNote': '{taxNote}・{varies}',
  'rooms.error': '客室情報の取得に失敗しました。時間をおいて再度お試しください。',
  'rooms.lastUpdated': '最終更新 {time}',

  /* ---------- 在庫の状態 ---------- */
  'stock.soldOut': '満室',
  'stock.last': '残り1室',
  'stock.few': '残り{count}室',
  'stock.plenty': '空室あり',

  /* ---------- 料金の注記 ---------- */
  'price.nightlyNote': '税・サービス料込 / 宿泊税別',
  'price.nightlyNoteFallback': '税・サービス料別',
  'price.totalNote': '税・サービス料・宿泊税込',

  /* ---------- アクセス ---------- */
  'access.title': 'アクセス',
  'access.address.term': '住所',
  'access.address.desc': '東空市スカイライン区タワー通り1-2-3',
  'access.station.term': '最寄り駅',
  'access.station.desc': 'クラウド駅から徒歩5分',
  'access.hours.term': '営業情報',
  'access.hours.desc': 'チェックイン 15:00 ／ チェックアウト 11:00',

  /* ---------- 予約セクション ---------- */
  'reserve.title': 'ご予約はこちらから',
  'reserve.text': '特別な一日を、Hotel ITS で。',
  'reserve.cta': '予約する',

  'footer.copy': '© 2026 Hotel ITS. All rights reserved.',

  /* ---------- 予約モーダル：日付選択ビュー ---------- */
  'modal.noDates': '日付を選択してください',
  // 選択済みの日程。日付そのものは書式が言語で変わるので、整形済みの
  // 文字列を受け取る（呼び出し側が Intl で作る）。
  'modal.selectedDates': '{checkIn} 〜 {checkOut}（{nights}）',
  'modal.checkIn': 'チェックイン',
  'modal.checkOut': 'チェックアウト',
  'modal.guests': '宿泊人数',
  'modal.couponCode': 'クーポンコード',
  'modal.couponApply': '適用',
  'modal.coupon.applied': '{label}を適用しました。',
  'modal.coupon.superseded': '{label}の方が割引額が大きいため、そちらを適用しています。',
  'modal.coupon.invalid': 'このクーポンコードはご利用いただけません。',
  'modal.soldOutAlert':
    'ご覧いただいている間に満室となりました。別の日程か、他の客室をご検討ください。',
  'modal.browseOtherRooms': '他の客室を見る',
  'modal.reserve': '予約する',
  'modal.share': 'この条件を共有',
  'modal.shareCopied': 'この条件のURLをコピーしました',
  'modal.shareFailed': 'コピーできませんでした。URLバーからコピーしてください',

  /* ---------- 予約モーダル：フォームビュー ---------- */
  'form.title': '予約情報の入力',
  // 部屋名・日付・金額をまとめた1行。値はすべて整形済みで渡す。
  'form.summary': '{room}｜{checkIn} 〜 {checkOut}（{nights} / {total}）',
  'form.summaryTotal': '合計 {amount}（{note}）',
  'form.guestName': '予約者名',
  'form.email': 'メールアドレス',
  'form.phone': '電話番号',
  'form.notes': '備考',
  'form.submit': 'この内容で予約する',
  'form.submitting': '送信中...',
  'form.error.guestNameRequired': '予約者名を入力してください。',
  'form.error.emailRequired': 'メールアドレスを入力してください。',
  'form.error.validation': '入力内容をご確認ください。',
  'form.error.soldOut':
    '手続き中に満室となりました。恐れ入りますが、別の日程か他の客室をご検討ください。',
  'form.error.outOfStock': '満室です。ご希望のお部屋は満室になりました。一覧に戻ります。',
  'form.error.failed': '予約に失敗しました。',
  'form.error.network': '通信に失敗しました。時間をおいて再度お試しください。',

  /* ---------- 予約モーダル：完了ビュー ---------- */
  'complete.title': 'ご予約が完了しました',
  'complete.orderLabel': '予約番号',
  'complete.note': '確認メールをお送りしました。予約番号は大切に保管してください。',

  /* ---------- 料金内訳 ---------- */
  'breakdown.meta': '{note} / {guests}{nights}',
  'breakdown.nightlyTitle': '日別の室料（{nights}）',
  'breakdown.nightlyBase': '基本 {amount}',
  'breakdown.nightlyExtraGuest': '人数加算 {amount}',
  'breakdown.nightlySingleDiscount': '1名利用割引 {amount}',
  'breakdown.roomCharge': '{room} 室料',
  'breakdown.roomCharge.nights': '{nights} / {guests}',
  'breakdown.roomCharge.extraGuests': '（追加{count}名）',
  'breakdown.roomCharge.singleUse': '（1名利用割引適用済み）',
  'breakdown.serviceCharge': 'サービス料（{rate}）',
  'breakdown.consumptionTax': '消費税（{rate}）',
  'breakdown.accommodationTax': '宿泊税',
  'breakdown.accommodationTax.note': '1人1泊 {amount} × {guests} × {nights}',
  'breakdown.total': '合計',

  /* ---------- 料金カレンダー ---------- */
  'calendar.prevMonth': '前の月',
  'calendar.nextMonth': '次の月',
  'calendar.gridLabel': '{month}の料金カレンダー',
  'calendar.taxNote': '1泊あたり・{note}',
  'calendar.loading': '料金を読み込んでいます…',
  'calendar.error': '料金の取得に失敗しました。',
  // セル内の短い表記。マスの幅が狭いので 1〜2 文字に収める。
  'calendar.closedShort': '休',
  'calendar.soldOutShort': '満',
  'calendar.blockedWarning': '満室・休館日をまたぐ期間は選択できません。別の日をお選びください。',
  // 読み上げ用のラベル。視覚的な色分けと同じ情報を文字で持たせる。
  'calendar.day.outside': '表示中の月以外',
  'calendar.day.noRate': '料金未取得',
  'calendar.day.closed': '休館日',
  'calendar.day.soldOut': '満室',
  'calendar.day.available': '空室あり',
  'calendar.day.past': '受付終了',

  /* ---------- ディープリンクの通知バー ---------- */
  'notice.applied': '{items}を適用しました。',
  'notice.cancel': '取り消す',
  'notice.close': '通知を閉じる',
  'notice.item.dates': '{checkIn}〜{checkOut}',
  'notice.item.promo': 'クーポン {code}',
  // 通知バーの項目を並べるときの区切り。日本語は中黒、英語はカンマ。
  'notice.separator': '・',

  /* ---------- 泊数・人数（単複） ---------- */
  // 呼び出し側は必ず tPlural() で引く。日本語は数で語形が変わらないので
  // other だけで足りるが、キーの形は en と揃えておく
  // （one を足す言語が増えても呼び出し側を書き換えずに済む）。
  'nights.other': '{count}泊',
  'guests.other': '{count}名',
};
