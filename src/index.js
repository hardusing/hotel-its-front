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

// 初期表示は日本語
applyLanguage('ja');
