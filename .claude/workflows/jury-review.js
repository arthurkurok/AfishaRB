export const meta = {
  name: 'jury-review',
  description: 'Жюри этапа: присяжные оценивают параллельно, скептик перепроверяет blocker/major, итоговый отчёт и решение по гейту',
  whenToUse: 'Перед чек-пойнтом хакатона (PREP, CP1–CP3, DEFENSE) или после этапа M0–M7. args: {milestone, round, scope, jurors?, gate?}',
  phases: [
    { title: 'Jury', detail: 'каждый присяжный оценивает этап по своей рубрике' },
    { title: 'Verify', detail: 'скептик пытается опровергнуть каждый blocker и major' },
    { title: 'Report', detail: 'сведение, дедупликация, бэклог, решение по гейту' },
  ],
}

// ---- Параметры ----
const A = args || {}
const milestone = A.milestone || 'adhoc'
const round = A.round || 1
const scope = A.scope || 'Всё, что изменено с момента прошлого отчёта жюри по этому этапу (см. git log и jury/reports/).'
const minScore = (A.gate && A.gate.minScore) || 8
const maxMajors = (A.gate && A.gate.maxMajors != null) ? A.gate.maxMajors : 3

// Состав жюри по этапам — единый источник истины (docs/12-dev-loop-jury.md ссылается сюда).
const PANELS = {
  // Хакатон «Кибер 102», 13–15.11.2026 — перед каждым официальным чек-пойнтом
  PREP: ['jury-architect', 'jury-ux', 'jury-ai', 'jury-ministry'],
  CP1: ['jury-ministry', 'jury-data', 'jury-architect'],
  CP2: ['jury-ai', 'jury-ux', 'jury-personas', 'jury-security'],
  CP3: ['jury-contest', 'jury-ministry', 'jury-mobile', 'jury-a11y'],
  DEFENSE: ['jury-contest', 'jury-ministry', 'jury-personas', 'jury-ai'],
  // Доведение до промышленной эксплуатации после хакатона
  M0: ['jury-architect', 'jury-ux', 'jury-ministry'],
  M1: ['jury-data', 'jury-architect', 'jury-security', 'jury-ministry'],
  M2: ['jury-ux', 'jury-a11y', 'jury-architect', 'jury-ministry', 'jury-personas'],
  M3: ['jury-ai', 'jury-ux', 'jury-security', 'jury-personas', 'jury-contest'],
  M4: ['jury-mobile', 'jury-ux', 'jury-a11y', 'jury-personas'],
  M5: ['jury-ministry', 'jury-data', 'jury-security', 'jury-ux', 'jury-personas'],
  M6: ['jury-security', 'jury-a11y', 'jury-architect', 'jury-mobile', 'jury-ministry'],
  M7: ['jury-contest', 'jury-ministry', 'jury-personas'],
  FINAL: ['jury-ministry', 'jury-contest', 'jury-ux', 'jury-architect', 'jury-ai',
          'jury-data', 'jury-security', 'jury-a11y', 'jury-mobile', 'jury-personas'],
}
const jurors = A.jurors || PANELS[milestone] || PANELS.FINAL
const prevReport = round > 1 ? `jury/reports/${milestone}-r${round - 1}.md` : null

// ---- Схемы ----
const FINDING = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
    area: { type: 'string', description: 'модуль/экран/канал' },
    evidence: { type: 'string', description: 'путь:строка, команда+вывод или шаги воспроизведения' },
    recommendation: { type: 'string' },
  },
  required: ['title', 'severity', 'area', 'evidence', 'recommendation'],
}
const JUROR = {
  type: 'object',
  properties: {
    score: { type: 'number', minimum: 0, maximum: 10 },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, score: { type: 'number' }, comment: { type: 'string' } },
        required: ['name', 'score', 'comment'],
      },
    },
    findings: { type: 'array', items: FINDING },
    strengths: { type: 'array', items: { type: 'string' } },
    prevFixedCheck: { type: 'string', description: 'какие замечания прошлого раунда из твоей зоны закрыты, какие нет' },
    summary: { type: 'string' },
  },
  required: ['score', 'criteria', 'findings', 'strengths', 'summary'],
}
const VERDICT = {
  type: 'object',
  properties: {
    confirmed: { type: 'boolean' },
    adjustedSeverity: { type: 'string', enum: ['blocker', 'major', 'minor', 'invalid'] },
    reason: { type: 'string' },
  },
  required: ['confirmed', 'adjustedSeverity', 'reason'],
}

