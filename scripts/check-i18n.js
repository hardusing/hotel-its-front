// 辞書の整合性を検査する。npm パッケージは足さず、Node の標準機能だけで動かす。
//
//   npm run check:i18n
//
// 検査するのは 4 つ。
//
//   1. キーの過不足     … ある言語にだけ存在するキー
//   2. 空文字の値       … キーはあるが訳が入っていない
//   3. プレースホルダ   … {name} の顔ぶれが言語間で食い違う
//   4. 存在しないキー   … ソースが引いているのに辞書に無い
//
// 3 が要る理由は、辞書だけ見ても壊れが分からないから。ja が「{count}名」で
// en が「guests」だと、英語のときだけ人数が消えた文が出る。逆に en にだけ
// {total} があると、置換されないまま "{total}" が画面に出る。どちらも
// 実行して該当の画面を開くまで気付けない。
//
// 4 は綴り間違いの検出。t('form.guestNarne') と書いても実行時までエラーに
// ならず、画面にキー名がそのまま出るだけなので、レビューで見落とすと通る。

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// 辞書はアプリと同じ入口から読む。ここでファイルを個別に import すると、
// 「index.js に登録し忘れた辞書」を検査してしまい、実際には使われていない
// ファイルに対して合格を出すことになる。
import { translations, FALLBACK_LOCALE } from '../src/i18n/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

// 訳が揃っていることを必須とする言語。
//
// ここに挙げた言語でキーが欠けていればエラー（終了コード 1）にする。
// 挙げていない言語は「翻訳作業中」とみなし、欠けているキーを一覧に出すが
// 失敗はさせない。新しい言語を足した初日に CI が真っ赤になると、
// 通すために辞書へ原文をコピーして埋める癖がつき、その時点で
// 「未訳かどうか」を機械が判別できなくなる。未訳は欠けたままにしておき、
// t() のフォールバックで原文を出す方が、後から追える。
// zh は宣伝文の原稿待ちなので、いまはここに入れない（未訳は警告で出る）。
const COMPLETE_LOCALES = ['ja', 'en'];

// 複数形のカテゴリ。言語によって存在するものが違う。
//
// 日本語と中国語は数で語形が変わらないので other しか持たず、英語は
// one と other を持つ。これを「キーの欠け」と数えると、正しい辞書が
// 毎回エラーになる。other だけを必須とし、残りは任意として扱う。
const OPTIONAL_PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many'];

const isOptionalPluralKey = (key) =>
  OPTIONAL_PLURAL_SUFFIXES.some((suffix) => key.endsWith(`.${suffix}`));

/** "{name}" の名前を集合で返す。順番は問わないので Set にする。 */
function placeholders(text) {
  return new Set([...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
}

const sorted = (set) => [...set].sort();

/* ---------- ソースの走査 ---------- */

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      // 辞書そのものは対象外。値の中の {name} をキーの参照と読み違える。
      if (entry === 'i18n') continue;
      found.push(...sourceFiles(path));
    } else if (/\.(js|html)$/.test(path)) {
      found.push(path);
    }
  }
  return found;
}

