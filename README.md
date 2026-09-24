# Cricket Performance

Your cricket career at one link. Create a profile, log batting and bowling innings, and share a live stats page - career tables, averages, strike rate, economy, per-year charts, recent form - all computed in the browser. Mobile-first, dark sporty theme, zero build step, zero dependencies.

- **Frontend:** plain HTML/CSS/JS on GitHub Pages
- **Backend:** Supabase free tier (Postgres + email magic-link sign-in)
- **Privacy:** anyone can view a profile; only the signed-in owner can edit it (enforced by Postgres row-level security, so the public anon key is safe)
- **Demo mode:** before you set up Supabase, the app runs fully offline in your browser

## One-time setup (about 10 minutes, all from your phone)

1. **Supabase account:** go to https://supabase.com and sign up (free, no card).
2. **New project:** tap **New project**, pick any name (e.g. `cricket`), any database password (save it, you won't need it again), region closest to you (Mumbai), free plan. Wait ~2 minutes while it spins up.
3. **Create the tables:** in the left menu open **SQL Editor > New query**, paste the whole contents of `schema.sql`, tap **Run**. You should see "Success. No rows returned".
4. **Get your two keys:** open **Project Settings** (gear icon) > **API**. Copy the **Project URL** and the **anon public** key.
5. **Paste them into `config.js`:** replace the two `PASTE_...` placeholders. (You can edit the file right on GitHub: open the file in your repo, tap the pencil.)
6. **Tell Supabase your site URL:** **Authentication > URL Configuration** - set **Site URL** to `https://santh0sh.github.io/cricket-performance/` and add the same URL under **Redirect URLs**. Save.
7. **Upload the app:** open https://github.com/santh0sh/cricket-performance > **Add file > Upload files**, and upload these 8 files (all flat, no folders):
   - `index.html`, `style.css`, `app.js`, `db.js`, `stats.js`, `config.js`, `README.md`, `LICENSE`
   - (`schema.sql` and `seed.sql` run inside Supabase, not on Pages. `seed_data.json` and test files are dev-only - skip them.)
8. **Turn on Pages:** repo **Settings > Pages** - Source = **Deploy from a branch**, Branch = **main / (root)**, Save. Wait a minute.
9. Open **https://santh0sh.github.io/cricket-performance/**, sign in with your email (tap the magic link in the email it sends), and create your profile with username **sandy**.
10. **Load your career history (optional):** back in Supabase **SQL Editor**, paste `seed.sql` and **Run**. Your 59 batting + 61 bowling innings (from your records PDF) appear on your public page.

Done. Share `https://santh0sh.github.io/cricket-performance/#/u/sandy` with anyone.

## Everyday use

- **Add a match:** sign in > My profile > Log an innings (batting or bowling). Bowling overs accept cricket notation - `4.2` means 4 overs 2 balls.
- **Edit/delete:** every innings in your list has ✏️ and 🗑️.
- **Your public page:** `#/u/your-username` - that's the link to share.

## Dev / verification

- `stats.test.js` - stats math + career figures reconciled against the source PDF: `node stats.test.js` (40 checks)
- `rls-test.js` - runs `schema.sql` verbatim on a real local PostgreSQL and attacks the row-level security as anon / wrong-owner / owner: `npm install embedded-postgres pg && node rls-test.js` (15 checks)
- `wiring.test.js` - full UI flow in jsdom (sign-in, add/edit/delete innings, public page recompute): `npm install jsdom && node wiring.test.js` (16 checks)

## Notes on the seeded data

The seed reproduces the career summary in the source PDF exactly, with two known mismatches against the PDF's own match-by-match table (the table is authoritative):
- Bowling innings count: summary says 62, the table has 61 rows (all other bowling totals reconcile to the row exactly).
- Best bowling: summary says 5/22, but the table also contains a later 5/18 (7 Mar 2020 vs Silent Assasians), which is better - the app shows 5/18.