// ---- Промпты ----
const jurorPrompt = (j) => `Этап: ${milestone}, раунд ${round}.
Объём проверки: ${scope}
${prevReport ? `Отчёт прошлого раунда: ${prevReport}. Отметь в prevFixedCheck, какие замечания из твоей зоны закрыты.` : ''}
Оцени этап как ${j} по своей рубрике и шкале jury/RUBRIC.md. Выполни весь легворк из своей роли.
Каждое замечание — с доказательством (путь:строка, команда и вывод, или шаги воспроизведения).`

const verifyPrompt = (f, j) => `Присяжный ${j} нашёл замечание на этапе ${milestone}:
Заголовок: ${f.title}
Серьёзность: ${f.severity}
Область: ${f.area}
Доказательство: ${f.evidence}

Твоя задача — попытаться ОПРОВЕРГНУТЬ его. Сам проверь доказательство в репозитории (открой файл, запусти команду).
Замечание подтверждается, только если ты воспроизвёл проблему сам. Если серьёзность завышена или занижена по jury/RUBRIC.md — укажи верную в adjustedSeverity.
Если доказательство не воспроизводится — confirmed=false, adjustedSeverity=invalid. Файлы проекта не изменяй.`

// ---- Жюри → проверка (конвейер: каждый присяжный идёт на проверку, не дожидаясь остальных) ----
log(`Этап ${milestone}, раунд ${round}. Жюри: ${jurors.join(', ')}`)

const results = await pipeline(
  jurors,
  (j) => agent(jurorPrompt(j), { label: j, phase: 'Jury', agentType: j, schema: JUROR }),
  (review, j) => {
    if (!review) return null
    const serious = review.findings.filter((f) => f.severity !== 'minor')
    return parallel(serious.map((f, i) => () =>
      agent(verifyPrompt(f, j), { label: `verify:${j}:${i + 1}`, phase: 'Verify', schema: VERDICT })
        .then((v) => ({ ...f, verdict: v }))
    )).then((verified) => ({
      juror: j,
      ...review,
      verified: verified.filter(Boolean),
      minors: review.findings.filter((f) => f.severity === 'minor'),
    }))
  },
)

const panel = results.filter(Boolean)
const missing = jurors.filter((j) => !panel.find((p) => p.juror === j))
if (missing.length) log(`Не ответили присяжные: ${missing.join(', ')} — гейт не может быть пройден`)

// ---- Детерминированный гейт ----
const confirmed = panel.flatMap((p) => p.verified
  .filter((f) => f.verdict && f.verdict.confirmed && f.verdict.adjustedSeverity !== 'invalid')
  .map((f) => ({ ...f, juror: p.juror, finalSeverity: f.verdict.adjustedSeverity })))
const blockers = confirmed.filter((f) => f.finalSeverity === 'blocker')
const majors = confirmed.filter((f) => f.finalSeverity === 'major')
const scores = Object.fromEntries(panel.map((p) => [p.juror, p.score]))
const lowScores = panel.filter((p) => p.score < minScore).map((p) => p.juror)
const pass = missing.length === 0 && lowScores.length === 0 && blockers.length === 0 && majors.length <= maxMajors

log(`Гейт: ${pass ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'} · blocker ${blockers.length} · major ${majors.length} · ниже ${minScore}: ${lowScores.join(', ') || 'нет'}`)

// ---- Отчёт (нужны все присяжные сразу → барьер оправдан) ----
phase('Report')
const reportPath = `jury/reports/${milestone}-r${round}.md`
await agent(`Составь отчёт жюри и запиши его в ${reportPath} строго по разделу «Отчёт раунда» из jury/RUBRIC.md.
Затем обнови бэклог jury/backlog/${milestone}.md: добавь каждое подтверждённое blocker/major как задачу с чекбоксом, приоритетом, областью и ссылкой на отчёт (существующие задачи не удаляй, закрытые отмечай [x], если присяжные подтвердили закрытие в prevFixedCheck).
Объедини дубли между присяжными (одна проблема, найденная двумя присяжными, — одна задача с двумя источниками).

Решение по гейту (уже вычислено, не пересчитывай): ${pass ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}.
Порог: каждый ≥ ${minScore}, blocker = 0, major ≤ ${maxMajors}. Не ответили: ${missing.join(', ') || 'нет'}.

Данные жюри (JSON):
${JSON.stringify({ milestone, round, scores, blockers, majors, panel }, null, 1)}

Верни одну строку: путь к отчёту.`, { label: 'report', phase: 'Report' })

return {
  milestone, round, pass, scores,
  blockers: blockers.length, majors: majors.length,
  lowScores, missing, reportPath,
  backlogPath: `jury/backlog/${milestone}.md`,
}
