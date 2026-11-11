import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { configError, supabase } from './lib/supabase'
import { store, useStore } from './lib/store'
import { Layout } from './components/Layout'
import { LoginView } from './views/Login'
import { SearchView, TaskListView, TodayView, UpcomingView } from './views/Lists'
import { CalendarView } from './views/CalendarView'
import { SettingsView } from './views/Settings'

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [search, setSearch] = useState('')
  const { loaded } = useStore()

  useEffect(() => {
    if (configError) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user) void store.start(session.user.id)
    else if (session === null) store.stop()
  }, [session?.user?.id, session])

  if (configError) return <div className="m-6 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{configError}</div>
  if (session === undefined) return null
  if (!session) return <LoginView />
  if (!loaded) return <div className="flex h-full items-center justify-center text-sm text-ink-500">Načítavam…</div>

  return (
    <Layout search={search} setSearch={setSearch}>
      {search.trim() ? <SearchView query={search} /> : (
        <Routes>
          <Route path="/" element={<TodayView />} />
          <Route path="/najblizsie" element={<UpcomingView />} />
          <Route path="/kalendar" element={<CalendarView />} />
          <Route path="/inbox" element={<TaskListView inbox key="inbox" />} />
          <Route path="/projekt/:id" element={<TaskListView />} />
          <Route path="/nastavenia" element={<SettingsView email={session.user.email ?? ''} />} />
          <Route path="*" element={<TodayView />} />
        </Routes>
      )}
    </Layout>
  )
}
