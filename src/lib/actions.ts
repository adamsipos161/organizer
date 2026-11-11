// Doménové akcie a výbery nad dátami. Všetky zmeny idú cez store.mutate (krok späť + synchronizácia).
import { store } from './store'
import { addDays, dayOfIso, today, zonedToUtc, formatDateTime, timeOf } from './dates'
import { norm } from './parse'
import { PALETTE, type Data, type Meeting, type Project, type Subtask, type Task, type TaskStatus } from './types'

const uid = () => store.userId!
const nowIso = () => new Date().toISOString()

// MARK: úlohy

export function addTask(input: { title: string; project_id?: string | null; due_date?: string | null; priority?: number; note?: string; subtasks?: string[] }): string {
  const id = crypto.randomUUID()
  store.mutate(`Pridaná úloha „${input.title}“`, d => {
    const minOrder = Math.min(0, ...d.tasks.map(t => t.sort_order))
    d.tasks.push({
      id, user_id: uid(), project_id: input.project_id ?? null, title: input.title.trim(), note: input.note ?? '',
      due_date: input.due_date ?? null, priority: input.priority ?? 0, status: 'todo',
      subtasks: (input.subtasks ?? []).map(t => ({ id: crypto.randomUUID(), title: t, done: false, due: null })),
      sort_order: minOrder - 1, created_at: nowIso(), completed_at: null,
    })
  })
  return id
}

export function updateTask(id: string, label: string, change: (t: Task) => void) {
  store.mutate(label, d => {
    const t = d.tasks.find(x => x.id === id)
    if (!t) return
    const wasDone = t.status === 'done'
    change(t)
    t.title = t.title.trim() || 'Bez názvu'
    if (t.status === 'done' && !wasDone) t.completed_at = nowIso()
    if (t.status !== 'done') t.completed_at = null
  })
}

export function setStatus(id: string, status: TaskStatus, completeSubtasks = false) {
  const t = store.data.tasks.find(x => x.id === id)
  if (!t) return
  updateTask(id, status === 'done' ? `Hotovo: „${t.title}“` : `Stav „${t.title}“: ${status === 'todo' ? 'na spravenie' : 'rozpracované'}`, x => {
    x.status = status
    if (status === 'done' && completeSubtasks) x.subtasks = x.subtasks.map(s => ({ ...s, done: true }))
  })
}

export function deleteTask(id: string) {
  const t = store.data.tasks.find(x => x.id === id)
  store.mutate(`Zmazaná úloha „${t?.title ?? ''}“`, d => { d.tasks = d.tasks.filter(x => x.id !== id) })
}

export function addSubtask(taskId: string, title: string) {
  updateTask(taskId, 'Pridaná podúloha', t => { t.subtasks.push({ id: crypto.randomUUID(), title: title.trim(), done: false, due: null }) })
}

export function updateSubtask(taskId: string, subId: string, label: string, change: (s: Subtask) => void) {
  updateTask(taskId, label, t => {
    const s = t.subtasks.find(x => x.id === subId)
    if (s) change(s)
    if (t.status === 'done' && t.subtasks.some(x => !x.done)) t.status = 'in_progress'
  })
}

export function deleteSubtask(taskId: string, subId: string) {
  updateTask(taskId, 'Zmazaná podúloha', t => { t.subtasks = t.subtasks.filter(s => s.id !== subId) })
}

export function moveTask(id: string, projectId: string | null) {
  const p = store.data.projects.find(x => x.id === projectId)
  updateTask(id, `Presunuté do ${p?.name ?? 'Inboxu'}`, t => { t.project_id = projectId })
}

/** Nové poradie úloh v zozname (zoznam id v požadovanom poradí) */
export function reorderTasks(ids: string[]) {
  store.mutate('Zmenené poradie', d => {
    ids.forEach((id, i) => { const t = d.tasks.find(x => x.id === id); if (t) t.sort_order = i })
  })
}

// MARK: stretnutia

export function addMeeting(input: { title: string; project_id: string | null; day: string; hh: number; mm: number; minutes: number; location?: string; note?: string }): string {
  const id = crypto.randomUUID()
  const start = zonedToUtc(input.day, input.hh, input.mm)
  const end = new Date(start.getTime() + Math.max(5, input.minutes) * 60000)
  store.mutate(`Pridané stretnutie „${input.title}“`, d => {
    d.meetings.push({
      id, user_id: uid(), project_id: input.project_id, title: input.title.trim(), starts_at: start.toISOString(), ends_at: end.toISOString(),
      location: input.location ?? '', note: input.note ?? '', created_at: nowIso(),
    })
  })
  return id
}

export function updateMeeting(id: string, label: string, change: (m: Meeting) => void) {
  store.mutate(label, d => {
    const m = d.meetings.find(x => x.id === id)
    if (!m) return
    change(m)
    m.title = m.title.trim() || 'Bez názvu'
    if (new Date(m.ends_at) <= new Date(m.starts_at)) m.ends_at = new Date(new Date(m.starts_at).getTime() + 30 * 60000).toISOString()
  })
}

export function deleteMeeting(id: string) {
  const m = store.data.meetings.find(x => x.id === id)
  store.mutate(`Zmazané stretnutie „${m?.title ?? ''}“`, d => { d.meetings = d.meetings.filter(x => x.id !== id) })
}

// MARK: projekty

export function addProject(name: string): string {
  const id = crypto.randomUUID()
  store.mutate(`Nový projekt „${name}“`, d => {
    d.projects.push({
      id, user_id: uid(), name: name.trim(), color: PALETTE[d.projects.length % PALETTE.length].hex, archived: false, note: '',
      sort_order: Math.max(0, ...d.projects.map(p => p.sort_order)) + 1, created_at: nowIso(),
    })
  })
  return id
}

