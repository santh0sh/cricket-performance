/* insights.js - Insights tab (per player) and Wildhogs team page. Pure SVG, no libraries.
   Only uses innings data we actually hold. There is no ball-by-ball shot direction in the data,
   so there is no wagon wheel; the "Where runs come from" ring is built from 4s, 6s and the rest. */
(function () {
  'use strict';
  var S = window.CricStats;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return n == null ? '-' : n; }
  function sum(rows, k) { return rows.reduce(function (t, r) { return t + (Number(r[k]) || 0); }, 0); }

  function ring(parts, centerBig, centerSmall) {
    var total = parts.reduce(function (t, p) { return t + p.v; }, 0) || 1, R = 52, C = 2 * Math.PI * R, off = 0;
    var arcs = parts.map(function (p) {
      var len = C * p.v / total;
      var el = '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + p.c + '" stroke-width="16" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"/>';
      off += len; return el;
    }).join('');
    var legend = parts.map(function (p) {
      return '<div class="lg"><i style="background:' + p.c + '"></i><span>' + esc(p.l) + '</span><b>' + p.v + '</b><small>' + Math.round(p.v * 100 / total) + '%</small></div>';
    }).join('');
    return '<div class="ringwrap"><svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="' + esc(centerSmall) + '">' +
      '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="rgba(120,160,255,.08)" stroke-width="16"/>' + arcs +
      '<text x="70" y="70" text-anchor="middle" class="rbig">' + esc(centerBig) + '</text><text x="70" y="88" text-anchor="middle" class="rsmall">' + esc(centerSmall) + '</text></svg>' +
      '<div class="legend">' + legend + '</div></div>';
  }

  function bars(items, cls) {
    var max = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([1]));
    return '<div class="hbars">' + items.map(function (i) {
      return '<div class="hb"><span class="hl2">' + esc(i.l) + '</span><div class="track"><div class="fill ' + (cls || '') + '" style="width:' + Math.max(i.v ? 3 : 0, i.v * 100 / max) + '%"></div></div><b>' + i.v + '</b></div>';
    }).join('') + '</div>';
  }

  function seasonBars(rows) {
    var ys = S.yearly(rows, 'batting');
    if (!ys.length) return '';
    var max = Math.max.apply(null, ys.map(function (y) { return y.runs; }).concat([1])), w = 100 / ys.length;
    return '<div class="seasons">' + ys.map(function (y) {
      var sr = y.balls ? Math.round(y.runs * 100 / y.balls) : 0;
      return '<div class="sn"><div class="snbar"><i style="height:' + Math.max(4, y.runs * 100 / max) + '%"></i></div><b>' + y.runs + '</b><span>' + esc(y.year.slice(2) === '' ? y.year : "'" + y.year.slice(2)) + '</span><small>' + y.inns + ' inns · SR ' + sr + '</small></div>';
    }).join('') + '</div>';
  }

  function dismissalKind(d) {
    var s = String(d || '').toLowerCase().trim();
    if (!s) return 'Not out';
    if (/^b\b|bowled/.test(s)) return 'Bowled';
    if (/^c\b|caught|ct\b/.test(s)) return 'Caught';
    if (/lbw/.test(s)) return 'LBW';
    if (/run ?out/.test(s)) return 'Run out';
    if (/st\b|stump/.test(s)) return 'Stumped';
    return 'Other';
  }

  function insights(bat, bowl, cb, kb) {
    var h = '';
    if (bat.length) {
      var b4 = cb.fours * 4, b6 = cb.sixes * 6, rest = Math.max(0, cb.runs - b4 - b6);
      h += '<div class="card"><h2>Where runs <em>come from</em></h2>' +
        ring([{ l: 'Fours', v: b4, c: '#22e58c' }, { l: 'Sixes', v: b6, c: '#ffb830' }, { l: 'Running (1s, 2s, 3s)', v: rest, c: '#4f8dff' }], String(cb.runs), 'runs') +
        '<div class="tnote">Boundaries are ' + (cb.runs ? Math.round((b4 + b6) * 100 / cb.runs) : 0) + '% of all runs. Built from 4s and 6s counts; shot direction is not recorded.</div></div>';

      var bands = [['0-9', 0, 9], ['10-24', 10, 24], ['25-49', 25, 49], ['50+', 50, 9999]].map(function (b) {
        return { l: b[0], v: bat.filter(function (r) { return r.runs >= b[1] && r.runs <= b[2]; }).length };
      });
      h += '<div class="card"><h2>Score <em>bands</em></h2>' + bars(bands) + '</div>';
      h += '<div class="card"><h2>Runs per <em>season</em></h2>' + seasonBars(bat) + '</div>';

      var dk = {};
      bat.forEach(function (r) { var k = dismissalKind(r.dismissal); dk[k] = (dk[k] || 0) + 1; });
      var dl = Object.keys(dk).map(function (k) { return { l: k, v: dk[k] }; }).sort(function (a, b) { return b.v - a.v; });
      h += '<div class="card"><h2>How <em>out</em></h2>' + bars(dl, 'amber') + '</div>';

      var opp = {};
      bat.forEach(function (r) { var k = r.opponent || 'Friendly'; (opp[k] = opp[k] || { n: 0, runs: 0 }); opp[k].n++; opp[k].runs += r.runs; });
      var ol = Object.keys(opp).map(function (k) { return { l: k, v: opp[k].runs, n: opp[k].n }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 5);
      if (ol.length) h += '<div class="card"><h2>Best <em>opponents</em> (runs scored)</h2>' + bars(ol.map(function (o) { return { l: o.l + ' · ' + o.n + ' inns', v: o.v }; })) + '</div>';
    }
    if (bowl.length) {
      var wk = {};
      bowl.forEach(function (r) { var k = r.wickets >= 4 ? '4+' : String(r.wickets); wk[k] = (wk[k] || 0) + 1; });
      var wl = ['0', '1', '2', '3', '4+'].map(function (k) { return { l: k + (k === '1' ? ' wicket' : ' wickets'), v: wk[k] || 0 }; });
      h += '<div class="card"><h2>Wickets per <em>spell</em></h2>' + bars(wl, 'amber') +
        '<div class="tnote">' + kb.wickets + ' wickets in ' + kb.inns + ' spells · economy ' + fmt(kb.econ) + '</div></div>';
    }
    if (!h) h = '<div class="card"><div class="empty">No innings logged yet.</div></div>';
    return h;
  }

  /* ---------- Wildhogs team page ---------- */
  function team(db, show, escF) {
    show('<div class="loading"><div class="spinner"></div></div>');
    Promise.all([db.listProfiles(), db.allInnings()]).then(function (res) {
      var ps = res[0], inn = res[1], by = {};
      inn.forEach(function (r) { (by[r.user_id] = by[r.user_id] || []).push(r); });
      var rowsP = ps.map(function (p) {
        var rs = by[p.id] || [];
        var bt = rs.filter(function (r) { return r.kind === 'batting'; }), bw = rs.filter(function (r) { return r.kind === 'bowling'; });
        var cb = S.careerBatting(bt), kb = S.careerBowling(bw);
        return { p: p, cb: cb, kb: kb, n: bt.length + bw.length };
      }).filter(function (x) { return x.n > 0 || true; });
      var tot = { runs: sum(inn.filter(function (r) { return r.kind === 'batting'; }), 'runs'), wk: sum(inn.filter(function (r) { return r.kind === 'bowling'; }), 'wickets'), inns: inn.length, players: ps.length };
      function top(arr, key, n, asc) { return arr.slice().sort(function (a, b) { return asc ? a[key] - b[key] : b[key] - a[key]; }).slice(0, n); }
      function board(title, list, val, sub) {
        return '<div class="card"><h2>' + title + '</h2>' + list.map(function (x, i) {
          return '<a class="lrow" href="#/u/' + escF(x.p.username) + '"><span class="rk">' + (i + 1) + '</span><span class="nm">' + escF(x.p.display_name) + '</span><small>' + escF(sub(x)) + '</small><b>' + val(x) + '</b></a>';
        }).join('') + '</div>';
      }
      var runsL = top(rowsP.filter(function (x) { return x.cb.runs > 0; }), 'x', 0);
      runsL = rowsP.filter(function (x) { return x.cb.inns > 0; }).sort(function (a, b) { return b.cb.runs - a.cb.runs; }).slice(0, 5);
      var wkL = rowsP.filter(function (x) { return x.kb.inns > 0; }).sort(function (a, b) { return b.kb.wickets - a.kb.wickets; }).slice(0, 5);
      var srL = rowsP.filter(function (x) { return x.cb.balls >= 60; }).sort(function (a, b) { return b.cb.sr - a.cb.sr; }).slice(0, 5);
      var html = '<div class="hero reveal"><div class="hero-top"><div class="avatar">🐗</div><div><h1>Wildhogs <span style="color:var(--green)">11</span></h1><div class="uname">weekend team · stats from SK 98 profiles</div></div></div>' +
        '<div class="hero-stats"><div class="hstat green"><b>' + tot.players + '</b><span>Players</span></div><div class="hstat"><b>' + tot.runs + '</b><span>Team runs</span></div><div class="hstat amber"><b>' + tot.wk + '</b><span>Wickets</span></div><div class="hstat blue"><b>' + tot.inns + '</b><span>Innings</span></div></div></div>' +
        board('Most <em>runs</em>', runsL, function (x) { return x.cb.runs; }, function (x) { return x.cb.inns + ' inns · HS ' + x.cb.hs; }) +
        board('Most <em>wickets</em>', wkL, function (x) { return x.kb.wickets; }, function (x) { return x.kb.inns + ' spells · econ ' + fmt(x.kb.econ); }) +
        (srL.length ? board('Strike <em>rate</em> (60+ balls)', srL, function (x) { return x.cb.sr; }, function (x) { return x.cb.runs + ' runs'; }) : '') +
        '<div class="card"><h2>The <em>squad</em></h2><div class="squad">' + rowsP.map(function (x) {
          var p = x.p;
          return '<a class="sq" href="#/u/' + escF(p.username) + '"><div class="avatar sm">' + (p.avatar_url ? '<img src="' + escF(p.avatar_url) + '" alt="">' : escF(String(p.display_name).slice(0, 2).toUpperCase())) + '</div><b>' + escF(p.display_name) + '</b><small>' + escF(p.role) + '</small><em>' + x.cb.runs + ' runs · ' + x.kb.wickets + ' wkts</em></a>';
        }).join('') + '</div><div class="tnote">More players appear as they claim a profile. Matches are added from the CricHeroes scorecard link, not auto-fetched.</div></div>';
      show(html);
    }).catch(function (e) { show('<div class="card"><div class="err">' + escF(e && e.message || e) + '</div></div>'); });
  }

  window.SK98X = { insights: insights, team: team };
}());
