import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Plus, Trash2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import {
  activeProjects, addSubtask, conflicts, deleteMeeting, deleteSubtask, deleteTask, describeMeeting,
  setStatus, updateMeeting, updateSubtask, updateTask,
} from '../lib/actions'
import { dayOfIso, formatDateTime, formatDayLong, minutesBetween, parseTime, relativeDay, timeOf, zonedToUtc } from '../lib/dates'
import { PRIORITY_LABEL, STATUS_LABEL, type Meeting, type Task, type TaskStatus } from '../lib/types'
import { CheckCircle, useToggleDone } from './rows'
import { AttachmentsSection } from './Attachments'
import { deleteAllForTask, useAttachmentCount } from '../lib/attachments'
import { useUi } from './ui'

export function DetailPanel() {
  const { data } = useStore()
  const ui = useUi()
  const sel = ui.selected
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('input,textarea,select')) ui.select(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [ui])
  if (!sel) return null
  const task = sel.kind === 'task' ? data.tasks.find(t => t.id === sel.id) : undefined
  const meeting = sel.kind === 'meeting' ? data.meetings.find(m => m.id === sel.id) : undefined

  return (
    <aside className="fixed inset-0 z-40 flex flex-col bg-white md:static md:z-auto md:w-[400px] md:shrink-0 md:border-l md:border-line">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <button className="btn-ghost md:hidden" onClick={() => ui.select(null)}><ArrowLeft size={16} />Späť</button>
        <span className="hidden text-xs font-medium uppercase tracking-wide text-ink-500 md:block">{sel.kind === 'task' ? 'Úloha' : 'Stretnutie'}</span>
        <button className="btn-ghost hidden md:inline-flex" onClick={() => ui.select(null)} aria-label="Zavrieť"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {task ? <TaskDetail key={task.id} task={task} /> : meeting ? <MeetingDetail key={meeting.id} meeting={meeting} /> : <p className="p-5 text-sm text-ink-500">Položka už neexistuje.</p>}
      </div>
    </aside>
  )
}

