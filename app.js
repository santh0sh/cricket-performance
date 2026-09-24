/* app.js - hash router + views. Talks only to CricDB and CricStats. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var nav = document.getElementById('nav-links');
  var db = null, session = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function go(hash) { location.hash = hash; }
  function fmt(n) { return n == null ? '-' : n; }
  function initials(name) {
    return String(name || '?').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  }
  function show(html) { app.innerHTML = html; }
  function fail(e) { return '<div class="err">' + esc(e && e.message || e) + '</div>'; }

  /* count-up tween for hero numbers */
  function countUps() {
    app.querySelectorAll('[data-count]').forEach(function (el) {
      var target = parseFloat(el.dataset.count), suffix = el.dataset.suffix || '';
      var t0 = null;
      function frame(t) {
        if (!t0) t0 = t;
        var p = Math.min(1, (t - t0) / 900);
        var v = target * (1 - Math.pow(1 - p, 3));
        el.textContent = (target % 1 ? v.toFixed(2) : Math.round(v)) + suffix;
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function barChart(rows, key, cls) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[key]; }).concat([1]));
    return '<div class="chart">' + rows.map(function (r, i) {
      var h = Math.max(4, Math.round(r[key] / max * 88));
      return '<div class="bar ' + (cls || '') + '"><b>' + r[key] + '</b>' +
        '<i style="height:' + h + '%;animation-delay:' + (i * 60) + 'ms"></i><span>' + esc(r.year) + '</span></div>';
    }).join('') + '</div>';
  }

  function formStrip(formRows, kind) {
    return '<div class="formstrip">' + formRows.map(function (f) {
      var cls = kind === 'batting' ? (f.value >= 30 ? 'good' : f.value < 10 ? 'bad' : '')
                                   : (f.value >= 3 ? 'good' : f.value === 0 ? 'bad' : '');
      return '<div class="fchip ' + cls + '">' + esc(f.label) + '<small>' + esc(String(f.played_on).slice(5)) + '</small></div>';
    }).join('') + '</div>';
  }

  function renderNav() {
    var h = '<a href="#/">Home</a>';
    if (session) h += '<a href="#/edit">My profile</a><button class="cta" id="nav-out">Sign out</button>';
    else h += '<a class="cta" href="#/">Sign in</a>';
    nav.innerHTML = h;
    var out = document.getElementById('nav-out');
    if (out) out.onclick = function () { db.signOut().then(function () { session = null; renderNav(); go('#/'); route(); }); };
  }

  /* ---------------- home ---------------- */
  function viewHome(msg) {
    var signed = session
      ? '<div class="card reveal d2"><h2>Signed in as <em>' + esc(session.email) + '</em></h2>' +
        '<a class="btn" href="#/edit">Open my profile</a></div>'
      : '<div class="card reveal d2"><h2>Create your profile</h2>' + (msg ? '<div class="notice green">' + esc(msg) + '</div>' : '') +
        (db.mode === 'demo' ? '<div class="notice">Demo mode (no Supabase config yet) - data stays in this browser. Sign-in is instant, no email sent.</div>' : '') +
        '<form id="signin"><div class="frow one"><div><label class="fl">Email</label>' +
        '<input class="fi" type="email" id="si-email" required placeholder="you@example.com"></div></div>' +
        '<button class="btn" type="submit">' + (db.mode === 'demo' ? 'Enter demo' : 'Email me a sign-in link') + '</button>' +
        '<div id="si-msg"></div></form></div>';
    show(
      '<div class="home-hero reveal">' +
      '<h1>Your cricket career,<br><em>one link.</em></h1>' +
      '<p>Create a profile, log every innings, and share a live stats page - averages, strike rates, economy, form - all computed for you.</p></div>' +
      '<div class="home-cards">' + signed +
      '<div class="card reveal d3"><h2>View a player</h2>' +
      '<form id="lookup"><div class="frow one"><div><label class="fl">Username</label>' +
      '<input class="fi" id="lk-name" required placeholder="sandy" pattern="[a-z0-9][a-z0-9-]{2,29}"></div></div>' +
      '<button class="btn ghost" type="submit">Open profile</button><div id="lk-msg"></div></form></div></div>'
    );
    var sf = document.getElementById('signin');
    if (sf) sf.onsubmit = function (e) {
      e.preventDefault();
      var email = document.getElementById('si-email').value.trim();
      db.signInWithEmail(email).then(function (r) {
        if (r.demo) { session = { id: 'demo-user-1', email: email }; renderNav(); go('#/edit'); route(); }
        else document.getElementById('si-msg').innerHTML = '<div class="notice green" style="margin-top:12px">Check your inbox - tap the link we sent to ' + esc(email) + '.</div>';
      }).catch(function (e2) { document.getElementById('si-msg').innerHTML = fail(e2); });
    };
    var lk = document.getElementById('lookup');
    if (lk) lk.onsubmit = function (e) {
      e.preventDefault();
      var u = document.getElementById('lk-name').value.trim().toLowerCase();
      db.getProfileByUsername(u).then(function (p) {
        if (p) go('#/u/' + u);
        else document.getElementById('lk-msg').innerHTML = '<div class="err">No profile named "' + esc(u) + '" yet.</div>';
      });
    };
  }

  /* ---------------- public profile ---------------- */
  function viewProfile(username) {
    show('<div class="loading"><div class="spinner"></div></div>');
    db.getProfileByUsername(username).then(function (p) {
      if (!p) { show('<div class="card"><div class="empty">No profile named <b>' + esc(username) + '</b> yet.<br><br><a class="btn ghost" href="#/">Back home</a></div></div>'); return; }
      db.listInnings(p.id).then(function (rows) {
        var bat = rows.filter(function (r) { return r.kind === 'batting'; });
        var bowl = rows.filter(function (r) { return r.kind === 'bowling'; });
        var cb = CricStats.careerBatting(bat), kb = CricStats.careerBowling(bowl);
        var own = session && session.id === p.id;
        var sharePath = '#/u/' + p.username;
        var shareUrl = (location.origin && location.origin.indexOf('http') === 0)
          ? location.origin + location.pathname + sharePath
          : sharePath;   // demo/opaque origin (e.g. opened as a local file) - relative link, never 'null...'

        var hero =
          '<div class="hero reveal"><div class="hero-top">' +
          '<div class="avatar">' + esc(initials(p.display_name)) + '</div>' +
          '<div><h1>' + esc(p.display_name) + '</h1><div class="uname">@' + esc(p.username) + '</div>' +
          '<div class="badges"><span class="badge hot">' + esc(p.role) + '</span>' +
          '<span class="badge">' + esc(p.batting_style) + '</span><span class="badge">' + esc(p.bowling_style) + '</span></div></div></div>' +
          '<div class="hero-stats">' +
          '<div class="hstat green"><b data-count="' + (cb.inns + kb.inns) + '">0</b><span>Innings</span></div>' +
          '<div class="hstat"><b data-count="' + cb.runs + '">0</b><span>Runs</span></div>' +
          '<div class="hstat amber"><b data-count="' + kb.wickets + '">0</b><span>Wickets</span></div>' +
          '<div class="hstat blue"><b data-count="' + (cb.sr || 0) + '">0</b><span>Strike rate</span></div></div>' +
          '<div class="sharebar"><input class="fi" readonly value="' + esc(shareUrl) + '" id="share-url">' +
          '<button class="btn ghost" id="copy-link">Copy link</button>' +
          (own ? '<a class="btn" href="#/edit">Edit</a>' : '') + '</div></div>';

        var tabs = '<div class="tabs reveal d1"><button class="tab on" data-t="bat">Batting</button><button class="tab" data-t="bowl">Bowling</button><button class="tab" data-t="all">All innings</button></div>';
        var body = '<div id="tab-body" class="reveal d2"></div>';
        show(hero + tabs + body);
        countUps();
        document.getElementById('copy-link').onclick = function () {
          var i = document.getElementById('share-url');
          i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).catch(function () { document.execCommand && document.execCommand('copy'); });
          this.textContent = 'Copied';
        }.bind(document.getElementById('copy-link'));

        function careerTable() {
          return '<div class="card"><h2>Career <em>batting</em></h2><div class="tablewrap"><table class="stats">' +
            '<tr><th></th><th>Inns</th><th>Runs</th><th>HS</th><th>Avg</th><th>SR</th><th>4s</th><th>6s</th><th>50s</th><th>100s</th><th>NO</th></tr>' +
            '<tr><td>T20</td><td>' + cb.inns + '</td><td class="hl">' + cb.runs + '</td><td>' + cb.hs + '</td><td>' + fmt(cb.avg) + '</td><td>' + fmt(cb.sr) + '</td><td>' + cb.fours + '</td><td>' + cb.sixes + '</td><td>' + cb.fifties + '</td><td>' + cb.hundreds + '</td><td>' + cb.notOuts + '</td></tr>' +
            '</table></div></div>' +
            '<div class="card"><h2>Career <em>bowling</em></h2><div class="tablewrap"><table class="stats">' +
            '<tr><th></th><th>Inns</th><th>Overs</th><th>Runs</th><th>Wkts</th><th>Best</th><th>Avg</th><th>SR</th><th>Econ</th></tr>' +
            '<tr><td>T20</td><td>' + kb.inns + '</td><td>' + kb.overs + '</td><td>' + kb.runs + '</td><td class="hl">' + kb.wickets + '</td><td>' + (kb.best ? kb.best.wickets + '/' + kb.best.runs : '-') + '</td><td>' + fmt(kb.avg) + '</td><td>' + fmt(kb.sr) + '</td><td>' + fmt(kb.econ) + '</td></tr>' +
            '</table></div></div>';
        }

        function batTab() {
          var y = CricStats.yearly(bat, 'batting'), f = CricStats.form(bat, 'batting', 10);
          return careerTable() +
            (y.length ? '<div class="card"><h2>Runs per <em>year</em></h2>' + barChart(y, 'runs') + '</div>' : '') +
            (f.length ? '<div class="card"><h2>Recent <em>form</em></h2>' + formStrip(f, 'batting') + '</div>' : '') +
            inningsList(bat, 'batting');
        }
        function bowlTab() {
          var y = CricStats.yearly(bowl, 'bowling'), f = CricStats.form(bowl, 'bowling', 10);
          return '<div class="card"><h2>Career <em>bowling</em></h2><div class="tablewrap"><table class="stats">' +
            '<tr><th></th><th>Inns</th><th>Overs</th><th>Runs</th><th>Wkts</th><th>Best</th><th>Avg</th><th>SR</th><th>Econ</th></tr>' +
            '<tr><td>T20</td><td>' + kb.inns + '</td><td>' + kb.overs + '</td><td>' + kb.runs + '</td><td class="hl">' + kb.wickets + '</td><td>' + (kb.best ? kb.best.wickets + '/' + kb.best.runs : '-') + '</td><td>' + fmt(kb.avg) + '</td><td>' + fmt(kb.sr) + '</td><td>' + fmt(kb.econ) + '</td></tr>' +
            '</table></div></div>' +
            (y.length ? '<div class="card"><h2>Wickets per <em>year</em></h2>' + barChart(y, 'wickets', 'amber') + '</div>' : '') +
            (f.length ? '<div class="card"><h2>Recent <em>form</em></h2>' + formStrip(f, 'bowling') + '</div>' : '') +
            inningsList(bowl, 'bowling');
        }
        function inningsList(rows2, kind) {
          var items = rows2.slice().sort(function (a, b) { return a.played_on < b.played_on ? 1 : -1; }).map(function (r) {
            var fig = kind === 'batting'
              ? r.runs + (CricStats.isOut(r.dismissal) ? '' : '*') + ' <small>(' + r.balls + 'b)</small>'
              : r.wickets + '/' + r.runs_given + ' <small>(' + CricStats.ballsToOvers(r.legal_balls) + 'ov)</small>';
            var sub = kind === 'batting' ? (r.dismissal || 'Not out') : 'econ ' + (r.legal_balls ? (r.runs_given * 6 / r.legal_balls).toFixed(2) : '-');
            return '<div class="inn"><div class="when">' + esc(r.played_on) + '</div>' +
              '<div class="vs">' + esc(r.opponent || 'Friendly') + '<small>' + esc(sub) + '</small></div>' +
              '<div class="fig ' + (kind === 'bowling' ? 'bowl' : '') + '">' + fig + '</div></div>';
          }).join('');
          return '<div class="card"><h2>' + (kind === 'batting' ? 'Batting' : 'Bowling') + ' <em>innings</em> (' + rows2.length + ')</h2>' +
            (items || '<div class="empty">No ' + kind + ' innings logged yet.</div>') + '</div>';
        }
        function allTab() {
          var all = rows.slice().sort(function (a, b) { return a.played_on < b.played_on ? 1 : -1; });
          return '<div class="card"><h2>Every <em>innings</em> (' + all.length + ')</h2>' +
            all.map(function (r) {
              var fig = r.kind === 'batting' ? r.runs + (CricStats.isOut(r.dismissal) ? '' : '*') + ' (' + r.balls + 'b)'
                                             : r.wickets + '/' + r.runs_given + ' (' + CricStats.ballsToOvers(r.legal_balls) + 'ov)';
              return '<div class="inn"><div class="when">' + esc(r.played_on) + '</div>' +
                '<div class="vs">' + esc(r.opponent || 'Friendly') + '<small>' + r.kind + '</small></div>' +
                '<div class="fig ' + (r.kind === 'bowling' ? 'bowl' : '') + '">' + fig + '</div></div>';
            }).join('') + '</div>';
        }

        var tb = document.getElementById('tab-body');
        function paint(t) {
          tb.innerHTML = t === 'bat' ? batTab() : t === 'bowl' ? bowlTab() : allTab();
        }
        document.querySelectorAll('.tab').forEach(function (b) {
          b.onclick = function () {
            document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on'); paint(b.dataset.t);
          };
        });
        paint('bat');
      });
    }).catch(function (e) { show('<div class="card">' + fail(e) + '</div>'); });
  }

  /* ---------------- edit dashboard ---------------- */
  var ROLES = ['Batter', 'Bowler', 'Batting all-rounder', 'Bowling all-rounder', 'Wicketkeeper batter', 'All-rounder'];
  var BAT_STYLES = ['Right-hand bat', 'Left-hand bat'];
  var BOWL_STYLES = ['Right-arm fast', 'Right-arm medium-fast', 'Right-arm medium', 'Right-arm offbreak', 'Right-arm legbreak', 'Left-arm fast', 'Left-arm medium', 'Left-arm orthodox', 'Left-arm wrist spin', 'Does not bowl'];
  var DISMISSALS = ['', 'Bowled', 'Caught', 'LBW', 'Run Out', 'Stumped', 'Hit wicket', 'Retired hurt'];

  function sel(id, opts, val) {
    return '<select class="fi" id="' + id + '">' + opts.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + (o === '' ? 'Not out' : esc(o)) + '</option>';
    }).join('') + '</select>';
  }

  function viewEdit() {
    if (!session) { viewHome(); return; }
    show('<div class="loading"><div class="spinner"></div></div>');
    db.getMyProfile(session.id).then(function (p) {
      if (!p) return profileForm(null);
      db.listInnings(p.id).then(function (rows) { profileForm(p, rows); });
    }).catch(function (e) { show('<div class="card">' + fail(e) + '</div>'); });
  }

  function profileForm(p, rows) {
    show(
      '<div class="card reveal"><h2>' + (p ? 'Your <em>profile</em>' : 'Create your <em>profile</em>') + '</h2>' +
      '<form id="pf">' +
      '<div class="frow"><div><label class="fl">Username (your link)</label>' +
      (p ? '<input class="fi" value="' + esc(p.username) + '" disabled>' :
           '<input class="fi" id="pf-user" required placeholder="sandy" pattern="[a-z0-9][a-z0-9-]{2,29}" title="lowercase letters, numbers, dashes">') + '</div>' +
      '<div><label class="fl">Display name</label><input class="fi" id="pf-name" required value="' + esc(p ? p.display_name : '') + '" placeholder="Sandy K"></div></div>' +
      '<div class="frow"><div><label class="fl">Role</label>' + sel('pf-role', ROLES, p ? p.role : 'All-rounder') + '</div>' +
      '<div><label class="fl">Batting style</label>' + sel('pf-bat', BAT_STYLES, p ? p.batting_style : BAT_STYLES[0]) + '</div></div>' +
      '<div class="frow one"><div><label class="fl">Bowling style</label>' + sel('pf-bowl', BOWL_STYLES, p ? p.bowling_style : BOWL_STYLES[2]) + '</div></div>' +
      '<button class="btn" type="submit">' + (p ? 'Save profile' : 'Create profile') + '</button> ' +
      (p ? '<a class="btn ghost" href="#/u/' + esc(p.username) + '">View public page</a>' : '') +
      '<div id="pf-msg"></div></form></div>' +
      (p ? inningsManager(p, rows) : '')
    );
    document.getElementById('pf').onsubmit = function (e) {
      e.preventDefault();
      var fields = {
        display_name: document.getElementById('pf-name').value.trim(),
        role: document.getElementById('pf-role').value,
        batting_style: document.getElementById('pf-bat').value,
        bowling_style: document.getElementById('pf-bowl').value
      };
      var msg = document.getElementById('pf-msg');
      var done = function (saved) { msg.innerHTML = '<div class="notice green" style="margin-top:12px">Saved. <a href="#/u/' + esc(saved.username) + '">View your public page</a></div>'; if (!p) viewEdit(); };
      if (p) db.updateProfile(p.id, fields).then(done).catch(function (e2) { msg.innerHTML = fail(e2); });
      else {
        fields.id = session.id;
        fields.username = document.getElementById('pf-user').value.trim().toLowerCase();
        db.createProfile(fields).then(done).catch(function (e2) { msg.innerHTML = fail(e2); });
      }
    };
    if (p) wireInnings(p, rows);
  }

  function inningsManager(p, rows) {
    return '<div class="card reveal d1"><h2>Log an <em>innings</em></h2>' +
      '<div class="tabs" style="max-width:340px"><button class="tab on" data-k="batting" type="button">Batting</button><button class="tab" data-k="bowling" type="button">Bowling</button></div>' +
      '<form id="inf">' +
      '<input type="hidden" id="inf-id" value="">' +
      '<input type="hidden" id="inf-kind" value="batting">' +
      '<div class="frow"><div><label class="fl">Date</label><input class="fi" type="date" id="inf-date" required></div>' +
      '<div><label class="fl">Opponent</label><input class="fi" id="inf-opp" placeholder="Wild Hogs"></div></div>' +
      '<div id="kind-fields"></div>' +
      '<button class="btn" type="submit" id="inf-save">Add innings</button> ' +
      '<button class="btn ghost" type="button" id="inf-clear" style="display:none">Cancel edit</button>' +
      '<div id="inf-msg"></div></form></div>' +
      '<div class="card reveal d2"><h2>Your <em>innings</em> (' + rows.length + ')</h2><div id="my-inns"></div></div>';
  }

  function kindFields(kind, r) {
    r = r || {};
    function v(k, d) { return r[k] != null ? r[k] : (d == null ? '' : d); }
    if (kind === 'batting') {
      return '<div class="frow"><div><label class="fl">Runs</label><input class="fi" type="number" min="0" id="inf-runs" required value="' + v('runs') + '"></div>' +
        '<div><label class="fl">Balls faced</label><input class="fi" type="number" min="0" id="inf-balls" required value="' + v('balls') + '"></div></div>' +
        '<div class="frow"><div><label class="fl">Fours</label><input class="fi" type="number" min="0" id="inf-fours" required value="' + v('fours', 0) + '"></div>' +
        '<div><label class="fl">Sixes</label><input class="fi" type="number" min="0" id="inf-sixes" required value="' + v('sixes', 0) + '"></div></div>' +
        '<div class="frow"><div><label class="fl">Dot balls</label><input class="fi" type="number" min="0" id="inf-dots" required value="' + v('dots', 0) + '"></div>' +
        '<div><label class="fl">Dismissal</label>' + sel('inf-dismissal', DISMISSALS, r.dismissal || '') + '</div></div>';
    }
    return '<div class="frow"><div><label class="fl">Overs (e.g. 4 or 4.2)</label><input class="fi" id="inf-overs" required pattern="\\d+(\\.[0-5])?" value="' + (r.legal_balls != null ? CricStats.ballsToOvers(r.legal_balls) : '') + '"></div>' +
      '<div><label class="fl">Runs given</label><input class="fi" type="number" min="0" id="inf-rgiven" required value="' + v('runs_given') + '"></div></div>' +
      '<div class="frow"><div><label class="fl">Wickets</label><input class="fi" type="number" min="0" id="inf-wkts" required value="' + v('wickets') + '"></div>' +
      '<div><label class="fl">Wides</label><input class="fi" type="number" min="0" id="inf-wides" required value="' + v('wides', 0) + '"></div></div>' +
      '<div class="frow"><div><label class="fl">No balls</label><input class="fi" type="number" min="0" id="inf-nb" required value="' + v('no_balls', 0) + '"></div>' +
      '<div><label class="fl">Catches</label><input class="fi" type="number" min="0" id="inf-cat" required value="' + v('catches', 0) + '"></div></div>' +
      '<div class="frow one"><div><label class="fl">Run outs</label><input class="fi" type="number" min="0" id="inf-ro" required value="' + v('run_outs', 0) + '"></div></div>';
  }

  function wireInnings(p, rows) {
    var kindEl = document.getElementById('inf-kind');
    var kf = document.getElementById('kind-fields');
    kf.innerHTML = kindFields('batting');
    document.querySelectorAll('.card .tab').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('.card .tab').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on'); kindEl.value = b.dataset.k; kf.innerHTML = kindFields(b.dataset.k);
      };
    });
    var today = new Date();
    document.getElementById('inf-date').value = today.toISOString().slice(0, 10);

    function paintList() {
      var el = document.getElementById('my-inns');
      if (!rows.length) { el.innerHTML = '<div class="empty">Nothing yet - log your first innings above.</div>'; return; }
      el.innerHTML = rows.slice().sort(function (a, b) { return a.played_on < b.played_on ? 1 : -1; }).map(function (r) {
        var fig = r.kind === 'batting' ? r.runs + (CricStats.isOut(r.dismissal) ? '' : '*') + ' (' + r.balls + 'b)'
                                       : r.wickets + '/' + r.runs_given + ' (' + CricStats.ballsToOvers(r.legal_balls) + 'ov)';
        return '<div class="inn"><div class="when">' + esc(r.played_on) + '</div>' +
          '<div class="vs">' + esc(r.opponent || 'Friendly') + '<small>' + r.kind + '</small></div>' +
          '<div class="fig ' + (r.kind === 'bowling' ? 'bowl' : '') + '">' + fig + '</div>' +
          '<button class="mini" data-edit="' + r.id + '" title="Edit">✏️</button>' +
          '<button class="mini" data-del="' + r.id + '" title="Delete">🗑️</button></div>';
      }).join('');
      el.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('Delete this innings?')) return;
          db.deleteInning(Number(b.dataset.del)).then(function () {
            rows = rows.filter(function (r) { return r.id !== Number(b.dataset.del); });
            paintList();
          });
        };
      });
      el.querySelectorAll('[data-edit]').forEach(function (b) {
        b.onclick = function () {
          var r = rows.filter(function (x) { return x.id === Number(b.dataset.edit); })[0];
          if (!r) return;
          document.getElementById('inf-id').value = r.id;
          kindEl.value = r.kind;
          document.querySelectorAll('.card .tab').forEach(function (x) { x.classList.toggle('on', x.dataset.k === r.kind); });
          kf.innerHTML = kindFields(r.kind, r);
          document.getElementById('inf-date').value = r.played_on;
          document.getElementById('inf-opp').value = r.opponent || '';
          document.getElementById('inf-save').textContent = 'Save changes';
          document.getElementById('inf-clear').style.display = '';
          var df = document.getElementById('inf-date');
          if (df.scrollIntoView) df.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
      });
    }
    paintList();

    document.getElementById('inf-clear').onclick = function () {
      document.getElementById('inf').reset();
      document.getElementById('inf-id').value = '';
      document.getElementById('inf-date').value = new Date().toISOString().slice(0, 10);
      kf.innerHTML = kindFields(kindEl.value);
      document.getElementById('inf-save').textContent = 'Add innings';
      this.style.display = 'none';
    };

    document.getElementById('inf').onsubmit = function (e) {
      e.preventDefault();
      var msg = document.getElementById('inf-msg');
      var kind = kindEl.value;
      var row = { user_id: p.id, kind: kind, played_on: document.getElementById('inf-date').value, opponent: document.getElementById('inf-opp').value.trim() };
      function num(id) { return parseInt(document.getElementById(id).value, 10) || 0; }
      if (kind === 'batting') {
        row.runs = num('inf-runs'); row.balls = num('inf-balls'); row.fours = num('inf-fours');
        row.sixes = num('inf-sixes'); row.dots = num('inf-dots');
        row.dismissal = document.getElementById('inf-dismissal').value;
        row.legal_balls = row.runs_given = row.wickets = row.wides = row.no_balls = row.catches = row.run_outs = null;
      } else {
        try { row.legal_balls = CricStats.oversToBalls(document.getElementById('inf-overs').value.trim()); }
        catch (e2) { msg.innerHTML = fail(e2); return; }
        row.runs_given = num('inf-rgiven'); row.wickets = num('inf-wkts'); row.wides = num('inf-wides');
        row.no_balls = num('inf-nb'); row.catches = num('inf-cat'); row.run_outs = num('inf-ro');
        row.runs = row.balls = row.fours = row.sixes = row.dots = null; row.dismissal = '';
      }
      var editId = document.getElementById('inf-id').value;
      var p2 = editId ? db.updateInning(Number(editId), row) : db.addInning(row);
      p2.then(function (saved) {
        if (editId) { var i = rows.findIndex(function (r) { return r.id === Number(editId); }); rows[i] = Object.assign({}, rows[i], row); }
        else rows.push(saved);
        document.getElementById('inf').reset();
        document.getElementById('inf-id').value = '';
        document.getElementById('inf-date').value = new Date().toISOString().slice(0, 10);
        kf.innerHTML = kindFields(kind);
        document.getElementById('inf-save').textContent = 'Add innings';
        document.getElementById('inf-clear').style.display = 'none';
        msg.innerHTML = '<div class="notice green" style="margin-top:12px">Saved. <a href="#/u/' + esc(p.username) + '">See it live</a></div>';
        paintList();
      }).catch(function (e2) { msg.innerHTML = fail(e2); });
    };
  }

  /* ---------------- router ---------------- */
  function route() {
    var h = location.hash || '#/';
    if (h.indexOf('#/u/') === 0) viewProfile(decodeURIComponent(h.slice(4)));
    else if (h === '#/edit') viewEdit();
    else viewHome();
  }

  CricDB.then(function (client) {
    db = client;
    db.getSessionUser().then(function (u) {
      session = u;
      renderNav();
      db.onAuthChange(function (u2) { session = u2; renderNav(); route(); });
      window.addEventListener('hashchange', route);
      route();
    });
  });
})();
