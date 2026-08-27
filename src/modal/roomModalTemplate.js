// 客室詳細モーダルのマークアップ。
//
// HTML ファイルではなくここに置く理由：モーダルはトップページとキャンペーン LP の
// 両方で使う。HTML に直接書くと同じ 140 行超を 2 つのファイルに複製することになり、
// 片方だけ id や data 属性を直したときに、もう片方が静かに壊れる。
// カレンダー・料金内訳・客室カードはすでに JS が組み立てているので、
// 器だけを HTML 側に残しておく必然性もない。
//
// initRoomModal() が #room-modal の不在を見て、この文字列から生成して body に差す。
// ページ側は <div id="room-modal"> を書かなくてよい（書いてあればそちらを使う）。
export const ROOM_MODAL_HTML = `
  <div class="modal" id="room-modal" hidden>
    <div class="modal__overlay" data-modal-close></div>
    <div class="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="modal-name">
      <button type="button" class="modal__close" data-modal-close aria-label="閉じる">&times;</button>
      <div class="modal__media" id="modal-media">
        <img class="modal__img" id="modal-img" src="" alt="" />
      </div>
      <div class="modal__body">
        <!-- ① 客室詳細＋日付選択ビュー -->
        <div class="modal__view" data-view="detail">
          <h3 class="modal__name" id="modal-name"></h3>
          <p class="modal__price" id="modal-price"></p>
          <p class="modal__desc" id="modal-desc"></p>

          <div class="booking">
            <!-- 月間料金カレンダーのマウント先（JS が中身を作る） -->
            <div class="booking__calendar" id="calendar-mount"></div>

            <!-- カレンダーで選んだ日付の表示欄 -->
            <p class="booking__dates" id="booking-dates">日付を選択してください</p>

            <!--
              日付の入力欄はカレンダーに置き換えたが、値の保持役として残す。
              予約フォームへの受け渡しと送信ペイロードがこの value を参照しているため、
              削除せず CSS（booking__fields--hidden）で隠している。
            -->
            <div class="booking__fields booking__fields--hidden">
              <div class="booking__field">
                <label for="checkin" class="booking__label">チェックイン</label>
                <input type="date" id="checkin" class="booking__input" />
              </div>
              <div class="booking__field">
                <label for="checkout" class="booking__label">チェックアウト</label>
                <input type="date" id="checkout" class="booking__input" />
              </div>
            </div>
            <!--
              宿泊人数。フォーム側の #guests と双方向に同期するが、値の保持役は
              あくまでフォーム側の1つだけ（roomModal.js の syncGuests を参照）。
              ここに置くのは、人数で料金が変わる以上、日付を選ぶ画面で
              金額を確かめられないと選び直しのたびにフォームまで往復させることになるため。
            -->
            <div class="booking__field booking__field--guests">
              <label for="booking-guests" class="booking__label">宿泊人数</label>
              <select id="booking-guests" class="booking__input"></select>
            </div>

            <!-- クーポン。入力しただけでは効かせず、「適用」で確定させる。 -->
            <div class="booking__coupon">
              <label for="coupon-code" class="booking__label">クーポンコード</label>
              <div class="booking__coupon-row">
                <input type="text" id="coupon-code" class="booking__input" placeholder="WELCOME" autocomplete="off" />
                <button type="button" class="btn booking__coupon-apply" id="coupon-apply">適用</button>
              </div>
              <p class="booking__coupon-msg" id="coupon-msg" hidden></p>
            </div>

            <!-- 料金内訳のマウント先（pricing/breakdownView.js が中身を作る） -->
            <div id="breakdown-mount"></div>

            <!--
              閲覧中に在庫が尽きたときの警告。JS（notifyInventoryChange）が出し入れする。
              モーダルは閉じずにここで知らせる。閉じてしまうと、選んだ日付が
              なぜ消えたのか利用者に分からないため。
            -->
            <div class="booking__alert" id="booking-alert" role="alert" hidden>
              <p class="booking__alert-text">
                ご覧いただいている間に満室となりました。別の日程か、他の客室をご検討ください。
              </p>
              <button type="button" class="booking__alert-link" data-browse-rooms>
                他の客室を見る
              </button>
            </div>

            <button type="button" class="btn btn--primary booking__reserve" id="booking-reserve" disabled>
              予約する
            </button>

            <!--
              いまの条件（客室・日付・人数・クーポン）を URL にしてコピーする。
              URL は条件が変わるたびに書き換わっているので、ここでは
              location.href をそのまま渡せばよい。
            -->
            <button type="button" class="booking__share" id="booking-share">
              この条件を共有
            </button>
          </div>
        </div>

        <!-- ② 予約フォームビュー -->
        <form class="modal__view reservation-form" data-view="form" hidden>
          <button type="button" class="reservation-form__back" data-form-back>← 戻る</button>
          <h3 class="reservation-form__title">予約情報の入力</h3>
          <p class="reservation-form__summary" id="form-summary"></p>

          <div class="field">
            <label for="guestName" class="field__label">予約者名<span class="field__req">必須</span></label>
            <input type="text" id="guestName" name="guestName" class="field__input" autocomplete="name" />
            <span class="field__error" data-error-for="guestName"></span>
          </div>

          <div class="field">
            <label for="email" class="field__label">メールアドレス<span class="field__req">必須</span></label>
            <input type="email" id="email" name="email" class="field__input" autocomplete="email" />
            <span class="field__error" data-error-for="email"></span>
          </div>

          <div class="field">
            <label for="phone" class="field__label">電話番号<span class="field__opt">任意</span></label>
            <input type="tel" id="phone" name="phone" class="field__input" autocomplete="tel" />
            <span class="field__error" data-error-for="phone"></span>
          </div>

          <div class="field">
            <label for="guests" class="field__label">宿泊人数<span class="field__req">必須</span></label>
            <select id="guests" name="guests" class="field__input"></select>
            <span class="field__error" data-error-for="guests"></span>
          </div>

          <div class="field">
            <label for="notes" class="field__label">備考<span class="field__opt">任意</span></label>
            <textarea id="notes" name="notes" class="field__input field__textarea" rows="3"></textarea>
            <span class="field__error" data-error-for="notes"></span>
          </div>

          <!--
            フォーム共通のエラー枠。満室の警告もここに出すため、
            「他の客室を見る」導線を同じブロック内に置いてある（普段は hidden）。
            エラー文言はサーバー由来の値も入るので、textContent で扱う #form-general-error と
            リンクは要素を分けている。
          -->
          <div class="reservation-form__alert">
            <p class="reservation-form__error" id="form-general-error" hidden></p>
            <button type="button" class="reservation-form__browse" id="form-browse-rooms" data-browse-rooms hidden>
              他の客室を見る
            </button>
          </div>

          <button type="submit" class="btn btn--primary reservation-form__submit" id="form-submit">
            この内容で予約する
          </button>
        </form>

        <!-- ③ 予約完了ビュー -->
        <div class="modal__view booking-complete" data-view="complete" hidden>
          <div class="booking-complete__icon">✓</div>
          <h3 class="booking-complete__title">ご予約が完了しました</h3>
          <p class="booking-complete__label">予約番号</p>
          <p class="booking-complete__order" id="complete-order"></p>
          <p class="booking-complete__note">確認メールをお送りしました。予約番号は大切に保管してください。</p>
          <button type="button" class="btn btn--primary booking-complete__close" data-modal-close>
            閉じる
          </button>
        </div>
      </div>
    </div>
  </div>
`;
