// バックエンド未完成のため、暫定のモックデータ。
// 本物の API レスポンスと同じ形式に揃えておくことで、
// 後から fetch へ差し替えても表示側を変更せずに済む。
//
// 客室名と説明は言語ごとの値をまとめて返す形にしてある。
// これらは「画面の構造」ではなく運営が足し引きするコンテンツなので、
// フロントの辞書（i18n/ja.js）に置くと部屋を 1 つ増やすたびに辞書の編集と
// 再デプロイが要る。API 側の値として持てば、部屋が増えてもフロントは触らない。
//
// 言語ごとに 1 件ずつ取り直す（Accept-Language）形にしなかったのは、
// 在庫ポーリングとモーダルが同じ room オブジェクトの参照を掴んでいるため。
// 言語を変えるたびに一覧を取り直して参照を差し替える設計だと、
// 切り替えが通信の成否に左右される。全言語を 1 度で受け取っておけば、
// 切り替えは手元の値を読み直すだけで済む。
//
// 画像は本番ならサーバー上のパス（"/images/rooms/single.jpg" など）が返るところ。
// モックでは webpack に同梱させた画像を import し、その公開 URL を imagePath に入れる。
// 値は文字列のままなので、resolveImageUrl も表示側も変更しなくてよい。
import singleImage from '../images/rooms/single.svg';
import doubleImage from '../images/rooms/double.svg';
import suiteImage from '../images/rooms/suite.svg';

export const mockRooms = [
  {
    id: 1,
    name: { ja: 'シングル', en: 'Single', zh: '单人间' },
    description: {
      ja: '出張や一人旅に最適なコンパクトルーム。機能的な設備で快適な一夜をお約束します。',
      en: 'A compact room ideal for business trips and solo travelers. Functional amenities ensure a comfortable night.',
      zh: '适合出差与独自旅行的紧凑客房。功能齐全的设施保证舒适的一夜。',
    },
    capacity: 1,
    price: 12800,
    stock: 5,
    available: true,
    imagePath: singleImage,
  },
  {
    id: 2,
    name: { ja: 'ダブル', en: 'Double', zh: '双人间' },
    description: {
      ja: 'ゆとりのある広さと上質なベッドを備えたお部屋。カップルやご夫婦の滞在にぴったりです。',
      en: 'A spacious room with a premium bed. Perfect for couples and partners.',
      zh: '空间宽敞、配备优质床品的客房。非常适合情侣与伴侣入住。',
    },
    capacity: 2,
    price: 24500,
    stock: 0,
    available: false,
    imagePath: doubleImage,
  },
  {
    id: 3,
    name: { ja: 'スイート', en: 'Suite', zh: '套房' },
    description: {
      ja: '眺望と空間を贅沢に楽しむ最上級のお部屋。特別な記念日にふさわしいおもてなしを。',
      en: 'Our finest room, with luxurious space and stunning views. Fitting hospitality for special occasions.',
      zh: '尽享景观与空间的顶级客房。以恰如其分的款待迎接特别的纪念日。',
    },
    capacity: 4,
    price: 68000,
    stock: 2,
    available: true,
    imagePath: suiteImage,
  },
];
