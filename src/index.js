import './style.css';
import { translations } from './i18n';

const langButtons = document.querySelectorAll('.lang-switch__btn');

function applyLanguage(lang) {
  const dict = translations[lang];
  if (!dict) return;

  // data-i18n を持つ全要素のテキストを差し替える
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) {
      el.textContent = dict[key];
    }
  });

  // <html lang="..."> も更新
  document.documentElement.lang = lang;

  // 選択中の言語ボタンを強調表示
  langButtons.forEach((btn) => {
    btn.classList.toggle('lang-switch__btn--active', btn.dataset.lang === lang);
  });
}

langButtons.forEach((btn) => {
  btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
});

// ブラウザの言語設定から初期表示言語を決定する。
// 日本語環境（ja, ja-JP など）なら JP、それ以外は EN。
function detectLanguage() {
  const browserLang = navigator.language || 'en';
  return browserLang.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

applyLanguage(detectLanguage());
