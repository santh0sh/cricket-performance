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

  /* Per-innings trend for the last n innings (date order). Batting: runs bars,
     not-out star, peak highlight. Bowling: wicket bars + fielding dots where the
     source recorded catches/run-outs (CricHeroes imports did not - shown as gaps). */
  function trendChart(rows, kind, n) {
    var last = rows.slice().sort(function (a, b) { return String(a.played_on) < String(b.played_on) ? -1 : 1; }).slice(-(n || 15));
    if (!last.length) return '';
    var key = kind === 'batting' ? 'runs' : 'wickets';
    var max = Math.max.apply(null, last.map(function (r) { return r[key] || 0; }).concat([1]));
    var missingFielding = kind === 'bowling' && last.some(function (r) { return r.catches == null && r.run_outs == null; });
    return '<div class="trend" role="img" aria-label="' + kind + ' form, last ' + last.length + ' innings">' + last.map(function (r, i) {
      var v = r[key] || 0;
      var h = Math.max(3, Math.round(v / max * 82));
      var peak = v > 0 && v === max;
      var star = kind === 'batting' && !CricStats.isOut(r.dismissal) ? '*' : '';
      var fdot = '';
      if (kind === 'bowling' && (r.catches != null || r.run_outs != null)) {
        var f = (r.catches || 0) + (r.run_outs || 0);
        if (f > 0) fdot = '<i class="fdot" title="' + (r.catches || 0) + ' catches, ' + (r.run_outs || 0) + ' run outs">' + f + '</i>';
      }
      return '<div class="tcol"><b>' + v + star + '</b>' + fdot +
        '<i class="tbar' + (kind === 'bowling' ? ' bowl' : '') + (peak ? ' peak' : '') + '" style="height:' + h + '%;animation-delay:' + (i * 50) + 'ms"></i>' +
        '<span>' + esc(String(r.played_on).slice(5).split('-').reverse().join('/')) + '</span></div>';
    }).join('') + '</div>' +
    (missingFielding ? '<div class="tnote">No fielding dots on some bars: CricHeroes imports do not record catches/run-outs.</div>' : '');
  }

  /* Records shelf: one card per fifty (batting) or five-wicket haul (bowling). */
  function recordsShelf(rows, kind) {
    var recs = rows.filter(function (r) {
      return kind === 'batting' ? (r.runs >= 50 && r.runs < 100) || r.runs >= 100 : r.wickets >= 5;
    }).sort(function (x, y) {
      return kind === 'batting' ? y.runs - x.runs : (y.wickets - x.wickets) || (x.runs_given - y.runs_given);
    });
    if (!recs.length) return '';
    return '<div class="shelf">' + recs.map(function (r) {
      var fig = kind === 'batting' ? r.runs + (CricStats.isOut(r.dismissal) ? '' : '*') : r.wickets + '/' + r.runs_given;
      return '<div class="rec"><b>' + fig + '</b><span>' + esc(r.opponent || 'Friendly') + '</span><small>' + esc(r.played_on) + '</small></div>';
    }).join('') + '</div>';
  }

  /* Head-to-head: this player's record against one opponent, from innings already loaded. */
  function h2hCard(rows, opp) {
    var vs = rows.filter(function (r) { return (r.opponent || '') === opp; });
    if (!vs.length) return '';
    var bat = vs.filter(function (r) { return r.kind === 'batting'; });
    var bowl = vs.filter(function (r) { return r.kind === 'bowling'; });
    var cb = CricStats.careerBatting(bat), kb = CricStats.careerBowling(bowl);
    var dates = vs.map(function (r) { return r.played_on; }).sort();
    var fieldC = bowl.reduce(function (t, r) { return t + (r.catches || 0); }, 0);
    var fieldR = bowl.reduce(function (t, r) { return t + (r.run_outs || 0); }, 0);
    return '<div class="card h2h" id="h2h"><h2>vs <em>' + esc(opp || 'Friendly') + '</em></h2>' +
      '<div class="h2hgrid">' +
      '<div><b>' + dates.length + '</b><span>innings</span></div>' +
      (bat.length ? '<div><b>' + cb.runs + '</b><span>runs (HS ' + cb.hs + ')</span></div>' : '') +
      (bat.length && cb.avg != null ? '<div><b>' + cb.avg + '</b><span>bat avg</span></div>' : '') +
      (bowl.length ? '<div><b>' + kb.wickets + '</b><span>wickets</span></div>' : '') +
      (bowl.length && kb.best ? '<div><b>' + kb.best.wickets + '/' + kb.best.runs + '</b><span>best</span></div>' : '') +
      (fieldC + fieldR > 0 ? '<div><b>' + fieldC + 'c / ' + fieldR + 'ro</b><span>fielding</span></div>' : '') +
      '</div>' +
      '<div class="tnote">' + esc(dates[0]) + ' to ' + esc(dates[dates.length - 1]) + '. Tap any other opponent name for their head-to-head.</div></div>';
  }

  function formStrip(formRows, kind) {
    return '<div class="formstrip">' + formRows.map(function (f) {
      var cls = kind === 'batting' ? (f.value >= 30 ? 'good' : f.value < 10 ? 'bad' : '')
                                   : (f.value >= 3 ? 'good' : f.value === 0 ? 'bad' : '');
      return '<div class="fchip ' + cls + '">' + esc(f.label) + '<small>' + esc(String(f.played_on).slice(5)) + '</small></div>';
    }).join('') + '</div>';
  }

  function renderNav() {
    var h = '<a href="#/">Home</a><a href="#/players">Players</a>';
    if (session) h += '<a href="#/edit">My profile</a><button class="cta" id="nav-out">Sign out</button>';
    else h += '<a class="cta" href="#/">Sign in</a>';
    nav.innerHTML = h;
    var out = document.getElementById('nav-out');
    if (out) out.onclick = function () { db.signOut().then(function () { session = null; renderNav(); go('#/'); route(); }); };
  }

  /* ---------------- home ---------------- */
  function viewHome(msg) {
    var signed = session
      ? '<div class="card reveal d2"><h2>Signed in as <em>' + esc(session.label || session.email) + '</em></h2>' +
        '<a class="btn" href="#/edit">Open my profile</a></div>'
      : '<div class="card reveal d2"><h2>Create your profile</h2>' + (msg ? '<div class="notice green">' + esc(msg) + '</div>' : '') +
        (db.mode === 'demo' ? '<div class="notice">Demo mode (no Supabase config yet) - data stays in this browser. Sign-in is instant, no email sent.</div>' : '') +
        '<p style="margin:0 0 12px;opacity:.8">Sign in with your mobile number and PIN. Anyone with your link can view your stats - only you can edit them.</p>' +
        '<form id="signin"><div class="frow"><div><label class="fl">Mobile number</label>' +
        '<input class="fi" type="tel" id="si-phone" required inputmode="tel" autocomplete="tel" placeholder="98400 12345"></div>' +
        '<div><label class="fl">PIN (4-6 digits)</label>' +
        '<input class="fi" type="password" id="si-pin" required inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="current-password" placeholder="****"></div></div>' +
        '<button class="btn" type="submit">Sign in</button> ' +
        '<button class="btn ghost" type="button" id="si-new">First time? Create my PIN</button>' +
        '<div id="si-msg"></div></form></div>';
    show(
      '<div class="home-hero reveal">' +
      '<h1>Your cricket career,<br><em>one link.</em></h1>' +
      '<p>Create a profile, log every innings, and share a live stats page - averages, strike rates, economy, form - all computed for you.</p></div>' +
      '<div class="home-cards">' + signed +
      '<div class="card reveal d3"><h2>Find a player</h2>' +
      '<form id="lookup"><div class="frow one"><div><label class="fl">Name or username</label>' +
      '<input class="fi" id="lk-name" required minlength="2" placeholder="sandy"></div></div>' +
      '<button class="btn ghost" type="submit">Search</button> <a class="btn ghost" href="#/players">All players</a><div id="lk-msg"></div></form></div></div>'
    );
    var sf = document.getElementById('signin');
    function pinAuth(isNew) {
      var phone = document.getElementById('si-phone').value.trim();
      var pin = document.getElementById('si-pin').value.trim();
      var m = document.getElementById('si-msg');
      if (!/^[0-9]{4,6}$/.test(pin)) { m.innerHTML = '<div class="err">PIN must be 4-6 digits.</div>'; return; }
      if (!db.phoneOk(phone)) { m.innerHTML = '<div class="err">Enter a valid mobile number (10 digits, or with country code).</div>'; return; }
      m.innerHTML = '';
      (isNew ? db.signUpWithPin(phone, pin) : db.signInWithPin(phone, pin)).then(function (u) {
        session = u; renderNav();
        db.getMyProfile(u.id).then(function (p) { go(p && p.username ? '#/u/' + p.username : '#/edit'); }, function () { go('#/edit'); }).then(route);
      }).catch(function (e2) { m.innerHTML = fail(e2); });
    }
    if (sf) {
      sf.onsubmit = function (e) { e.preventDefault(); pinAuth(false); };
      document.getElementById('si-new').onclick = function () {
        if (!sf.reportValidity()) return;
        pinAuth(true);
      };
    }
    var lk = document.getElementById('lookup');
    attachSuggest(document.getElementById('lk-name'), function (p) { go('#/u/' + p.username); });
    if (lk) lk.onsubmit = function (e) {
      e.preventDefault();
      var u = document.getElementById('lk-name').value.trim().toLowerCase();
      var msg = document.getElementById('lk-msg');
      db.searchProfiles(u).then(function (hits) {
        if (hits.length === 1) { go('#/u/' + hits[0].username); return; }
        if (!hits.length) { msg.innerHTML = '<div class="err">No players match "' + esc(u) + '" yet.</div>'; return; }
        msg.innerHTML = '<div style="margin-top:12px">' + hits.map(function (p) {
          return '<a class="inn" href="#/u/' + esc(p.username) + '" style="text-decoration:none;color:inherit">' +
            '<div class="vs">' + esc(p.display_name) + '<small>@' + esc(p.username) + ' · ' + esc(p.role) + '</small></div>' +
            '<div class="fig">→</div></a>';
        }).join('') + '</div>';
      }).catch(function (e2) { msg.innerHTML = fail(e2); });
    };
  }

  /* ---------------- search suggestions ---------------- */
  (function () {
    var css = '.sug{position:absolute;left:0;right:0;top:100%;margin-top:4px;z-index:50;background:#0f1729;border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,.45)}' +
      '.sug a{display:flex;align-items:center;gap:10px;padding:10px 12px;color:inherit;text-decoration:none;cursor:pointer}' +
      '.sug a.on,.sug a:hover{background:rgba(34,211,153,.12)}' +
      '.sug .sa{width:30px;height:30px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;background:linear-gradient(135deg,#22d399,#3b82f6);color:#06101f;overflow:hidden}' +
      '.sug .sa img{width:100%;height:100%;object-fit:cover}.sug small{display:block;opacity:.6;font-size:12px}' +
      '.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}' +
      '.pcard{display:flex;gap:12px;align-items:center;padding:14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);color:inherit;text-decoration:none;transition:transform .15s,border-color .15s}' +
      '.pcard:hover{transform:translateY(-2px);border-color:rgba(34,211,153,.5)}' +
      '.pcard .sa{width:52px;height:52px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;background:linear-gradient(135deg,#22d399,#3b82f6);color:#06101f;overflow:hidden}' +
      '.pcard .sa img{width:100%;height:100%;object-fit:cover}.pcard b{display:block;font-size:16px}.pcard small{display:block;opacity:.6;font-size:12px}' +
      '.pcard .pst{margin-top:4px;font-size:13px;opacity:.85}.pcard .pst span{margin-right:10px}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  })();
  function miniAvatar(p) {
    return '<div class="sa">' + (p.avatar_url ? '<img src="' + esc(p.avatar_url) + '" alt="" onerror="this.parentNode.textContent=\'' + esc(initials(p.display_name)) + '\'">' : esc(initials(p.display_name))) + '</div>';
  }
  function attachSuggest(input, onPick) {
    if (!input) return;
    var wrap = input.parentNode; wrap.style.position = 'relative';
    input.setAttribute('autocomplete', 'off');
    var box = document.createElement('div'); box.className = 'sug'; box.style.display = 'none'; wrap.appendChild(box);
    var hits = [], sel = -1, timer = null, seq = 0;
    function close() { box.style.display = 'none'; sel = -1; }
    function paint() {
      if (!hits.length) { close(); return; }
      box.innerHTML = hits.map(function (p, i) {
        return '<a data-i="' + i + '"' + (i === sel ? ' class="on"' : '') + '>' + miniAvatar(p) +
          '<div>' + esc(p.display_name) + '<small>@' + esc(p.username) + ' · ' + esc(p.role) + '</small></div></a>';
      }).join('');
      box.style.display = 'block';
    }
    box.addEventListener('mousedown', function (e) {
      var a = e.target.closest('a[data-i]'); if (!a) return;
      e.preventDefault(); var p = hits[+a.getAttribute('data-i')]; close(); onPick(p, input);
    });
    input.addEventListener('input', function () {
      var q = input.value.trim(); clearTimeout(timer);
      if (!q) { hits = []; close(); return; }
      timer = setTimeout(function () {
        var my = ++seq;
        db.searchProfiles(q).then(function (r) { if (my !== seq) return; hits = r || []; sel = -1; paint(); }).catch(function () {});
      }, 180);
    });
    input.addEventListener('keydown', function (e) {
      if (box.style.display === 'none') return;
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, hits.length - 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); }
      else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); var p = hits[sel]; close(); onPick(p, input); }
      else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
  }

  function shrinkImage(file, max) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not read that image.')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        if (!window.createImageBitmap) { reject(new Error('Could not read that image. Try a JPG or PNG.')); return; }
        createImageBitmap(file).then(function (bm) {
          var s = Math.min(1, max / Math.max(bm.width, bm.height));
          var c = document.createElement('canvas'); c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
          c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
          c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not read that image.')); }, 'image/jpeg', 0.85);
        }).catch(function () { reject(new Error('Could not read that image. Try a JPG or PNG.')); });
      };
      img.src = url;
    });
  }

  /* ---------------- all players ---------------- */
  function viewPlayers() {
    show('<div class="loading"><div class="spinner"></div></div>');
    Promise.all([db.listProfiles(), db.teamTotals().catch(function () { return []; })]).then(function (res) {
      var ps = res[0], tot = {};
      res[1].forEach(function (r) {
        var t = tot[r.user_id] || (tot[r.user_id] = { m: 0, runs: 0, wk: 0 });
        if (r.kind === 'batting') t.runs += r.runs || 0; else t.wk += r.wickets || 0;
      });
      var cards = ps.map(function (p) {
        var t = tot[p.id] || { runs: 0, wk: 0 };
        return '<a class="pcard" href="#/u/' + esc(p.username) + '">' + miniAvatar(p) +
          '<div><b>' + esc(p.display_name) + '</b><small>@' + esc(p.username) + ' · ' + esc(p.role) + '</small>' +
          '<div class="pst"><span>' + t.runs + ' runs</span><span>' + t.wk + ' wkts</span></div></div></a>';
      }).join('');
      show('<div class="card reveal"><h2>All <em>players</em> <small style="opacity:.6;font-size:14px">(' + ps.length + ')</small></h2>' +
        '<div class="frow one" style="margin-bottom:14px"><div><input class="fi" id="pl-filter" placeholder="Filter by name" autocomplete="off"></div></div>' +
        (ps.length ? '<div class="pgrid" id="pl-grid">' + cards + '</div>' : '<div class="empty">No players yet.</div>') + '</div>');
      var f = document.getElementById('pl-filter');
      if (f) f.oninput = function () {
        var q = f.value.trim().toLowerCase();
        [].forEach.call(document.querySelectorAll('#pl-grid .pcard'), function (c) {
          c.style.display = !q || c.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
        });
      };
    }).catch(function (e) { show('<div class="card">' + fail(e) + '</div>'); });
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
          (p.avatar_url
            ? '<div class="avatar"><img src="' + esc(p.avatar_url) + '" alt="' + esc(p.display_name) + '" onerror="this.parentNode.textContent=\'' + esc(initials(p.display_name)) + '\'"></div>'
            : '<div class="avatar">' + esc(initials(p.display_name)) + '</div>') +
          '<div><h1>' + esc(p.display_name) + '</h1><div class="uname">@' + esc(p.username) + '</div>' +
          '<div class="badges"><span class="badge hot">' + esc(p.role) + '</span>' +
          '<span class="badge">' + esc(p.batting_style) + '</span><span class="badge">' + esc(p.bowling_style) + '</span>' +
          (p.external_url ? '<a class="badge hot" href="' + esc(p.external_url) + '" target="_blank" rel="noopener">' +
            (/cricheroes|chshare/i.test(p.external_url) ? 'CricHeroes' : esc((p.external_url.match(/^https?:\/\/([^\/]+)/i) || [,'link'])[1])) + ' ↗</a>' : '') +
          '</div></div></div>' +
          '<div class="hero-stats">' +
          '<div class="hstat green"><b data-count="' + (cb.inns + kb.inns) + '">0</b><span>Innings</span></div>' +
          '<div class="hstat"><b data-count="' + cb.runs + '">0</b><span>Runs</span></div>' +
          '<div class="hstat amber"><b data-count="' + kb.wickets + '">0</b><span>Wickets</span></div>' +
          '<div class="hstat blue"><b data-count="' + (cb.sr || 0) + '">0</b><span>Strike rate</span></div></div>' +
          '<div class="sharebar"><input class="fi" readonly value="' + esc(shareUrl) + '" id="share-url">' +
          '<button class="btn ghost" id="copy-link">Copy link</button>' +
          (own ? '<a class="btn" href="#/edit">Edit</a>' : '') + '<a class="btn ghost" href="#/compare/' + esc(p.username) + '">Compare</a>' + '</div></div>';

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
            (bat.some(function (r) { return r.runs >= 50; }) ? '<div class="card"><h2>Records <em>shelf</em> - fifties</h2>' + recordsShelf(bat, 'batting') + '</div>' : '') +
            (y.length ? '<div class="card"><h2>Runs per <em>year</em></h2>' + barChart(y, 'runs') + '</div>' : '') +
            (bat.length ? '<div class="card"><h2>Form - last <em>' + Math.min(15, bat.length) + ' innings</em></h2>' + trendChart(bat, 'batting', 15) + '</div>' : '') +
            inningsList(bat, 'batting');
        }
        function bowlTab() {
          var y = CricStats.yearly(bowl, 'bowling'), f = CricStats.form(bowl, 'bowling', 10);
          return '<div class="card"><h2>Career <em>bowling</em></h2><div class="tablewrap"><table class="stats">' +
            '<tr><th></th><th>Inns</th><th>Overs</th><th>Runs</th><th>Wkts</th><th>Best</th><th>Avg</th><th>SR</th><th>Econ</th></tr>' +
            '<tr><td>T20</td><td>' + kb.inns + '</td><td>' + kb.overs + '</td><td>' + kb.runs + '</td><td class="hl">' + kb.wickets + '</td><td>' + (kb.best ? kb.best.wickets + '/' + kb.best.runs : '-') + '</td><td>' + fmt(kb.avg) + '</td><td>' + fmt(kb.sr) + '</td><td>' + fmt(kb.econ) + '</td></tr>' +
            '</table></div></div>' +
            (bowl.some(function (r) { return r.wickets >= 5; }) ? '<div class="card"><h2>Records <em>shelf</em> - five-fors</h2>' + recordsShelf(bowl, 'bowling') + '</div>' : '') +
            (y.length ? '<div class="card"><h2>Wickets per <em>year</em></h2>' + barChart(y, 'wickets', 'amber') + '</div>' : '') +
            (function () {
              var fr = bowl.filter(function (r) { return r.catches != null || r.run_outs != null; });
              if (!fr.length) return '';
              var c = fr.reduce(function (t, r) { return t + (r.catches || 0); }, 0);
              var ro = fr.reduce(function (t, r) { return t + (r.run_outs || 0); }, 0);
              return '<div class="card"><h2><em>Fielding</em></h2><div class="h2hgrid fielding">' +
                '<div><b>' + c + '</b><span>catches</span></div><div><b>' + ro + '</b><span>run outs</span></div><div><b>' + fr.length + '</b><span>innings recorded</span></div></div>' +
                '<div class="tnote">Fielding comes from the 2019-2021 scorebook era; CricHeroes imports do not record it.</div></div>';
            })() +
            (bowl.length ? '<div class="card"><h2>Form - last <em>' + Math.min(15, bowl.length) + ' innings</em></h2>' + trendChart(bowl, 'bowling', 15) + '</div>' : '') +
            inningsList(bowl, 'bowling');
        }
        function inningsList(rows2, kind) {
          var items = rows2.slice().sort(function (a, b) { return a.played_on < b.played_on ? 1 : -1; }).map(function (r) {
            var fig = kind === 'batting'
              ? r.runs + (CricStats.isOut(r.dismissal) ? '' : '*') + ' <small>(' + r.balls + 'b)</small>'
              : r.wickets + '/' + r.runs_given + ' <small>(' + CricStats.ballsToOvers(r.legal_balls) + 'ov)</small>';
            var sub = kind === 'batting' ? (r.dismissal || 'Not out') : 'econ ' + (r.legal_balls ? (r.runs_given * 6 / r.legal_balls).toFixed(2) : '-');
            return '<div class="inn"><div class="when">' + esc(r.played_on) + '</div>' +
              '<button class="vs tappable" data-opp="' + esc(r.opponent || '') + '" title="Head-to-head vs ' + esc(r.opponent || 'Friendly') + '">' + esc(r.opponent || 'Friendly') + '<small>' + esc(sub) + '</small></button>' +
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
                '<button class="vs tappable" data-opp="' + esc(r.opponent || '') + '" title="Head-to-head vs ' + esc(r.opponent || 'Friendly') + '">' + esc(r.opponent || 'Friendly') + '<small>' + r.kind + '</small></button>' +
                '<div class="fig ' + (r.kind === 'bowling' ? 'bowl' : '') + '">' + fig + '</div></div>';
            }).join('') + '</div>';
        }

        var tb = document.getElementById('tab-body');
        function paint(t) {
          tb.innerHTML = t === 'bat' ? batTab() : t === 'bowl' ? bowlTab() : allTab();
        }
        tb.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('.vs.tappable') : null;
          if (!b) return;
          var old = document.getElementById('h2h');
          if (old) old.remove();
          tb.insertAdjacentHTML('afterbegin', h2hCard(rows, b.dataset.opp || ''));
          var h = document.getElementById('h2h');
          if (h && h.scrollIntoView) h.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
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
      '<div><label class="fl">Display name</label><input class="fi" id="pf-name" required value="' + esc(p ? p.display_name : '') + '" placeholder="Sandy"></div></div>' +
      '<div class="frow"><div><label class="fl">Role</label>' + sel('pf-role', ROLES, p ? p.role : 'All-rounder') + '</div>' +
      '<div><label class="fl">Batting style</label>' + sel('pf-bat', BAT_STYLES, p ? p.batting_style : BAT_STYLES[0]) + '</div></div>' +
      '<div class="frow one"><div><label class="fl">Bowling style</label>' + sel('pf-bowl', BOWL_STYLES, p ? p.bowling_style : BOWL_STYLES[2]) + '</div></div>' +
      '<div class="frow one"><div><label class="fl">External profile link (optional - e.g. CricHeroes)</label>' +
      '<input class="fi" id="pf-ext" type="url" placeholder="https://..." value="' + esc(p && p.external_url || '') + '"></div></div>' +
      (p ? '<div class="frow one"><div><label class="fl">Profile photo</label>' +
        '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        '<div id="ph-prev" style="width:72px;height:72px;border-radius:16px;overflow:hidden;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;background:linear-gradient(135deg,#22d399,#3b82f6);color:#06101f">' +
        (p.avatar_url ? '<img src="' + esc(p.avatar_url) + '" alt="" style="width:100%;height:100%;object-fit:cover">' : esc(initials(p.display_name))) + '</div>' +
        '<label class="btn ghost" style="cursor:pointer;margin:0">Upload photo<input type="file" id="ph-file" accept="image/*" style="display:none"></label>' +
        '<div id="ph-msg" style="flex-basis:100%"></div></div></div></div>' : '') +
      '<div class="frow one"><div><label class="fl">Profile photo URL (optional - or use Upload photo)</label>' +
      '<input class="fi" id="pf-avatar" type="text" placeholder="https://..." value="' + esc(p && p.avatar_url || '') + '"></div></div>' +
      '<button class="btn" type="submit">' + (p ? 'Save profile' : 'Create profile') + '</button> ' +
      (p ? '<a class="btn ghost" href="#/u/' + esc(p.username) + '">View public page</a>' : '') +
      '<div id="pf-msg"></div></form></div>' +
      (p && db.mode !== 'demo' ? '<div class="card reveal"><h2>Change <em>PIN</em></h2>' +
        '<form id="cp"><div class="frow one"><div><label class="fl">New PIN (4-6 digits)</label>' +
        '<input class="fi" type="password" id="cp-pin" required inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="new-password"></div></div>' +
        '<button class="btn ghost" type="submit">Update PIN</button><div id="cp-msg"></div></form></div>' : '') +
      (p ? inningsManager(p, rows) : '')
    );
    var cpf = document.getElementById('cp');
    if (cpf) cpf.onsubmit = function (e) {
      e.preventDefault();
      var np = document.getElementById('cp-pin').value.trim(), cm = document.getElementById('cp-msg');
      if (!/^[0-9]{4,6}$/.test(np)) { cm.innerHTML = '<div class="err">PIN must be 4-6 digits.</div>'; return; }
      db.changePin(np).then(function () { document.getElementById('cp-pin').value = ''; cm.innerHTML = '<div class="notice green" style="margin-top:12px">PIN updated.</div>'; })
        .catch(function (e2) { cm.innerHTML = fail(e2); });
    };
    var phf = document.getElementById('ph-file');
    if (phf) phf.onchange = function () {
      var file = phf.files && phf.files[0], pm = document.getElementById('ph-msg');
      if (!file) return;
      if (!/^image\//.test(file.type)) { pm.innerHTML = '<div class="err">Please pick an image.</div>'; return; }
      pm.innerHTML = '<div class="notice" style="margin-top:8px">Uploading...</div>';
      shrinkImage(file, 512).then(function (blob) { return db.uploadAvatar(session.id, blob); })
        .then(function (url) { return db.updateProfile(p.id, { avatar_url: url }).then(function () { return url; }); })
        .then(function (url) {
          p.avatar_url = url; document.getElementById('pf-avatar').value = url;
          document.getElementById('ph-prev').innerHTML = '<img src="' + esc(url) + '" alt="" style="width:100%;height:100%;object-fit:cover">';
          pm.innerHTML = '<div class="notice green" style="margin-top:8px">Photo updated. <a href="#/u/' + esc(p.username) + '">See it on your page</a></div>';
          phf.value = '';
        }).catch(function (e2) { pm.innerHTML = fail(e2); });
    };
    document.getElementById('pf').onsubmit = function (e) {
      e.preventDefault();
      var ext = document.getElementById('pf-ext').value.trim();
      var av = document.getElementById('pf-avatar').value.trim();
      var msg0 = document.getElementById('pf-msg');
      if (ext && !/^https:\/\//i.test(ext)) { msg0.innerHTML = '<div class="err">External link must start with https://</div>'; return; }
      var fields = {
        display_name: document.getElementById('pf-name').value.trim(),
        role: document.getElementById('pf-role').value,
        batting_style: document.getElementById('pf-bat').value,
        bowling_style: document.getElementById('pf-bowl').value,
        external_url: ext || null,
        avatar_url: av || null
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
    return '<div class="card reveal d1"><h2>This weekend\'s <em>match</em> - quick add</h2>' +
      '<form id="qa">' +
      '<div class="frow"><div><label class="fl">Date</label><input class="fi" type="date" id="qa-date" required></div>' +
      '<div><label class="fl">Opponent</label><input class="fi" id="qa-opp" placeholder="Wild Hogs"></div></div>' +
      '<label class="chk"><input type="checkbox" id="qa-bat-on" checked> I batted</label>' +
      '<div id="qa-bat-fields">' +
      '<div class="frow"><div><label class="fl">Runs</label><input class="fi" type="number" min="0" id="qa-runs" value="0"></div>' +
      '<div><label class="fl">Balls faced</label><input class="fi" type="number" min="0" id="qa-balls" value="0"></div></div>' +
      '<div class="frow"><div><label class="fl">Fours</label><input class="fi" type="number" min="0" id="qa-fours" value="0"></div>' +
      '<div><label class="fl">Sixes</label><input class="fi" type="number" min="0" id="qa-sixes" value="0"></div>' +
      '<div><label class="fl">Dismissal</label>' + sel('qa-dismissal', DISMISSALS, '') + '</div></div></div>' +
      '<label class="chk"><input type="checkbox" id="qa-bowl-on" checked> I bowled / fielded</label>' +
      '<div id="qa-bowl-fields">' +
      '<div class="frow"><div><label class="fl">Overs (4 or 4.2)</label><input class="fi" id="qa-overs" pattern="\\d+(\\.[0-5])?" value="0"></div>' +
      '<div><label class="fl">Runs given</label><input class="fi" type="number" min="0" id="qa-rgiven" value="0"></div></div>' +
      '<div class="frow"><div><label class="fl">Wickets</label><input class="fi" type="number" min="0" id="qa-wkts" value="0"></div>' +
      '<div><label class="fl">Wides</label><input class="fi" type="number" min="0" id="qa-wides" value="0"></div>' +
      '<div><label class="fl">No balls</label><input class="fi" type="number" min="0" id="qa-nb" value="0"></div></div>' +
      '<div class="frow"><div><label class="fl">Catches</label><input class="fi" type="number" min="0" id="qa-cat" value="0"></div>' +
      '<div><label class="fl">Run outs</label><input class="fi" type="number" min="0" id="qa-ro" value="0"></div></div></div>' +
      '<button class="btn" type="submit">Add match</button>' +
      '<div id="qa-msg"></div></form></div>' +
      '<div class="card reveal d15"><h2>Log an <em>innings</em> (full form)</h2>' +
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
    // quick-add: one weekend match (bat + bowl + fielding) in a single submit
    (function () {
      var qaDate = document.getElementById('qa-date');
      qaDate.value = new Date().toISOString().slice(0, 10);
      function toggle(cbId, boxId) {
        var cb = document.getElementById(cbId), box = document.getElementById(boxId);
        cb.onchange = function () { box.style.display = cb.checked ? '' : 'none'; };
      }
      toggle('qa-bat-on', 'qa-bat-fields');
      toggle('qa-bowl-on', 'qa-bowl-fields');
      function qnum(id) { return parseInt(document.getElementById(id).value, 10) || 0; }
      document.getElementById('qa').onsubmit = function (e) {
        e.preventDefault();
        var msg = document.getElementById('qa-msg');
        var batOn = document.getElementById('qa-bat-on').checked, bowlOn = document.getElementById('qa-bowl-on').checked;
        if (!batOn && !bowlOn) { msg.innerHTML = fail('Tick at least one of batting / bowling.'); return; }
        var date = qaDate.value, opp = document.getElementById('qa-opp').value.trim();
        var jobs = [];
        if (batOn) jobs.push({ user_id: p.id, kind: 'batting', played_on: date, opponent: opp,
          runs: qnum('qa-runs'), balls: qnum('qa-balls'), fours: qnum('qa-fours'), sixes: qnum('qa-sixes'),
          dots: null, dismissal: document.getElementById('qa-dismissal').value,
          legal_balls: null, runs_given: null, wickets: null, wides: null, no_balls: null, catches: null, run_outs: null });
        var legal;
        if (bowlOn) {
          try { legal = CricStats.oversToBalls(document.getElementById('qa-overs').value.trim() || '0'); }
          catch (e2) { msg.innerHTML = fail(e2); return; }
          jobs.push({ user_id: p.id, kind: 'bowling', played_on: date, opponent: opp,
            legal_balls: legal, runs_given: qnum('qa-rgiven'), wickets: qnum('qa-wkts'), wides: qnum('qa-wides'),
            no_balls: qnum('qa-nb'), catches: qnum('qa-cat'), run_outs: qnum('qa-ro'),
            runs: null, balls: null, fours: null, sixes: null, dots: null, dismissal: '' });
        }
        var added = [];
        jobs.reduce(function (chain, row) {
          return chain.then(function () { return db.addInning(row); }).then(function (saved) { rows.push(saved); added.push(saved); });
        }, Promise.resolve()).then(function () {
          paintList();
          msg.innerHTML = '<div class="ok">Added ' + added.length + ' row' + (added.length > 1 ? 's' : '') + ' - match logged. 🏏</div>';
          document.getElementById('qa').reset();
          qaDate.value = date;
          document.getElementById('qa-bat-on').checked = document.getElementById('qa-bowl-on').checked = true;
          document.getElementById('qa-bat-fields').style.display = document.getElementById('qa-bowl-fields').style.display = '';
          var h2 = document.querySelector('#my-inns');
          if (h2 && h2.scrollIntoView) h2.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }).catch(function (e2) { msg.innerHTML = fail(e2); });
      };
    })();

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
  /* Player comparison: side-by-side career numbers for two profiles. */
  function viewCompare(u1, u2) {
    function form() {
      return '<div class="card reveal"><h2>Compare <em>players</em></h2>' +
        '<form id="cmp"><div class="frow"><div><label class="fl">Player 1</label><input class="fi" id="cmp-a" required placeholder="sandy" value="' + esc(u1 || '') + '"></div>' +
        '<div><label class="fl">Player 2</label><input class="fi" id="cmp-b" required placeholder="sandeep" value="' + esc(u2 || '') + '"></div></div>' +
        '<button class="btn" type="submit">Compare</button><div id="cmp-msg"></div></form></div>';
    }
    if (!u1 || !u2) { show(form()); wireCompareForm(); return; }
    Promise.all([db.getProfileByUsername(u1), db.getProfileByUsername(u2)]).then(function (ps) {
      var pa = ps[0], pb = ps[1];
      if (!pa || !pb) {
        show(form() + '<div class="card"><div class="empty">Could not find <b>' + esc(!pa ? u1 : u2) + '</b>. Check the username - demo mode ships <b>sandy</b> and <b>sandeep</b>.</div></div>');
        wireCompareForm(); return;
      }
      Promise.all([db.listInnings(pa.id), db.listInnings(pb.id)]).then(function (rs) {
        var ca = statsPair(rs[0]), cb2 = statsPair(rs[1]);
        function statRow(label, va, vb, best) {
          var na = parseFloat(va), nb = parseFloat(vb);
          var wa = best === 'high' ? na > nb : na < nb;
          var tie = isNaN(na) || isNaN(nb) || na === nb;
          return '<tr><td>' + label + '</td><td class="' + (!tie && wa ? 'win' : '') + '">' + va + '</td><td class="' + (!tie && !wa ? 'win' : '') + '">' + vb + '</td></tr>';
        }
        function statsPair(rows) {
          var bat = CricStats.careerBatting(rows.filter(function (r) { return r.kind === 'batting'; }));
          var bowl = CricStats.careerBowling(rows.filter(function (r) { return r.kind === 'bowling'; }));
          return { bat: bat, bowl: bowl };
        }
        show(form() +
          '<div class="card reveal d1"><h2><em>' + esc(pa.display_name) + '</em> vs <em>' + esc(pb.display_name) + '</em></h2>' +
          '<div class="tablewrap"><table class="stats cmp">' +
          '<tr><th></th><th>' + esc(pa.display_name) + '<small>@' + esc(pa.username) + '</small></th><th>' + esc(pb.display_name) + '<small>@' + esc(pb.username) + '</small></th></tr>' +
          '<tr><td colspan="3" class="sec">Batting</td></tr>' +
          statRow('Innings', ca.bat.inns, cb2.bat.inns, 'high') +
          statRow('Runs', ca.bat.runs, cb2.bat.runs, 'high') +
          statRow('HS', ca.bat.hs, cb2.bat.hs, 'high') +
          statRow('Average', fmt(ca.bat.avg), fmt(cb2.bat.avg), 'high') +
          statRow('Strike rate', fmt(ca.bat.sr), fmt(cb2.bat.sr), 'high') +
          statRow('50s', ca.bat.fifties, cb2.bat.fifties, 'high') +
          '<tr><td colspan="3" class="sec">Bowling</td></tr>' +
          statRow('Innings', ca.bowl.inns, cb2.bowl.inns, 'high') +
          statRow('Wickets', ca.bowl.wickets, cb2.bowl.wickets, 'high') +
          statRow('Best', ca.bowl.best ? ca.bowl.best.wickets + '/' + ca.bowl.best.runs : '-', cb2.bowl.best ? cb2.bowl.best.wickets + '/' + cb2.bowl.best.runs : '-', 'high') +
          statRow('Average', fmt(ca.bowl.avg), fmt(cb2.bowl.avg), 'low') +
          statRow('Economy', fmt(ca.bowl.econ), fmt(cb2.bowl.econ), 'low') +
          '</table></div></div>');
        wireCompareForm();
      });
    });
    function wireCompareForm() {
      var f = document.getElementById('cmp');
      ['cmp-a', 'cmp-b'].forEach(function (id) { attachSuggest(document.getElementById(id), function (p, inp) { inp.value = p.username; }); });
      if (f) f.onsubmit = function (e) {
        e.preventDefault();
        var a2 = document.getElementById('cmp-a').value.trim().toLowerCase(), b2 = document.getElementById('cmp-b').value.trim().toLowerCase();
        if (a2 && b2) go('#/compare/' + encodeURIComponent(a2) + '/' + encodeURIComponent(b2));
      };
    }
  }

  function route() {
    var h = location.hash || '#/';
    if (h.indexOf('#/u/') === 0) viewProfile(decodeURIComponent(h.slice(4)));
    else if (h.indexOf('#/compare') === 0) {
      var parts = h.slice(9).split('/').filter(Boolean).map(decodeURIComponent);
      viewCompare(parts[0], parts[1]);
    }
    else if (h === '#/players') viewPlayers();
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


