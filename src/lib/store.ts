// Dátový sklad: lokálna kópia dát + fronta zmien pre Supabase + krok späť/znova.
// Každá zmena sa hneď prejaví v aplikácii, uloží sa do prehliadača (funguje aj offline)
// a na pozadí sa odošle na server. Bez pripojenia zmeny čakajú vo fronte a odošlú sa neskôr.
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { emptyData, PALETTE, type Data, type Meeting, type Project, type Task } from './types'

type Table = 'projects' | 'tasks' | 'meetings' | 'user_settings'
type Row = { id?: string; user_id: string } & Record<string, unknown>

interface Op { table: Table; kind: 'upsert' | 'delete'; key: string; row?: Row }
interface Change { table: Table; key: string; before: Row | null; after: Row | null }
interface UndoEntry { label: string; changes: Change[] }

export interface SyncStatus {
  phase: 'idle' | 'saving' | 'offline' | 'error'
  pending: number
  message: string | null
  lastSyncedAt: number | null
}

const keyOf = (table: Table, row: Row) => (table === 'user_settings' ? row.user_id : (row.id as string))

function tableRows(d: Data, table: Table): Row[] {
  if (table === 'user_settings') return d.settings ? [d.settings as unknown as Row] : []
  return d[table] as unknown as Row[]
}

function setRow(d: Data, table: Table, key: string, row: Row | null) {
  if (table === 'user_settings') { d.settings = row as unknown as Data['settings']; return }
  const list = d[table] as unknown as Row[]
  const i = list.findIndex(r => r.id === key)
  if (row === null) { if (i >= 0) list.splice(i, 1) }
  else if (i >= 0) list[i] = row
  else list.push(row)
}

const TABLES: Table[] = ['projects', 'tasks', 'meetings', 'user_settings']

function diff(before: Data, after: Data): Change[] {
  const out: Change[] = []
  for (const table of TABLES) {
    const a = new Map(tableRows(before, table).map(r => [keyOf(table, r), r]))
    const b = new Map(tableRows(after, table).map(r => [keyOf(table, r), r]))
    for (const [k, r] of b) {
      const old = a.get(k)
      if (!old || JSON.stringify(old) !== JSON.stringify(r)) out.push({ table, key: k, before: old ?? null, after: r })
    }
    for (const [k, r] of a) if (!b.has(k)) out.push({ table, key: k, before: r, after: null })
  }
  return out
}

/** Poradie odoslania: najprv projekty (cudzie kľúče), mazanie projektov nakoniec */
function opsFor(changes: Change[], dir: 'after' | 'before'): Op[] {
  const ops = changes.map<Op>(c => {
    const row = c[dir]
    return row ? { table: c.table, kind: 'upsert', key: c.key, row } : { table: c.table, kind: 'delete', key: c.key }
  })
  const rank = (o: Op) => o.kind === 'upsert' ? (o.table === 'projects' ? 0 : 1) : (o.table === 'projects' ? 3 : 2)
  return ops.sort((x, y) => rank(x) - rank(y))
}

const isNetworkError = (e: unknown) => {
  const msg = String((e as { message?: string })?.message ?? e)
  return !navigator.onLine || /fetch|network|Failed to|Load failed|NetworkError|timeout/i.test(msg)
}

class Store {
  data: Data = emptyData()
  userId: string | null = null
  loaded = false
  status: SyncStatus = { phase: 'idle', pending: 0, message: null, lastSyncedAt: null }
  private queue: Op[] = []
  private undoStack: UndoEntry[] = []
  private redoStack: UndoEntry[] = []
  private listeners = new Set<() => void>()
  private flushing = false
  private version = 0
  private snapshot = { data: this.data, status: this.status, version: 0, canUndo: false, canRedo: false, loaded: false }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getSnapshot = () => this.snapshot

  private emit() {
    this.version++
    this.status = { ...this.status, pending: this.queue.length }
    this.snapshot = {
      data: this.data, status: this.status, version: this.version, loaded: this.loaded,
      canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0,
    }
    this.listeners.forEach(f => f())
  }

  private storageKey() { return `organizer:v1:${this.userId}` }

  private persist() {
    if (!this.userId) return
    try { localStorage.setItem(this.storageKey(), JSON.stringify({ data: this.data, queue: this.queue })) } catch { /* plná pamäť – nevadí */ }
  }

  // MARK: načítanie

  async start(userId: string) {
    if (this.userId === userId && this.loaded) return
    this.userId = userId
    this.undoStack = []; this.redoStack = []
    try {
      const cached = JSON.parse(localStorage.getItem(this.storageKey()) ?? 'null') as { data: Data; queue: Op[] } | null
      if (cached?.data) { this.data = { ...emptyData(), ...cached.data }; this.queue = cached.queue ?? []; this.loaded = true }
    } catch { /* poškodená cache – načíta sa zo servera */ }
    this.emit()
    await this.flush()
    await this.reload()
  }

  stop() {
    this.userId = null; this.data = emptyData(); this.queue = []; this.loaded = false
    this.undoStack = []; this.redoStack = []
    this.status = { phase: 'idle', pending: 0, message: null, lastSyncedAt: null }
    this.emit()
  }

