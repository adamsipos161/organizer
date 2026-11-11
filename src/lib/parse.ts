// Rýchle zadávanie v slovenčine – bez AI, priamo v prehliadači.
// Príklady: „zajtra o 10 stretnutie s Radom #swan“, „pripraviť TZ do piatku #swan !“,
// „budúci štvrtok od 14 do 15:30 natáčanie #studio“, „15.12. faktúry“.
import { addDays, diffDays, formatDayLong, isValidDay, dayOf, today as todayFn, weekday } from './dates'

export interface ProjectRef { id: string; name: string; archived?: boolean }

export interface Parsed {
  kind: 'task' | 'meeting'
  title: string
  projectId: string | null
  projectName: string | null
  day: string | null
  start: { hh: number; mm: number } | null
  end: { hh: number; mm: number } | null
  durationMin: number | null
  priority: number
  needsTime: boolean
  /** ďalší možný výklad dátumu (napr. „budúci štvrtok“ = tento alebo ďalší týždeň) */
  alternative: { day: string; label: string } | null
  notes: string[]
}

export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const WEEKDAY_WORDS: Record<string, number> = {
  pondelok: 1, pondelka: 1, utorok: 2, utorka: 2, streda: 3, stredu: 3, stredy: 3,
  stvrtok: 4, stvrtka: 4, piatok: 5, piatka: 5, piatku: 5, sobota: 6, sobotu: 6, soboty: 6,
  nedela: 0, nedelu: 0, nedele: 0,
}
const MONTH_WORDS: Record<string, number> = {
  januara: 1, januar: 1, februara: 2, februar: 2, marca: 3, marec: 3, aprila: 4, april: 4,
  maja: 5, maj: 5, juna: 6, jun: 6, jula: 7, jul: 7, augusta: 8, august: 8,
  septembra: 9, september: 9, oktobra: 10, oktober: 10, novembra: 11, november: 11, decembra: 12, december: 12,
}
const NUM_WORDS: Record<string, number> = { jeden: 1, jedna: 1, dva: 2, dve: 2, tri: 3, styri: 4, pat: 5, sest: 6, sedem: 7 }
const has = (o: object, k: string | undefined) => k !== undefined && Object.prototype.hasOwnProperty.call(o, k)
const PREPS = new Set(['v', 'vo', 'do', 'na', 'dna', 'od', 'cez', 'tento', 'tuto', 'tohto'])
const NEXT_WORDS = new Set(['buduci', 'buducu', 'buduca', 'buduceho', 'nasledujuci', 'nasledujucu', 'dalsi', 'dalsiu'])
const MEETING_WORDS = /^(stretnutie|stretnutia|stretko|meeting|meet|call|hovor|porada|poradu|schodzka|schodzku|obed|vecera|veceru|rozhovor|natacanie|konzultacia|konzultaciu|prezentacia|prezentaciu|workshop|termin u|u lekara|lekar|zubar)$/
const DAY_UNITS = /^(den|dni|dna|dnoch)$/
const WEEK_UNITS = /^(tyzden|tyzdne|tyzdnov|tyzdna)$/

function parseClock(tok: string): { hh: number; mm: number } | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(?:h|hod)?$/.exec(tok)
  if (!m) return null
  const hh = +m[1], mm = m[2] ? +m[2] : 0
  if (hh > 23 || mm > 59) return null
  return { hh, mm }
}

/** Najbližší výskyt dňa v týždni od dnes (vrátane dnes) */
function nextWeekday(from: string, wd: number): string {
  const diff = (wd - weekday(from) + 7) % 7
  return addDays(from, diff)
}

