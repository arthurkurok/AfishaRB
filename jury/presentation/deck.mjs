// Слайды презентации «Афиши РБ»: разметка из компонентов (окно, телефон, карточка, схема).
// Иконки — линейные, как CategoryIcon продукта (24 px, линия 2 px). Снимки экранов — shots/.

const ART = "assets";
const CAT_COLORS = {
  theatre: "var(--color-category-theatre)",
  music: "var(--color-category-music)",
  museum: "var(--color-category-museum)",
  kids: "var(--color-category-kids)",
  folk: "var(--color-category-folk)",
  cinema: "var(--color-category-cinema)",
  education: "var(--color-category-education)",
  accent: "var(--color-accent)",
  meadow: "var(--color-meadow)",
  honey: "var(--color-honey)",
  focus: "var(--color-focus)",
};

/** Пути линейных иконок, 24×24, обводка 2 px. */
const ICONS = {
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3.5 9h17M3.5 15h17M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18",
  pulse: "M3 13h4l2.5-7 4 14 2.5-7H21",
  telegram: "M22 2L11 13M22 2l-7 20-4-9-9-4 22-7z",
  code: "M8 6l-6 6 6 6M16 6l6 6-6 6",
  database:
    "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  sync: "M20 8a8 8 0 0 0-14-2M4 16a8 8 0 0 0 14 2M17 2v4h-4M7 22v-4h4",
  sparkle: "M12 3l2 5.5L19.5 11 14 13.5 12 19l-2-5.5L4.5 11 10 8.5zM19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2-2.2-.8 2.2-.8z",
  shield: "M12 3l7 3v5.5c0 4.2-3 7.9-7 9-4-1.1-7-4.8-7-9V6zM9 12l2 2 4-4",
  pin: "M12 21c-4.5-4-7-7.5-7-11a7 7 0 1 1 14 0c0 3.5-2.5 7-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  seal: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M8.5 12l2.5 2.5 4.5-4.5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7.5V12l3 2.5",
  chat: "M4 5h16v11H9l-4 4V5z",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15M21 21l-5.2-5.2",
  git: "M6 3v12M6 15a2 2 0 1 0 .01 4A2 2 0 0 0 6 15zM18 5a2 2 0 1 0 .01 4A2 2 0 0 0 18 5zM18 9v2c0 2-2 3-4 3H9",
};

/** Линейные иконки категорий (07-design §4.2), обводка 2 px. */
const CAT_PATHS = {
  theatre: "M4 5.5c3-2 13-2 16 0V11c0 5-4 9-8 9s-8-4-8-9zM7.5 11c0-2 3-2 3 0M13.5 11c0-2 3-2 3 0M9 15c1.5 1.6 4.5 1.6 6 0",
  music: "M5 20 13 4M7.8 14.4l1 .5M10 10l1 .5M15 10.5c2 .8 2.8 2.8 1.8 4.6M17.6 7.6c3.4 2 4.2 6 2.2 9",
  museum: "M12 3l9 9-9 9-9-9zM12 8.5l3.5 3.5-3.5 3.5L8.5 12z",
  kids: "M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8M12 8a4 4 0 1 1-4 4c0-1.6 1.4-2.6 2.6-2 .9.5.8 1.8-.2 2",
  folk: "M12 21V8M12 14c-3 0-5-2-5-5 1.6 0 3 .8 3 2.4M12 14c3 0 5-2 5-5-1.6 0-3 .8-3 2.4M12 9.5c-1.8 0-3-1.3-3-3M12 9.5c1.8 0 3-1.3 3-3M12 2.5l2 2-2 2-2-2z",
  cinema: "M12 3l9 9-9 9-9-9zM10.5 9.2v5.6l4.4-2.8z",
  education:
    "M12 20c-5-3.6-8.5-6.8-8.5-10.4A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 8.5 2c0 3.6-3.5 6.8-8.5 10.4zM12 7.6v4M12 11.6c-1.2 0-2-.9-2-1.9",
};

const icon = (name, cat = false) =>
  cat
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${CAT_PATHS[name]}"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