// ソースからキーの参照を拾う。
//
// ── この走査の限界 ────────────────────────────────────────────
// 正規表現はソースを「文字として」見るだけなので、実行時に組み立てられる
// キーは原理的に拾えない。たとえば次はどれも見つけられない。
//
//   t(part.key, values)                  … 変数に入っている
//   t(`rooms.${type}.name`)              … 実行時に連結する
//   const KEY = 'form.title'; t(KEY)     … 別の場所で定義した定数
//   items.map((i) => t(i.labelKey))      … データから来る
//
// 実際このリポジトリでも breakdownView.js の t(part.key) と
// t(line.labelKey) は変数経由なので、下の「使用キー」には現れない。
// 代わりに、それらの実体である calculator.js の labelKey: '...' と
// noteParts の key: '...' を別途拾うことで埋めている。
//
// この限界は 2 方向に効く。
//
//   ・存在しないキーの見逃し … 動的に組み立てたキーの綴り間違いは通る。
//     この検査は「静的に書かれたキーは全部合っている」ことしか保証しない。
//   ・未使用の誤検出       … 動的にしか引かれないキーは「使われていない」
//     と報告される。だから未使用は警告どまりにし、消す判断は人がする。
//
// 完全にやるならソースを構文木として読む必要があるが、そのための依存を
// 足すほどの問題ではない。動的なキーは数えるほどしかなく、増えたら
// このコメントごと見直す。
// ──────────────────────────────────────────────────────────
const REFERENCE_PATTERNS = [
  // t('key') / t("key")
  /\bt\(\s*['"]([\w.]+)['"]/g,
  // labelKey: 'key'（calculator.js が返す明細行）
  /\blabelKey:\s*['"]([\w.]+)['"]/g,
  // noteParts の key: 'breakdown....'
  /\bkey:\s*['"](breakdown[\w.]*)['"]/g,
  // HTML の data-i18n="key"
  /data-i18n="([\w.]+)"/g,
];

// tPlural('nights', n) は 'nights.other' を必ず引く。
const PLURAL_PATTERN = /\btPlural\(\s*['"]([\w.]+)['"]/g;

// data-i18n-attr="aria-label:key;placeholder:key"
const ATTR_PATTERN = /data-i18n-attr="([^"]+)"/g;

function collectReferences(files) {
  // key -> 参照している場所の一覧
  const refs = new Map();
  const add = (key, file) => {
    if (!refs.has(key)) refs.set(key, new Set());
    refs.get(key).add(relative(ROOT, file));
  };

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    for (const pattern of REFERENCE_PATTERNS) {
      for (const m of source.matchAll(pattern)) add(m[1], file);
    }
    for (const m of source.matchAll(PLURAL_PATTERN)) add(`${m[1]}.other`, file);
    for (const m of source.matchAll(ATTR_PATTERN)) {
      for (const pair of m[1].split(';')) {
        const key = pair.split(':')[1];
        if (key) add(key.trim(), file);
      }
    }
  }

  return refs;
}

// 未使用の判定にだけ使う、緩めの走査。
//
// 上の厳しい走査だけを根拠に「未使用」と言うと、動的に引かれるキーを
// 消させてしまう。辞書のキーと同じ形の文字列がソースのどこかに書いてあれば
// 「使われている可能性がある」とみなし、未使用の報告から外す。
function collectLooseMentions(files, knownKeys) {
  const mentioned = new Set();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/['"]([\w.]+)['"]/g)) {
      if (knownKeys.has(m[1])) mentioned.add(m[1]);
    }
  }
  return mentioned;
}

/* ---------- 検査 ---------- */

const locales = Object.keys(translations);
const reference = translations[FALLBACK_LOCALE];
const referenceKeys = Object.keys(reference);
const allKeys = new Set(locales.flatMap((l) => Object.keys(translations[l])));

const errors = [];
const warnings = [];

// 1. キーの過不足
for (const locale of locales) {
  if (locale === FALLBACK_LOCALE) continue;
  const dict = translations[locale];

  const missing = referenceKeys.filter(
    (key) => !Object.hasOwn(dict, key) && !isOptionalPluralKey(key),
  );
  const extra = Object.keys(dict).filter(
    (key) => !Object.hasOwn(reference, key) && !isOptionalPluralKey(key),
  );

  const bucket = COMPLETE_LOCALES.includes(locale) ? errors : warnings;
  if (missing.length > 0) {
    bucket.push({
      title: `${locale}: ${FALLBACK_LOCALE} にあって ${locale} に無いキー (${missing.length})`,
      items: missing,
    });
  }
  // 余分なキーは翻訳作業中かどうかに関わらずエラー。参照言語に無いものは
  // どこからも引かれないので、訳した労力がそのまま無駄になっている。
  if (extra.length > 0) {
    errors.push({
      title: `${locale}: ${locale} にしか無いキー (${extra.length})`,
      items: extra,
    });
  }
}

// 2. 空文字の値
for (const locale of locales) {
  const empty = Object.entries(translations[locale])
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([key]) => key);
  if (empty.length > 0) {
    errors.push({ title: `${locale}: 値が空のキー (${empty.length})`, items: empty });
  }
}

// 3. プレースホルダの食い違い
for (const locale of locales) {
  if (locale === FALLBACK_LOCALE) continue;
  const dict = translations[locale];
  const mismatched = [];

  for (const key of referenceKeys) {
    if (!Object.hasOwn(dict, key)) continue;

    const expected = placeholders(reference[key]);
    const actual = placeholders(dict[key]);

    const lacking = sorted(expected).filter((n) => !actual.has(n));
    const surplus = sorted(actual).filter((n) => !expected.has(n));
    if (lacking.length === 0 && surplus.length === 0) continue;

    const detail = [
      lacking.length > 0 ? `不足 {${lacking.join('} {')}}` : null,
      surplus.length > 0 ? `余分 {${surplus.join('} {')}}` : null,
    ]
      .filter(Boolean)
      .join(' / ');
    mismatched.push(`${key}  ${detail}`);
  }

  if (mismatched.length > 0) {
    errors.push({
      title: `${locale}: プレースホルダが ${FALLBACK_LOCALE} と一致しないキー (${mismatched.length})`,
      items: mismatched,
    });
  }
}

// 4. ソースが引いているのに辞書に無いキー
const files = sourceFiles(SRC);
const references = collectReferences(files);
const undefinedKeys = [...references]
  .filter(([key]) => !allKeys.has(key))
  .map(([key, where]) => `${key}  (${[...where].join(', ')})`);

if (undefinedKeys.length > 0) {
  errors.push({
    title: `どの辞書にも定義されていないキー (${undefinedKeys.length})`,
    items: undefinedKeys,
  });
}

// おまけ：使われていないかもしれないキー（警告のみ）
const mentioned = collectLooseMentions(files, allKeys);
const unused = referenceKeys.filter(
  (key) => !references.has(key) && !mentioned.has(key) && !isOptionalPluralKey(key),
);
if (unused.length > 0) {
  warnings.push({
    title: `どこからも引かれていないように見えるキー (${unused.length})`,
    items: [...unused, '※ 動的に組み立てたキーは検出できないため、消す前に確認すること'],
  });
}

/* ---------- 出力 ---------- */

function report(label, groups) {
  for (const group of groups) {
    console.log(`\n${label} ${group.title}`);
    for (const item of group.items) console.log(`    ${item}`);
  }
}

const keyCount = referenceKeys.length;
console.log(
  `辞書: ${locales.join(', ')} / 参照言語: ${FALLBACK_LOCALE}（${keyCount} キー） / 走査: ${files.length} ファイル`,
);

report('WARN ', warnings);
report('ERROR', errors);

if (errors.length === 0) {
  console.log(`\nOK: 検査項目に問題はありません${warnings.length > 0 ? '（警告あり）' : ''}`);
  process.exit(0);
}

console.log(`\nNG: ${errors.length} 件の問題があります`);
process.exit(1);
