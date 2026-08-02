/**
 * Simonix landing — entry point.
 * Модули: мобильное меню, скролл-прогресс, scrollspy, reveal,
 * калькулятор комиссии, валидация формы.
 * Ванильный ES-модуль, без зависимостей.
 */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------ Мобильное меню */
function initMenu() {
  const burger = $('#burger');
  const nav = $('#nav');
  if (!burger || !nav) return;

  const toggle = (force) => {
    const open = force ?? !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };

  burger.addEventListener('click', () => toggle());
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
  window.addEventListener('resize', () => { if (innerWidth > 860) toggle(false); });
}

/* ------------------------------------------------ Шапка: прогресс + тень
   Полоса показывает долю прокрученной страницы.

   Тонкие места, из-за которых индикатор «уезжает»:
   1. Высота документа меняется после загрузки шрифтов и картинок —
      значит max нельзя кэшировать, он пересчитывается на каждом кадре.
   2. Разные браузеры отдают позицию то в scrollingElement, то в window.
   3. При просмотре внутри iframe скроллится не окно, а элемент документа.
   4. <details> в FAQ и адаптив меняют высоту — ловим через ResizeObserver. */
function initHeader() {
  const header = $('#header');
  const bar = $('#progress');
  let ticking = false;
  let lastRatio = -1;

  /** Текущая позиция прокрутки, устойчиво для всех движков и iframe */
  const scrollTop = () => {
    const se = document.scrollingElement || document.documentElement;
    return window.scrollY || window.pageYOffset || se.scrollTop || 0;
  };

  /** Полная высота документа */
  const docHeight = () => {
    const b = document.body;
    const e = document.documentElement;
    return Math.max(
      b.scrollHeight, e.scrollHeight,
      b.offsetHeight, e.offsetHeight,
      e.clientHeight,
    );
  };

  const draw = () => {
    ticking = false;
    const y = scrollTop();
    header?.classList.toggle('is-stuck', y > 8);
    if (!bar) return;

    const max = docHeight() - window.innerHeight;
    const ratio = max > 1 ? Math.min(Math.max(y / max, 0), 1) : 0;

    // не трогаем DOM, если доля не изменилась заметно
    if (Math.abs(ratio - lastRatio) < 0.0005) return;
    lastRatio = ratio;
    bar.style.transform = `scaleX(${ratio})`;
  };

  const request = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(draw);
  };

  draw();

  // Скролл окна и любых внутренних контейнеров (capture ловит и iframe-кейс)
  window.addEventListener('scroll', request, { passive: true });
  document.addEventListener('scroll', request, { passive: true, capture: true });
  window.addEventListener('resize', request, { passive: true });
  window.addEventListener('orientationchange', request, { passive: true });

  // Высота документа меняется: шрифты, раскрытие FAQ, появление reveal-блоков
  window.addEventListener('load', request);
  document.addEventListener('toggle', request, true);
  document.fonts?.ready.then(request);

  if ('ResizeObserver' in window) {
    new ResizeObserver(request).observe(document.body);
  }
}

/* ------------------------------------------------ Подсветка активного раздела */
function initScrollSpy() {
  const links = $$('.nav__list a');
  const map = new Map();
  links.forEach((a) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) map.set(target, a);
  });
  if (!map.size) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((l) => l.classList.remove('is-active'));
      map.get(entry.target)?.classList.add('is-active');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  map.forEach((_, section) => io.observe(section));
}

