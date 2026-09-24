'use strict';
/* Full UI wiring test in jsdom: sign in, view profile, add/edit/delete innings. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = '/home/sandbox/cricket-performance/';
const S = require(path + 'stats.js');

const seed = JSON.parse(fs.readFileSync(path + 'seed_data.json', 'utf8'));
const mock = { profiles: [{ id: 'demo-user-1', username: 'sandy', display_name: 'Sandy', role: 'All-rounder', batting_style: 'Right-hand bat', bowling_style: 'Right-arm medium', created_at: 'x' }, { id: 'demo-user-2', username: 'sandeep', display_name: 'Sandeep V', role: 'Batsman', created_at: 'x' }], innings: [], nextId: 1000 };
seed.batting.forEach((r, i) => mock.innings.push({ id: i + 1, user_id: 'demo-user-1', kind: 'batting', played_on: r.date, opponent: r.opponent, runs: r.runs, balls: r.balls, fours: r.fours, sixes: r.sixes, dots: r.dots, dismissal: r.dismissal, created_at: 'x' }));
seed.bowling.forEach((r, i) => mock.innings.push({ id: 100 + i, user_id: 'demo-user-1', kind: 'bowling', played_on: r.date, opponent: r.opponent, legal_balls: S.oversToBalls(r.overs), runs_given: r.runs_given, wickets: r.wickets, wides: r.wides, no_balls: r.no_balls, catches: r.catches, run_outs: r.run_outs, dismissal: '', created_at: 'x' }));

mock.innings.push(
  { id: 501, user_id: 'demo-user-2', kind: 'batting', played_on: '2026-02-08', opponent: 'The Vintage Titans', runs: 58, balls: 44, fours: 7, sixes: 2, dots: null, dismissal: '', created_at: 'x' },
  { id: 502, user_id: 'demo-user-2', kind: 'bowling', played_on: '2026-02-08', opponent: 'The Vintage Titans', legal_balls: 24, runs_given: 19, wickets: 3, wides: 0, no_balls: 0, catches: 0, run_outs: 1, dismissal: '', created_at: 'x' });

const html = fs.readFileSync(path + 'index.html', 'utf8')
  .replace(/<script src="https:[^"]+"><\/script>/, '')
  .replace('<script src="config.js"></script>',
    '<script>window.CRIC_MOCK_SEED=' + JSON.stringify(mock) + ';</script><script>' + fs.readFileSync(path + 'config.js') + '</script>')
  .replace('<script src="stats.js"></script>', '<script>' + fs.readFileSync(path + 'stats.js') + '</script>')
  .replace('<script src="db.js"></script>', '<script>' + fs.readFileSync(path + 'db.js') + '</script>')
  .replace('<script src="app.js"></script>', '<script>' + fs.readFileSync(path + 'app.js') + '</script>');

const dom = new JSDOM(html, { url: 'https://santh0sh.github.io/cricket-performance/', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let passed = 0, failed = 0;
function ok(cond, name, extra) { if (cond) passed++; else { failed++; console.error('FAIL', name, extra || ''); } }

(async () => {
  await wait(300);
  // home rendered, demo mode
  ok(doc.getElementById('signin'), 'home shows sign-in form');
  ok((doc.body.textContent || '').includes('Demo mode'), 'demo-mode notice shown');

  // sign in (demo) -> routes to #/edit with profile + innings manager
  doc.getElementById('si-email').value = 'sandy@example.com';
  doc.getElementById('signin').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await wait(300);
  ok(window.location.hash === '#/edit', 'sign-in routes to #/edit', window.location.hash);
  ok(doc.getElementById('pf'), 'edit page shows profile form');
  ok(doc.querySelectorAll('#my-inns .inn').length === 185, 'manager lists 185 innings (92 bat + 93 bowl)', doc.querySelectorAll('#my-inns .inn').length);

  // public page link works
  ok(doc.querySelector('#pf a[href="#/u/sandy"]'), 'view-public-page link present');

  // add a batting innings
  doc.getElementById('inf-runs').value = '55';
  doc.getElementById('inf-balls').value = '30';
  doc.getElementById('inf-opp').value = 'Test XI';
  doc.getElementById('inf').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await wait(300);
  ok(doc.querySelectorAll('#my-inns .inn').length === 186, 'add innings bumps list to 186');
  ok(doc.querySelector('#my-inns .inn .fig').textContent.includes('55'), 'new innings at top (latest date)');

  // public profile reflects it
  window.location.hash = '#/u/sandy';
  await wait(400);
  const heroStats = [...doc.querySelectorAll('.hstat b')].map(b => b.dataset.count);
  ok(heroStats[0] === '186' && heroStats[1] === '1537', 'public hero updates: 186 inns, 1537 runs', heroStats.join('/'));
  ok(doc.querySelector('#tab-body table.stats tr:last-child td:nth-child(4)').textContent === '98', 'HS now 98');
  ok(doc.querySelector('#tab-body table.stats tr:last-child td:nth-child(5)').textContent === '20.49', 'avg recomputed to 20.49 (55 not out; 1537/75 outs)');

  // edit that innings back down (55 -> 10)
  window.location.hash = '#/edit';
  await wait(400);
  const firstEdit = doc.querySelector('#my-inns [data-edit]');
  firstEdit.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(100);
  ok(doc.getElementById('inf-save').textContent === 'Save changes', 'edit mode armed');
  doc.getElementById('inf-runs').value = '10';
  doc.getElementById('inf').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await wait(300);
  ok(doc.querySelector('#my-inns .inn .fig').textContent.includes('10'), 'edit applied');

  // delete it
  window.confirm = () => true;
  doc.querySelector('#my-inns [data-del]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(300);
  ok(doc.querySelectorAll('#my-inns .inn').length === 185, 'delete returns to 185');

  // bowling add via overs string
  doc.querySelector('.card .tab[data-k="bowling"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(100);
  doc.getElementById('inf-overs').value = '3.5';
  doc.getElementById('inf-rgiven').value = '24';
  doc.getElementById('inf-wkts').value = '2';
  doc.getElementById('inf').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await wait(300);
  ok([...doc.querySelectorAll('#my-inns .inn .fig')].some(f => f.textContent.includes('2/24')), 'bowling innings added');
  const stored = JSON.parse(window.localStorage.getItem('cric-demo-v1'));
  const last = stored.innings[stored.innings.length - 1];
  ok(last.legal_balls === 23, 'overs 3.5 stored as 23 legal balls', last.legal_balls);

  // search by partial name and by username
  window.location.hash = '#/';
  await wait(300);
  doc.getElementById('lk-name').value = 'sandy';
  doc.getElementById('lookup').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await wait(300);
  ok(window.location.hash === '#/u/sandy', 'single search hit routes straight to profile', window.location.hash);

  // === feature batch: trend chart, records shelf, head-to-head, quick-add, comparison ===
  // (currently on #/u/sandy, batting tab by default)
  await wait(200);
  ok(doc.querySelector('#tab-body .trend'), 'batting tab shows form trend chart');
  ok(doc.querySelectorAll('#tab-body .trend .tcol').length === 15, 'trend shows last 15 innings', doc.querySelectorAll('#tab-body .trend .tcol').length);
  ok(doc.querySelectorAll('#tab-body .trend .tbar.peak').length === 1, 'trend marks the peak innings');
  const expFifties = mock.innings.filter(r => r.user_id === 'demo-user-1' && r.kind === 'batting' && r.runs >= 50).length;
  ok(doc.querySelectorAll('#tab-body .shelf .rec').length === expFifties, 'records shelf lists every fifty (' + expFifties + ')', doc.querySelectorAll('#tab-body .shelf .rec').length);
  ok(doc.querySelector('#tab-body .shelf .rec b').textContent.includes('98'), 'top record is the 98');

  // head-to-head: tap an opponent name
  const oppBtn = doc.querySelector('#tab-body .vs.tappable');
  const oppName = oppBtn.dataset.opp;
  oppBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(150);
  const h2h = doc.getElementById('h2h');
  ok(h2h && h2h.textContent.includes(oppName || 'Friendly'), 'head-to-head card opens for tapped opponent');
  const expVs = mock.innings.filter(r => r.user_id === 'demo-user-1' && (r.opponent || '') === oppName).length;
  ok(h2h.querySelector('.h2hgrid b').textContent === String(expVs), 'h2h innings count matches data (' + expVs + ')', h2h.querySelector('.h2hgrid b').textContent);

  // bowling tab: trend with fielding dots + five-fors shelf
  doc.querySelector('.tab[data-t="bowl"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(150);
  ok(doc.querySelector('#tab-body .trend .tbar.bowl'), 'bowling tab shows amber trend chart');
  ok(doc.querySelector('#tab-body .tnote'), 'bowling trend notes missing CricHeroes fielding data');
  ok(/19/.test(doc.querySelector('#tab-body .h2hgrid.fielding').textContent) && /6/.test(doc.querySelector('#tab-body .h2hgrid.fielding').textContent), 'fielding card: 19 catches, 6 run outs from scorebook era');
  const expHauls = mock.innings.filter(r => r.user_id === 'demo-user-1' && r.kind === 'bowling' && r.wickets >= 5).length;
  ok(doc.querySelectorAll('#tab-body .shelf .rec').length === expHauls, 'records shelf lists every five-for (' + expHauls + ')', doc.querySelectorAll('#tab-body .shelf .rec').length);

  // quick-add: one match = bat + bowl in one submit
  window.location.hash = '#/edit';
  await wait(400);
  ok(doc.getElementById('qa'), 'quick-add match form present on edit page');
  doc.getElementById('qa-opp').value = 'Weekend XI';
  doc.getElementById('qa-runs').value = '34'; doc.getElementById('qa-balls').value = '22';
  doc.getElementById('qa-overs').value = '3'; doc.getElementById('qa-rgiven').value = '21'; doc.getElementById('qa-wkts').value = '2';
  const qaBase = doc.querySelectorAll('#my-inns .inn').length;
  doc.getElementById('qa').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await wait(400);
  ok(doc.querySelectorAll('#my-inns .inn').length === qaBase + 2, 'quick-add creates bat+bowl rows in one submit (' + qaBase + '->' + (qaBase + 2) + ')', doc.querySelectorAll('#my-inns .inn').length);
  ok(doc.querySelector('#qa-msg .ok'), 'quick-add shows success message');
  // cleanup both rows
  window.confirm = () => true;
  doc.querySelector('#my-inns [data-del]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(300);
  doc.querySelector('#my-inns [data-del]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(300);
  ok(doc.querySelectorAll('#my-inns .inn').length === qaBase, 'quick-add rows cleaned up (back to ' + qaBase + ')');

  // player comparison (demo: sandy vs sandeep)
  window.location.hash = '#/compare/sandy/sandeep';
  await wait(500);
  const cmpText = (doc.querySelector('table.cmp') || { textContent: '' }).textContent;
  ok(doc.querySelector('table.cmp'), 'comparison table renders');
  ok(cmpText.includes('Sandeep V') && cmpText.includes('Sandy'), 'comparison shows both players');
  ok(doc.querySelectorAll('table.cmp td.win').length > 0, 'comparison highlights category leaders');
  ok(doc.getElementById('cmp'), 'compare form still available for another pairing');

  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
