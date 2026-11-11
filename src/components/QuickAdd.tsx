import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CalendarClock, CheckSquare, CornerDownLeft, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { parseQuick } from '../lib/parse'
import { addMeeting, addTask, conflicts, describeMeeting } from '../lib/actions'
import { formatDayLong, parseTime, zonedToUtc } from '../lib/dates'
import { PRIORITY_LABEL } from '../lib/types'
import { Dot, useUi } from './ui'

/**
 * Rýchle zadávanie: jeden riadok v slovenčine → úloha alebo stretnutie.
 * Pred uložením vždy ukáže, ako text pochopilo (konkrétny dátum, čas, projekt).
 */
export function QuickAdd({ defaultProjectId }: { defaultProjectId: string | null }) {
  const { data } = useStore()
  const ui = useUi()
  const [text, setText] = useState('')
  const [kindOverride, setKindOverride] = useState<'task' | 'meeting' | null>(null)
  const [dayOverride, setDayOverride] = useState<string | null>(null)
  const [time, setTime] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ui.quickAdd.nonce === 0) return
    setText(ui.quickAdd.text); setKindOverride(null); setDayOverride(null); setTime('')
    setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }, 0)
  }, [ui.quickAdd])

  const projects = useMemo(() => data.projects.map(p => ({ id: p.id, name: p.name, archived: p.archived })), [data.projects])
  const parsed = useMemo(() => (text.trim() ? parseQuick(text, projects) : null), [text, projects])
  useEffect(() => { setDayOverride(null); setKindOverride(null) }, [text])

  const kind = kindOverride ?? parsed?.kind ?? 'task'
  const projectId = parsed?.projectId ?? defaultProjectId
  const project = data.projects.find(p => p.id === projectId) ?? null
  const day = dayOverride ?? parsed?.day ?? null
  const manualTime = parseTime(time)
  const start = parsed?.start ?? manualTime
  const minutes = parsed?.durationMin ?? data.settings?.default_meeting_minutes ?? 60
  const needsTime = kind === 'meeting' && !start
  const meetingDay = day ?? (kind === 'meeting' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava' }).format(new Date()) : null)

  const clash = useMemo(() => {
    if (kind !== 'meeting' || !start || !meetingDay) return []
    const s = zonedToUtc(meetingDay, start.hh, start.mm)
    return conflicts(data, s.toISOString(), new Date(s.getTime() + minutes * 60000).toISOString())
  }, [kind, start, meetingDay, minutes, data])

  const canSave = !!parsed?.title && !needsTime

  const save = () => {
    if (!parsed) return
    if (!parsed.title) return
    if (needsTime) { timeRef.current?.focus(); return }
    if (kind === 'meeting' && start && meetingDay) {
      addMeeting({ title: parsed.title, project_id: projectId, day: meetingDay, hh: start.hh, mm: start.mm, minutes })
      ui.toast(`Stretnutie „${parsed.title}“ · ${formatDayLong(meetingDay)} ${hm(start)}${clash.length ? ' · pozor, prekrýva sa' : ''}`, { undo: true })
    } else {
      addTask({ title: parsed.title, project_id: projectId, due_date: day, priority: parsed.priority })
      ui.toast(`Úloha „${parsed.title}“${day ? ` · termín ${formatDayLong(day)}` : ''} · ${project?.name ?? 'Inbox'}`, { undo: true })
    }
    setText(''); setTime('')
  }

  return (
    <div className="relative w-full">
      <div className={clsx('flex items-center gap-2 rounded-xl border bg-white px-3 shadow-sm transition', parsed ? 'border-accent-500 ring-2 ring-accent-500/15' : 'border-line')}>
        <Plus size={16} className="shrink-0 text-ink-300" />
        <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} data-quickadd
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') { setText(''); inputRef.current?.blur() } }}
          placeholder={window.innerWidth < 640 ? "Pridať úlohu alebo stretnutie…" : "Pridať… napr. „zajtra o 10 stretnutie s Radom #swan“ alebo „TZ do piatku !“"}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-ink-300" aria-label="Rýchle pridanie" />
        {parsed && (
          <button onClick={save} disabled={!canSave} className="btn-primary hidden px-2.5 py-1 text-xs sm:inline-flex">
            Pridať <CornerDownLeft size={12} />
          </button>
        )}
      </div>

      {parsed && (
        <div className="absolute inset-x-0 bottom-full z-30 mb-1.5 max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-white p-3 text-sm shadow-lg">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button onClick={() => setKindOverride(kind === 'task' ? 'meeting' : 'task')} title="Prepnúť úloha / stretnutie"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent-50 px-2 py-1 font-medium text-accent-600 hover:bg-accent-100">
              {kind === 'task' ? <CheckSquare size={14} /> : <CalendarClock size={14} />}{kind === 'task' ? 'Úloha' : 'Stretnutie'}
            </button>
            <span className="font-medium">{parsed.title || <span className="text-red-600">chýba názov</span>}</span>
            <span className="inline-flex items-center gap-1 text-ink-500"><Dot color={project?.color} />{project?.name ?? 'Inbox'}</span>
            {kind === 'task' && <span className="text-ink-500">{day ? `termín ${formatDayLong(day)}` : 'bez termínu'}</span>}
            {kind === 'meeting' && meetingDay && <span className="text-ink-500">{formatDayLong(meetingDay)}{start ? ` ${hm(start)}–${hm(addMin(start, minutes))}` : ''}</span>}
            {parsed.priority > 0 && kind === 'task' && <span className="text-red-600">{PRIORITY_LABEL[parsed.priority]} priorita</span>}
          </div>

          {kind === 'meeting' && !parsed.start && (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-ink-700">O koľkej?</span>
              <input ref={timeRef} type="time" value={time} onChange={e => setTime(e.target.value)} className="input w-28 py-1"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
              <button className="btn-ghost text-xs" onClick={() => setKindOverride('task')}>Je to úloha</button>
            </div>
          )}
          {parsed.alternative && (
            <div className="mt-2 text-xs text-ink-500">
              {dayOverride ? 'Zvolené: ' : 'Myslíte iný deň? '}
              <button className="font-medium text-accent-600 hover:underline" onClick={() => setDayOverride(dayOverride ? null : parsed.alternative!.day)}>
                {dayOverride ? `späť na ${formatDayLong(parsed.day!)}` : parsed.alternative.label}
              </button>
            </div>
          )}
          {clash.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />Prekrýva sa s: {clash.map(describeMeeting).join('; ')}
            </div>
          )}
          {parsed.notes.map(n => <div key={n} className="mt-1.5 text-xs text-ink-500">{n}</div>)}
          <div className="mt-2 hidden text-[11px] text-ink-300 md:block">Enter = uložiť · Esc = zrušiť · #projekt · ! = vysoká priorita</div>
          <button onClick={save} disabled={!canSave} className="btn-primary mt-2.5 w-full py-2 sm:hidden">Pridať</button>
        </div>
      )}
    </div>
  )
}

const hm = (t: { hh: number; mm: number }) => `${t.hh}:${String(t.mm).padStart(2, '0')}`
const addMin = (t: { hh: number; mm: number }, m: number) => { const x = t.hh * 60 + t.mm + m; return { hh: Math.floor(x / 60) % 24, mm: x % 60 } }