/* ------------------------------------------------ Появление блоков */
function initReveal() {
  const items = $$('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry, i) => {
      if (!entry.isIntersecting) return;
      setTimeout(() => entry.target.classList.add('is-visible'), i * 70);
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px' });

  items.forEach((el) => io.observe(el));
}

/* ------------------------------------------------ Калькулятор комиссии
   Ставки по форматам сделок (см. таблицу «Монетизация»).
   Средневзвешенная ставка НЕ задаётся вручную: она выводится из структуры
   сделок как сумма произведений доли на её ставку. */
const RATES = Object.freeze({
  raas:  0.11,   // RaaS / аренда: подписка, софт, обновления
  trade: 0.125,  // трейд-ин и рефёрбишмент
  base:  0.03,   // тяжёлый B2B-остаток: прямые поставки, лизинг, импорт
});

function initCalculator() {
  const form = $('#calc');
  if (!form) return;

  const els = {
    ticket: $('#ticket'), deals: $('#deals'), raas: $('#raas'), trade: $('#trade'),
    ticketOut: $('#ticketOut'), dealsOut: $('#dealsOut'),
    raasOut: $('#raasOut'), tradeOut: $('#tradeOut'),
    segRaas: $('#segRaas'), segTrade: $('#segTrade'), segBase: $('#segBase'),
    legRaas: $('#legRaas'), legTrade: $('#legTrade'), legBase: $('#legBase'),
    rateSlider: $('#rateSlider'), rateOut: $('#rateOut'), rateFormula: $('#rateFormula'),
    gmv: $('#gmv'), rev: $('#rev'), arr: $('#arr'),
  };

  const money = (v) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)} млрд ₽`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)} млн ₽`;
    return `${Math.round(v).toLocaleString('ru-RU')} ₽`;
  };
  const pct = (v, digits = 0) =>
    `${v.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
  // ru-RU уже отдаёт запятую как десятичный разделитель

  const update = () => {
    const ticket = +els.ticket.value;
    const deals  = +els.deals.value;

    // Доли не могут в сумме превышать 100%: ползунок-донор ужимается.
    let raasShare  = +els.raas.value / 100;
    let tradeShare = +els.trade.value / 100;
    if (raasShare + tradeShare > 1) {
      if (document.activeElement === els.raas) {
        tradeShare = 1 - raasShare;
        els.trade.value = Math.round(tradeShare * 100);
      } else {
        raasShare = 1 - tradeShare;
        els.raas.value = Math.round(raasShare * 100);
      }
    }
    const baseShare = Math.max(0, 1 - raasShare - tradeShare);

    // GMV распределяем по форматам, комиссию считаем к каждому потоку отдельно
    const gmv       = ticket * deals * 12;
    const gmvRaas   = gmv * raasShare;
    const gmvTrade  = gmv * tradeShare;
    const gmvBase   = gmv * baseShare;

    const revRaas  = gmvRaas  * RATES.raas;
    const revTrade = gmvTrade * RATES.trade;
    const revBase  = gmvBase  * RATES.base;
    const rev      = revRaas + revTrade + revBase;

    // Средневзвешенная ставка = выручка / GMV (эквивалент Σ доля × ставка)
    const weighted = gmv > 0 ? (rev / gmv) * 100 : 0;

    // Повторяемая выручка — только подписной поток RaaS
    const arr = revRaas;

    els.ticketOut.textContent = money(ticket);
    els.dealsOut.textContent  = `${deals} / мес`;
    els.raasOut.textContent   = pct(raasShare * 100);
    els.tradeOut.textContent  = pct(tradeShare * 100);

    els.segRaas.style.width  = `${raasShare * 100}%`;
    els.segTrade.style.width = `${tradeShare * 100}%`;
    els.segBase.style.width  = `${baseShare * 100}%`;
    els.legRaas.textContent  = pct(raasShare * 100);
    els.legTrade.textContent = pct(tradeShare * 100);
    els.legBase.textContent  = pct(baseShare * 100);

    // Ползунок ставки — индикатор: двигается сам вслед за структурой сделок
    els.rateSlider.value = weighted.toFixed(2);
    els.rateOut.textContent = pct(weighted, 2);
    els.rateFormula.textContent =
      `(${pct(raasShare * 100)} × 11%) + (${pct(tradeShare * 100)} × 12,5%) + (${pct(baseShare * 100)} × 3%) = ${pct(weighted, 2)}`;

    els.gmv.textContent  = money(gmv);
    els.rev.textContent = money(rev);
    els.arr.textContent = money(arr);
  };

  // Индикатор ставки не редактируется пользователем
  ['input', 'change', 'pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
    els.rateSlider.addEventListener(evt, (e) => { e.preventDefault(); update(); });
  });

  form.addEventListener('input', update);
  update();
}

/* ------------------------------------------------ Форма заявки
   Отправка на почту без бэкенда.

   Адрес получателя не хранится в открытом виде — он собирается из частей
   в рантайме, чтобы почту не выцепили спам-скраперы из исходного кода.

   Активация (делается один раз): отправьте форму с опубликованного сайта,
   на почту придёт письмо от FormSubmit со ссылкой «Activate Form» —
   перейдите по ней. После этого заявки приходят автоматически.
   Чтобы использовать свою CRM — замените ENDPOINT на свой URL.

   Ещё надёжнее: получить на formsubmit.co персональный хеш-токен вида
   https://formsubmit.co/ajax/a1b2c3d4… — тогда адрес в коде не фигурирует
   вовсе. Подставьте его в ENDPOINT вместо leadEmail(). */
const leadEmail = () => ['m.finbox2022', 'gmail.com'].join('\u0040');
const ENDPOINT  = `https://formsubmit.co/ajax/${leadEmail()}`;

function initForm() {
  const form = $('#leadForm');
  const status = $('#formStatus');
  if (!form) return;

  const setStatus = (text, kind = '') => {
    status.className = `form__status${kind ? ` is-${kind}` : ''}`;
    status.textContent = text;
  };

  /** Фолбэк: открыть письмо в почтовом клиенте пользователя */
  const mailtoFallback = (d) => {
    const body = [
      `Имя: ${d.name || '—'}`,
      `E-mail: ${d.email || '—'}`,
      `Компания / фонд: ${d.company || '—'}`,
      `Интерес: ${d.interest || '—'}`,
      '',
      'Комментарий:',
      d.message || '—',
    ].join('\n');
    window.location.href =
      `mailto:${leadEmail()}?subject=${encodeURIComponent('Заявка с сайта Simonix')}` +
      `&body=${encodeURIComponent(body)}`;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('');
    $$('.field', form).forEach((f) => f.classList.remove('has-error'));

    if (!form.checkValidity()) {
      $$(':invalid', form).forEach((el) => el.closest('.field')?.classList.add('has-error'));
      setStatus('Проверьте обязательные поля.', 'err');
      form.querySelector(':invalid')?.focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Отправляем…';

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: `Заявка с сайта Simonix — ${data.name || 'без имени'}`,
          _template: 'table',
          Имя: data.name,
          Email: data.email,
          'Компания / фонд': data.company || '—',
          Интерес: data.interest,
          Комментарий: data.message || '—',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      form.reset();
      setStatus('Заявка отправлена. Материалы придут в течение рабочего дня.', 'ok');
    } catch (err) {
      console.warn('Не удалось отправить через сервис:', err);
      setStatus('Открываем почтовый клиент… Или напишите в Telegram @airmaze7', 'err');
      mailtoFallback(data);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Отправить запрос';
    }
  });
}

/* ------------------------------------------------ Мелочи */
function initMisc() {
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
}

/* ------------------------------------------------ Bootstrap */
const boot = () => {
  initMenu();
  initHeader();
  initScrollSpy();
  initReveal();
  initCalculator();
  initForm();
  initMisc();
};

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', boot)
  : boot();
