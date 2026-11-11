import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
// Podporuje nový publishable kľúč aj legacy anon kľúč. Oba sú verejné a chránené RLS.
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

export const configError: string | null = !url || !key
  ? 'Chýba konfigurácia Supabase. Nastavte VITE_SUPABASE_URL a VITE_SUPABASE_PUBLISHABLE_KEY (pozri .env.example a README).'
  : /service_role|sb_secret_/.test(key)
    ? 'Do frontendu bol vložený tajný (service_role/secret) kľúč. Použite iba publishable/anon kľúč.'
    : null

export const supabase: SupabaseClient = createClient(url ?? 'http://localhost', configError ? 'invalid' : key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
