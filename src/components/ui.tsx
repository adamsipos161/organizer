import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { store } from '../lib/store'
import type { ItemRef } from '../lib/types'

interface Toast { id: number; text: string; undo?: boolean }
interface ConfirmOpts { title: string; message?: string; buttons: { label: string; value: string; tone?: 'primary' | 'danger' | 'plain' }[] }

interface UiCtx {
  selected: ItemRef | null
  select: (r: ItemRef | null) => void
  toast: (text: string, opts?: { undo?: boolean }) => void
  confirm: (o: ConfirmOpts) => Promise<string | null>
  quickAdd: { text: string; nonce: number }
  openQuickAdd: (text?: string) => void
  expanded: Set<string>
  toggleExpanded: (id: string) => void
}

const Ctx = createContext<UiCtx | null>(null)
export const useUi = () => useContext(Ctx)!

export function UiProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ItemRef | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: string | null) => void }) | null>(null)
  const [quickAdd, setQuickAdd] = useState({ text: '', nonce: 0 })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const seq = useRef(0)

  const toast = useCallback((text: string, opts?: { undo?: boolean }) => {
    const id = ++seq.current
    setToasts(t => [...t.slice(-2), { id, text, undo: opts?.undo }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6000)
  }, [])

  const confirm = useCallback((o: ConfirmOpts) => new Promise<string | null>(resolve => setDialog({ ...o, resolve })), [])
  const openQuickAdd = useCallback((text = '') => setQuickAdd(q => ({ text, nonce: q.nonce + 1 })), [])
  const toggleExpanded = useCallback((id: string) => setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }), [])

  const close = (v: string | null) => { dialog?.resolve(v); setDialog(null) }

  return (
    <Ctx.Provider value={{ selected, select: setSelected, toast, confirm, quickAdd, openQuickAdd, expanded, toggleExpanded }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[200px] z-50 flex flex-col items-center gap-2 px-3 md:bottom-20">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-ink-900 px-4 py-2.5 text-sm text-white shadow-lg">
            <span className="min-w-0 flex-1">{t.text}</span>
            {t.undo && (
              <button className="font-semibold text-accent-100 hover:text-white" onClick={() => {
                const l = store.undo(); setToasts(x => x.filter(y => y.id !== t.id)); if (l) toast(`Vrátené: ${l}`)
              }}>Späť</button>
            )}
            <button className="text-white/50 hover:text-white" onClick={() => setToasts(x => x.filter(y => y.id !== t.id))} aria-label="Zavrieť"><X size={14} /></button>
          </div>
        ))}
      </div>
      {dialog && <Dialog opts={dialog} onClose={close} />}
    </Ctx.Provider>
  )
}

function Dialog({ opts, onClose }: { opts: ConfirmOpts; onClose: (v: string | null) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-3 md:items-center" onClick={() => onClose(null)}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal>
        <h2 className="text-base font-semibold">{opts.title}</h2>
        {opts.message && <p className="mt-1.5 text-sm text-ink-500">{opts.message}</p>}
        <div className="mt-4 flex flex-col gap-2">
          {opts.buttons.map((b, i) => (
            <button key={b.value} autoFocus={i === 0}
              className={b.tone === 'danger' ? 'btn border border-red-200 bg-red-50 py-2 text-red-700 hover:bg-red-100' : b.tone === 'primary' ? 'btn-primary py-2' : 'btn-outline py-2'}
              onClick={() => onClose(b.value)}>{b.label}</button>
          ))}
          <button className="btn-ghost py-2" onClick={() => onClose(null)}>Zrušiť</button>
        </div>
      </div>
    </div>
  )
}

export function Dot({ color, size = 8 }: { color?: string | null; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color ?? '#aab0bd' }} />
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-2 text-sm text-ink-300">{children}</p>
}
