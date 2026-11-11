// Prílohy k úlohám: súbor v Supabase Storage (súkromný bucket) + záznam v tabuľke attachments.
// Prílohy vyžadujú pripojenie na internet (súbory sa neukladajú v prehliadači).
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { store } from './store'
import { norm } from './parse'

export interface Attachment {
  id: string
  user_id: string
  task_id: string | null
  project_id: string | null
  name: string
  path: string
  size: number
  mime: string
  created_at: string
}

export const MAX_BYTES = 50 * 1024 * 1024
const BUCKET = 'attachments'

// Počet príloh pri každej úlohe (ikona sponky v zozname)
let counts = new Map<string, number>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(f => f())

/** Príloha patrí úlohe alebo celému projektu */
export type AttachmentOwner = { kind: 'task' | 'project'; id: string }
const keyOf = (o: AttachmentOwner) => `${o.kind}:${o.id}`
const col = (o: AttachmentOwner) => (o.kind === 'task' ? 'task_id' : 'project_id')
const ownerOf = (a: Attachment): AttachmentOwner => (a.task_id ? { kind: 'task', id: a.task_id } : { kind: 'project', id: a.project_id! })

export function useAttachmentCount(owner: AttachmentOwner): number {
  const k = keyOf(owner)
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => counts.get(k) ?? 0)
}

export async function refreshCounts() {
  const { data, error } = await supabase.from('attachments').select('task_id, project_id')
  if (error || !data) return
  const m = new Map<string, number>()
  for (const r of data as Attachment[]) { const k = keyOf(ownerOf(r)); m.set(k, (m.get(k) ?? 0) + 1) }
  counts = m
  emit()
}

export async function listAttachments(owner: AttachmentOwner): Promise<Attachment[]> {
  const { data, error } = await supabase.from('attachments').select('*').eq(col(owner), owner.id).order('created_at')
  if (error) throw new Error(friendly(error.message))
  const list = (data ?? []) as Attachment[]
  counts = new Map(counts).set(keyOf(owner), list.length); emit()
  return list
}

const safeName = (name: string) => {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot + 1) : ''
  const clean = (s: string) => norm(s).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'subor'
  return ext ? `${clean(base)}.${clean(ext).slice(0, 10)}` : clean(base)
}

export async function uploadAttachment(owner: AttachmentOwner, file: File): Promise<Attachment> {
  if (file.size > MAX_BYTES) throw new Error(`Súbor „${file.name}“ je väčší ako 50 MB.`)
  if (!navigator.onLine) throw new Error('Prílohy sa dajú nahrať iba s pripojením na internet.')
  // úloha musí byť uložená na serveri (mohla vzniknúť offline)
  await store.flush()
  if (store.status.pending > 0) throw new Error('Zmeny sa ešte neuložili na server. Skúste to o chvíľu.')
  const uid = store.userId!
  const path = `${uid}/${owner.kind === 'task' ? owner.id : `project-${owner.id}`}/${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (up.error) throw new Error(friendly(up.error.message))
  const row = { user_id: uid, task_id: owner.kind === 'task' ? owner.id : null, project_id: owner.kind === 'project' ? owner.id : null, name: file.name, path, size: file.size, mime: file.type || '' }
  const ins = await supabase.from('attachments').insert(row).select().single()
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(friendly(ins.error.message))
  }
  counts = new Map(counts).set(keyOf(owner), (counts.get(keyOf(owner)) ?? 0) + 1); emit()
  return ins.data as Attachment
}

/** Otvorí prílohu v novej karte (download = stiahnuť s pôvodným názvom) */
export async function openAttachment(a: Attachment, download = false) {
  // okno otvoríme hneď po kliknutí, inak ho Safari zablokuje
  const win = download ? null : window.open('', '_blank')
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 300, download ? { download: a.name } : undefined)
  if (error || !data) { win?.close(); throw new Error(friendly(error?.message ?? 'Súbor sa nepodarilo otvoriť.')) }
  if (win) win.location.href = data.signedUrl
  else { const link = document.createElement('a'); link.href = data.signedUrl; link.download = a.name; link.click() }
}

export async function deleteAttachment(a: Attachment) {
  const rm = await supabase.storage.from(BUCKET).remove([a.path])
  if (rm.error) throw new Error(friendly(rm.error.message))
  const del = await supabase.from('attachments').delete().eq('id', a.id)
  if (del.error) throw new Error(friendly(del.error.message))
  const k = keyOf(ownerOf(a))
  counts = new Map(counts).set(k, Math.max(0, (counts.get(k) ?? 1) - 1)); emit()
}

/** Pred zmazaním úlohy alebo projektu – zmaže aj ich súbory */
export async function deleteAllFor(owner: AttachmentOwner) {
  const list = await listAttachments(owner)
  if (list.length === 0) return
  const rm = await supabase.storage.from(BUCKET).remove(list.map(a => a.path))
  if (rm.error) throw new Error(friendly(rm.error.message))
  await supabase.from('attachments').delete().eq(col(owner), owner.id)
  counts = new Map(counts); counts.delete(keyOf(owner)); emit()
}

export function formatSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} kB`
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function friendly(msg: string): string {
  if (/Bucket not found/i.test(msg)) return 'Úložisko príloh nie je pripravené – spustite v Supabase SQL súbor pre prílohy.'
  if (/relation .*attachments.* does not exist|Could not find the table/i.test(msg)) return 'Tabuľka príloh chýba – spustite v Supabase SQL súbor pre prílohy.'
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return 'Súbor je príliš veľký (max. 50 MB).'
  if (/fetch|network/i.test(msg)) return 'Bez pripojenia na internet.'
  return msg
}
