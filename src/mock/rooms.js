// バックエンド未完成のため、暫定のモックデータ。
// 本物の API レスポンスと同じ形式に揃えておくことで、
// 後から fetch へ差し替えても表示側を変更せずに済む。
export const mockRooms = [
  {
    id: 1,
    name: 'シングル',
    description:
      '出張や一人旅に最適なコンパクトルーム。機能的な設備で快適な一夜をお約束します。',
    capacity: 1,
    price: 12800,
    stock: 5,
    available: true,
    imagePath: '/images/rooms/single.jpg',
  },
  {
    id: 2,
    name: 'ダブル',
    description:
      'ゆとりのある広さと上質なベッドを備えたお部屋。カップルやご夫婦の滞在にぴったりです。',
    capacity: 2,
    price: 24500,
    stock: 0,
    available: false,
    imagePath: '/images/rooms/double.jpg',
  },
  {
    id: 3,
    name: 'スイート',
    description:
      '眺望と空間を贅沢に楽しむ最上級のお部屋。特別な記念日にふさわしいおもてなしを。',
    capacity: 4,
    price: 68000,
    stock: 2,
    available: true,
    imagePath: '/images/rooms/suite.jpg',
  },
];
