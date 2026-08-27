// キャンペーン LP のエントリ。起動手順そのものは bootstrap.js が持つ
// （予約モーダル・在庫ポーリング・ディープリンクはトップページと同じものを使う）。
import './style.css';
import './campaign.css';
import { startPage } from './bootstrap';

// このキャンペーンの対象客室。ここに並べた順で表示する。
// ID を LP 側に置くのは、対象がキャンペーンの内容であって客室データの
// 属性ではないため（客室マスタに「キャンペーン対象」の列を増やさない）。
const CAMPAIGN_ROOM_IDS = [3, 2];

startPage({ gridId: 'campaign-rooms-grid', roomIds: CAMPAIGN_ROOM_IDS });
