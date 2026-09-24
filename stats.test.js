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
eq(cb.inns, 59, 'bat inns'); eq(cb.runs, 1123, 'bat runs'); eq(cb.balls, 927, 'bat balls');
eq(cb.fours, 120, 'bat fours'); eq(cb.sixes, 39, 'bat sixes'); eq(cb.dots, 333, 'bat dots');
eq(cb.outs, 49, 'bat outs'); eq(cb.notOuts, 10, 'bat notOuts');
eq(cb.hs, 75, 'bat hs'); eq(cb.fifties, 7, 'bat fifties'); eq(cb.hundreds, 0, 'bat hundreds');
eq(cb.avg, 22.92, 'bat avg'); eq(cb.sr, 121.14, 'bat sr');

// career bowling vs his PDF summary; innings count and best are the two KNOWN discrepancies
const kb = S.careerBowling(bowl);
eq(kb.inns, 61, 'bowl inns (his summary says 62 - PDF table has 61 rows)');
eq(kb.balls, 1170, 'bowl balls'); eq(kb.overs, '195.0', 'bowl overs');
eq(kb.runs, 1205, 'bowl runs'); eq(kb.wickets, 59, 'bowl wickets');
eq(kb.wides, 88, 'bowl wides'); eq(kb.noBalls, 3, 'bowl noBalls');
eq(kb.catches, 19, 'bowl catches'); eq(kb.runOuts, 6, 'bowl runOuts');
eq(kb.best.wickets + '/' + kb.best.runs, '5/18', 'bowl best (his summary says 5/22 - PDF table max is 5/18)');
eq(kb.avg, 20.42, 'bowl avg'); eq(kb.sr, 19.83, 'bowl sr'); eq(kb.econ, 6.18, 'bowl econ');
eq(kb.fiveW, 2, 'bowl five-wicket hauls (5/22 match 29, 5/18 match 30)');

// yearly + form
const yb = S.yearly(bat, 'batting');
eq(yb[0].year, '2019', 'yearly starts 2019');
eq(yb.reduce((t, y) => t + y.runs, 0), 1123, 'yearly runs total');
eq(S.form(bat, 'batting', 10).length, 10, 'form length');
eq(S.form(bat, 'batting', 10)[9].played_on, '2023-03-12', 'form ends at latest match');
eq(S.form(bowl, 'bowling', 5)[4].label, '1/25', 'form bowling label');

// empty state
eq(S.careerBatting([]).avg, null, 'empty avg null');
eq(S.careerBowling([]).best, null, 'empty best null');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
