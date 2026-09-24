'use strict';
/* rls-test.js - runs schema.sql verbatim on a real local PostgreSQL (embedded-postgres,
   dev-only) with a stubbed auth schema, then attacks the RLS policies as anon / wrong
   owner / owner using SET ROLE, exactly how Supabase's anon key would behave.
   Setup: npm install embedded-postgres pg && node rls-test.js */
const EmbeddedPostgres = require('embedded-postgres').default;
const { Client } = require('pg');
const fs = require('fs');

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) passed++;
  else { failed++; console.error('FAIL', name, extra || ''); }
}

(async () => {
  const pg = new EmbeddedPostgres({ databaseDir: '/tmp/rls/pgdata2', user: 'sandbox', password: 'sandbox', port: 5545, persistent: false });
  await pg.initialise(); await pg.start(); await pg.createDatabase('cric');
  const c = new Client({ host: '127.0.0.1', port: 5545, user: 'sandbox', password: 'sandbox', database: 'cric' });
  await c.connect();

  // stub Supabase's auth schema: auth.users table + auth.uid() driven by a GUC
  await c.query(`create schema auth;
    create table auth.users(id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('app.uid', true), '')::uuid $$;`);

  // the real schema, byte for byte
  await c.query(fs.readFileSync(__dirname + '/schema.sql', 'utf8'));

  // a role with the same powers as Supabase's anon/authenticated roles
  await c.query(`create role anon_role nologin;
    grant usage on schema public, auth to anon_role;
    grant execute on function auth.uid() to anon_role;
    grant select, insert, update, delete on public.profiles, public.innings to anon_role;
    grant usage, select on sequence public.innings_id_seq to anon_role;`);

  const A = '11111111-1111-1111-1111-111111111111';
  const B = '22222222-2222-2222-2222-222222222222';
  await c.query(`insert into auth.users values ('${A}'), ('${B}')`);
  await c.query('set role anon_role');

  async function throws(sql, name) {
    try { await c.query(sql); failed++; console.error('FAIL (no error thrown):', name); }
    catch (e) { passed++; }
  }
  const rows = async (sql) => (await c.query(sql)).rows;

  // 1. anon (no JWT => auth.uid() null) cannot create a profile
  await c.query(`reset app.uid`);
  await throws(`insert into public.profiles (id, username, display_name) values ('${A}', 'sandy', 'Sandy')`, 'anon cannot insert profile');

  // 2. owner A creates profile
  await c.query(`set app.uid = '${A}'`);
  await c.query(`insert into public.profiles (id, username, display_name) values ('${A}', 'sandy', 'Sandy')`);
  ok((await rows(`select * from public.profiles where username='sandy'`)).length === 1, 'owner inserts own profile');

  // 3. user B cannot hijack A's id
  await c.query(`set app.uid = '${B}'`);
  await throws(`insert into public.profiles (id, username, display_name) values ('${A}', 'dupe', 'Dupe')`, 'B cannot insert with A id');

  // 4. B cannot update/delete A's profile (policy filters the row out)
  let r = await c.query(`update public.profiles set display_name='Hacked' where id='${A}'`);
  ok(r.rowCount === 0 && (await rows(`select display_name from public.profiles where id='${A}'`))[0].display_name === 'Sandy', 'B update on A profile blocked');
  r = await c.query(`delete from public.profiles where id='${A}'`);
  ok(r.rowCount === 0, 'B delete on A profile blocked');

  // 5. owner A adds innings; 6. B cannot touch them
  await c.query(`set app.uid = '${A}'`);
  await c.query(`insert into public.innings (user_id, kind, played_on, opponent, runs, balls, fours, sixes, dots, dismissal)
    values ('${A}', 'batting', '2026-09-24', 'Test XI', 30, 20, 4, 1, 3, 'Bowled')`);
  await c.query(`set app.uid = '${B}'`);
  await throws(`insert into public.innings (user_id, kind, played_on, opponent, runs, balls, fours, sixes, dots)
    values ('${A}', 'batting', '2026-09-24', 'X', 99, 50, 9, 4, 0)`, 'B cannot insert innings for A');
  r = await c.query(`update public.innings set runs=999 where user_id='${A}'`);
  ok(r.rowCount === 0, 'B update on A innings blocked');
  r = await c.query(`delete from public.innings where user_id='${A}'`);
  ok(r.rowCount === 0, 'B delete on A innings blocked');

  // 7. anon reads everything (public shareable profiles)
  await c.query(`reset app.uid`);
  ok((await rows(`select * from public.profiles`)).length === 1 && (await rows(`select * from public.innings`)).length === 1, 'anon reads profiles + innings');

  // 8. owner A updates own innings fine
  await c.query(`set app.uid = '${A}'`);
  r = await c.query(`update public.innings set runs=31 where user_id='${A}'`);
  ok(r.rowCount === 1, 'owner updates own innings');

  // 9. kind check constraint
  await throws(`insert into public.innings (user_id, kind, played_on) values ('${A}', 'batting', '2026-09-24')`, 'incomplete batting row rejected');

  // 10. seed.sql loads and reproduces the career numbers
  await c.query(`delete from public.innings`);
  await c.query(fs.readFileSync(__dirname + '/seed.sql', 'utf8'));
  const S = require('./stats.js');
  const bat = await rows(`select * from public.innings where kind='batting'`);
  const bowl = await rows(`select * from public.innings where kind='bowling'`);
  const cb = S.careerBatting(bat.map(x => ({ ...x })));
  const kb = S.careerBowling(bowl.map(x => ({ ...x })));
  ok(bat.length === 92 && bowl.length === 93, 'seed row counts (92 bat + 93 bowl, PDF + CricHeroes)', bat.length + '/' + bowl.length);
  ok(cb.runs === 1482 && cb.balls === 1275 && cb.outs === 75 && cb.sr === 116.24 && cb.avg === 19.76, 'seeded batting career matches combined PDF(updated)+CricHeroes totals');
  ok(kb.runs === 1749 && kb.wickets === 87 && kb.overs === '302.4' && kb.econ === 5.78, 'seeded bowling career matches combined PDF(updated)+CricHeroes totals');
  ok(kb.best.wickets + '/' + kb.best.runs === '6/18', 'seeded best bowling 6/18');

  console.log(passed + ' passed, ' + failed + ' failed');
  await c.end(); await pg.stop();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