  /** Načíta aktuálny stav zo servera (iba ak nečakajú neodoslané zmeny) */
  async reload() {
    if (!this.userId || this.queue.length > 0) return
    try {
      const [p, t, m, s] = await Promise.all([
        supabase.from('projects').select('*').order('sort_order'),
        supabase.from('tasks').select('*'),
        supabase.from('meetings').select('*'),
        supabase.from('user_settings').select('*').maybeSingle(),
      ])
      const err = p.error ?? t.error ?? m.error ?? s.error
      if (err) throw err
      if (this.queue.length > 0) return // medzitým vznikla zmena
      const fresh: Data = {
        projects: (p.data ?? []) as Project[],
        tasks: ((t.data ?? []) as Task[]).map(x => ({ ...x, subtasks: Array.isArray(x.subtasks) ? x.subtasks : [] })),
        meetings: (m.data ?? []) as Meeting[],
        settings: (s.data as Data['settings']) ?? null,
      }
      const changed = JSON.stringify(normalizeForCompare(fresh)) !== JSON.stringify(normalizeForCompare(this.data))
      this.data = fresh
      if (changed) { this.undoStack = []; this.redoStack = [] }
      this.loaded = true
      this.status = { ...this.status, phase: 'idle', message: null, lastSyncedAt: Date.now() }
      if (!fresh.settings) await this.bootstrap()
      this.persist(); this.emit()
    } catch (e) {
      this.status = { ...this.status, phase: isNetworkError(e) ? 'offline' : 'error', message: isNetworkError(e) ? 'Bez pripojenia – zobrazujú sa uložené dáta.' : `Načítanie zlyhalo: ${(e as Error).message}` }
      this.loaded = true
      this.emit()
    }
  }

  /** Prvé prihlásenie: nastavenia a štyri predvolené projekty */
  private async bootstrap() {
    const uid = this.userId!
    const names = ['SWAN / 4ka', 'TheraBeast', 'Štúdio / rozhovory', 'Osobné']
    const colors = [PALETTE[0].hex, PALETTE[2].hex, PALETTE[3].hex, PALETTE[4].hex]
    const before = structuredClone(this.data)
    if (this.data.projects.length === 0) {
      names.forEach((name, i) => this.data.projects.push({
        id: crypto.randomUUID(), user_id: uid, name, color: colors[i], archived: false, sort_order: i, created_at: new Date().toISOString(),
      }))
    }
    this.data.settings = { user_id: uid, default_meeting_minutes: 60 }
    this.queue.push(...opsFor(diff(before, this.data), 'after'))
    this.persist()
    void this.flush()
  }

  // MARK: zmeny

  /** Vykoná zmenu dát. Vracia false, ak sa nič nezmenilo. */
  mutate(label: string, recipe: (d: Data) => void, opts: { undoable?: boolean } = {}): boolean {
    if (!this.userId) return false
    const before = this.data
    const draft = structuredClone(before)
    recipe(draft)
    const changes = diff(before, draft)
    if (changes.length === 0) return false
    this.data = draft
    if (opts.undoable !== false) {
      this.undoStack.push({ label, changes })
      if (this.undoStack.length > 100) this.undoStack.shift()
      this.redoStack = []
    }
    this.queue.push(...opsFor(changes, 'after'))
    this.persist(); this.emit()
    void this.flush()
    return true
  }

  undo(): string | null {
    const e = this.undoStack.pop()
    if (!e) return null
    this.applyChanges(e.changes, 'before')
    this.redoStack.push(e)
    return e.label
  }

  redo(): string | null {
    const e = this.redoStack.pop()
    if (!e) return null
    this.applyChanges(e.changes, 'after')
    this.undoStack.push(e)
    return e.label
  }

  private applyChanges(changes: Change[], dir: 'before' | 'after') {
    const draft = structuredClone(this.data)
    for (const c of changes) setRow(draft, c.table, c.key, c[dir] ? structuredClone(c[dir]) : null)
    this.data = draft
    this.queue.push(...opsFor(changes, dir))
    this.persist(); this.emit()
    void this.flush()
  }

  // MARK: odosielanie na server

  async flush() {
    if (this.flushing || !this.userId) return
    this.flushing = true
    try {
      while (this.queue.length > 0) {
        const op = this.queue[0]
        this.status = { ...this.status, phase: 'saving' }
        this.emit()
        try {
          const res = op.kind === 'upsert'
            ? await supabase.from(op.table).upsert(op.row!, { onConflict: op.table === 'user_settings' ? 'user_id' : 'id' })
            : await supabase.from(op.table).delete().eq(op.table === 'user_settings' ? 'user_id' : 'id', op.key)
          if (res.error) throw res.error
          this.queue.shift()
          this.persist()
        } catch (e) {
          if (isNetworkError(e)) {
            this.status = { ...this.status, phase: 'offline', message: 'Bez pripojenia – zmeny sa uložia, keď bude internet.' }
            this.emit()
            return
          }
          // chyba servera (napr. neplatné dáta) – zmenu zahodíme a obnovíme stav zo servera
          this.queue.shift()
          this.persist()
          this.status = { ...this.status, phase: 'error', message: `Zmenu sa nepodarilo uložiť: ${(e as Error).message}` }
          this.emit()
          if (this.queue.length === 0) { this.flushing = false; await this.reload(); return }
        }
      }
      this.status = { ...this.status, phase: this.status.phase === 'error' ? 'error' : 'idle', message: this.status.phase === 'error' ? this.status.message : null, lastSyncedAt: Date.now() }
      this.emit()
    } finally {
      this.flushing = false
    }
  }

  clearMessage() { this.status = { ...this.status, message: null, phase: this.queue.length ? this.status.phase : 'idle' }; this.emit() }
}

function normalizeForCompare(d: Data) {
  const by = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id))
  return { p: by(d.projects), t: by(d.tasks), m: by(d.meetings), s: d.settings }
}

export const store = new Store()

export function useStore() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void store.flush().then(() => store.reload()) })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void store.flush().then(() => store.reload())
  })
  setInterval(() => { if (document.visibilityState === 'visible') void store.flush().then(() => store.reload()) }, 120000)
}
