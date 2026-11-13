# 13. Что сделать вам лично

> Задачи, которые не может сделать агент: регистрации, договорённости, решения, визуальные ассеты. Отмечайте `[x]` по мере выполнения. Если агент упрётся в задачу из этого списка, он работает с моком и ждёт вас.

## Блок А. Срочно — доступы и организационное (02–05.11)

Порядок важен: регистрации и модерация занимают дни.

- [ ] **А1. Команда и регистрация на «Кибер 102»** (кибер102.рф), до 5 человек. Роли — по потокам S1–S5 (11-roadmap).
- [ ] **А2. Вопросы организаторам** (письменно, сохранить ответы в `docs/00-brief.md`):
  1. Дадут ли доступ к GigaChat (ключи, кредиты) или приходить со своим?
  2. Дадут ли от министерства партнёрский ключ API PRO.Культура или тестовые данные?
  3. Время трёх чек-пойнтов и формат защиты (минуты на команду, показ с телефона?).
  4. Критерии оценки кейса 01.
  5. Можно ли показывать нативные приложения с устройства на защите?
- [ ] **А4. Telegram-бот:** @BotFather → `/newbot` (имя, username), `/setdescription`, `/setabouttext`, `/setuserpic` (когда будет готов аватар Б9; до этого — временный), `/setinline` (включить inline-режим), `/setdomain` (для Mini App). Telegram в РФ заблокирован — понадобится VPN.
- [ ] **А5. GigaChat:** аккаунт в cloud.ru (Evolution Foundation Models: GigaChat 3-Pro, 3.5 Ultra, Lightning) **и/или** developers.sber.ru (GigaChat 2 Lite/Pro/Max + эмбеддинги). Пополнить на 3–6 тыс. ₽. Скачать сертификат НУЦ Минцифры (Russian Trusted Root CA).
- [ ] **А6. Ключ к открытым данным** opendata.mkrf.ru (бесплатно) — для набора «Мероприятия в сфере культуры».
- [ ] **А7. Инфраструктура:** домен (`.ru` / `.рф`), VPS в РФ (4 vCPU / 8 ГБ, почасовая оплата), минимальный VPS за рубежом (исходящий прокси для Telegram Bot API), DNS.
- [ ] **А8. Устройства:** Mac с Xcode (последняя стабильная версия), Android Studio, iPhone и Android-смартфон для демо (Apple ID для бесплатной подписи сборок), павербанки, резервный мобильный интернет.
- [ ] **А9. Дизайн-инструмент:** Figma (если доступна) или Pixso — общий файл для команды.
- [ ] **А11. Проверка названий в ФИПС** (fips.ru → открытые реестры, классы 9, 35, 38, 41, 42): «Тамаша», «Торна», «Бал». Результат записать в `docs/07-design.md` §2.

## Блок Б. Визуальные ассеты (после основной разработки)

> До готовности ассетов в коде используются временные плейсхолдеры-иллюстрации, сгенерированные кодом (SVG-геометрия орнамента ҡусҡар и ромба). Готовые ассеты кладутся в `packages/design-tokens/assets/` по именам из «Приёмки ассетов» и заменяют плейсхолдеры.

### Рекомендуемый процесс

1. Концепты генерируются нейросетью: Midjourney v7, Recraft (лучше всего для векторного стиля), Kandinsky или Шедеврум (бесплатно, экосистема Сбера — хорошая деталь для питча).
2. Выбирается лучший вариант маскота — он становится **референсом** для всех остальных генераций (omni-reference `--oref` в Midjourney v7 или загрузка картинки-референса в других сервисах). Так персонаж будет одинаковым во всех эмоциях.
3. **Обязательно** — чистовая векторизация и доводка в Figma/Illustrator (или иллюстратор-фрилансер, 3–10 тыс. ₽). Генерация даёт концепт, а не финальный ассет: нужны чистые контуры, точные цвета палитры и одинаковые пропорции.
4. Анимации — Lottie (бесплатно, работает на всех платформах) или Rive (интерактивные состояния). Делаются из векторных слоёв.

### Список ассетов

