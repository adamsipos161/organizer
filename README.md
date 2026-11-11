# Organizér

Osobná webová aplikácia na úlohy, podúlohy, projekty a stretnutia. Funguje v prehliadači na Macu aj na iPhone (dá sa pridať na plochu ako aplikácia).

**Stack:** React 19 + TypeScript + Vite · Tailwind CSS 4 · Supabase (PostgreSQL + Auth, plán Free) · Vercel (Hobby). Bez platených služieb a bez AI.

## Čo vie

- **Rýchle zadávanie v slovenčine** (bez AI): „zajtra o 10 stretnutie s Radom #swan“, „pripraviť TZ do piatku #swan !“, „budúci štvrtok od 14 do 15:30 natáčanie #štúdio“, „15.12. faktúry“. Pred uložením ukáže, ako text pochopilo (konkrétny deň a dátum, čas, projekt). Ak pri stretnutí chýba čas, opýta sa. Pri nejednoznačnom dátume („budúci štvrtok“) ponúkne druhú možnosť.
  - `#projekt` = projekt (stačí začiatok názvu), `!` = vysoká priorita
  - s časom = stretnutie, bez času = úloha s termínom
- **Pohľady:** Dnes, Najbližšie dni (14 dní), Kalendár (týždeň/mesiac), Inbox, projekty, archív projektov
- **Úlohy:** stav (na spravenie / rozpracované / hotovo), priorita, termín, poznámka, podúlohy s počítadlom „2 z 5 hotových“, zbalenie podúloh, otázka pri dokončení úlohy s otvorenými podúlohami, presun medzi projektmi, poradie potiahnutím. Hotové úlohy sú skryté, ale hľadanie ich nájde.
- **Prílohy:** k úlohám aj k celému projektu (PDF, Excel, Word, obrázky…, max. 50 MB), súkromné úložisko Supabase.
- **Poznámky k projektu:** všeobecné poznámky pri každom projekte, prehľadávané hľadaním.
- **Stretnutia:** dátum, čas, dĺžka (predvolená v Nastaveniach), miesto, poznámka, upozornenie na prekrytie.
- **Krok späť / znova** (⌘Z / ⇧⌘Z aj tlačidlo „Späť“ pri každej zmene)
- **Offline:** aplikácia sa otvorí aj bez internetu; zmeny čakajú a odošlú sa, keď je pripojenie (ikona obláčika vpravo hore ukazuje stav).
- **Záloha:** Nastavenia → Stiahnuť zálohu / Obnoviť zo zálohy (JSON).
- **Skratky:** N = pridať, / = hľadať, Esc = zavrieť detail, 1–4 = pohľady.

## Inštalácia

### 1. Supabase
1. supabase.com/dashboard → **New project** → názov `organizer`, región **Central EU (Frankfurt)**, plán Free.
2. **SQL Editor → New query** → postupne vložte a spustite (**Run**) súbory `supabase/migrations/20261111000001_schema.sql`, `…0002_attachments.sql` a `…0003_project_notes.sql`.
3. **Authentication → Users → Add user → Create new user**: váš e-mail + heslo, zaškrtnite **Auto Confirm User**.
4. **Authentication → Sign In / Providers → Email**: vypnite **Allow new users to sign up** (aby sa nikto iný nemohol zaregistrovať).
5. **Project Settings → API Keys**: skopírujte **Project URL** a **Publishable key** (`sb_publishable_…`). Secret kľúč nikam nekopírujte.

### 2. Vercel
1. vercel.com/new → **Import** repozitára `organizer`.
2. **Environment Variables:** `VITE_SUPABASE_URL` = Project URL, `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable key.
3. **Deploy.** Adresu aplikácie (napr. `https://organizer-xyz.vercel.app`) doplňte v Supabase → **Authentication → URL Configuration → Site URL**.

### 3. iPhone
Safari → otvorte adresu → Zdieľať → **Pridať na plochu**.

## Bezpečnosť
- Každý riadok v databáze patrí jednému používateľovi; Row Level Security povolí čítanie a zápis iba vlastných dát. Anonymný prístup nemá k dátam nič.
- Vo frontende je iba verejný publishable kľúč. Registrácia je vypnutá.

## Vývoj
```bash
npm ci
cp .env.example .env.local   # doplňte URL a publishable kľúč
npm run dev                  # http://localhost:5173
npm test                     # testy rýchleho zadávania a dátumov
npm run build
```
`supabase/tests/` slúži iba na lokálne testy (nespúšťať v Supabase).
