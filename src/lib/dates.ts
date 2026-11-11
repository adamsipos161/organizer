// Všetky dátumy a „dnes“ sa vyhodnocujú v časovom pásme Europe/Bratislava,
// nezávisle od pásma zariadenia. Deň = reťazec "YYYY-MM-DD".

export const TZ = 'Europe/Bratislava'

export const WEEKDAYS_SHORT = ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so']
export const WEEKDAYS_LONG = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota']
export const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

interface LocalParts { y: number; m: number; d: number; hh: number; mm: number; ss: number }

export function localParts(date: Date): LocalParts {
  const p: Record<string, string> = {}
  for (const x of partsFmt.formatToParts(date)) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second }
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dayOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** Deň (Bratislava) pre daný okamih */
export function dayString(date: Date): string {
  const p = localParts(date)
  return dayOf(p.y, p.m, p.d)
}

export const today = () => dayString(new Date())

export function isValidDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dayOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

export function addMonths(day: string, n: number): string {
  const [y, m] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  return dayOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1)
}

/** 0 = nedeľa … 6 = sobota */
export function weekday(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Pondelok týždňa, do ktorého deň patrí */
export const startOfWeek = (day: string) => addDays(day, -((weekday(day) + 6) % 7))

export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/** Okamih (UTC) pre miestny čas v Bratislave */
export function zonedToUtc(day: string, hh: number, mm: number): Date {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let ts = guess
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(ts))
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm)
    const delta = guess - asUtc
    if (delta === 0) break
    ts += delta
  }
  return new Date(ts)
}

export function timeOf(iso: string): string {
  const p = localParts(new Date(iso))
  return `${pad(p.hh)}:${pad(p.mm)}`
}

export const dayOfIso = (iso: string) => dayString(new Date(iso))

/** "po 9. 11." alebo s rokom "po 9. 11. 2026" */
export function formatDay(day: string | null | undefined, withYear = false): string {
  if (!day) return '—'
  const [y, m, d] = day.split('-').map(Number)
  const thisYear = +today().slice(0, 4)
  return `${WEEKDAYS_SHORT[weekday(day)]} ${d}. ${m}.${withYear || y !== thisYear ? ` ${y}` : ''}`
}

/** "pondelok 9. novembra" – na overenie výkladu dátumu */
export function formatDayLong(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const thisYear = +today().slice(0, 4)
  return `${WEEKDAYS_LONG[weekday(day)]} ${d}. ${m}.${y !== thisYear ? ` ${y}` : ''}`
}

export function relativeDay(day: string | null | undefined): string {
  if (!day) return ''
  const t = today()
  if (day === t) return 'Dnes'
  if (day === addDays(t, 1)) return 'Zajtra'
  if (day === addDays(t, -1)) return 'Včera'
  return formatDay(day)
}

export function formatDateTime(iso: string): string {
  return `${formatDay(dayOfIso(iso))} ${timeOf(iso)}`
}

export function monthTitle(day: string): string {
  const [y, m] = day.split('-').map(Number)
  const name = MONTHS[m - 1]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}

/** Hodnota pre <input type="time"> ↔ minúty */
export function parseTime(s: string): { hh: number; mm: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const hh = +m[1], mm = +m[2]
  if (hh > 23 || mm > 59) return null
  return { hh, mm }
}

export const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
