/* stats.js - pure cricket statistics. UMD: browser global CricStats, or require() in node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CricStats = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function sum(rows, key) { return rows.reduce(function (t, r) { return t + (Number(r[key]) || 0); }, 0); }
  function r2(n) { return Math.round(n * 100) / 100; }

  /* Cricket overs: "4.2" means 4 overs and 2 balls = 26 legal balls. */
  function oversToBalls(overs) {
    var s = String(overs);
    var parts = s.split('.');
    var whole = parseInt(parts[0] || '0', 10) || 0;
    var balls = parts.length > 1 && parts[1] !== '' ? parseInt(parts[1], 10) : 0;
    if (balls < 0 || balls > 5) throw new Error('Invalid overs value: ' + overs + ' (the part after the dot must be 0-5 balls)');
    return whole * 6 + balls;
  }

  function ballsToOvers(balls) {
    balls = Math.max(0, Math.floor(Number(balls) || 0));
    return Math.floor(balls / 6) + '.' + (balls % 6);
  }

  function isOut(dismissal) { return !!(dismissal && String(dismissal).trim() !== ''); }

  function careerBatting(rows) {
    var inns = rows.length;
    var runs = sum(rows, 'runs'), balls = sum(rows, 'balls');
    var fours = sum(rows, 'fours'), sixes = sum(rows, 'sixes'), dots = sum(rows, 'dots');
    var outs = rows.filter(function (r) { return isOut(r.dismissal); }).length;
    var hs = rows.reduce(function (m, r) { return Math.max(m, Number(r.runs) || 0); }, 0);
    return {
      inns: inns, runs: runs, balls: balls, fours: fours, sixes: sixes, dots: dots,
      outs: outs, notOuts: inns - outs,
      hs: hs,
      fifties: rows.filter(function (r) { return r.runs >= 50 && r.runs < 100; }).length,
      hundreds: rows.filter(function (r) { return r.runs >= 100; }).length,
      avg: outs ? r2(runs / outs) : null,
      sr: balls ? r2(runs * 100 / balls) : null
    };
  }

  function careerBowling(rows) {
    var inns = rows.length;
    var balls = sum(rows, 'legal_balls');
    var runs = sum(rows, 'runs_given'), wickets = sum(rows, 'wickets');
    var best = null;
    rows.forEach(function (r) {
      if (!best || r.wickets > best.wickets || (r.wickets === best.wickets && r.runs_given < best.runs)) {
        best = { wickets: r.wickets, runs: r.runs_given, played_on: r.played_on, opponent: r.opponent };
      }
    });
    return {
      inns: inns, balls: balls, overs: ballsToOvers(balls),
      runs: runs, wickets: wickets,
      wides: sum(rows, 'wides'), noBalls: sum(rows, 'no_balls'),
      catches: sum(rows, 'catches'), runOuts: sum(rows, 'run_outs'),
      best: best,
      fiveW: rows.filter(function (r) { return r.wickets >= 5; }).length,
      avg: wickets ? r2(runs / wickets) : null,
      sr: wickets ? r2(balls / wickets) : null,
      econ: balls ? r2(runs * 6 / balls) : null
    };
  }

  /* Rows grouped per calendar year, chronological. */
  function yearly(rows, kind) {
    var byYear = {};
    rows.forEach(function (r) {
      var y = String(r.played_on).slice(0, 4);
      if (!byYear[y]) byYear[y] = [];
      byYear[y].push(r);
    });
    return Object.keys(byYear).sort().map(function (y) {
      var rs = byYear[y];
      return {
        year: y,
        inns: rs.length,
        runs: kind === 'batting' ? sum(rs, 'runs') : sum(rs, 'runs_given'),
        wickets: kind === 'bowling' ? sum(rs, 'wickets') : null,
        balls: kind === 'batting' ? sum(rs, 'balls') : sum(rs, 'legal_balls')
      };
    });
  }

  /* Last n innings in date order (oldest -> newest), each reduced to a bar value. */
  function form(rows, kind, n) {
    var sorted = rows.slice().sort(function (a, b) {
      return String(a.played_on) < String(b.played_on) ? -1 : 1;
    }).slice(-(n || 10));
    return sorted.map(function (r) {
      return {
        played_on: r.played_on, opponent: r.opponent,
        value: kind === 'batting' ? r.runs : r.wickets,
        label: kind === 'batting'
          ? r.runs + (isOut(r.dismissal) ? '' : '*') + ' (' + r.balls + ')'
          : r.wickets + '/' + r.runs_given
      };
    });
  }

  return {
    oversToBalls: oversToBalls, ballsToOvers: ballsToOvers, isOut: isOut,
    careerBatting: careerBatting, careerBowling: careerBowling,
    yearly: yearly, form: form
  };
}));
