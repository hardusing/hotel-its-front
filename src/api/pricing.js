import { SERVER_URL } from './rooms.js';
import { mockPricingRules } from '../mock/pricingRules.js';

// 税率も宿泊税の刻みも、法改正・条例改定・施設ごとの設定で変わる値なので、
// 計算ロジックではなくサーバーから配られる「データ」として扱う。
// 宿泊税を段階テーブルで持てば、閾値や税額の改定は配列の編集だけで済み、
// 判定を書き換えずに済む（クライアントの再デプロイなしで追随できる）。

// バックエンド未完成のためモックを使う。完成後は false にするだけでよい。
const USE_MOCK = true;

/**
 * 料金ルールの形は mock/pricingRules.js を参照。
 * 本番 fetch 版も同じ形に正規化するので、呼び出し側は変更せず差し替えられる。
 */

// --- モック実装 -------------------------------------------------------------
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function mockFetchPricingRules() {
  // 実際の通信に近づけるための待ち時間。料金ルールは滅多に変わらず
  // 起動時に一度だけ取る想定なので、在庫と違って失敗は混ぜていない。
  await delay(120);
  return normalize(mockPricingRules);
}

// --- 本番実装（差し替え用） -------------------------------------------------
async function apiFetchPricingRules() {
  const res = await fetch(`${SERVER_URL}/api/pricing-rules`);
  if (!res.ok) {
    throw new Error(`Failed to fetch pricing rules: ${res.status}`);
  }
  return normalize(await res.json());
}

/**
 * サーバー由来の値をクライアントで扱える形に整える。
 *
 * 宿泊税の最上位帯は「上限なし」だが、JSON に Infinity は書けないため
 * サーバーは maxPerNight を null（または省略）で返す。ここで Infinity に
 * 直しておくことで、計算側は全帯を同じ `perNight <= maxPerNight` で判定できる。
 * ついでに閾値の昇順に並べ替え、テーブルの記述順に依存しないようにする。
 */
function normalize(rules) {
  const brackets = rules.accommodationTax.brackets
    .map((b) => ({
      ...b,
      maxPerNight: b.maxPerNight == null ? Infinity : b.maxPerNight,
    }))
    .sort((a, b) => a.maxPerNight - b.maxPerNight);

  return {
    ...rules,
    accommodationTax: { ...rules.accommodationTax, brackets },
  };
}

/**
 * 料金ルール（税率・サービス料・宿泊税テーブル・人数条件・割引）を取得する。
 * 在庫と違い頻繁には変わらないので、起動時に一度取得して使い回す想定。
 * 失敗時は例外を投げるので、呼び出し側は catch して
 * 「料金を表示できません」等のフォールバックに切り替える。
 *
 * なお表示側の計算はあくまで見積もりで、確定金額はサーバー側が正。
 * 同じルール（version）を双方が見ていることが前提になる。
 *
 * @returns {Promise<object>} mock/pricingRules.js と同じ形のルール
 */
export async function fetchPricingRules() {
  if (USE_MOCK) {
    return mockFetchPricingRules();
  }
  return apiFetchPricingRules();
}
