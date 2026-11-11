import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import {
  deleteProject, isDone, meetingsOn, nextDays, overdue, projectOf, reorderTasks, search, sortTasks, tasksDue, updateProject,
} from '../lib/actions'
import { formatDay, relativeDay, today, WEEKDAYS_LONG, weekday } from '../lib/dates'
import { PALETTE } from '../lib/types'
import { MeetingRow, TaskRow } from '../components/rows'
import { Dot, Empty, useUi } from '../components/ui'

export function Page({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-4 md:px-8 md:pb-12 md:pt-6">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function TodayView() {
  const { data } = useStore()
  const t = today()
  const od = overdue(data)
  const tasks = tasksDue(data, t)
  const meetings = meetingsOn(data, t)
  const progress = sortTasks(data.tasks.filter(x => x.status === 'in_progress' && !x.due_date))
  const [y, m, d] = t.split('-').map(Number)
  return (
    <Page title="Dnes" subtitle={`${cap(WEEKDAYS_LONG[weekday(t)])} ${d}. ${m}. ${y}`}>
      {od.length > 0 && (<>
        <h2 className="section-title text-red-600">Po termíne <span className="font-normal">{od.length}</span></h2>
        {od.map(x => <TaskRow key={x.id} task={x} />)}
      </>)}
      <h2 className="section-title">Stretnutia <span className="font-normal text-ink-300">{meetings.length}</span></h2>
      {meetings.length === 0 ? <Empty>Dnes nemáte žiadne stretnutia.</Empty> : meetings.map(x => <MeetingRow key={x.id} meeting={x} />)}
      <h2 className="section-title">Úlohy na dnes <span className="font-normal text-ink-300">{tasks.length}</span></h2>
      {tasks.length === 0 ? <Empty>Na dnes nemáte žiadne úlohy.</Empty> : tasks.map(x => <TaskRow key={x.id} task={x} showDue={false} />)}
      {progress.length > 0 && (<>
        <h2 className="section-title">Rozpracované bez termínu <span className="font-normal text-ink-300">{progress.length}</span></h2>
        {progress.map(x => <TaskRow key={x.id} task={x} />)}
      </>)}
    </Page>
  )
}

export function UpcomingView() {
  const { data } = useStore()
  const ui = useUi()
  const od = overdue(data)
  return (
    <Page title="Najbližšie dni" subtitle="Nasledujúcich 14 dní">
      {od.length > 0 && (<>
        <h2 className="section-title text-red-600">Po termíne <span className="font-normal">{od.length}</span></h2>
        {od.map(x => <TaskRow key={x.id} task={x} />)}
      </>)}
      {nextDays(14).map(day => {
        const ms = meetingsOn(data, day), ts = tasksDue(data, day)
        const [, m, d] = day.split('-').map(Number)
        return (
          <section key={day} className="border-b border-line pb-2">
            <div className="mt-4 mb-1 flex items-baseline gap-2">
              <h2 className="font-semibold">{relativeDay(day) === formatDay(day) ? cap(WEEKDAYS_LONG[weekday(day)]) : relativeDay(day)}</h2>
              <span className="text-sm text-ink-500">{relativeDay(day) === formatDay(day) ? `${d}. ${m}.` : `${WEEKDAYS_LONG[weekday(day)]} ${d}. ${m}.`}</span>
              <button className="ml-auto text-xs text-ink-300 hover:text-accent-600" onClick={() => ui.openQuickAdd(`${d}.${m}.${day.slice(0, 4)} `)}>+ pridať</button>
            </div>
            {ms.length === 0 && ts.length === 0 && <Empty>Nič naplánované</Empty>}
            {ms.map(x => <MeetingRow key={x.id} meeting={x} />)}
            {ts.map(x => <TaskRow key={x.id} task={x} showDue={false} />)}
          </section>
        )
      })}
    </Page>
  )
}

/** Projekt (projectId) alebo Inbox (null) */
export function TaskListView({ inbox }: { inbox?: boolean }) {
  const { id } = useParams()
  const projectId = inbox ? null : id ?? null
  const { data } = useStore()
  const ui = useUi()
  const nav = useNavigate()
  const [showDone, setShowDone] = useState(false)
  const project = projectOf(data, projectId)
  const all = data.tasks.filter(t => t.project_id === projectId)
  const open = sortTasks(all.filter(t => !isDone(t)))
  const done = all.filter(isDone).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const upcoming = projectId ? data.meetings.filter(m => m.project_id === projectId && new Date(m.ends_at) > new Date()).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 8) : []

  if (!inbox && !project) return <Page title="Projekt neexistuje"><Empty>Projekt bol zmazaný.</Empty></Page>

  const onDrop = (dragged: string, target: string) => {
    const ids = open.map(t => t.id).filter(x => x !== dragged)
    const at = ids.indexOf(target)
    if (at < 0) return
    const draggedIdx = open.findIndex(t => t.id === dragged)
    const targetIdx = open.findIndex(t => t.id === target)
    ids.splice(draggedIdx < targetIdx ? at + 1 : at, 0, dragged)
    reorderTasks(ids)
  }

  const menu = project && (
    <ProjectMenu archived={project.archived}
      onArchive={() => { updateProject(project.id, project.archived ? 'Projekt obnovený' : 'Projekt archivovaný', p => { p.archived = !p.archived }); ui.toast(project.archived ? 'Projekt obnovený z archívu' : 'Projekt archivovaný – úlohy a stretnutia ostávajú uložené', { undo: true }) }}
      onDelete={async () => {
        const v = await ui.confirm({ title: `Zmazať projekt „${project.name}“?`, message: 'Úlohy a stretnutia projektu sa nezmažú – presunú sa do Inboxu.', buttons: [{ label: 'Zmazať projekt', value: 'del', tone: 'danger' }] })
        if (v) { deleteProject(project.id); nav('/inbox'); ui.toast('Projekt zmazaný', { undo: true }) }
      }} />
  )

  return (
    <Page
      title={project ? <ProjectTitle id={project.id} name={project.name} color={project.color} /> : 'Inbox'}
      subtitle={project ? (project.archived ? 'Archivovaný projekt' : undefined) : 'Úlohy bez projektu'}
      actions={menu}>
      {upcoming.length > 0 && (<>
        <h2 className="section-title">Nadchádzajúce stretnutia</h2>
        {upcoming.map(m => <MeetingRow key={m.id} meeting={m} showDate />)}
      </>)}
      <h2 className="section-title">Úlohy <span className="font-normal text-ink-300">{open.length}</span>
        {open.length > 1 && <span className="hidden font-normal normal-case tracking-normal text-ink-300 md:inline">· poradie zmeníte potiahnutím</span>}</h2>
      {open.length === 0 ? <Empty>Žiadne otvorené úlohy. Pridajte ich hore cez „Pridať…“.</Empty>
        : open.map(t => <TaskRow key={t.id} task={t} showProject={false} draggable onDropOn={onDrop} />)}
      {done.length > 0 && (
        <div className="mt-5">
          <button className="text-sm text-accent-600 hover:underline" onClick={() => setShowDone(!showDone)}>{showDone ? 'Skryť' : 'Zobraziť'} hotové ({done.length})</button>
          {showDone && <div className="mt-1">{done.map(t => <TaskRow key={t.id} task={t} showProject={false} />)}</div>}
        </div>
      )}
    </Page>
  )
}