| № | Ассет | Количество | Формат и размеры | Куда идёт |
|---|---|---|---|---|
| Б1 | **Маскот Бал**: лист персонажа (анфас, ¾, профиль, спина) | 1 лист | SVG + PNG 2048 | Референс для всего |
| Б2 | Эмоции маскота: приветствие, думает, нашла, уточняет, не нашла, праздник, ночь, ошибка сети, загрузка, напоминание, достижение, спасибо | 12 | SVG + PNG 1024, прозрачный фон | Гид, пустые состояния, онбординг |
| Б3 | Анимации: полёт по спирали (загрузка), «нашла», «не нашла» | 3 | Lottie JSON (≤ 150 КБ) | Веб, iOS, Android |
| Б4 | Стикерпак Telegram | 12 | PNG/WebP 512 × 512 (анимированные — по желанию, TGS из Lottie) | Бот, вирусность |
| Б5 | Иллюстрации 7 категорий | 7 × 2 | SVG + PNG: 1600 × 900 и 1080 × 1080 | Обложки событий без фото |
| Б6 | Пустые состояния: ничего не найдено, офлайн, ошибка, нет избранного, событие отменено, первый запуск | 6 | SVG 400 × 300 | Все каналы |
| Б7 | Онбординг | 3 | SVG / PNG 1170 × 1600 | Приложения, Mini App |
| Б8 | Иконка приложения | 1 | iOS: слои для Icon Composer (фон + передний план). Android: adaptive icon (передний план и фон 432 × 432, безопасная зона 66 %) + монохромная версия | Сторы |
| Б9 | Аватар бота, favicon, иконки PWA | — | 640 × 640, SVG, 192/512 | Telegram, веб |
| Б10 | Бесшовный паттерн орнамента (ҡусҡар + ромб) | 2 | SVG tile | Фоны, сторис, OG |
| Б11 | Шаблон OG-картинки и сторис-карточки события | 2 | Figma-шаблон 1200 × 630 и 1080 × 1920 | Шеринг (генерируется кодом) |
| Б12 | Обложка и визуалы презентации | 1 комплект | 16:9 | Защита |

### Запреты для всех ассетов

Без жёлто-чёрных полос (ассоциация с «Билайном»). Без флага, герба и семилепесткового цветка в круге (госсимволика). Без текста внутри картинок (тексты — в коде, на двух языках). Без узнаваемых лиц реальных людей.

### Промпты

**Б1. Маскот — лист персонажа (Midjourney v7 / Recraft, EN):**

```
Character design turnaround sheet of a friendly cartoon honeybee mascot for a cultural events app
from Bashkortostan. Warm amber-honey body (#F4A51C), absolutely no black stripes — instead a thin
coral-red (#B8322A) belt decorated with a geometric Bashkir "kuskar" spiral ornament. Translucent
wings with fine rhombus-shaped veins. Big curious kind eyes, small gentle smile, tiny optional
coral scarf. Flat vector illustration, clean geometric shapes, soft subtle gradients, rounded
outlines, limited palette: honey amber, coral red, meadow green (#2F7A4B), cream (#F6F0E4),
dark velvet brown (#16120F). Views: front, three-quarter, side, back. Plain cream background,
no text, no logos. --ar 3:2 --style raw --v 7
```

**Б1. То же для Kandinsky / Шедеврума (RU):**

```
Лист персонажа: дружелюбная мультяшная пчела-талисман для приложения-афиши культуры Башкортостана.
Тело тёплого медового янтарного цвета, без чёрных полос; вместо полос — тонкий коралловый поясок
с геометрическим башкирским орнаментом-завитком «кускар». Прозрачные крылья с прожилками-ромбами.
Большие добрые любопытные глаза, лёгкая улыбка. Плоская векторная иллюстрация, чистые геометричные
формы, мягкие градиенты, скруглённые контуры. Палитра: мёд, коралл, луговой зелёный, кремовый,
тёмно-коричневый. Ракурсы: анфас, три четверти, профиль, со спины. Однотонный кремовый фон, без текста.
```

**Б2. Эмоции (с референсом выбранного маскота):**

```
The same honeybee mascot (use reference), sticker sheet of 12 emotions in a 4x3 grid:
waving hello; thinking while circling; holding a small event ticket card proudly (found it);
head tilt with a question mark made of rhombuses (asking); shrugging but offering a card
(not found, alternative); celebrating with rhombus confetti; sleeping in a honeycomb cell (night);
searching for signal with a tiny antenna (offline); flying along a spiral trail (loading);
ringing a small bell (reminder); holding a round ornament medallion (achievement);
hand on heart (thank you). Consistent proportions, flat vector, same palette, cream background,
no text. --oref <URL выбранного маскота> --ar 4:3 --style raw --v 7
```