/** Знак «Афиша РБ»: ромб со срезом-завитком ҡусҡар (brand/logo.tsx). */
const mark = (size = 32) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 1 31 16 16 31 1 16Z" fill="var(--color-accent)"/><path d="M16 1 23.5 8.5C21 8 19 9.6 19 11.6c0 1.6 1.6 2.6 3 1.8" fill="none" stroke="var(--color-on-accent)" stroke-width="1.6" stroke-linecap="round"/><path d="M16 10 22 16 16 22 10 16Z" fill="var(--color-honey)"/></svg>`;

const brand = `<div style="display:flex;align-items:center;gap:16px">${mark(56)}<span style="font-family:var(--font-display);font-size:40px;font-weight:800">Афиша РБ</span></div>`;

/** Срез ҡусқар в правом верхнем углу слайда. */
const cut = `<svg class="cut" viewBox="0 0 40 40" aria-hidden="true"><path d="M40 0H6C6 19 21 34 40 34Z"/><path d="M24 30.2C20 36.5 11.5 36.5 11.5 30.5C11.5 25.5 18 25.2 18.2 29.4"/></svg>`;

const window_ = (src) => `<div class="window"><div class="window__bar"><i></i><i></i><i></i></div><img src="shots/${src}" alt=""></div>`;
const phone = (src) => `<div class="phone"><img src="shots/${src}" alt=""></div>`;

const point = (tone, name, b, p) =>
  `<li><span class="point__icon" style="background:${CAT_COLORS[tone]}">${icon(name)}</span><div><b>${b}</b><br>${p}</div></li>`;

const box = (tone, name, tech, iconName) =>
  `<div class="box"><span class="box__icon">${icon(iconName)}</span><b>${name}</b><span>${tech}</span></div>`;

