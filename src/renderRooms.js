import { fetchRooms, resolveImageUrl, roomName, roomDescription } from './api/rooms';
import { openRoomModal } from './roomModal';
import { formatMoney } from './i18n/format.js';
import { loadPricingRules } from './pricing/rulesStore.js';
import { toNightlyDisplayPrice, nightlyPriceNote } from './pricing/displayPrice.js';
import {
  getStockLabel,
  getStockModifier,
  isBookable,
  readStock,
} from './inventory/stockLevel';
import { t, onLocaleChange } from './i18n/index.js';

// 在庫が動いたことを知らせるハイライト用の修飾子。
const UPDATED_CLASS = 'room-card__stock--updated';

// 既定の描画先。トップページの客室一覧。
const DEFAULT_GRID_ID = 'rooms-grid';

// 直近まで表示していた在庫数（客室 ID → stock）。
// ポーリングは変化がなくても同じ値を運んでくるので、
// 「前回と同じかどうか」をここで持っておかないと、
// 毎回すべてのカードを書き換えてハイライトを無意味に光らせることになる。
const stockSnapshot = new Map();

// 描画に使った客室オブジェクト（客室 ID → room）。
// モーダルはこのオブジェクトを掴んで料金や定員を読むため、
// 在庫が動いたら DOM だけでなくこちらも合わせて更新する。
const roomsById = new Map();

// 直近の renderRooms が描画先にしたグリッドの id。
// トップページは #rooms-grid、キャンペーン LP は #campaign-rooms と描画先が違うので、
// applyInventory が固定の id を見に行くと LP 側で在庫が一切反映されない。
let currentGridId = DEFAULT_GRID_ID;

// 直近の renderRooms に渡された引数。言語が変わったときに同じ条件で
// 描き直すために持つ。トップページと LP で描画先も対象客室も違うので、
// 引数を覚えていないと再描画のしようがない。
let lastOptions = null;

// 言語変更の購読は 1 回だけ張る。renderRooms が呼ばれるたびに登録すると、
// 在庫の OUT_OF_STOCK による再描画のたびに購読者が増えていく。
let localeSubscribed = false;

// 在庫表示を一度光らせる。
function flashStock(stockEl) {
  // 同じクラスを付け直すだけではアニメーションは再生されない。
  // 連続で在庫が動いたときに 2 回目以降が光らなくなるので、
  // 一度外してリフローを挟み、別のアニメーションとして開始させる。
  stockEl.classList.remove(UPDATED_CLASS);
  void stockEl.offsetWidth;
  stockEl.classList.add(UPDATED_CLASS);
}

// カードの在庫まわりだけを現在の room の内容に合わせる。
// カード全体を作り直さないのは、再生成するとフォーカスやホバー状態が飛び、
// モーダルに渡した room 参照とも切り離されてしまうため。
function updateCardStock(card, room) {
  const bookable = isBookable(room.stock);

  card.classList.toggle('room-card--soldout', !bookable);

  const stockEl = card.querySelector('.room-card__stock');
  // 状態別の修飾子は付け替えなので、className ごと組み直してから光らせる。
  stockEl.className = `room-card__stock room-card__stock${getStockModifier(room.stock)}`;
  stockEl.textContent = getStockLabel(room.stock);
  flashStock(stockEl);

  const reserveBtn = card.querySelector('.room-card__reserve');
  reserveBtn.disabled = !bookable;
  reserveBtn.textContent = bookable ? t('rooms.reserve') : t('rooms.soldOut');

  // 満室バッジは満室のときだけ存在させる（満室から復活する場合もあるので両方向）。
  const media = card.querySelector('.room-card__media');
  const badge = media.querySelector('.room-card__badge');
  if (!bookable && !badge) {
    const el = document.createElement('span');
    el.className = 'room-card__badge';
    el.textContent = t('rooms.soldOut');
    media.appendChild(el);
  } else if (bookable && badge) {
    badge.remove();
  }
}

