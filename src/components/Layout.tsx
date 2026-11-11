import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { CalendarDays, CalendarRange, ChevronDown, Cloud, CloudOff, Inbox, Loader2, Menu, Plus, Redo2, Search, Settings, Sun, Undo2, X } from 'lucide-react'
import { store, useStore } from '../lib/store'
import { activeProjects, addProject, archivedProjects, isDone, overdue, tasksDue } from '../lib/actions'
import { today } from '../lib/dates'
import { QuickAdd } from './QuickAdd'
import { DetailPanel } from './Detail'
import { Dot, useUi } from './ui'

export function Layout({ children, search, setSearch }: { children: ReactNode; search: string; setSearch: (s: string) => void }) {
  const { data, status, canUndo, canRedo } = useStore()
  const ui = useUi()
  const nav = useNavigate()
  const loc = useLocation()
  const [drawer, setDrawer] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const projectId = loc.pathname.startsWith('/projekt/') ? loc.pathname.split('/')[2] : null

  useEffect(() => { setDrawer(false) }, [loc.pathname])

  // klávesové skratky
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable]')
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        const l = e.shiftKey ? store.redo() : store.undo()
        if (l) ui.toast(`${e.shiftKey ? 'Znova' : 'Vrátené'}: ${l}`)
        return
      }
      if (typing || mod || e.altKey) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); ui.openQuickAdd() }
      else if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      else if (e.key === '1') nav('/')
      else if (e.key === '2') nav('/najblizsie')
      else if (e.key === '3') nav('/kalendar')
      else if (e.key === '4') nav('/inbox')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui, nav])

  const sidebar = (
    <Sidebar todayCount={overdue(data).length + tasksDue(data, today()).length} onNavigate={() => setSearch('')} />
  )

  return (
    <div className="flex h-full">
      <div className="hidden w-60 shrink-0 border-r border-line bg-white/60 md:block">{sidebar}</div>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl" onClick={e => e.stopPropagation()}>{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 px-3 py-2 backdrop-blur md:px-6">
          <div className="flex items-center gap-2">
            <button className="btn-ghost px-2 md:hidden" onClick={() => setDrawer(true)} aria-label="Menu"><Menu size={18} /></button>
            <div className="min-w-0 flex-1"><QuickAdd defaultProjectId={projectId} /></div>
            <div className="relative hidden w-56 lg:block">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300" />
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Hľadať…  /" aria-label="Hľadať"
                onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); e.currentTarget.blur() } }}
                className="input py-2 pl-8 pr-7" />
              {search && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-300" onClick={() => setSearch('')}><X size={14} /></button>}
            </div>
            <button className="btn-ghost hidden px-2 md:inline-flex" disabled={!canUndo} title="Späť (⌘Z)" onClick={() => { const l = store.undo(); if (l) ui.toast(`Vrátené: ${l}`) }}><Undo2 size={16} /></button>
            <button className="btn-ghost hidden px-2 md:inline-flex" disabled={!canRedo} title="Znova (⇧⌘Z)" onClick={() => { const l = store.redo(); if (l) ui.toast(`Znova: ${l}`) }}><Redo2 size={16} /></button>
            <SyncBadge phase={status.phase} pending={status.pending} message={status.message} />
          </div>
          <div className="relative mt-2 lg:hidden">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hľadať úlohy, poznámky, stretnutia" aria-label="Hľadať"
              className="input py-1.5 pl-8 pr-7" ref={el => { if (window.innerWidth < 1024) searchRef.current = el }} />
            {search && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-300" onClick={() => setSearch('')}><X size={14} /></button>}
          </div>
          {status.message && (
            <div className={clsx('mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs', status.phase === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}>
              <span className="flex-1">{status.message}</span>
              <button onClick={() => store.clearMessage()} aria-label="Zavrieť"><X size={12} /></button>
            </div>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
          <DetailPanel />
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {[
            { to: '/', icon: Sun, label: 'Dnes' },
            { to: '/najblizsie', icon: CalendarRange, label: 'Najbližšie' },
            { to: '/kalendar', icon: CalendarDays, label: 'Kalendár' },
            { to: '/inbox', icon: Inbox, label: 'Inbox' },
          ].map(i => (
            <NavLink key={i.to} to={i.to} end onClick={() => setSearch('')} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'text-accent-600' : 'text-ink-500')}>
              <i.icon size={20} />{i.label}
            </NavLink>
          ))}
          <button onClick={() => ui.openQuickAdd()} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-accent-600"><Plus size={20} />Pridať</button>
        </nav>
      </div>
    </div>
  )
}

function SyncBadge({ phase, pending, message }: { phase: string; pending: number; message: string | null }) {
  const title = phase === 'offline' ? `Offline – ${pending} zmien čaká` : phase === 'saving' ? 'Ukladám…' : phase === 'error' ? message ?? 'Chyba' : 'Uložené'
  return (
    <span title={title} className={clsx('flex items-center gap-1 px-1 text-xs', phase === 'offline' ? 'text-amber-600' : phase === 'error' ? 'text-red-600' : 'text-ink-300')}>
      {phase === 'saving' ? <Loader2 size={15} className="animate-spin" /> : phase === 'offline' ? <CloudOff size={15} /> : <Cloud size={15} />}
      {pending > 0 && <span className="num">{pending}</span>}
    </span>
  )
}

function Sidebar({ todayCount, onNavigate }: { todayCount: number; onNavigate: () => void }) {
  const { data } = useStore()
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [showArchive, setShowArchive] = useState(false)
  const inboxCount = data.tasks.filter(t => !t.project_id && !isDone(t)).length
  const link = (isActive: boolean) => clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm md:py-1.5', isActive ? 'bg-accent-50 font-medium text-accent-600' : 'text-ink-700 hover:bg-black/[0.04]')
  const count = (n: number) => n > 0 ? <span className="num ml-auto text-xs text-ink-300">{n}</span> : null
  const archived = archivedProjects(data)

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <div className="mb-4 flex items-center gap-2 px-2 pt-1">
        <img src="/icon.svg" alt="" className="h-7 w-7" /><span className="font-semibold">Organizér</span>
      </div>
      <nav className="space-y-0.5" onClick={onNavigate}>
        <NavLink to="/" end className={({ isActive }) => link(isActive)}><Sun size={16} />Dnes{count(todayCount)}</NavLink>
        <NavLink to="/najblizsie" className={({ isActive }) => link(isActive)}><CalendarRange size={16} />Najbližšie dni</NavLink>
        <NavLink to="/kalendar" className={({ isActive }) => link(isActive)}><CalendarDays size={16} />Kalendár</NavLink>
        <NavLink to="/inbox" className={({ isActive }) => link(isActive)}><Inbox size={16} />Inbox{count(inboxCount)}</NavLink>
      </nav>
      <div className="mt-5 px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Projekty</div>
      <nav className="mt-1 space-y-0.5" onClick={onNavigate}>
        {activeProjects(data).map(p => (
          <NavLink key={p.id} to={`/projekt/${p.id}`} className={({ isActive }) => link(isActive)}>
            <Dot color={p.color} /><span className="truncate">{p.name}</span>{count(data.tasks.filter(t => t.project_id === p.id && !isDone(t)).length)}
          </NavLink>
        ))}
      </nav>
      {adding ? (
        <input autoFocus className="input mt-1 py-1.5" placeholder="Názov projektu" value={name} onChange={e => setName(e.target.value)}
          onBlur={() => { setAdding(false); setName('') }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setAdding(false); setName('') }
            if (e.key === 'Enter' && name.trim()) { const id = addProject(name); setAdding(false); setName(''); nav(`/projekt/${id}`) }
          }} />
      ) : (
        <button className="mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-500 hover:bg-black/[0.04]" onClick={() => setAdding(true)}><Plus size={16} />Nový projekt</button>
      )}
      {archived.length > 0 && (
        <>
          <button className="mt-4 flex items-center gap-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500" onClick={() => setShowArchive(!showArchive)}>
            Archív <ChevronDown size={12} className={clsx('transition', !showArchive && '-rotate-90')} />
          </button>
          {showArchive && (
            <nav className="mt-1 space-y-0.5" onClick={onNavigate}>
              {archived.map(p => <NavLink key={p.id} to={`/projekt/${p.id}`} className={({ isActive }) => link(isActive)}><Dot color={p.color} /><span className="truncate text-ink-500">{p.name}</span></NavLink>)}
            </nav>
          )}
        </>
      )}
      <div className="mt-auto pt-4" onClick={onNavigate}>
        <NavLink to="/nastavenia" className={({ isActive }) => link(isActive)}><Settings size={16} />Nastavenia</NavLink>
      </div>
    </div>
  )
}