export function updateProject(id: string, label: string, change: (p: Project) => void) {
  store.mutate(label, d => { const p = d.projects.find(x => x.id === id); if (p) { change(p); p.name = p.name.trim() || 'Projekt' } })
}

/** Zmazanie projektu – úlohy a stretnutia sa presunú do Inboxu (nič iné sa nemaže) */
export function deleteProject(id: string) {
  const p = store.data.projects.find(x => x.id === id)
  store.mutate(`Zmazaný projekt „${p?.name ?? ''}“`, d => {
    d.tasks.forEach(t => { if (t.project_id === id) t.project_id = null })
    d.meetings.forEach(m => { if (m.project_id === id) m.project_id = null })
    d.projects = d.projects.filter(x => x.id !== id)
  })
}

export function setDefaultMeetingMinutes(min: number) {
  store.mutate('Nastavenia', d => { d.settings = { user_id: uid(), default_meeting_minutes: min } })
}

// MARK: záloha

export function exportBackup(): string {
  const d = store.data
  return JSON.stringify({ app: 'organizer', version: 1, exported_at: nowIso(), projects: d.projects, tasks: d.tasks, meetings: d.meetings, settings: d.settings }, null, 2)
}

export function importBackup(json: string): { projects: number; tasks: number; meetings: number } {
  const b = JSON.parse(json)
  if (b?.app !== 'organizer' || !Array.isArray(b.projects) || !Array.isArray(b.tasks) || !Array.isArray(b.meetings)) throw new Error('Súbor nie je záloha Organizéra.')
  const u = uid()
  const fix = <T extends { user_id: string }>(r: T): T => ({ ...r, user_id: u })
  store.mutate('Obnova zo zálohy', d => {
    d.projects = b.projects.map(fix)
    d.tasks = b.tasks.map((t: Task) => fix({ ...t, subtasks: Array.isArray(t.subtasks) ? t.subtasks : [] }))
    d.meetings = b.meetings.map(fix)
    d.settings = { user_id: u, default_meeting_minutes: b.settings?.default_meeting_minutes ?? 60 }
  })
  return { projects: b.projects.length, tasks: b.tasks.length, meetings: b.meetings.length }
}

// MARK: výbery

export const isDone = (t: Task) => t.status === 'done'
export const openSubs = (t: Task) => t.subtasks.filter(s => !s.done).length

export function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => (isDone(a) === isDone(b) ? a.sort_order - b.sort_order : isDone(a) ? 1 : -1))
}

export const activeProjects = (d: Data) => d.projects.filter(p => !p.archived).sort((a, b) => a.sort_order - b.sort_order)
export const archivedProjects = (d: Data) => d.projects.filter(p => p.archived).sort((a, b) => a.name.localeCompare(b.name, 'sk'))
export const projectOf = (d: Data, id: string | null | undefined) => (id ? d.projects.find(p => p.id === id) ?? null : null)

export const tasksDue = (d: Data, day: string) => sortTasks(d.tasks.filter(t => !isDone(t) && t.due_date === day))
export const overdue = (d: Data) => d.tasks.filter(t => !isDone(t) && t.due_date && t.due_date < today()).sort((a, b) => a.due_date!.localeCompare(b.due_date!))
export const meetingsOn = (d: Data, day: string) => d.meetings.filter(m => dayOfIso(m.starts_at) === day).sort((a, b) => a.starts_at.localeCompare(b.starts_at))

export function conflicts(d: Data, startIso: string, endIso: string, excludeId?: string): Meeting[] {
  const s = new Date(startIso).getTime(), e = new Date(endIso).getTime()
  return d.meetings.filter(m => m.id !== excludeId && new Date(m.starts_at).getTime() < e && new Date(m.ends_at).getTime() > s)
}

export const describeMeeting = (m: Meeting) => `${m.title} (${formatDateTime(m.starts_at)}–${timeOf(m.ends_at)})`

export interface SearchHit { kind: 'task' | 'meeting' | 'project'; id: string; title: string; detail: string; done: boolean }

export function search(d: Data, query: string): SearchHit[] {
  const q = norm(query.trim())
  if (!q) return []
  const hits: SearchHit[] = []
  for (const t of d.tasks) {
    const sub = t.subtasks.find(s => norm(s.title).includes(q))
    if (norm(t.title).includes(q) || norm(t.note).includes(q) || sub) {
      const parts = [projectOf(d, t.project_id)?.name ?? 'Inbox', isDone(t) ? 'hotovo' : null, sub ? `podúloha: ${sub.title}` : null, norm(t.note).includes(q) && !norm(t.title).includes(q) ? 'v poznámke' : null]
      hits.push({ kind: 'task', id: t.id, title: t.title, detail: parts.filter(Boolean).join(' · '), done: isDone(t) })
    }
  }
  for (const m of d.meetings) {
    if ([m.title, m.note, m.location].some(x => norm(x).includes(q))) {
      hits.push({ kind: 'meeting', id: m.id, title: m.title, detail: [formatDateTime(m.starts_at), projectOf(d, m.project_id)?.name].filter(Boolean).join(' · '), done: false })
    }
  }
  for (const p of d.projects) {
    if (p.note && norm(p.note).includes(q)) {
      const line = p.note.split('\n').find(l => norm(l).includes(q)) ?? ''
      hits.push({ kind: 'project', id: p.id, title: p.name, detail: `poznámka projektu: ${line.trim().slice(0, 90)}`, done: false })
    }
  }
  return hits.sort((a, b) => Number(a.done) - Number(b.done))
}

export const nextDays = (n: number) => Array.from({ length: n }, (_, i) => addDays(today(), i))
