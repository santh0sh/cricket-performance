# SK 98

A cricket career tracker. The GitHub repo stays `cricket-performance`, so all URLs keep working.

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
   - (`schema.sql` and `seed.sql - his full career: 92 batting + 93 bowling innings (59+61 from his updated PDF sheet, Jan 2019 - Mar 2023, plus 33+32 imported from his CricHeroes profile, Sep 2023 - Aug 2026). Every innings is marked source=pdf or source=cricheroes.
8. **Turn on Pages:** repo **Settings > Pages** - Source = **Deploy from a branch**, Branch = **main / (root)**, Save. Wait a minute.
9. Open **https://santh0sh.github.io/cricket-performance/**, sign in with your email (tap the magic link in the email it sends), and create your profile with username **sandy**.
10. **Load your career history (optional):** back in Supabase **SQL Editor**, paste `seed.sql` and **Run**. Your 59 batting + 61 bowling innings (from your records PDF) appear on your public page.

Done. Share `https://santh0sh.github.io/cricket-performance/#/u/sandy` with anyone.

## Everyday use

- **Add a match (quick):** sign in > My profile > "Add this weekend's game" - one form logs batting, bowling and fielding together in under a minute. Bowling overs accept cricket notation - `4.2` means 4 overs 2 balls.
- **Full innings form:** below the quick-add, for complete scorecard details (dots, dismissal, etc.).
- **Form graphs:** every public profile shows per-innings trend charts for the last 15 batting and bowling innings, with the peak innings marked. Fielding (catches/run-outs) shows where the data exists.
- **Records shelf:** one card per fifty and per five-wicket haul on the profile.
- **Head-to-head:** tap any opponent name in an innings list for the record against them.
- **Compare players:** every profile has a Compare link - side-by-side career numbers of any two players. Demo mode ships a second demo player (sandeep) so it works offline.
- **Edit/delete:** every innings in your list has ✏️ and 🗑️.
- **Your public page:** `#/u/your-username` - that's the link to share.
- **Find players:** the home page searches by display name or username. Profiles are public-by-design; the app never collects phone numbers, so there is no phone-number lookup.

## Dev / verification

- `stats.test.js` - stats math + career figures reconciled against the source PDF: `node stats.test.js` (40 checks)
- `rls-test.js` - runs `schema.sql` verbatim on a real local PostgreSQL and attacks the row-level security as anon / wrong-owner / owner: `npm install embedded-postgres pg && node rls-test.js` (15 checks)
- `wiring.test.js` - full UI flow in jsdom (sign-in, add/edit/delete innings, public page recompute): `npm install jsdom && node wiring.test.js` (16 checks)

## Notes on the seeded data

The seed reproduces the career summary in the source PDF exactly, with two known mismatches against the PDF's own match-by-match table (the table is authoritative):
- Bowling innings count: summary says 62, the table has 61 rows (all other bowling totals reconcile to the row exactly).
- Best bowling: the summary line still says 5/22, but the table contains 6/18 (7 Mar 2020 vs Silent Assasians), which is better - the app shows 6/18.
- Highest score: an older version of the sheet said HS 75; the current sheet and the app show 98 (21 Jul 2019 vs Unregistered Team, off 67 balls).

## CricHeroes import notes

- 38 matches read from his CricHeroes profile (player 4924922): he batted in 33, bowled in 32.
- Cross-checked: imported totals match his CricHeroes career line exactly (278 runs, 27 wickets, 38 matches).
- CricHeroes does not publish dot balls, catches, or run-outs per match, so those columns are NULL on cricheroes rows. Dot-ball, catch and run-out totals in the app cover the PDF era only - they are not missing data.
- The two eras do not overlap, so both sets are kept in full (no merging or deduping).

## Profile photo and external link

- Profile has an optional photo URL (Profile settings -> Profile photo URL). A flat file like ./sandy.jpg works when hosted next to index.html; the demo bundle ships his CricHeroes photo this way. Falls back to initials if the image fails to load.
- Optional external link (e.g. a CricHeroes profile) shows as a badge on the public page. Empty by default.

## Known quirks in his sheet (kept faithful, not "fixed")

- The bowling summary line says 62 innings, but the table lists 61 rows. The table is what got imported.
- The bowling summary "Best" still says 5/22, but the 7 Mar 2020 row is 6/18 - so the app shows 6/18 as his best.
- The 26 Jan 2021 bowling row has a blank date cell in the sheet; the date is restored from his earlier sheet.
