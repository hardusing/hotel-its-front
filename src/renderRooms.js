import { fetchRooms, resolveImageUrl } from './api/rooms';
import { openRoomModal } from './roomModal';
import { formatYen } from './format';
import {
  getStockLabel,
  getStockModifier,
  isBookable,
  readStock,
} from './inventory/stockLevel';

// 在庫が動いたことを知らせるハイライト用の修飾子。
const UPDATED_CLASS = 'room-card__stock--updated';

// 直近まで表示していた在庫数（客室 ID → stock）。
// ポーリングは変化がなくても同じ値を運んでくるので、
// 「前回と同じかどうか」をここで持っておかないと、
// 毎回すべてのカードを書き換えてハイライトを無意味に光らせることになる。
const stockSnapshot = new Map();

// 描画に使った客室オブジェクト（客室 ID → room）。
// モーダルはこのオブジェクトを掴んで料金や定員を読むため、
// 在庫が動いたら DOM だけでなくこちらも合わせて更新する。
const roomsById = new Map();

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
  reserveBtn.textContent = bookable ? '予約する' : '満室';

  // 満室バッジは満室のときだけ存在させる（満室から復活する場合もあるので両方向）。
  const media = card.querySelector('.room-card__media');
  const badge = media.querySelector('.room-card__badge');
  if (!bookable && !badge) {
    const el = document.createElement('span');
    el.className = 'room-card__badge';
    el.textContent = '満室';
    media.appendChild(el);
  } else if (bookable && badge) {
    badge.remove();
  }
}

// 1件分の客室カード要素を生成する
function createRoomCard(room) {
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

  card.innerHTML = `
    <div class="room-card__media">
      <img class="room-card__img" src="${resolveImageUrl(room.imagePath)}" alt="${room.name}" loading="lazy" />
      ${!bookable ? '<span class="room-card__badge">満室</span>' : ''}
    </div>
    <div class="room-card__body">
      <h3 class="room-card__name">${room.name}</h3>
      <p class="room-card__price">${formatYen(room.price)}<span>/泊</span></p>
      <p class="room-card__desc">${room.description}</p>
      <p class="room-card__stock room-card__stock${getStockModifier(room.stock)}">${getStockLabel(room.stock)}</p>
      <button type="button" class="btn btn--primary room-card__reserve" ${
        bookable ? '' : 'disabled'
      }>
        ${bookable ? '予約する' : '満室'}
      </button>
    </div>
  `;

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
 * 在庫スナップショットを画面に反映する。
 * 前回と同じ在庫の部屋には DOM 操作を一切行わない。
 *
 * @param {{updatedAt: string, rooms: Array<{id: number, stock: number}>}} payload
 */
export function applyInventory(payload) {
  if (!payload || !Array.isArray(payload.rooms)) return;

  const grid = document.getElementById('rooms-grid');
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
 */
export async function renderRooms() {
  const grid = document.getElementById('rooms-grid');
  if (!grid) return;

  try {
    const rooms = await fetchRooms();

    // 作り直すカードに合わせて、比較用の状態も必ず作り直す。
    // 残しておくと、再描画直後の 1 回目が「変化なし」と判定されて反映されない。
    stockSnapshot.clear();
    roomsById.clear();

    grid.innerHTML = '';
    rooms.forEach((room) => {
      stockSnapshot.set(Number(room.id), Number(room.stock));
      roomsById.set(Number(room.id), room);
      grid.appendChild(createRoomCard(room));
    });
  } catch (err) {
    stockSnapshot.clear();
    roomsById.clear();
    grid.innerHTML =
      '<p class="rooms__error">客室情報の取得に失敗しました。時間をおいて再度お試しください。</p>';
    // eslint-disable-next-line no-console
    console.error(err);
  }
}
