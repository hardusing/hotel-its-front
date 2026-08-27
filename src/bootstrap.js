// ページ共通の起動処理。
//
// トップページとキャンペーン LP は「どのグリッドに、どの客室を描くか」しか
// 違わない。予約モーダル・在庫ポーリング・言語・ディープリンクの配線を
// 各ページのエントリに書くと、片方だけ手順が抜けても気付けないので、
// 起動の順番はこの 1 か所だけが知っている状態にする。

import { renderRooms, applyInventory, getRenderedRooms } from './renderRooms';
import { initRoomModal, notifyInventoryChange } from './roomModal';
import { createInventoryPoller } from './inventory/poller';
import { initLastUpdated, setLastUpdated } from './inventory/lastUpdated';
import { initLangSwitch } from './lang';
import { parseDeepLink } from './deeplink/params.js';
import { applyDeepLink } from './deeplink/apply.js';
import { todayStr } from './booking';
import { initTracker, track, EVENTS } from './analytics/tracker.js';

/**
 * ページを起動する。
 *
 * @param {Object} [options]
 * @param {string} [options.gridId] 客室カードの描画先 id
 * @param {Array<number>} [options.roomIds] 描画する客室 ID（省略時は全件）
 * @returns {Promise<void>} 描画とディープリンクの適用まで終わったら解決する
 */
export async function startPage(options = {}) {
  const { gridId, roomIds } = options;

  // 描画の入口。OUT_OF_STOCK でモーダルが閉じたときにも同じ条件で描き直したいので、
  // 引数を閉じ込めた関数にしておく。
  const render = () => renderRooms({ gridId, roomIds });

  // URL の解釈は描画より先に済ませる。今日の日付は params.js を純粋に保つため
  // ここで確定させて渡す。
  const deepLink = parseDeepLink(window.location.search, { today: todayStr() });

  // 計測は最初に初期化する。utm はここで一度だけ拾い、以降のイベントには
  // tracker が自動で足す（各所で引き回さない。理由は tracker.js を参照）。
  initTracker(deepLink.tracking);
  track(EVENTS.PAGE_VIEW, {
    // どのページか。パスそのものは送らない（クエリに何が付くか読めないため）。
    page: gridId === 'campaign-rooms-grid' ? 'campaign' : 'top',
    // ディープリンクで開かれたかどうかは、LP の効果を見るのに要る。
    deepLink: Boolean(deepLink.booking.room),
  });

  initRoomModal({ onStockChange: render });
  initLastUpdated();
  // 言語ボタンはトップページにしか無い。LP では 0 件になるだけ。
  initLangSwitch();

  const inventoryPoller = createInventoryPoller({
    onUpdate: (payload) => {
      // 取得できた時刻を先に出す。以降の反映で例外が出ても、
      // 「いつのデータか」の表示だけは正しく残る。
      setLastUpdated(payload && payload.updatedAt);
      applyInventory(payload);
      // モーダル側は表示中の部屋だけを見て、それ以外は無視する。
      if (payload && Array.isArray(payload.rooms)) {
        payload.rooms.forEach((item) => notifyInventoryChange(item));
      }
    },
    onError: (err) => {
      // 取得できなかったときは前回の在庫を出したままにする。
      // ポーラー側が間隔を空けて自動で再試行するので、ここでは記録だけ。
      // eslint-disable-next-line no-console
      console.error(err);
    },
  });

  // ディープリンクの適用は描画の後。?room= から客室を引き当てるには
  // 一覧が手元にある必要があり、描画前に開こうとしても対象が存在しない。
  // renderRooms は内部で失敗を捕まえるので、描画に失敗しても以降は進む
  // （その場合 getRenderedRooms が空になり、モーダルは開かない）。
  await render();

  applyDeepLink(deepLink, { rooms: getRenderedRooms() });

  // 反映先のカードが揃ってから在庫の取得を始める。
  inventoryPoller.start();
}