// 1件分の客室カード要素を生成する
function createRoomCard(room, rules) {
  // 予約可否は room.available ではなく在庫数だけから決める。
  // 判断の入口を 1 つにしておかないと、在庫を定期取得するようになったとき
  // available の更新漏れがそのまま「押せてしまう満室ボタン」になる。
  const bookable = isBookable(room.stock);

  const card = document.createElement('article');
  card.className = 'room-card';
  // 差分更新で対象カードを引き当てるための目印。
  card.dataset.roomId = String(room.id);
  if (!bookable) {
    card.classList.add('room-card--soldout');
  }

  // 骨組みだけを innerHTML で作り、外から来る値（客室名・説明・画像パス）は
  // 一切埋め込まない。現在はモックだが、fetch に切り替えた時点で
  // これらはサーバーの応答＝外部入力になる。名前に "><img onerror=...> が
  // 入っていれば、その瞬間に一覧を描くだけでスクリプトが動く。
  // テンプレートに値を混ぜない作りにしておけば、差し替えの日に見落とさない。
  card.innerHTML = `
    <div class="room-card__media">
      <img class="room-card__img" alt="" loading="lazy" />
      ${!bookable ? '<span class="room-card__badge"></span>' : ''}
    </div>
    <div class="room-card__body">
      <h3 class="room-card__name"></h3>
      <p class="room-card__price"></p>
      <p class="room-card__tax-note"></p>
      <p class="room-card__desc"></p>
      <p class="room-card__stock room-card__stock${getStockModifier(room.stock)}"></p>
      <button type="button" class="btn btn--primary room-card__reserve" ${
        bookable ? '' : 'disabled'
      }></button>
    </div>
  `;

  // 画像は属性ではなくプロパティに入れる。属性文字列に混ぜると
  // 引用符ひとつで属性を抜け出せる（alt="${room.name}" の形が危ない）。
  const img = card.querySelector('.room-card__img');
  img.src = resolveImageUrl(room.imagePath);
  img.alt = roomName(room);

  // 客室名と説明は API の言語別フィールドを現在の言語に解いたもの。
  card.querySelector('.room-card__name').textContent = roomName(room);
  card.querySelector('.room-card__desc').textContent = roomDescription(room);
  card.querySelector('.room-card__stock').textContent = getStockLabel(room.stock);
  // 注記の区切り（日本語の中黒 / 英語のカンマ）まで言語で変わるので、
  // 文ごと辞書に持たせて断片を差し込む形にする。
  card.querySelector('.room-card__tax-note').textContent = t('rooms.priceNote', {
    taxNote: nightlyPriceNote(rules),
    varies: t('rooms.variesByWeekday'),
  });
  card.querySelector('.room-card__reserve').textContent = bookable
    ? t('rooms.reserve')
    : t('rooms.soldOut');

  const badge = card.querySelector('.room-card__badge');
  if (badge) badge.textContent = t('rooms.soldOut');

  // 単価だけは <span> を含むので組み立てる。金額は formatMoney が数値から
  // 作った文字列なので、外部の文字が混ざる余地がない。
  const priceEl = card.querySelector('.room-card__price');
  priceEl.textContent = formatMoney(toNightlyDisplayPrice(room.price, rules));
  const unit = document.createElement('span');
  unit.textContent = t('rooms.perNightFrom');
  priceEl.appendChild(unit);

  // ハイライトはアニメーション終了で自分から外れる。生成時に一度だけ張るので、
  // 在庫が何度動いてもリスナが積み上がらない。
  const stockEl = card.querySelector('.room-card__stock');
  stockEl.addEventListener('animationend', () => {
    stockEl.classList.remove(UPDATED_CLASS);
  });

  // リスナは在庫の有無にかかわらず張る。満室から復活したカードに
  // 後からリスナを付け直す必要をなくすため。
  card.querySelector('.room-card__reserve').addEventListener('click', () => {
    // disabled なボタンはクリックされないが、判断の基準は最新の在庫に揃えておく。
    if (!isBookable(room.stock)) return;
    openRoomModal(room);
  });

  return card;
}

/**
 * 直近の描画に使った客室オブジェクトを、描画順で返す。
 * ディープリンクが ?room= の ID から客室を引き当てるのに使う。
 * 一覧に無い ID（LP の対象外の客室など）はここに現れないので、
 * 呼び出し側は「このページで開ける部屋か」をこの結果だけで判断できる。
 *
 * @returns {Array<Object>}
 */
export function getRenderedRooms() {
  return [...roomsById.values()];
}

/**
 * 在庫スナップショットを画面に反映する。
 * 前回と同じ在庫の部屋には DOM 操作を一切行わない。
 *
 * @param {{updatedAt: string, rooms: Array<{id: number, stock: number}>}} payload
 */
