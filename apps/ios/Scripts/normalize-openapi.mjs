#!/usr/bin/env node
// Нормализация packages/contract/openapi.json для swift-openapi-generator.
//
// Контракт экспортируется из zod (OpenAPI 3.1) и не меняется отсюда — мы детерминированно
// преобразуем копию, чтобы генератор дал удобные и устойчивые к эволюции API типы:
//   1. operationId: в контракте их нет, генератор без них именует операции по пути
//      (`get_sol_v1_sol_occurrences`) — даём человеческие имена.
//   2. Повторяющиеся inline-схемы выносятся в components.schemas (OccurrenceCard, EventSummary…):
//      zod разворачивает все ссылки, и без этого одна сущность превращается в десятки
//      несовместимых вложенных типов.
//   3. `anyOf: [X, {type: null}]` → X без обязательности (в Swift — Optional): генератор
//      иначе строит обёртку anyOf с полями value1/value2.
//   4. `prefixItems` (кортеж [lat, lon]) → массив чисел из двух элементов: OpenAPIKit
//      не поддерживает prefixItems.
//   5. `additionalProperties: false` убирается: генератор с ним бросает ошибку декодирования
//      на любом новом поле ответа, и старые версии приложения ломаются при эволюции API.
//   6. `enum: [true]` у булевых полей и `propertyNames` убираются — генератор их не понимает.
//
// Запуск: node Scripts/normalize-openapi.mjs <in.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("Использование: normalize-openapi.mjs <in.json> <out.json>");
  process.exit(2);
}

const spec = JSON.parse(readFileSync(input, "utf8"));
const warnings = [];

/** Имена операций по методу и пути. Неизвестные пути получают имя из сегментов пути. */
const OPERATION_IDS = {
  "get /v1/occurrences": "searchOccurrences",
  "get /v1/events/{id}": "getEvent",
  "get /v1/categories": "listCategories",
  "get /v1/municipalities": "listMunicipalities",
  "get /v1/stats": "getStats",
  "post /v1/reports": "createReport",
  "get /feeds/ical": "getICalFeed",
  "get /feeds/rss": "getRSSFeed",
  "post /v1/assistant": "askAssistant",
  "get /v1/assistant/status": "getAssistantStatus",
};

/**
 * Имена схем по набору свойств объекта (отсортированные ключи через запятую).
 * Если форма объекта в контракте поменяется, скрипт предупредит, а тип останется вложенным.
 */
const OBJECT_NAMES = {
  "address,geo,id,municipality,municipality_id,name": "VenueRef",
  "author,color,height,license,source,url,width": "Image",
  "currency,is_free,max,min": "Price",
  "age_rating,categories,id,image,organization,price,pushkin_card,summary,tags,title": "EventSummary",
  "availability,distance_km,ends_at,event,freshness,id,is_range,more_dates,previous_starts_at,reasons,starts_at,status,status_reason,ticket_url,venue":
    "OccurrenceCard",
  "availability,distance_km,ends_at,freshness,id,is_range,more_dates,previous_starts_at,reasons,starts_at,status,status_reason,ticket_url,venue":
    "OccurrenceSession",
  "applied,items,next_cursor,total": "SearchResult",
  "date_from,date_to,timezone": "AppliedRange",
  "detail,status,title,type": "Problem",
  "code,color,count,title": "Category",
  "center,id,kind,name,name_ba,name_ru,upcoming": "Municipality",
  "freshness,last_verified_at,sources,trust_level": "Provenance",
  "id,title,url": "ProvenanceSource",
  "at,field,kind,new,old,source,text": "ChangeEntry",
  "accessibility,age_rating,categories,description_html,history,id,image,images,is_permanent,languages,occurrences,organization,price,provenance,pushkin_card,quality_score,source_url,summary,tags,ticket_url,title":
    "EventDetail",
  "events,free_share,municipalities_with_events,pushkin_share,upcoming_occurrences,updated_at,venues": "Stats",
  "comment,event_id,occurrence_id,reason": "ReportRequest",
  "ok": "ReportAccepted",
  "conversation_id,event_id,lang,municipality_id,near,patch,text": "AssistantRequest",
  "chips,clarify,conversation_id,followups,kind,mode,picks,relaxed,slots,text": "AssistantResponse",
  "label,slot,source": "SlotChip",
  "id,label,patch": "QuickReply",
  "options,question,slot": "Clarify",
  "occurrence,reason_codes,reason_text": "AssistantPick",
  "accessible,adults,budget,budget_per,categories,date_from,date_label,date_source,date_to,free_only,intent,kids_ages,municipality_id,municipality_label,municipality_source,near_me,pushkin,tags,text,time_of_day,with_kids":
    "Slots",
  "available,providers,spentTokens": "AssistantStatus",
};

