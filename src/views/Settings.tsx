import { useRef, useState } from 'react'
import { Download, LogOut, Upload } from 'lucide-react'
import { store, useStore } from '../lib/store'
import { activeProjects, addProject, archivedProjects, exportBackup, importBackup, setDefaultMeetingMinutes, updateProject } from '../lib/actions'
import { supabase } from '../lib/supabase'
import { today } from '../lib/dates'
import { Dot, useUi } from '../components/ui'
import { Page } from './Lists'

export function SettingsView({ email }: { email: string }) {
  const { data, status } = useStore()
  const ui = useUi()
  const fileRef = useRef<HTMLInputElement>(null)
  const [newProject, setNewProject] = useState('')
  const minutes = data.settings?.default_meeting_minutes ?? 60

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `organizer-zaloha-${today()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const restore = async (f: File) => {
    const v = await ui.confirm({ title: 'Obnoviť dáta zo zálohy?', message: 'Aktuálne projekty, úlohy a stretnutia sa nahradia obsahom zálohy. Krok sa dá vrátiť tlačidlom Späť.', buttons: [{ label: 'Obnoviť', value: 'ok', tone: 'danger' }] })
    if (!v) return
    try {
      const r = importBackup(await f.text())
      ui.toast(`Obnovené: ${r.projects} projektov, ${r.tasks} úloh, ${r.meetings} stretnutí`, { undo: true })
    } catch (e) { ui.toast(`Obnova zlyhala: ${(e as Error).message}`) }
  }

  return (
    <Page title="Nastavenia">
      <section className="mt-4 rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold">Stretnutia</h2>
        <label className="mt-3 flex items-center gap-3 text-sm">
          Predvolená dĺžka
          <select className="input w-32 py-1.5" value={minutes} onChange={e => setDefaultMeetingMinutes(+e.target.value)}>
            {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold">Projekty</h2>
        <div className="mt-2 divide-y divide-line">
          {activeProjects(data).map(p => (
            <div key={p.id} className="flex items-center gap-2 py-2 text-sm">
              <Dot color={p.color} /><span className="flex-1">{p.name}</span>
              <button className="btn-ghost text-xs" onClick={() => { updateProject(p.id, 'Projekt archivovaný', x => { x.archived = true }); ui.toast('Projekt archivovaný – nič sa nezmazalo', { undo: true }) }}>Archivovať</button>
            </div>
          ))}
          {archivedProjects(data).map(p => (
            <div key={p.id} className="flex items-center gap-2 py-2 text-sm text-ink-500">
              <Dot color={p.color} /><span className="flex-1">{p.name} <span className="text-xs">(archív)</span></span>
              <button className="btn-ghost text-xs" onClick={() => updateProject(p.id, 'Projekt obnovený', x => { x.archived = false })}>Obnoviť</button>
            </div>
          ))}
        </div>
        <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); if (newProject.trim()) { addProject(newProject); setNewProject('') } }}>
          <input className="input" placeholder="Nový projekt" value={newProject} onChange={e => setNewProject(e.target.value)} />
          <button className="btn-primary" disabled={!newProject.trim()}>Pridať</button>
        </form>
        <p className="mt-2 text-xs text-ink-500">Archivácia nič nemaže – projekt sa len skryje zo zoznamu.</p>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold">Záloha</h2>
        <p className="mt-1 text-sm text-ink-500">Dáta sú uložené v databáze Supabase a v tomto prehliadači. Raz za čas si stiahnite zálohu do súboru.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-outline" onClick={download}><Download size={15} />Stiahnuť zálohu</button>
          <button className="btn-outline" onClick={() => fileRef.current?.click()}><Upload size={15} />Obnoviť zo zálohy…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = '' }} />
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">
        <h2 className="font-semibold">Účet a synchronizácia</h2>
        <p className="mt-1 text-ink-500">Prihlásený: {email}</p>
        <p className="mt-1 text-ink-500">
          {status.pending > 0 ? `Čaká na odoslanie: ${status.pending} zmien` : 'Všetko je uložené na serveri.'}
          {status.lastSyncedAt ? ` · posledná synchronizácia ${new Date(status.lastSyncedAt).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => { void store.flush().then(() => store.reload()) }}>Synchronizovať teraz</button>
          <button className="btn-outline" onClick={async () => {
            if (status.pending > 0) {
              const v = await ui.confirm({ title: 'Odhlásiť sa?', message: `${status.pending} zmien ešte nie je odoslaných na server. Po odhlásení sa stratia.`, buttons: [{ label: 'Odhlásiť aj tak', value: 'ok', tone: 'danger' }] })
              if (!v) return
            }
            await supabase.auth.signOut()
          }}><LogOut size={15} />Odhlásiť sa</button>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">
        <h2 className="font-semibold">Na iPhone ako aplikácia</h2>
        <p className="mt-1 text-ink-500">V Safari otvorte túto stránku → tlačidlo Zdieľať → „Pridať na plochu“. Organizér sa potom otvára ako samostatná aplikácia.</p>
        <h2 className="mt-4 font-semibold">Klávesové skratky (počítač)</h2>
        <ul className="mt-1 space-y-0.5 text-ink-500">
          <li><b>N</b> – pridať (rýchle zadávanie) · <b>/</b> – hľadať · <b>Esc</b> – zavrieť detail</li>
          <li><b>⌘Z</b> / <b>Ctrl+Z</b> – späť · <b>⇧⌘Z</b> – znova</li>
          <li><b>1–4</b> – Dnes, Najbližšie dni, Kalendár, Inbox</li>
        </ul>
      </section>
    </Page>
  )
}
