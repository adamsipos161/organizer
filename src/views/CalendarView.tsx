import { useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../lib/store'
import { isDone, meetingsOn, projectOf, tasksDue } from '../lib/actions'
import { addDays, addMonths, formatDay, monthTitle, startOfWeek, timeOf, today, WEEKDAYS_SHORT, weekday } from '../lib/dates'
import type { Data, Meeting, Task } from '../lib/types'
import { CheckCircle, useToggleDone } from '../components/rows'
import { useUi } from '../components/ui'

export function CalendarView() {
  const [mode, setMode] = useState<'week' | 'month'>(() => (window.innerWidth < 768 ? 'week' : 'week'))
  const [anchor, setAnchor] = useState(today())
  const step = (dir: number) => setAnchor(mode === 'week' ? addDays(anchor, 7 * dir) : addMonths(anchor, dir))
  const ws = startOfWeek(anchor)
  const title = mode === 'month' ? monthTitle(anchor) : `${formatDay(ws)} – ${formatDay(addDays(ws, 6))}`

  return (
    <div className="flex h-full flex-col px-3 pb-6 pt-4 md:px-6 md:pb-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold md:text-2xl">{title}</h1>
        <div className="flex rounded-lg border border-line bg-white p-0.5 text-sm">
          {(['week', 'month'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={clsx('rounded-md px-3 py-1', mode === m ? 'bg-accent-50 font-medium text-accent-600' : 'text-ink-500')}>{m === 'week' ? 'Týždeň' : 'Mesiac'}</button>
          ))}
        </div>
        <button className="btn-outline px-2" onClick={() => step(-1)} aria-label="Späť"><ChevronLeft size={16} /></button>
        <button className="btn-outline" onClick={() => setAnchor(today())}>Dnes</button>
        <button className="btn-outline px-2" onClick={() => step(1)} aria-label="Ďalej"><ChevronRight size={16} /></button>
      </div>
      {mode === 'week' ? <Week start={ws} /> : <Month anchor={anchor} />}
    </div>
  )
}

function Week({ start }: { start: string }) {
  const { data } = useStore()
  const ui = useUi()
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-7 md:gap-0 md:overflow-hidden md:rounded-xl md:border md:border-line md:bg-white">
      {days.map(day => {
        const isToday = day === today()
        return (
          <div key={day} onDoubleClick={() => ui.openQuickAdd(quickPrefix(day))}
            className={clsx('min-h-[64px] rounded-xl border border-line bg-white p-2 md:min-h-[420px] md:rounded-none md:border-0 md:border-r md:last:border-r-0', isToday && 'bg-accent-50/50')}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className={clsx('text-sm', isToday ? 'font-semibold text-accent-600' : 'text-ink-500')}>{WEEKDAYS_SHORT[weekday(day)]} {+day.slice(8)}.</span>
              <button className="text-xs text-ink-300 hover:text-accent-600" onClick={() => ui.openQuickAdd(quickPrefix(day))} aria-label="Pridať">+</button>
            </div>
            <DayItems data={data} day={day} />
          </div>
        )
      })}
    </div>
  )
}

function Month({ anchor }: { anchor: string }) {
  const { data } = useStore()
  const ui = useUi()
  const first = anchor.slice(0, 8) + '01'
  const gs = startOfWeek(first)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gs, i))
  const month = first.slice(0, 7)
  return (
    <div className="flex-1 overflow-hidden rounded-xl border border-line bg-white">
      <div className="grid grid-cols-7 border-b border-line text-center text-xs text-ink-500">
        {['po', 'ut', 'st', 'št', 'pi', 'so', 'ne'].map(d => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map(day => {
          const isToday = day === today()
          return (
            <div key={day} onClick={() => ui.openQuickAdd(quickPrefix(day))}
              className={clsx('min-h-[64px] cursor-pointer border-b border-r border-line p-1 md:min-h-[104px] md:p-1.5', !day.startsWith(month) && 'bg-canvas/70 text-ink-300', isToday && 'bg-accent-50/50')}>
              <div className={clsx('mb-1 text-xs', isToday && 'font-semibold text-accent-600')}>{+day.slice(8)}</div>
              <DayItems data={data} day={day} compact />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayItems({ data, day, compact }: { data: Data; day: string; compact?: boolean }) {
  const ms = meetingsOn(data, day)
  const ts = tasksDue(data, day)
  const max = compact ? 3 : 50
  const items: ({ k: 'm'; v: Meeting } | { k: 't'; v: Task })[] = [...ms.map(v => ({ k: 'm' as const, v })), ...ts.map(v => ({ k: 't' as const, v }))]
  return (
    <div className="space-y-1">
      {items.slice(0, max).map(it => it.k === 'm' ? <MeetingChip key={it.v.id} m={it.v} compact={compact} /> : <TaskChip key={it.v.id} t={it.v} compact={compact} />)}
      {items.length > max && <div className="text-[11px] text-ink-500">+ {items.length - max} ďalšie</div>}
    </div>
  )
}

function MeetingChip({ m, compact }: { m: Meeting; compact?: boolean }) {
  const { data } = useStore()
  const ui = useUi()
  const c = projectOf(data, m.project_id)?.color ?? '#7A8794'
  return (
    <button onClick={e => { e.stopPropagation(); ui.select({ kind: 'meeting', id: m.id }) }}
      className="flex w-full items-start gap-1 rounded-md px-1.5 py-1 text-left text-xs leading-tight" style={{ background: `${c}22` }}>
      <span className="num shrink-0 text-ink-500">{timeOf(m.starts_at)}</span>
      <span className={clsx('min-w-0', compact ? 'truncate' : 'line-clamp-2')}>{m.title}</span>
    </button>
  )
}

function TaskChip({ t, compact }: { t: Task; compact?: boolean }) {
  const ui = useUi()
  const toggle = useToggleDone()
  return (
    <div onClick={e => { e.stopPropagation(); ui.select({ kind: 'task', id: t.id }) }} className="flex cursor-pointer items-center gap-1.5 px-1 py-0.5 text-xs">
      <CheckCircle small done={isDone(t)} onClick={() => toggle(t)} />
      <span className={clsx('min-w-0', compact ? 'truncate' : 'line-clamp-2')}>{t.title}</span>
    </div>
  )
}

const quickPrefix = (day: string) => `${+day.slice(8)}.${+day.slice(5, 7)}.${day.slice(0, 4)} `