function ProjectTitle({ id, name, color }: { id: string; name: string; color: string }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState(name)
  const [colors, setColors] = useState(false)
  return (
    <span className="relative flex items-center gap-2.5">
      <button onClick={() => setColors(!colors)} title="Farba projektu"><Dot color={color} size={14} /></button>
      {colors && (
        <span className="absolute left-0 top-9 z-20 flex gap-1.5 rounded-xl border border-line bg-white p-2 shadow-lg">
          {PALETTE.map(c => <button key={c.hex} title={c.name} onClick={() => { updateProject(id, 'Farba projektu', p => { p.color = c.hex }); setColors(false) }}
            className={`h-6 w-6 rounded-full ${c.hex === color ? 'ring-2 ring-offset-2 ring-ink-300' : ''}`} style={{ background: c.hex }} />)}
        </span>
      )}
      {edit
        ? <input autoFocus value={v} onChange={e => setV(e.target.value)} className="input py-1 text-lg font-semibold"
            onBlur={() => { setEdit(false); if (v.trim() && v !== name) updateProject(id, 'Premenovaný projekt', p => { p.name = v }) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(name); setEdit(false) } }} />
        : <span className="cursor-text" onClick={() => { setV(name); setEdit(true) }} title="Kliknutím premenujete">{name}</span>}
    </span>
  )
}

function ProjectMenu({ archived, onArchive, onDelete }: { archived: boolean; onArchive: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button className="btn-ghost px-2" onClick={() => setOpen(!open)} aria-label="Možnosti projektu"><MoreHorizontal size={18} /></button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-56 rounded-xl border border-line bg-white p-1 shadow-lg" onMouseLeave={() => setOpen(false)}>
          <button className="btn-ghost w-full justify-start" onClick={() => { setOpen(false); onArchive() }}>
            {archived ? <><ArchiveRestore size={15} />Obnoviť z archívu</> : <><Archive size={15} />Archivovať</>}
          </button>
          <button className="btn-danger w-full justify-start" onClick={() => { setOpen(false); onDelete() }}><Trash2 size={15} />Zmazať projekt</button>
        </div>
      )}
    </div>
  )
}

export function SearchView({ query }: { query: string }) {
  const { data } = useStore()
  const ui = useUi()
  const hits = useMemo(() => search(data, query), [data, query])
  return (
    <Page title="Hľadanie" subtitle={hits.length ? `${hits.length} výsledkov pre „${query}“ · vrátane hotových úloh` : `Nič sa nenašlo pre „${query}“`}>
      <div className="mt-3">
        {hits.map(h => (
          <button key={h.kind + h.id} onClick={() => ui.select({ kind: h.kind, id: h.id })}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-black/[0.03]">
            <span className="w-20 shrink-0 text-xs text-ink-500">{h.kind === 'task' ? (h.done ? 'Hotová úloha' : 'Úloha') : 'Stretnutie'}</span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm ${h.done ? 'text-ink-500 line-through' : ''}`}>{h.title}</span>
              <span className="block truncate text-xs text-ink-500">{h.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </Page>
  )
}

