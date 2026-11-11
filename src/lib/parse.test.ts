import { describe, expect, it } from 'vitest'
import { parseQuick } from './parse'
import { zonedToUtc, timeOf, dayOfIso, addDays, startOfWeek, formatDay } from './dates'

const P = [
  { id: 'swan', name: 'SWAN / 4ka' },
  { id: 'tb', name: 'TheraBeast' },
  { id: 'st', name: 'Štúdio / rozhovory' },
  { id: 'os', name: 'Osobné' },
  { id: 'old', name: 'Starý', archived: true },
]
// streda 11. 11. 2026, 12:00 v Bratislave
const TODAY = '2026-11-11'
const NOW = zonedToUtc(TODAY, 12, 0)
const q = (s: string) => parseQuick(s, P, NOW, TODAY)

describe('rýchle zadávanie', () => {
  it('stretnutie zajtra o 10 s projektom', () => {
    const r = q('zajtra o 10 stretnutie s Radom #swan')
    expect(r.kind).toBe('meeting')
    expect(r.day).toBe('2026-11-12')
    expect(r.start).toEqual({ hh: 10, mm: 0 })
    expect(r.projectId).toBe('swan')
    expect(r.title).toBe('Stretnutie s Radom')
  })
  it('úloha do piatku s prioritou', () => {
    const r = q('pripraviť TZ do piatku #swan !')
    expect(r.kind).toBe('task')
    expect(r.day).toBe('2026-11-13')
    expect(r.priority).toBe(3)
    expect(r.title).toBe('Pripraviť TZ')
  })
  it('budúci štvrtok = štvrtok budúceho týždňa, s alternatívou', () => {
    const r = q('budúci štvrtok o 14:30 natáčanie #štúdio')
    expect(r.day).toBe('2026-11-19')
    expect(r.alternative?.day).toBe('2026-11-12')
    expect(r.start).toEqual({ hh: 14, mm: 30 })
    expect(r.projectId).toBe('st')
    expect(r.title).toBe('Natáčanie')
  })
  it('v piatok = najbližší piatok', () => {
    expect(q('v piatok upratať').day).toBe('2026-11-13')
    expect(q('v piatok upratať').title).toBe('Upratať')
  })
  it('stretnutie bez času sa pýta na čas', () => {
    const r = q('stretnutie s Erikom v pondelok')
    expect(r.kind).toBe('meeting')
    expect(r.needsTime).toBe(true)
    expect(r.day).toBe('2026-11-16')
  })
  it('rozsah času a dĺžka', () => {
    const r = q('15.12. od 9 do 10:30 porada')
    expect(r.day).toBe('2026-12-15')
    expect(r.start).toEqual({ hh: 9, mm: 0 })
    expect(r.durationMin).toBe(90)
    const r2 = q('zajtra 10:00 call na 30 min')
    expect(r2.durationMin).toBe(30)
    expect(r2.title).toBe('Call')
  })
  it('dátum s medzerou a mesiacom slovom', () => {
    expect(q('faktúry 20. 11.').day).toBe('2026-11-20')
    expect(q('faktúry 3. decembra').day).toBe('2026-12-03')
    expect(q('daňové priznanie 31.3.').day).toBe('2027-03-31') // už prešlo → budúci rok
  })
  it('o týždeň / o 3 dni', () => {
    expect(q('zavolať mame o týždeň').day).toBe('2026-11-18')
    expect(q('kontrola o 3 dni').day).toBe('2026-11-14')
  })
  it('čas bez dňa, ktorý už prešiel → zajtra', () => {
    const r = q('o 9 hovor')
    expect(r.day).toBe('2026-11-12')
  })
  it('večer posúva na popoludnie', () => {
    expect(q('zajtra o 7 večer večera').start).toEqual({ hh: 19, mm: 0 })
  })
  it('neexistujúci projekt → poznámka, Inbox', () => {
    const r = q('niečo #neexistuje')
    expect(r.projectId).toBeNull()
    expect(r.notes.length).toBe(1)
  })
  it('archivovaný projekt sa nevyberie', () => {
    expect(q('x #stary').projectId).toBeNull()
  })
  it('slovo „so“ a „po“ v názve ostáva', () => {
    const r = q('obed so Zuzanou po porade zajtra o 12')
    expect(r.title).toBe('Obed so Zuzanou po porade')
    expect(r.day).toBe('2026-11-12')
  })
  it('úloha bez dátumu', () => {
    const r = q('kúpiť toner')
    expect(r).toMatchObject({ kind: 'task', day: null, title: 'Kúpiť toner', projectId: null })
  })
  it('budúci týždeň bez dňa', () => {
    expect(q('budúci týždeň report').day).toBe('2026-11-16')
  })
})

describe('dátumy v Bratislave', () => {
  it('prevod letného/zimného času', () => {
    const w = zonedToUtc('2026-01-15', 10, 0)
    expect(w.toISOString()).toBe('2026-01-15T09:00:00.000Z')
    const s = zonedToUtc('2026-07-15', 10, 0)
    expect(s.toISOString()).toBe('2026-07-15T08:00:00.000Z')
    expect(timeOf(s.toISOString())).toBe('10:00')
    expect(dayOfIso('2026-07-14T22:30:00.000Z')).toBe('2026-07-15')
  })
  it('pomocné funkcie', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09')
    expect(formatDay('2026-11-15')).toMatch(/^ne 15\. 11\./)
  })
})
