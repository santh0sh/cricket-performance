'use strict';
const S = require('./stats.js');
const seed = require('./seed_data.json');

let passed = 0, failed = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error('FAIL', name, '| expected', e, '| got', a); }
}

// unit: overs conversion
eq(S.oversToBalls('4.2'), 26, 'oversToBalls 4.2');
eq(S.oversToBalls('4'), 24, 'oversToBalls 4');
eq(S.oversToBalls(6), 36, 'oversToBalls numeric');
eq(S.ballsToOvers(26), '4.2', 'ballsToOvers 26');
eq(S.ballsToOvers(1170), '195.0', 'ballsToOvers 1170');
let threw = false; try { S.oversToBalls('2.6'); } catch (e) { threw = true; }
eq(threw, true, 'oversToBalls rejects 2.6');

// normalize rows the way seed.sql/db stores them
const bat = seed.batting.map(r => ({ ...r, played_on: r.date }));
const bowl = seed.bowling.map(r => ({ ...r, played_on: r.date, legal_balls: S.oversToBalls(r.overs) }));

// career batting vs his PDF summary (11 figures, all must match)
const cb = S.careerBatting(bat);
eq(cb.inns, 92, 'bat inns (59 PDF + 33 CricHeroes)'); eq(cb.runs, 1482, 'bat runs (1204 updated PDF + 278)'); eq(cb.balls, 1275, 'bat balls');
eq(cb.fours, 155, 'bat fours'); eq(cb.sixes, 47, 'bat sixes'); eq(cb.dots, 333, 'bat dots (PDF era only - CricHeroes does not publish dots)');
eq(cb.outs, 75, 'bat outs'); eq(cb.notOuts, 17, 'bat notOuts');
eq(cb.hs, 98, 'bat hs (21 Jul 2019, was mis-recorded as 17 in the old sheet)'); eq(cb.fifties, 8, 'bat fifties'); eq(cb.hundreds, 0, 'bat hundreds');
eq(cb.avg, 19.76, 'bat avg'); eq(cb.sr, 116.24, 'bat sr');

// career bowling vs his PDF summary; innings count and best are the two KNOWN discrepancies
const kb = S.careerBowling(bowl);
eq(kb.inns, 93, 'bowl inns (61 PDF + 32 CricHeroes; his PDF summary said 62 - PDF table has 61)');
eq(kb.balls, 1816, 'bowl balls'); eq(kb.overs, '302.4', 'bowl overs');
eq(kb.runs, 1749, 'bowl runs'); eq(kb.wickets, 87, 'bowl wickets (60 updated PDF + 27)');
eq(kb.wides, 121, 'bowl wides'); eq(kb.noBalls, 4, 'bowl noBalls');
eq(kb.catches, 19, 'bowl catches (PDF era only - CricHeroes does not publish them)'); eq(kb.runOuts, 6, 'bowl runOuts (PDF era only)');
eq(kb.best.wickets + '/' + kb.best.runs, '6/18', 'bowl best (7 Mar 2020, was mis-recorded as 5/18 in the old sheet; summary still says 5/22 - stale)');
eq(kb.avg, 20.1, 'bowl avg'); eq(kb.sr, 20.87, 'bowl sr'); eq(kb.econ, 5.78, 'bowl econ');
eq(kb.fiveW, 2, 'bowl five-wicket hauls (5/22 match 29, 5/18 match 30)');

// yearly + form
const yb = S.yearly(bat, 'batting');
eq(yb[0].year, '2019', 'yearly starts 2019');
eq(yb.reduce((t, y) => t + y.runs, 0), 1482, 'yearly runs total');
eq(S.form(bat, 'batting', 10).length, 10, 'form length');
eq(S.form(bat, 'batting', 10)[9].played_on, '2026-08-01', 'form ends at latest batting match (he did not bat in the 2026-08-08 game)');
eq(S.form(bowl, 'bowling', 5)[4].label, '1/18', 'form bowling label');

// empty state
eq(S.careerBatting([]).avg, null, 'empty avg null');
eq(S.careerBowling([]).best, null, 'empty best null');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