/** Имена перечислений по набору значений. */
const ENUM_NAMES = {
  "cinema,education,folk,kids,museum,music,theatre": "CategoryCode",
  "accessible,excursion,family,festival,free,master_class,on_bashkir,outdoor,premiere,pushkin,youth": "TagCode",
  "cancelled,ended,postponed,rescheduled,scheduled,sold_out,unverified": "OccurrenceStatus",
  "available,few_left,sold_out,unknown": "Availability",
  "aggregated,extracted,official,official_plus,partner": "TrustLevel",
  "aging,fresh,stale,vanished": "Freshness",
  "accessible,age_fit,budget_fit,category_match,free,last_chance,near,new,on_bashkir,popular,pushkin,text_match,time_fit": "ReasonCode",
  "date,distance,popular,price,relevance": "SortMode",
  "ba,ru": "Lang",
  "default,inferred,profile,user": "SlotSource",
  "day,evening,morning": "TimeOfDay",
  "month,today,tomorrow,week,weekend": "WhenPreset",
  "city,district": "MunicipalityKind",
  "cancelled,other,wrong_place,wrong_price,wrong_time": "ReportReason",
  "event_question,help,offtopic,plan_day,refine,search,smalltalk": "AssistantIntent",
  "answer,clarify,empty,error,help,offtopic,results": "AssistantKind",
  "llm,rules": "AssistantMode",
  "ticket,total,unknown": "BudgetPer",
};

const components = (spec.components ??= {});
const schemas = (components.schemas ??= {});
const canonical = new Map(); // имя → канонический JSON (проверка, что одно имя — одна форма)

const isNull = (s) => s && typeof s === "object" && (s.type === "null" || (Array.isArray(s.type) && s.type.length === 1 && s.type[0] === "null"));
const stable = (v) =>
  Array.isArray(v)
    ? `[${v.map(stable).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v)
          .filter((k) => k !== "description")
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
          .join(",")}}`
      : JSON.stringify(v);