/** Textové pole, ktoré ukladá pri opustení (jeden krok späť za celú úpravu) */
function EditableText({ value, onCommit, multiline, className, placeholder }: { value: string; onCommit: (v: string) => void; multiline?: boolean; className?: string; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => { if (v !== value) onCommit(v) }
  return multiline
    ? <textarea value={v} onChange={e => setV(e.target.value)} onBlur={commit} placeholder={placeholder} className={className} rows={5} />
    : <input value={v} onChange={e => setV(e.target.value)} onBlur={commit} placeholder={placeholder} className={className}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid grid-cols-[88px_1fr] items-center gap-2"><span className="label">{label}</span>{children}</label>
}

function TaskDetail({ task }: { task: Task }) {
  const { data } = useStore()
  const ui = useUi()
  const toggle = useToggleDone()
  const [newSub, setNewSub] = useState('')
  const attCount = useAttachmentCount(task.id)
  const done = task.status === 'done'
  const projects = activeProjects(data)
  const current = data.projects.find(p => p.id === task.project_id)

  const changeStatus = async (s: TaskStatus) => {
    if (s === 'done') { await toggle(task); return }
    setStatus(task.id, s)
  }

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-start gap-2.5">
        <div className="pt-1.5"><CheckCircle done={done} onClick={() => toggle(task)} /></div>
        <EditableText value={task.title} onCommit={v => updateTask(task.id, 'Premenovaná úloha', t => { t.title = v })}
          className="w-full rounded-md px-1 py-0.5 text-lg font-semibold outline-none focus:bg-canvas" />
      </div>

      <div className="space-y-2.5">
        <Field label="Projekt">
          <select className="input py-1.5" value={task.project_id ?? ''} onChange={e => updateTask(task.id, 'Zmenený projekt', t => { t.project_id = e.target.value || null })}>
            <option value="">Inbox</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            {current?.archived && <option value={current.id}>{current.name} (archív)</option>}
          </select>
        </Field>
        <Field label="Stav">
          <select className="input py-1.5" value={task.status} onChange={e => changeStatus(e.target.value as TaskStatus)}>
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Priorita">
          <select className="input py-1.5" value={task.priority} onChange={e => updateTask(task.id, 'Zmenená priorita', t => { t.priority = +e.target.value })}>
            {PRIORITY_LABEL.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
        </Field>
        <Field label="Termín">
          <div className="flex items-center gap-2">
            <input type="date" className="input py-1.5" value={task.due_date ?? ''} onChange={e => updateTask(task.id, 'Zmenený termín', t => { t.due_date = e.target.value || null })} />
            {task.due_date && <button className="btn-ghost px-2 text-xs" onClick={() => updateTask(task.id, 'Odstránený termín', t => { t.due_date = null })}>Zrušiť</button>}
          </div>
        </Field>
        {task.due_date && <p className="pl-[96px] text-xs text-ink-500">{formatDayLong(task.due_date)}{['Dnes', 'Zajtra', 'Včera'].includes(relativeDay(task.due_date)) ? ` · ${relativeDay(task.due_date)}` : ''}</p>}
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="label">Podúlohy</span>
          {task.subtasks.length > 0 && <span className="text-xs text-ink-500">{task.subtasks.filter(s => s.done).length} z {task.subtasks.length} hotových</span>}
        </div>
        <div className="space-y-1">
          {task.subtasks.map(s => (
            <div key={s.id} className="group flex items-center gap-2">
              <CheckCircle small done={s.done} onClick={() => updateSubtask(task.id, s.id, s.done ? 'Podúloha otvorená' : 'Podúloha hotová', x => { x.done = !x.done })} />
              <EditableText value={s.title} onCommit={v => updateSubtask(task.id, s.id, 'Premenovaná podúloha', x => { x.title = v.trim() || x.title })}
                className={`min-w-0 flex-1 rounded px-1 py-0.5 text-sm outline-none focus:bg-canvas ${s.done ? 'text-ink-300 line-through' : ''}`} />
              <input type="date" value={s.due ?? ''} title="Termín podúlohy" onChange={e => updateSubtask(task.id, s.id, 'Termín podúlohy', x => { x.due = e.target.value || null })}
                className="w-[118px] rounded border border-transparent bg-transparent px-1 text-xs text-ink-500 hover:border-line" />
              <button className="rounded p-1 text-ink-300 hover:text-red-600 md:opacity-0 md:group-hover:opacity-100" onClick={() => deleteSubtask(task.id, s.id)} aria-label="Zmazať podúlohu"><Trash2 size={13} /></button>
            </div>
          ))}
          <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); if (newSub.trim()) { addSubtask(task.id, newSub); setNewSub(''); if (!ui.expanded.has(task.id)) ui.toggleExpanded(task.id) } }}>
            <Plus size={14} className="text-ink-300" />
            <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="Pridať podúlohu" className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" />
          </form>
        </div>
      </div>

      <AttachmentsSection taskId={task.id} />

      <div>
        <span className="label">Poznámka</span>
        <EditableText multiline value={task.note} onCommit={v => updateTask(task.id, 'Upravená poznámka', t => { t.note = v })} placeholder="Poznámka…"
          className="input mt-1 min-h-[120px] resize-y" />
      </div>

      <div className="flex items-center justify-between border-t border-line pt-3 text-xs text-ink-300">
        <span>Vytvorené {formatDateTime(task.created_at)}{task.completed_at ? ` · hotové ${formatDateTime(task.completed_at)}` : ''}</span>
        <button className="btn-danger px-2" onClick={async () => {
          const v = await ui.confirm({
            title: `Zmazať úlohu „${task.title}“?`,
            message: attCount > 0 ? `Natrvalo sa zmaže aj ${attCount} ${attCount === 1 ? 'príloha' : attCount < 5 ? 'prílohy' : 'príloh'}. Úlohu bude možné vrátiť tlačidlom Späť, prílohy nie.` : 'Dá sa vrátiť tlačidlom Späť.',
            buttons: [{ label: 'Zmazať', value: 'del', tone: 'danger' }],
          })
          if (!v) return
          if (attCount > 0) {
            try { await deleteAllForTask(task.id) } catch (e) { ui.toast(`Prílohy sa nepodarilo zmazať: ${(e as Error).message}`); return }
          }
          ui.select(null); deleteTask(task.id); ui.toast('Úloha zmazaná', { undo: true })
        }}><Trash2 size={14} />Zmazať</button>
      </div>
    </div>
  )
}

