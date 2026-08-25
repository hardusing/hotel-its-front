import { fetchRooms, resolveImageUrl } from './api/rooms';
import { openRoomModal } from './roomModal';
import { formatYen } from './format';

// 1件分の客室カード要素を生成する
function createRoomCard(room) {
  const card = document.createElement('article');
  card.className = 'room-card';
  if (!room.available) {
    card.classList.add('room-card--soldout');
  }

  card.innerHTML = `
    <div class="room-card__media">
      <img class="room-card__img" src="${resolveImageUrl(room.imagePath)}" alt="${room.name}" loading="lazy" />
      ${!room.available ? '<span class="room-card__badge">満室</span>' : ''}
    </div>
    <div class="room-card__body">
      <h3 class="room-card__name">${room.name}</h3>
      <p class="room-card__price">${formatYen(room.price)}<span>/泊</span></p>
      <p class="room-card__desc">${room.description}</p>
      <p class="room-card__stock">残り ${room.stock} 室</p>
      <button type="button" class="btn btn--primary room-card__reserve" ${
        room.available ? '' : 'disabled'
      }>
        ${room.available ? '予約する' : '満室'}
      </button>
    </div>
  `;

  // 予約可能な部屋は、予約ボタンで詳細モーダルを開く
  if (room.available) {
    card
      .querySelector('.room-card__reserve')
      .addEventListener('click', () => openRoomModal(room));
  }

  return card;
}

/**
 * 客室一覧を取得してグリッドに描画する。
 */
export async function renderRooms() {
  const grid = document.getElementById('rooms-grid');
  if (!grid) return;

  try {
    const rooms = await fetchRooms();
    grid.innerHTML = '';
    rooms.forEach((room) => grid.appendChild(createRoomCard(room)));
  } catch (err) {
    grid.innerHTML =
      '<p class="rooms__error">客室情報の取得に失敗しました。時間をおいて再度お試しください。</p>';
    // eslint-disable-next-line no-console
    console.error(err);
  }
}
