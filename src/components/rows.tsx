import { useState, type DragEvent } from 'react'
import clsx from 'clsx'
import { Check, ChevronRight, Flag, GripVertical, MapPin, StickyNote } from 'lucide-react'
import { useStore } from '../lib/store'
import { isDone, openSubs, projectOf, setStatus, updateSubtask } from '../lib/actions'
import { relativeDay, timeOf, today, formatDay, dayOfIso } from '../lib/dates'
import type { Meeting, Task } from '../lib/types'
import { Dot, useUi } from './ui'

/** Dokončenie úlohy; pri otvorených podúlohách sa opýta */
export function useToggleDone() {
  const ui = useUi()
  return async (t: Task) => {
    if (isDone(t)) { setStatus(t.id, 'todo'); ui.toast(`Znovu otvorené: „${t.title}“`, { undo: true }); return }
    const open = openSubs(t)
    if (open > 0) {
      const v = await ui.confirm({
        title: `Dokončiť „${t.title}“?`,
        message: `Úloha má ${open} ${open === 1 ? 'nedokončenú podúlohu' : open < 5 ? 'nedokončené podúlohy' : 'nedokončených podúloh'}.`,
        buttons: [{ label: 'Dokončiť aj podúlohy', value: 'all', tone: 'primary' }, { label: 'Iba hlavnú úlohu', value: 'main' }],
      })
      if (!v) return
      setStatus(t.id, 'done', v === 'all')
    } else setStatus(t.id, 'done')
    ui.toast(`Hotovo: „${t.title}“`, { undo: true })
  }
}

export function CheckCircle({ done, onClick, small }: { done: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick() }} aria-label={done ? 'Označiť ako nehotové' : 'Označiť ako hotové'}
      className={clsx('focus-ring flex shrink-0 items-center justify-center rounded-full border transition',
        small ? 'h-4 w-4' : 'h-[18px] w-[18px]',
        done ? 'border-accent-500 bg-accent-500 text-white' : 'border-ink-300 hover:border-accent-500 bg-white')}>
      {done && <Check size={small ? 10 : 12} strokeWidth={3} />}
    </button>
  )
}

export function PriorityFlag({ p }: { p: number }) {
  if (!p) return null
  return <Flag size={13} className={p === 3 ? 'text-red-500' : p === 2 ? 'text-amber-500' : 'text-ink-300'} fill={p >= 2 ? 'currentColor' : 'none'} />
}

interface TaskRowProps {
  task: Task
  showProject?: boolean
  showDue?: boolean
  draggable?: boolean
  onDropOn?: (draggedId: string, targetId: string) => void
}

export function TaskRow({ task, showProject = true, showDue = true, draggable, onDropOn }: TaskRowProps) {
  const { data } = useStore()
  const ui = useUi()
  const toggle = useToggleDone()
  const [over, setOver] = useState(false)
  const expanded = ui.expanded.has(task.id)
  const selected = ui.selected?.kind === 'task' && ui.selected.id === task.id
  const p = projectOf(data, task.project_id)
  const done = isDone(task)
  const overdue = !done && task.due_date && task.due_date < today()
  const dn = task.subtasks.filter(s => s.done).length

  const dragProps = draggable ? {
    draggable: true,
    onDragStart: (e: DragEvent) => { e.dataTransfer.setData('text/task', task.id); e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes('text/task')) { e.preventDefault(); setOver(true) } },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/task'); if (id && id !== task.id) onDropOn?.(id, task.id) },
  } : {}

  return (
    <div className={clsx('group rounded-lg', over && 'ring-2 ring-accent-500/40')} {...dragProps}>
      <div onClick={() => ui.select({ kind: 'task', id: task.id })}
        className={clsx('flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 md:py-1.5', selected ? 'bg-accent-50' : 'hover:bg-black/[0.03]')}>
        {draggable && <GripVertical size={14} className="-ml-1 hidden shrink-0 cursor-grab text-ink-300 opacity-0 group-hover:opacity-100 md:block" />}
        <CheckCircle done={done} onClick={() => toggle(task)} />
        {task.subtasks.length > 0 ? (
          <button onClick={e => { e.stopPropagation(); ui.toggleExpanded(task.id) }} className="focus-ring -mx-0.5 rounded p-0.5 text-ink-300 hover:text-ink-700" aria-label="Podúlohy">
            <ChevronRight size={14} className={clsx('transition', expanded && 'rotate-90')} />
          </button>
        ) : null}
        <span className={clsx('min-w-0 flex-1 truncate text-sm', done && 'text-ink-300 line-through')}>{task.title}</span>
        {task.status === 'in_progress' && <span className="hidden rounded-full bg-accent-50 px-2 py-0.5 text-[11px] text-accent-600 sm:inline">Rozpracované</span>}
        <PriorityFlag p={task.priority} />
        {task.note && <StickyNote size={13} className="text-ink-300" />}
        {task.subtasks.length > 0 && <span className="num whitespace-nowrap text-xs text-ink-500">{dn} z {task.subtasks.length}<span className="hidden sm:inline"> hotových</span></span>}
        {showDue && task.due_date && <span className={clsx('num whitespace-nowrap text-xs', overdue ? 'font-medium text-red-600' : 'text-ink-500')}>{relativeDay(task.due_date)}</span>}
        {showProject && p && <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-ink-500 sm:flex"><Dot color={p.color} />{p.name}</span>}
      </div>
      {expanded && task.subtasks.map(s => (
        <div key={s.id} className="flex items-center gap-2 py-1 pl-10 pr-2 md:pl-12">
          <CheckCircle small done={s.done} onClick={() => updateSubtask(task.id, s.id, s.done ? 'Podúloha otvorená' : 'Podúloha hotová', x => { x.done = !x.done })} />
          <span className={clsx('min-w-0 flex-1 truncate text-sm', s.done && 'text-ink-300 line-through')}>{s.title}</span>
          {s.due && <span className="text-xs text-ink-500">{relativeDay(s.due)}</span>}
        </div>
      ))}
    </div>
  )
}

export function MeetingRow({ meeting, showDate }: { meeting: Meeting; showDate?: boolean }) {
  const { data } = useStore()
  const ui = useUi()
  const p = projectOf(data, meeting.project_id)
  const selected = ui.selected?.kind === 'meeting' && ui.selected.id === meeting.id
  return (
    <div onClick={() => ui.select({ kind: 'meeting', id: meeting.id })}
      className={clsx('flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 md:py-1.5', selected ? 'bg-accent-50' : 'hover:bg-black/[0.03]')}>
      <span className="h-5 w-1 shrink-0 rounded-full" style={{ background: p?.color ?? '#aab0bd' }} />
      <span className="num w-[86px] shrink-0 whitespace-nowrap text-xs text-ink-500">
        {showDate ? `${relativeDay(dayOfIso(meeting.starts_at)) || formatDay(dayOfIso(meeting.starts_at))} ${timeOf(meeting.starts_at)}` : `${timeOf(meeting.starts_at)}–${timeOf(meeting.ends_at)}`}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{meeting.title}</span>
      {meeting.location && <span className="hidden items-center gap-1 truncate text-xs text-ink-500 sm:flex"><MapPin size={12} />{meeting.location}</span>}
      {p && <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-ink-500 sm:flex"><Dot color={p.color} />{p.name}</span>}
    </div>
  )
}
