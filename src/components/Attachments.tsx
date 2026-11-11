import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Download, File, FileImage, FileSpreadsheet, FileText, Loader2, Paperclip, Presentation, Trash2, Upload } from 'lucide-react'
import { deleteAttachment, formatSize, listAttachments, openAttachment, uploadAttachment, type Attachment } from '../lib/attachments'
import { formatDateTime } from '../lib/dates'
import { useUi } from './ui'

function iconFor(a: Attachment) {
  const n = a.name.toLowerCase()
  if (/\.(xlsx?|csv|numbers)$/.test(n)) return <FileSpreadsheet size={16} className="text-emerald-600" />
  if (/\.(pptx?|key)$/.test(n)) return <Presentation size={16} className="text-orange-500" />
  if (/\.(png|jpe?g|gif|webp|heic|svg)$/.test(n)) return <FileImage size={16} className="text-violet-500" />
  if (/\.(pdf|docx?|txt|rtf|pages|md)$/.test(n)) return <FileText size={16} className={n.endsWith('.pdf') ? 'text-red-500' : 'text-accent-500'} />
  return <File size={16} className="text-ink-500" />
}

export function AttachmentsSection({ taskId }: { taskId: string }) {
  const ui = useUi()
  const [items, setItems] = useState<Attachment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(0)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    listAttachments(taskId).then(l => alive && setItems(l)).catch(e => alive && (setItems([]), setError(e.message)))
    return () => { alive = false }
  }, [taskId])

  const upload = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    setError(null)
    const list = Array.from(files)
    setBusy(list.length)
    for (const f of list) {
      try {
        const a = await uploadAttachment(taskId, f)
        setItems(x => [...(x ?? []), a])
      } catch (e) { setError((e as Error).message) }
      setBusy(b => b - 1)
    }
  }

  const remove = async (a: Attachment) => {
    const v = await ui.confirm({ title: `Zmazať prílohu „${a.name}“?`, message: 'Súbor sa natrvalo odstráni.', buttons: [{ label: 'Zmazať', value: 'del', tone: 'danger' }] })
    if (!v) return
    try { await deleteAttachment(a); setItems(x => (x ?? []).filter(y => y.id !== a.id)); ui.toast('Príloha zmazaná') }
    catch (e) { setError((e as Error).message) }
  }

  const open = (a: Attachment, download: boolean) => { openAttachment(a, download).catch(e => setError(e.message)) }

  return (
    <div
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true) } }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files) } }}
      className={clsx('rounded-lg transition', drag && 'bg-accent-50 ring-2 ring-accent-500/40')}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="label">Prílohy</span>
        {items && items.length > 0 && <span className="text-xs text-ink-500">{items.length}</span>}
        <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => input.current?.click()} disabled={busy > 0}>
          {busy > 0 ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}{busy > 0 ? `Nahrávam (${busy})…` : 'Pridať súbor'}
        </button>
        <input ref={input} type="file" multiple hidden aria-label="Vybrať súbory" onChange={e => { void upload(e.target.files ? Array.from(e.target.files) : null); e.target.value = '' }} />
      </div>

      {items === null ? <p className="text-xs text-ink-300">Načítavam…</p> : items.length === 0 ? (
        <button onClick={() => input.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line py-3 text-xs text-ink-500 hover:border-accent-500 hover:text-accent-600">
          <Paperclip size={14} /><span className="hidden md:inline">Pretiahnite sem súbory (PDF, Excel, Word…) alebo kliknite</span><span className="md:hidden">Pridať súbor</span>
        </button>
      ) : (
        <div className="space-y-0.5">
          {items.map(a => (
            <div key={a.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-black/[0.03]">
              {iconFor(a)}
              <button className="min-w-0 flex-1 text-left" onClick={() => open(a, false)} title="Otvoriť">
                <span className="block truncate text-sm hover:underline">{a.name}</span>
                <span className="block text-[11px] text-ink-300">{formatSize(a.size)} · {formatDateTime(a.created_at)}</span>
              </button>
              <button className="rounded p-1 text-ink-300 hover:text-ink-700" onClick={() => open(a, true)} aria-label="Stiahnuť" title="Stiahnuť"><Download size={14} /></button>
              <button className="rounded p-1 text-ink-300 hover:text-red-600" onClick={() => remove(a)} aria-label="Zmazať prílohu" title="Zmazať"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-[11px] text-ink-300">Max. 50 MB na súbor · prílohy vyžadujú internet</p>
    </div>
  )
}