**Б5. Иллюстрации категорий (шаблон; подставить строку из таблицы):**

```
Flat geometric vector illustration for the "{CATEGORY}" category of a cultural events app:
{SUBJECT}. Built from Bashkir ornament motifs (kuskar spirals, rhombuses, tree of life),
dominant color {HEX} with honey amber (#E8A92E) and cream (#F6F0E4) accents on dark velvet
(#16120F) background. Minimal, elegant, poster-like, generous negative space. No people faces,
no text, no flags, no emblems. --ar 16:9 --style raw --v 7
```

| Категория | {HEX} | {SUBJECT} |
|---|---|---|
| Театр | #B8322A | two theatre masks formed from mirrored spiral ornaments, stage curtain of rhombus pattern |
| Музыка | #2E64A8 | a kurai reed flute emitting sound waves shaped as spirals |
| Музеи и выставки | #8F6209 | a rhombus-shaped gallery frame with an abstract ornament artwork inside |
| Детям | #A84A14 | a playful sun made of spirals, small paper birds, building blocks with ornament |
| Народная культура | #2F7A4B | a stylized tree of life with yurt silhouette and horse made of ornament lines |
| Кино | #6B3A6E | a film strip with rhombus frames, projector light beam of spirals |
| Лекции и встречи | #1F6B70 | an open book whose pages turn into heart-shaped ornament motifs |

**Б10. Паттерн:**

```
Seamless tileable pattern of Bashkir geometric ornament: interlocking kuskar spirals and
rhombuses, mirror symmetry, two-color: coral (#B8322A) on cream (#F6F0E4). Flat vector,
crisp lines, no shading, no text. --tile --ar 1:1 --style raw --v 7
```

**Б8. Иконка приложения:**

```
Mobile app icon: a bold rhombus with one corner cut as a spiral kuskar curl, inside it a minimal
honeybee silhouette in amber (#F4A51C) on coral (#B8322A) background, flat, geometric,
centered, high contrast, no text, readable at small sizes. --ar 1:1 --style raw --v 7
```

### Приёмка ассетов

- [ ] Цвета совпадают с токенами из 07-design §4 (проверить пипеткой).
- [ ] Маскот одинаков во всех 12 эмоциях: пропорции, цвета, поясок.
- [ ] Все SVG чистые (без растровых вставок), подписаны по шаблону `mascot-<emotion>.svg`, `category-<code>-16x9.svg`.
- [ ] Ассеты лежат в `packages/design-tokens/assets/` (агенты подключат их во все платформы).

## Блок В. Защита (10–15.11)

- [ ] **В1.** Презентация по 14-pitch (вы + дизайнер). Черновик — к 11.11.
- [ ] **В2.** Две генеральные репетиции с таймером: 12.11 и утром 15.11.
- [ ] **В3.** Резервное демо-видео 2–3 минуты — записать вечером 14.11.
- [ ] **В4.** Подготовить устройства: заряжены, нужные аккаунты залогинены, приложения установлены, демо-данные свежие.

## Блок Г. После хакатона (если министерство заинтересовано)

- [ ] Письмо министерства на partners@team.culture.ru о партнёрском доступе к API PRO.Культура.
- [ ] Предложить министерству приказ учреждениям: отмечать отмены и переносы в PRO.Культура или кабинете в течение 2 часов.
- [ ] Шаблон соглашения о правах на изображения с учреждениями.
- [ ] Договоры или ключи: QuickTickets, Radario, Яндекс Афиша (статус инфопартнёра + API), Kassir (партнёрские ссылки).
- [ ] Верификация бизнес-профиля VK (иначе 10 000 вызовов API в месяц).
- [ ] Юридические решения: статус системы (ГИС или иная ИС), оператор ПДн, схема Telegram-бота по 41-ФЗ, уведомление РКН.
- [ ] Заявка в Минцифры РБ о включении домена в региональный «белый список» на время отключений мобильного интернета.
- [ ] Если логотип будет содержать элементы госсимволики — экспертиза в Комиссии по госсимволике РБ (лучше не содержать).
- [ ] Аккаунты App Store, Google Play и RuStore — на министерство или подведомственное учреждение.
- [ ] Регистрация продукта в реестре российского ПО.