/** Рекурсивно нормализует схему; возвращает новую схему (возможно — $ref). */
function normalize(schema, path) {
  if (!schema || typeof schema !== "object") return schema;
  let s = { ...schema };

  // 4. Кортежи → массивы
  if (Array.isArray(s.prefixItems)) {
    const itemTypes = [...new Set(s.prefixItems.map((p) => p.type))];
    s.items = itemTypes.length === 1 ? { type: itemTypes[0] } : {};
    s.minItems = s.prefixItems.length;
    s.maxItems = s.prefixItems.length;
    delete s.prefixItems;
  }
  // 5–6. Строгость, которую генератор не переносит
  if (s.additionalProperties === false) delete s.additionalProperties;
  delete s.propertyNames;
  if (s.type === "boolean" && Array.isArray(s.enum)) delete s.enum;

  if (s.anyOf) s.anyOf = s.anyOf.map((x, i) => normalize(x, `${path}/anyOf/${i}`));
  if (s.oneOf) s.oneOf = s.oneOf.map((x, i) => normalize(x, `${path}/oneOf/${i}`));
  if (s.allOf) s.allOf = s.allOf.map((x, i) => normalize(x, `${path}/allOf/${i}`));
  if (s.items) s.items = normalize(s.items, `${path}/items`);
  if (s.additionalProperties && typeof s.additionalProperties === "object")
    s.additionalProperties = normalize(s.additionalProperties, `${path}/additionalProperties`);

  if (s.properties) {
    const required = new Set(s.required ?? []);
    const props = {};
    for (const [key, raw] of Object.entries(s.properties)) {
      let value = raw;
      // 3. anyOf [X, null] → X, поле становится необязательным (Optional в Swift)
      if (Array.isArray(value.anyOf) && value.anyOf.length === 2 && value.anyOf.some(isNull)) {
        const inner = value.anyOf.find((x) => !isNull(x));
        value = { ...inner, ...(value.description ? { description: value.description } : {}) };
        required.delete(key);
      }
      // type: [T, "null"] → T, необязательное поле
      if (Array.isArray(value.type) && value.type.includes("null")) {
        const rest = value.type.filter((t) => t !== "null");
        value = { ...value, type: rest.length === 1 ? rest[0] : rest };
        required.delete(key);
      }
      // z.unknown().nullable() → пустая схема: значение может быть чем угодно, включая null
      if (Array.isArray(value.anyOf) && value.anyOf.length === 0) value = {};
      props[key] = normalize(value, `${path}/properties/${key}`);
    }
    s.properties = props;
    if (required.size) s.required = [...required];
    else delete s.required;
  }

  // 2. Вынос именованных схем в components
  let name;
  if (s.type === "object" && s.properties) {
    const signature = Object.keys(s.properties).sort().join(",");
    name = OBJECT_NAMES[signature];
    if (!name) warnings.push(`безымянный объект ${path}: {${signature}}`);
  } else if (s.type === "string" && Array.isArray(s.enum)) {
    name = ENUM_NAMES[[...s.enum].sort().join(",")];
    if (!name && s.enum.length > 1) warnings.push(`безымянное перечисление ${path}: ${s.enum.join("|")}`);
  }
  if (name) {
    const { description, ...body } = s;
    const key = stable(body);
    const known = canonical.get(name);
    if (known && known !== key) {
      // Та же форма с другими деталями (например, описанием поля): берём первую, предупреждаем
      warnings.push(`схема ${name} встречается в разных вариантах (${path})`);
    }
    if (!known) {
      canonical.set(name, key);
      schemas[name] = body;
    }
    return description ? { $ref: `#/components/schemas/${name}`, description } : { $ref: `#/components/schemas/${name}` };
  }
  return s;
}

for (const [route, ops] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(ops)) {
    if (typeof op !== "object" || !op) continue;
    const key = `${method} ${route}`;
    op.operationId ??=
      OPERATION_IDS[key] ??
      (method +
        route
          .split(/[/{}_-]+/)
          .filter(Boolean)
          .map((p) => p[0].toUpperCase() + p.slice(1))
          .join(""));
    for (const p of op.parameters ?? []) {
      // Параметры-перечисления тоже выносим, чтобы в Swift были общие типы
      p.schema = normalize(p.schema, `${key}/parameters/${p.name}`);
      if (p.schema?.type === "array") {
        // Массивы в query zod принимает как CSV — сериализуем как form без explode: a,b,c
        p.style = "form";
        p.explode = false;
      }
    }
    for (const content of Object.values(op.requestBody?.content ?? {})) {
      content.schema = normalize(content.schema, `${key}/requestBody`);
    }
    for (const [code, response] of Object.entries(op.responses ?? {})) {
      for (const content of Object.values(response.content ?? {})) {
        content.schema = normalize(content.schema, `${key}/responses/${code}`);
      }
    }
  }
}

// Компоненты сортируем по имени — стабильный diff
components.schemas = Object.fromEntries(Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b)));

writeFileSync(output, `${JSON.stringify(spec, null, 2)}\n`);
for (const w of warnings) console.warn(`предупреждение: ${w}`);
console.log(`Нормализовано: ${Object.keys(components.schemas).length} схем → ${output}`);