export function applyInventory(payload) {
  if (!payload || !Array.isArray(payload.rooms)) return;

  const grid = document.getElementById(currentGridId);
  if (!grid) return;

  payload.rooms.forEach((entry) => {
    const id = Number(entry.id);
    const room = roomsById.get(id);
    // 一覧に無い客室が混ざっていても無視する（描画前・描画失敗時もここで止まる）。
    if (!room) return;

    // 壊れた値で画面を満室に書き換えないよう、解釈できなければ何もしない。
    const stock = readStock(entry.stock);
    if (stock === null) return;

    // 変化なし。ここで抜けるので、読み取りも書き込みも発生しない。
    if (stockSnapshot.get(id) === stock) return;

    // 反映先を先に確かめる。スナップショットを先に進めてしまうと、
    // カードが見つからなかった回を「反映済み」と記録してしまい、
    // 次に同じ値が届いても「変化なし」で弾かれて永久に反映されない。
    const card = grid.querySelector(`[data-room-id="${id}"]`);
    if (!card) return;

    stockSnapshot.set(id, stock);
    // room オブジェクトへの書き込みはここだけ。モーダル側は書かない。
    // 2 か所から同じオブジェクトを書くと、呼ばれ方が変わった瞬間に
    // どちらが最新か分からなくなる。
    room.stock = stock;
    room.available = isBookable(stock);

    updateCardStock(card, room);
  });
}

/**
 * 客室一覧を取得してグリッドに描画する。
 *
 * キャンペーン LP は「対象客室だけを別のグリッドに出す」ため、描画先と
 * 対象客室を指定できるようにしてある。カードの作り方・在庫の反映・
 * モーダルの開き方をページごとに書き分けると、満室の扱いのような
 * 細かい判断が 2 か所に散って必ずずれるので、入口はこの 1 つに保つ。
 *
 * @param {Object} [options]
 * @param {string} [options.gridId] 描画先の要素 id（既定: 'rooms-grid'）
 * @param {Array<number>} [options.roomIds] 描画する客室 ID。省略時は全件。
 *   指定した順に並べるので、LP 側で見せたい順を決められる。
 */
export async function renderRooms(options = {}) {
  const { gridId = DEFAULT_GRID_ID, roomIds = null } = options;

  const grid = document.getElementById(gridId);
  if (!grid) return;

  // 言語が変わったら同じ条件で描き直す。カードは innerHTML と textContent で
  // 組み立てているので、data-i18n の走査では一切触れられない。自分の描き方を
  // 知っているのはこのモジュールだけなので、描き直しもここが引き受ける。
  lastOptions = { gridId, roomIds };
  if (!localeSubscribed) {
    localeSubscribed = true;
    onLocaleChange(() => {
      if (lastOptions) renderRooms(lastOptions);
    });
  }

  // 在庫の反映先を、いま描画したグリッドに合わせる。
  currentGridId = gridId;

  try {
    // 客室と料金ルールは互いに独立なので同時に取りにいく。
    // ルールが無いと税込単価に換算できないため、描画はどちらも揃ってから。
    const [rooms, rules] = await Promise.all([fetchRooms(), loadPricingRules()]);

    // 作り直すカードに合わせて、比較用の状態も必ず作り直す。
    // 残しておくと、再描画直後の 1 回目が「変化なし」と判定されて反映されない。
    stockSnapshot.clear();
    roomsById.clear();

    // 指定があればその順で絞り込む。存在しない ID は黙って落とす
    // （LP の設定ミスでページ全体を落とさない）。
    const targets = roomIds
      ? roomIds
          .map((id) => rooms.find((room) => Number(room.id) === Number(id)))
          .filter(Boolean)
      : rooms;

    grid.innerHTML = '';
    targets.forEach((room) => {
      stockSnapshot.set(Number(room.id), Number(room.stock));
      roomsById.set(Number(room.id), room);
      grid.appendChild(createRoomCard(room, rules));
    });
  } catch (err) {
    stockSnapshot.clear();
    roomsById.clear();
    // エラー文も textContent で入れる（辞書の値を HTML として解釈させない）。
    grid.innerHTML = '';
    const error = document.createElement('p');
    error.className = 'rooms__error';
    error.textContent = t('rooms.error');
    grid.appendChild(error);
    // eslint-disable-next-line no-console
    console.error(err);
  }
}