function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const { data } = useStore()
  const ui = useUi()
  const projects = activeProjects(data)
  const day = dayOfIso(meeting.starts_at)
  const start = timeOf(meeting.starts_at)
  const dur = minutesBetween(meeting.starts_at, meeting.ends_at)
  const clash = conflicts(data, meeting.starts_at, meeting.ends_at, meeting.id)

  const setStart = (newDay: string, newTime: string) => {
    const t = parseTime(newTime)
    if (!t || !newDay) return
    const s = zonedToUtc(newDay, t.hh, t.mm)
    updateMeeting(meeting.id, 'Presunuté stretnutie', m => { m.starts_at = s.toISOString(); m.ends_at = new Date(s.getTime() + dur * 60000).toISOString() })
  }
  const setDuration = (min: number) => {
    if (!min || min < 5) return
    updateMeeting(meeting.id, 'Zmenená dĺžka', m => { m.ends_at = new Date(new Date(m.starts_at).getTime() + min * 60000).toISOString() })
  }

  return (
    <div className="space-y-5 p-4">
      <EditableText value={meeting.title} onCommit={v => updateMeeting(meeting.id, 'Premenované stretnutie', m => { m.title = v })}
        className="w-full rounded-md px-1 py-0.5 text-lg font-semibold outline-none focus:bg-canvas" />
      <div className="space-y-2.5">
        <Field label="Dátum"><input type="date" className="input py-1.5" value={day} onChange={e => setStart(e.target.value, start)} /></Field>
        <Field label="Začiatok"><input type="time" className="input py-1.5" value={start} onChange={e => setStart(day, e.target.value)} /></Field>
        <Field label="Dĺžka">
          <div className="flex items-center gap-2">
            <select className="input py-1.5" value={[15, 30, 45, 60, 90, 120, 180, 240].includes(dur) ? dur : 'x'} onChange={e => setDuration(+e.target.value)}>
              {[15, 30, 45, 60, 90, 120, 180, 240].map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`.replace('.5', ',5')}</option>)}
              {![15, 30, 45, 60, 90, 120, 180, 240].includes(dur) && <option value="x">{dur} min</option>}
            </select>
            <span className="whitespace-nowrap text-xs text-ink-500">do {timeOf(meeting.ends_at)}</span>
          </div>
        </Field>
        <p className="pl-[96px] text-xs text-ink-500">{formatDayLong(day)} · {start}–{timeOf(meeting.ends_at)}</p>
        <Field label="Projekt">
          <select className="input py-1.5" value={meeting.project_id ?? ''} onChange={e => updateMeeting(meeting.id, 'Zmenený projekt', m => { m.project_id = e.target.value || null })}>
            <option value="">Bez projektu</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Miesto">
          <EditableText value={meeting.location} placeholder="Miesto alebo odkaz" onCommit={v => updateMeeting(meeting.id, 'Zmenené miesto', m => { m.location = v })} className="input py-1.5" />
        </Field>
      </div>

      {clash.length > 0 && (
        <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div><div className="font-medium">Prekrýva sa s:</div>{clash.map(c => <div key={c.id} className="text-xs">{describeMeeting(c)}</div>)}</div>
        </div>
      )}

      <div>
        <span className="label">Poznámka</span>
        <EditableText multiline value={meeting.note} onCommit={v => updateMeeting(meeting.id, 'Upravená poznámka', m => { m.note = v })} placeholder="Poznámka…"
          className="input mt-1 min-h-[120px] resize-y" />
      </div>

      <div className="flex justify-end border-t border-line pt-3">
        <button className="btn-danger px-2" onClick={async () => {
          const v = await ui.confirm({ title: `Zmazať stretnutie „${meeting.title}“?`, message: 'Dá sa vrátiť tlačidlom Späť.', buttons: [{ label: 'Zmazať', value: 'del', tone: 'danger' }] })
          if (v) { ui.select(null); deleteMeeting(meeting.id); ui.toast('Stretnutie zmazané', { undo: true }) }
        }}><Trash2 size={14} />Zmazať stretnutie</button>
      </div>
    </div>
  )
}
