export const meta = {
  name: 'jury-loop',
  description: 'Цикл этапа: жюри → исправления → повторное жюри, пока гейт не пройден (не более maxRounds раундов)',
  whenToUse: 'Когда реализация этапа завершена и нужно довести его до гейта. args: {milestone, scope, maxRounds?, startRound?, jurors?, gate?}',
  phases: [
    { title: 'Review', detail: 'вложенный сценарий jury-review' },
    { title: 'Fix', detail: 'исполнитель закрывает подтверждённые blocker и major' },
  ],
}

const A = args || {}
const maxRounds = A.maxRounds || 3
let round = A.startRound || 1
const history = []

while (round <= maxRounds) {
  phase('Review')
  const res = await workflow('jury-review', { ...A, round })
  if (!res) { log('jury-review не вернул результат — остановка'); break }
  history.push(res)
  log(`Раунд ${round}: ${res.pass ? 'гейт пройден' : `blocker ${res.blockers}, major ${res.majors}, ниже порога: ${res.lowScores.join(', ') || 'нет'}`}`)
  if (res.pass) break
  if (round === maxRounds) { log(`Лимит ${maxRounds} раундов исчерпан — решение за владельцем продукта`); break }

  phase('Fix')
  await agent(`Ты исполнитель этапа ${A.milestone}. Закрой замечания жюри из ${res.reportPath} и задачи из ${res.backlogPath}.
Порядок: все подтверждённые blocker → major → (если осталось время) minor из того же модуля.
Для каждого исправления: сначала тест, который воспроизводит проблему (красный), затем исправление (зелёный).
Работай по правилам CLAUDE.md. После всех исправлений запусти \`make check\` — он должен быть зелёным.
В конце допиши в ${res.reportPath} раздел «Исправлено в раунде ${round}»: что сделано по каждому замечанию (коммит/файлы) и что сознательно отложено с причиной.
Отметь закрытые задачи в ${res.backlogPath}.
Верни краткую сводку: сколько закрыто, что отложено, статус make check.`,
    { label: `fix:r${round}`, phase: 'Fix' })
  round++
}

const last = history[history.length - 1] || null
return {
  milestone: A.milestone,
  rounds: history.length,
  pass: !!(last && last.pass),
  history: history.map((h) => ({ round: h.round, pass: h.pass, scores: h.scores, blockers: h.blockers, majors: h.majors, report: h.reportPath })),
  needsHuman: !(last && last.pass),
}