export function parseQuick(input: string, projects: ProjectRef[], now: Date = new Date(), today: string = todayFn()): Parsed {
  const raw = input.trim().split(/\s+/).filter(Boolean)
  const toks = raw.map(norm)
  const used = new Array(raw.length).fill(false)
  const res: Parsed = {
    kind: 'task', title: '', projectId: null, projectName: null, day: null, start: null, end: null,
    durationMin: null, priority: 0, needsTime: false, alternative: null, notes: [],
  }
  const mark = (...idx: number[]) => idx.forEach(i => { if (i >= 0 && i < used.length) used[i] = true })
  const markPrep = (i: number) => { if (i >= 0 && !used[i] && PREPS.has(toks[i])) used[i] = true }
  let meetingHint = false
  let deadlineHint = false

  for (let i = 0; i < toks.length; i++) {
    if (used[i]) continue
    const t = toks[i]
    const t1 = toks[i + 1] ?? ''
    const t2 = toks[i + 2] ?? ''

    // #projekt
    if (t.startsWith('#') && t.length > 1) {
      const tag = t.slice(1).replace(/[^a-z0-9]/g, '')
      const cands = projects.filter(p => !p.archived)
      const p = cands.find(p => norm(p.name).replace(/[^a-z0-9]/g, '') === tag)
        ?? cands.find(p => norm(p.name).replace(/[^a-z0-9]/g, '').startsWith(tag))
        ?? cands.find(p => norm(p.name).split(/[^a-z0-9]+/).some(w => w && w.startsWith(tag)))
      if (p) { res.projectId = p.id; res.projectName = p.name }
      else res.notes.push(`Projekt „${raw[i]}“ neexistuje – úloha pôjde do Inboxu.`)
      mark(i); continue
    }
    // priorita
    if (/^!{1,3}$/.test(t)) { res.priority = 3; mark(i); continue }

    if (MEETING_WORDS.test(t)) meetingHint = true

    // relatívne dni
    if (t === 'dnes' || t === 'dneska') { res.day = today; mark(i); markPrep(i - 1); continue }
    if (t === 'zajtra') { res.day = addDays(today, 1); mark(i); markPrep(i - 1); continue }
    if (t === 'pozajtra') { res.day = addDays(today, 2); mark(i); markPrep(i - 1); continue }

    // „o týždeň“, „o 3 dni“, „o 2 týždne“, „za týždeň“
    if ((t === 'o' || t === 'za') && WEEK_UNITS.test(t1)) { res.day = addDays(today, 7); mark(i, i + 1); continue }
    if ((t === 'o' || t === 'za') && (/^\d+$/.test(t1) || has(NUM_WORDS, t1)) && (DAY_UNITS.test(t2) || WEEK_UNITS.test(t2))) {
      const n = /^\d+$/.test(t1) ? +t1 : NUM_WORDS[t1]
      res.day = addDays(today, WEEK_UNITS.test(t2) ? 7 * n : n); mark(i, i + 1, i + 2); continue
    }
    // „budúci týždeň“ (bez dňa) = pondelok budúceho týždňa
    if (NEXT_WORDS.has(t) && WEEK_UNITS.test(t1) && !has(WEEKDAY_WORDS, toks[i + 2]) && !has(WEEKDAY_WORDS, toks[i + 3])) {
      res.day = addDays(today, 7 - ((weekday(today) + 6) % 7)); mark(i, i + 1); markPrep(i - 1)
      res.notes.push('„Budúci týždeň“ = pondelok budúceho týždňa.')
      continue
    }
    // „budúci štvrtok“, „budúci týždeň v piatok“, „v piatok“, „do piatku“
    if (has(WEEKDAY_WORDS, t) || (NEXT_WORDS.has(t) && (has(WEEKDAY_WORDS, t1) || (WEEK_UNITS.test(t1) && (has(WEEKDAY_WORDS, toks[i + 2]) || has(WEEKDAY_WORDS, toks[i + 3])))))) {
      let j = i, next = false
      if (NEXT_WORDS.has(t)) {
        next = true; j = i + 1
        if (WEEK_UNITS.test(toks[j])) { j++; if (PREPS.has(toks[j])) j++ }
      }
      const wd = WEEKDAY_WORDS[toks[j]]
      if (wd === undefined) continue
      const prev = toks[i - 1]
      if (prev === 'do') deadlineHint = true
      const upcoming = nextWeekday(today, wd)
      if (next) {
        const mondayNext = addDays(today, 7 - ((weekday(today) + 6) % 7))
        res.day = addDays(mondayNext, (wd + 6) % 7)
        if (upcoming !== res.day && diffDays(today, upcoming) > 0) {
          res.alternative = { day: upcoming, label: formatDayLong(upcoming) }
        }
      } else {
        res.day = upcoming
        res.alternative = { day: addDays(upcoming, 7), label: formatDayLong(addDays(upcoming, 7)) }
      }
      for (let k = i; k <= j; k++) mark(k)
      markPrep(i - 1)
      continue
    }
    // 15.11. / 15.11.2026 / 15/11 / 15. 11. / 15. novembra
    {
      let d: number | null = null, mo: number | null = null, y: number | null = null, span = 0
      let m = /^(\d{1,2})[./](\d{1,2})[./]?(\d{4})?$/.exec(t)
      if (m && !/^\d{1,2}[.:]\d{2}$/.test(t)) { d = +m[1]; mo = +m[2]; y = m[3] ? +m[3] : null; span = 1 }
      else if (/^\d{1,2}\.$/.test(t) && /^\d{1,2}\.(\d{4})?$/.test(t1)) {
        d = parseInt(t); mo = parseInt(t1); const yy = /\.(\d{4})$/.exec(t1); y = yy ? +yy[1] : null; span = 2
        if (!y && /^\d{4}$/.test(t2)) { y = +t2; span = 3 }
      } else if (/^\d{1,2}\.?$/.test(t) && has(MONTH_WORDS, t1)) {
        d = parseInt(t); mo = MONTH_WORDS[t1]; span = 2
        if (/^\d{4}$/.test(t2)) { y = +t2; span = 3 }
      }
      // „o 10.30“ nie je dátum
      if (span && toks[i - 1] === 'o' && span === 1 && !y) span = 0
      if (span && d && mo) {
        let year = y ?? +today.slice(0, 4)
        let day = dayOf(year, mo, d)
        if (!y && isValidDay(day) && day < today) { year++; day = dayOf(year, mo, d) }
        if (isValidDay(day)) {
          res.day = day
          if (toks[i - 1] === 'do') deadlineHint = true
          for (let k = 0; k < span; k++) mark(i + k)
          markPrep(i - 1)
          continue
        }
      }
    }
    // čas: „od 10 do 11:30“, „10-11“, „o 10“, „o 10:30“, „10:30“, „o 7 večer“
    if (t === 'od' && parseClock(t1) && toks[i + 2] === 'do' && parseClock(toks[i + 3] ?? '')) {
      res.start = parseClock(t1); res.end = parseClock(toks[i + 3]); mark(i, i + 1, i + 2, i + 3); continue
    }
    {
      const range = /^(\d{1,2}(?:[:.]\d{2})?)-(\d{1,2}(?:[:.]\d{2})?)$/.exec(t)
      if (range && parseClock(range[1]) && parseClock(range[2]) && (range[1].includes(':') || range[2].includes(':') || toks[i - 1] === 'o' || toks[i - 1] === 'od')) {
        res.start = parseClock(range[1]); res.end = parseClock(range[2]); mark(i); markPrep(i - 1); if (toks[i - 1] === 'o') mark(i - 1); continue
      }
    }
    if (t === 'o' && parseClock(t1) && !DAY_UNITS.test(t2) && !WEEK_UNITS.test(t2)) {
      const c = parseClock(t1)!
      mark(i, i + 1)
      if (/^(vecer|poobede|popoludni|podvecer)$/.test(t2) && c.hh < 12) { c.hh += 12; mark(i + 2) }
      else if (/^(rano|dopoludnia|doobeda)$/.test(t2)) mark(i + 2)
      res.start = c; continue
    }
    if (/^\d{1,2}:\d{2}$/.test(t) || /^\d{1,2}(h|hod)$/.test(t)) {
      const c = parseClock(t)
      if (c) { res.start = c; mark(i); if (toks[i - 1] === 'o' || toks[i - 1] === 'od') mark(i - 1); continue }
    }
    // dĺžka: „na 30 min“, „na 2 hodiny“, „na hodinu“, „na pol hodiny“, „na 1,5 h“
    if (t === 'na') {
      if (t1 === 'hodinu') { res.durationMin = 60; mark(i, i + 1); continue }
      if (t1 === 'pol' && /^hod/.test(t2)) { res.durationMin = 30; mark(i, i + 1, i + 2); continue }
      const n = /^(\d+(?:[.,]\d+)?)$/.exec(t1)
      if (n && /^(min|minut|minuty|minutu)$/.test(t2)) { res.durationMin = Math.round(+n[1].replace(',', '.')); mark(i, i + 1, i + 2); continue }
      if (n && /^(h|hod|hodinu|hodiny|hodin)$/.test(t2)) { res.durationMin = Math.round(+n[1].replace(',', '.') * 60); mark(i, i + 1, i + 2); continue }
    }
  }

  // stretnutie vs. úloha
  if (res.start) res.kind = 'meeting'
  else if (meetingHint && !deadlineHint) { res.kind = 'meeting'; res.needsTime = true }

  if (res.kind === 'meeting' && res.start && !res.day) {
    // čas bez dňa: dnes, ak ešte neprešiel; inak zajtra
    const nowMin = (() => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bratislava', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).split(':'); return +p[0] * 60 + +p[1] })()
    if (res.start.hh * 60 + res.start.mm <= nowMin) { res.day = addDays(today, 1); res.notes.push('Čas dnes už prešiel – navrhujem zajtra.') }
    else res.day = today
  }
  if (res.kind === 'meeting' && !res.day) res.day = today
  if (res.end && res.start) {
    const a = res.start.hh * 60 + res.start.mm, b = res.end.hh * 60 + res.end.mm
    if (b > a) res.durationMin = b - a
    else { res.end = null; res.notes.push('Koniec je skôr ako začiatok – použijem predvolenú dĺžku.') }
  }

  // názov = nevyužité slová
  let title = raw.filter((_, k) => !used[k]).join(' ')
    .replace(/\s+([,.;:])/g, '$1').replace(/^[,.;:\-–\s]+|[,.;:\-–\s]+$/g, '').trim()
  // osamotené predložky na konci („stretnutie s Radom v“)
  title = title.replace(/\s+(v|vo|do|na|o|od|s|so|k|ku)$/i, '').trim()
  res.title = title ? title.charAt(0).toUpperCase() + title.slice(1) : ''
  return res
}
