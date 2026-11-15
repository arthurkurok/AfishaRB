// Слайды презентации «Афиши РБ», 3 минуты. На каждом слайде один-два экрана продукта и короткая подпись.
// Снимки: shots/ (shots-web.mjs, 15.11.2026).

/** Знак «Афиша РБ» (apps/web/src/brand/logo.tsx), завиток обрезан по ромбу. */
const mark = (size = 32) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs><clipPath id="mk"><path d="M16 1 31 16 16 31 1 16Z"/></clipPath></defs><path d="M16 1 31 16 16 31 1 16Z" fill="var(--color-accent)"/><path clip-path="url(#mk)" d="M16 1 23.5 8.5C21 8 19 9.6 19 11.6c0 1.6 1.6 2.6 3 1.8" fill="none" stroke="var(--color-on-accent)" stroke-width="1.6" stroke-linecap="round"/><path d="M16 10 22 16 16 22 10 16Z" fill="var(--color-honey)"/></svg>`;

const shot = (src, style = "", cls = "") => `<div class="shot ${cls}" style="${style}"><img src="shots/${src}" alt=""></div>`;
const nat = (src) => shot(src, "", "shot--natural");
const phone = (src) => `<div class="phone"><img src="shots/${src}" alt=""></div>`;
const head = (title, lead = "") => `<h2 class="title">${title}</h2>${lead ? `<p class="lead">${lead}</p>` : ""}`;
const num = (n) => `<p class="num">${n}</p>`;

export function deck() {
  const slides = [
    // 1. Обложка
    () => `
<section class="slide cover">
  <div>
    <div class="brand">${mark(56)}Афиша РБ</div>
    <h1 class="cover__title">Афиша культурных событий Башкортостана</h1>
    <p class="lead">Сайт, Telegram-бот с Mini App, ИИ-гид на GigaChat, рабочее место министерства, открытый API и виджет.</p>
    <p class="cover__url">antihype.best</p>
  </div>
  ${shot("home-top.jpg")}
</section>`,

    // 3. Поиск
    (n) => `
<section class="slide">
  ${head("Поиск и фильтры", "Дата и время суток, город или район, «рядом со мной», цена, возраст, категория, Пушкинская карта. Фильтры сохраняются в адресе страницы, ссылкой можно поделиться.")}
  <div class="body full">${shot("search.jpg")}</div>
  ${num(n)}
</section>`,

    // 4. Карточка события
    (n) => `
<section class="slide">
  ${head("Карточка и паспорт события", "У каждого сеанса свой статус: по плану, перенесён, отменён, распродан или уточняется. В паспорте видно, из какого источника пришло событие и что в нём менялось.")}
  <div class="body two" style="grid-template-columns:1080px 1fr">
    <div>${shot("event.jpg")}</div>
    <div>${nat("passport.jpg")}</div>
  </div>
  ${num(n)}
</section>`,

    // 5. Гид
    (n) => `
<section class="slide">
  ${head("ИИ-гид")}
  <div class="body side" style="grid-template-columns:1000px 1fr">
    ${shot("guide.jpg")}
    <div class="side__text">
      <p>Запрос пишется своими словами. Гид раскладывает его на условия и показывает их. Любое условие можно поправить или убрать.</p>
      <p>Если данных не хватает, Гид задаёт один вопрос с готовыми вариантами ответа.</p>
      <p>События берутся только из базы. Перед показом ответ сверяется с карточками.</p>
      <p>Если GigaChat недоступен, запрос разбирается правилами и Гид продолжает работать.</p>
    </div>
  </div>
  ${num(n)}
</section>`,

    // 6. Telegram
    (n) => `
<section class="slide">
  ${head("Telegram-бот и Mini App", "Mini App открывается из бота @AfishaRB102bot. В боте можно подписаться на город и категорию.")}
  <div class="body phones">
    <div>${phone("m-tma.jpg")}<p class="cap">Главная</p></div>
    <div>${phone("m-tma-guide.jpg")}<p class="cap">Гид</p></div>
    <div>${phone("m-tma-event.jpg")}<p class="cap">Карточка события</p></div>
  </div>
  ${num(n)}
</section>`,

    // 7. Города и районы, башкирский
    (n) => `
<section class="slide">
  ${head("Районы и башкирский язык")}
  <div class="body two" style="grid-template-columns:1fr 1fr">
    <div>${nat("districts.jpg")}<p class="cap">У каждого города и района своя страница с картой площадок.</p></div>
    <div>${nat("home-ba.jpg")}<p class="cap">Сайт полностью переведён на башкирский. Гид понимает запросы на башкирском.</p></div>
  </div>
  ${num(n)}
</section>`,

    // 8. Пульс культуры
    (n) => `
<section class="slide">
  ${head("«Пульс культуры» для министерства", "Что жители искали и не нашли, в каких районах мало событий, у каких учреждений неполные данные. Каждую таблицу можно выгрузить в CSV.")}
  <div class="body full">${shot("admin-pulse.jpg")}</div>
  ${num(n)}
</section>`,

    // 9. Импорт и кабинет
    (n) => `
<section class="slide">
  ${head("Импорт и кабинет учреждения")}
  <div class="body two" style="grid-template-columns:1fr 1fr">
    <div>${nat("admin-import.jpg")}<p class="cap">Импорт CSV и JSON с отчётом: что добавлено, что обновлено, какие строки отклонены и почему. Повторная загрузка не создаёт дублей.</p></div>
    <div>${nat("admin-cabinet.jpg")}<p class="cap">Учреждение отменяет или переносит сеанс, подписчики получают уведомление.</p></div>
  </div>
  ${num(n)}
</section>`,

    // 10. API и виджет
    (n) => `
<section class="slide">
  ${head("Открытый API и виджет")}
  <div class="body two" style="grid-template-columns:1fr 1fr">
    <div>${nat("developers.jpg")}<p class="cap">Страница для разработчиков: примеры запросов, виджет для сайта, инструкция для 1С-Битрикс.</p></div>
    <div>${nat("api-docs.jpg")}<p class="cap">REST API без ключа, документация OpenAPI 3.1.</p></div>
  </div>
  ${num(n)}
</section>`,

    // 12. Ссылки
    () => `
<section class="slide final">
  <img class="final__qr" src="shots/qr.png" alt="QR: antihype.best">
  <div>
    <div class="brand">${mark(56)}Афиша РБ</div>
    <p class="final__url">antihype.best</p>
    <p class="final__links">
      <span>Бот</span>@AfishaRB102bot<br>
      <span>API</span>api.antihype.best/docs<br>
      <span>Админка</span>admin.antihype.best<br>
      <span>Код</span>github.com/arthurkurok/AfishaRB
    </p>
  </div>
</section>`,
  ];

  return slides.map((s, i) => s(i + 1)).join("\n");
}