export function deck() {
  const slides = [
    // 1 · Обложка
    () => `
<section class="slide cover">
  <div>
    ${brand}
    <p class="cover__sub">Культура Башкортостана</p>
    <h1 class="cover__title">Афиша событий республики</h1>
    <p class="lead">Сайт, Telegram-бот, админка, открытый API и виджет. Общие данные, синк каждый час.</p>
  </div>
  <div class="cover__art">
    ${["theatre", "music", "museum", "kids", "folk", "cinema"].map((c) => `<div class="poster">${cut}<img src="${ART}/${c}.jpg" alt=""></div>`).join("")}
  </div>
</section>`,

    // 2 · Задача
    () => `
<section class="slide">
  ${cut}
  <h2 class="title"><span class="kicker">Задача</span>Афишу республики собирают вручную</h2>
  <div class="cards3">
    <div class="card card--pad">
      <div class="card__num" style="color:${CAT_COLORS.accent}">65</div>
      <p class="card__text">городов и районов. Анонсы публикуют на сайтах учреждений и в соцсетях. Афиши района целиком нет нигде.</p>
    </div>
    <div class="card card--pad">
      <div class="card__num" style="color:${CAT_COLORS.accent}">0</div>
      <p class="card__text">источников отвечают на вопрос «что делать в выходные». Даты, цены и переносы сверять нужно руками.</p>
    </div>
    <div class="card card--pad">
      <div class="card__num" style="color:${CAT_COLORS.accent}">2</div>
      <p class="card__text">языка, на которых публикуют анонсы: русский и башкирский. Дубли и расхождения между ними не сходятся.</p>
    </div>
  </div>
  <div class="note">${icon("search")}<span>В каждом источнике часть афиши. Целиком её не видно нигде.</span></div>
</section>`,

    // 3 · Архитектура
    () => `
<section class="slide">
  ${cut}
  <h2 class="title"><span class="kicker">Архитектура</span>Один контур данных</h2>
  <div class="arch">
    <div>
      <p class="arch__label">Клиенты</p>
      <div class="arch__row arch__row--4">
        ${box("accent", "Сайт", "Next.js 16, RU и BA", "globe")}
        ${box("accent", "Админка", "Next.js 16, доступ по токену", "pulse")}
        ${box("accent", "Бот и Mini App", "grammY, Telegram", "telegram")}
        ${box("accent", "Виджет", "сниппет для сайтов учреждений", "code")}
      </div>
      <p class="arch__label">Сервер</p>
      <div class="arch__api">
        <div class="arch__api-head"><b>API: модульный монолит</b><span>TypeScript, Fastify, OpenAPI 3.1</span></div>
        <div class="chips">
          ${["События", "Сеансы", "Площадки", "Поиск", "Гид", "Подписки", "Синк", "Дедупликация", "Фидбек", "Виджет"].map((m) => `<span class="chip">${m}</span>`).join("")}
        </div>
      </div>
      <p class="arch__label">Данные</p>
      <div class="arch__row arch__row--4">
        ${box("accent", "PostgreSQL 18", "PostGIS, pgvector", "database")}
        ${box("accent", "pg-boss", "фоновые задачи и синк", "sync")}
        ${box("accent", "GigaChat", "двухуровневый гид", "sparkle")}
        ${box("accent", "Caddy", "TLS, сборка контейнеров", "shield")}
      </div>
    </div>
    <div class="arch__side">
      <div class="rule">${icon("sync")}<div><b>Идемпотентный синк</b><p>Культура.РФ и Башопера, каждый час. Повторный запуск не плодит дубли.</p></div></div>
      <div class="rule">${icon("shield")}<div><b>Дедупликация до показа</b><p>Кандидатов скорит автопарсер, спорные пары уходят в очередь модерации.</p></div></div>
      <div class="rule">${icon("seal")}<div><b>Провенанс</b><p>У каждого поля события есть источник. Виден в паспорте карточки.</p></div></div>
      <div class="rule">${icon("chat")}<div><b>Два языка</b><p>RU и BA из одного пакета i18n, плюрализация по правилам CLDR.</p></div></div>
    </div>
  </div>
</section>`,

    // 4 · Данные
    () => `
<section class="slide slide--center">
  ${cut}
  <h2 class="title"><span class="kicker">Данные</span>Что в каталоге сегодня</h2>
  <div class="numbers">
    <div class="number card"><span class="number__icon" style="background:${CAT_COLORS.theatre}">${icon("theatre", true)}</span><div><div class="number__val">8 703</div><p class="number__text">события</p></div></div>
    <div class="number card"><span class="number__icon" style="background:${CAT_COLORS.music}">${icon("music", true)}</span><div><div class="number__val">27 193</div><p class="number__text">будущих сеанса</p></div></div>
    <div class="number card"><span class="number__icon" style="background:${CAT_COLORS.museum}">${icon("museum", true)}</span><div><div class="number__val">2 303</div><p class="number__text">площадки</p></div></div>
    <div class="number card"><span class="number__icon" style="background:${CAT_COLORS.meadow}">${icon("pin")}</span><div><div class="number__val">65</div><p class="number__text">городов и районов</p></div></div>
    <div class="number card"><span class="number__icon" style="background:${CAT_COLORS.kids}">${icon("kids", true)}</span><div><div class="number__val">31 %</div><p class="number__text">событий бесплатные</p></div></div>
    <div class="number card"><span class="number__icon" style="background:${CAT_COLORS.education}">${icon("education", true)}</span><div><div class="number__val">63 %</div><p class="number__text">принимают Пушкинскую карту</p></div></div>
  </div>
  <p class="numbers__src">Срез 14.11.2026, api.antihype.best/v1/stats. Синк с PRO.Культура.РФ и Башоперой, обновление каждый час.</p>
</section>`,

    // 5 · Выбор города
    () => `
<section class="slide">
  ${cut}
  <h2 class="title"><span class="kicker">Сайт</span>Сначала город</h2>
  <div class="duo">
    <div>${window_("home-modal.jpg")}<p class="caption">Первый заход<small>нативное окно выбора города</small></p></div>
    <div>${window_("home-ufa.jpg")}<p class="caption">После выбора<small>ленты, подборки и гид в рамках города</small></p></div>
  </div>
</section>`,

    // 6 · Поиск и карточка
    () => `
<section class="slide">
  ${cut}
  <h2 class="title"><span class="kicker">Сайт</span>Поиск и карточка</h2>
  <div class="duo">
    <div>${window_("search.jpg")}<p class="caption">Поиск<small>фильтры: категория, дата, цена, Пушкинская карта</small></p></div>
    <div>${window_("event.jpg")}<p class="caption">Карточка события<small>постер 2:3, сеансы, доступность, экспорт в календарь</small></p></div>
  </div>
</section>`,

    // 7 · Паспорт
    () => `
<section class="slide">
  ${cut}
  <h2 class="title"><span class="kicker">Сайт</span>Паспорт события</h2>
  <div class="split">
    ${window_("passport.jpg")}
    <ul class="points">
      ${point("seal", "seal", "Источники", "из каких лент собрано событие, со ссылками")}
      ${point("focus", "shield", "Уровень доверия", "официальный источник, подтверждено учреждением, собрано из нескольких")}
      ${point("meadow", "clock", "История изменений", "поле за полем: что изменилось и когда")}
    </ul>
  </div>
</section>`,

    // 8 · Гид
    () => `
<section class="slide">
  ${cut}
  <h2 class="title"><span class="kicker">Гид</span>Подборка по вопросу</h2>
  <div class="split">
    ${window_("guide.jpg")}
    <div>
      <ul class="points">
        ${point("accent", "chat", "Запрос обычным языком", "«куда пойти в субботу с ребёнком до 1000 рублей в Уфе»")}
        ${point("focus", "sparkle", "GigaChat-2", "разбирает запрос, ищет по каталогу, объясняет подборку")}
        ${point("meadow", "seal", "Проверка ответа", "верификатор сверяет каждое событие с базой")}
      </ul>
      <div class="chips" style="margin-top:var(--space-6)">
        <span class="chip">98 из 98 кейсов ТЗ</span>
        <span class="chip">резерв: режим правил</span>
        <span class="chip">RU и BA</span>
      </div>
    </div>
  </div>
</section>`,

    // 9 · Админка и карта
    () => `
<section class="slide">
  ${cut}
  <h2 class="title"><span class="kicker">Админка</span>Пульс культуры и карта</h2>
  <div class="duo">
    <div>${window_("admin-pulse.jpg")}<p class="caption">Пульс культуры<small>метрики, очередь модерации, кабинет учреждения</small></p></div>
    <div>${window_("map.jpg")}<p class="caption">Карта города<small>площадки и события, Leaflet и OSM</small></p></div>
  </div>
</section>`,

    // 10 · Телефон и Telegram
    () => `
<section class="slide">
  ${cut}
  <h2 class="title"><span class="kicker">Телефон</span>На телефоне и в Telegram</h2>
  <div class="devices">
    <div class="device">${phone("mobile-home.jpg")}<p class="caption">Сайт<small>адаптив без отдельной версии</small></p></div>
    <div class="device">${phone("mobile-tma.jpg")}<p class="caption">Mini App<small>открывается из бота @AfishaRB102bot</small></p></div>
    <div class="device">${phone("mobile-event.jpg")}<p class="caption">Карточка<small>сеансы, цены, как добраться</small></p></div>
  </div>
</section>`,

    // 11 · Что открыто
    () => `
<section class="slide slide--center">
  ${cut}
  <h2 class="title"><span class="kicker">Доступ</span>Что открыто</h2>
  <div class="links">
    <div class="card link"><span class="link__icon" style="background:${CAT_COLORS.accent}">${icon("globe")}</span><b>Сайт</b><span>antihype.best</span></div>
    <div class="card link"><span class="link__icon" style="background:${CAT_COLORS.education}">${icon("code")}</span><b>REST API</b><span>api.antihype.best/docs</span></div>
    <div class="card link"><span class="link__icon" style="background:${CAT_COLORS.focus}">${icon("telegram")}</span><b>Бот и Mini App</b><span>@AfishaRB102bot</span></div>
    <div class="card link"><span class="link__icon" style="background:${CAT_COLORS.meadow}">${icon("pulse")}</span><b>Админка</b><span>admin.antihype.best</span></div>
    <div class="card link"><span class="link__icon" style="background:${CAT_COLORS.cinema}">${icon("code")}</span><b>Виджет</b><span>antihype.best/ru/developers</span></div>
    <div class="card link"><span class="link__icon" style="background:${CAT_COLORS.honey}">${icon("git")}</span><b>Код</b><span>github.com/3r0ha/AfishaRB</span></div>
  </div>
</section>`,

    // 12 · Финал
    () => `
<section class="slide final">
  ${cut}
  <div class="final__mark">${mark(128)}</div>
  <div class="final__url">antihype.best</div>
  <img class="final__qr" src="shots/qr.png" alt="QR: antihype.best">
  <p class="final__note">Демонстрационный проект. Не является официальным сервисом Министерства культуры Республики Башкортостан.</p>
</section>`,
  ];

  return slides.map((s) => s()).join("\n");
}
