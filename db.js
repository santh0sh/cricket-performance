/* db.js - data layer. Uses Supabase when config.js is filled in, otherwise an
   in-browser demo backend (localStorage) so the app is fully usable offline.
   App code only talks to the CricDB API below - never to Supabase directly. */
(function () {
  'use strict';
  var cfg = window.CRICONFIG || {};
  var LIVE = /^https:\/\/.+\.supabase\.co/.test(cfg.SUPABASE_URL || '') &&
             typeof cfg.SUPABASE_ANON_KEY === 'string' && cfg.SUPABASE_ANON_KEY.length > 20 &&
             cfg.SUPABASE_ANON_KEY.indexOf('PASTE_') !== 0;

  /* Mobile + PIN login. Supabase has no free SMS, so the mobile number is the account id:
     it maps to an internal address on the reserved .invalid domain (never emailed) and the
     PIN is the password. Ownership rules in schema.sql still apply per account. */
  function phoneDigits(p) {
    var s = String(p || '').replace(/[^0-9]/g, '');
    if (s.length === 11 && s[0] === '0') s = s.slice(1);
    if (s.length === 10) s = '91' + s;
    return s;
  }
  function phoneOk(p) { var s = phoneDigits(p); return s.length >= 11 && s.length <= 15; }
  function phoneEmail(p) { return phoneDigits(p) + '@phone.invalid'; }
  function pinPass(pin) { return 'sk98pin:' + String(pin); }
  function labelOf(email) {
    var m = /^([0-9]+)@phone\.invalid$/.exec(email || '');
    if (!m) return email || '';
    var s = m[1];
    return s.indexOf('91') === 0 && s.length === 12 ? '+91 ' + s.slice(2, 7) + ' ' + s.slice(7) : '+' + s;
  }
  function asUser(u) { return u ? { id: u.id, email: u.email, label: labelOf(u.email) } : null; }
  function authErr(e, isNew) {
    var t = String(e && (e.message || e.code) || e);
    if (/invalid login|invalid_credentials/i.test(t)) return new Error('Wrong mobile number or PIN. First time here? Tap "First time? Create my PIN".');
    if (/already registered|already exists|user_already_exists/i.test(t)) return new Error('This number already has a PIN - use Sign in. Forgot it? Ask Sandy to reset it.');
    return e instanceof Error ? e : new Error(t);
  }

  /* ---------- Supabase backend ---------- */
  function supaBackend() {
    var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return {
      mode: 'supabase',
      getSessionUser: function () {
        return sb.auth.getSession().then(function (r) {
          return r.data.session ? asUser(r.data.session.user) : null;
        });
      },
      signInWithEmail: function (email) {
        var redirect = (location.origin && location.origin.indexOf('http') === 0) ? location.origin + location.pathname : undefined;
        return sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirect } })
          .then(function (r) { if (r.error) throw r.error; return { emailed: true }; });
      },
      signOut: function () { return sb.auth.signOut(); },
      onAuthChange: function (cb) { sb.auth.onAuthStateChange(function (e, s) { cb(s ? asUser(s.user) : null); }); },
      phoneOk: phoneOk,
      signInWithPin: function (phone, pin) {
        return sb.auth.signInWithPassword({ email: phoneEmail(phone), password: pinPass(pin) })
          .then(function (r) { if (r.error) throw authErr(r.error); return asUser(r.data.user); });
      },
      signUpWithPin: function (phone, pin) {
        return sb.auth.signUp({ email: phoneEmail(phone), password: pinPass(pin) })
          .then(function (r) {
            if (r.error) throw authErr(r.error, true);
            // an existing number comes back with no identities and no session
            if (!r.data.session || (r.data.user && r.data.user.identities && r.data.user.identities.length === 0))
              throw authErr(new Error('already registered'), true);
            return asUser(r.data.user);
          });
      },
      changePin: function (pin) {
        return sb.auth.updateUser({ password: pinPass(pin) }).then(function (r) { if (r.error) throw r.error; });
      },
      getProfileByUsername: function (username) {
        return sb.from('profiles').select('*').eq('username', username).maybeSingle()
          .then(function (r) { if (r.error) throw r.error; return r.data; });
      },
      searchProfiles: function (q) {
        var safe = String(q).replace(/[%_(),"'.\\]/g, ' ').trim();
        if (safe.length < 2) return Promise.resolve([]);
        return sb.from('profiles').select('username,display_name,role,batting_style')
          .or('username.ilike.%' + safe + '%,display_name.ilike.%' + safe + '%')
          .limit(10)
          .then(function (r) { if (r.error) throw r.error; return r.data; });
      },
      getMyProfile: function (userId) {
        return sb.from('profiles').select('*').eq('id', userId).maybeSingle()
          .then(function (r) { if (r.error) throw r.error; return r.data; });
      },
      createProfile: function (p) {
        return sb.from('profiles').insert(p).select().single()
          .then(function (r) { if (r.error) throw r.error; return r.data; });
      },
      updateProfile: function (userId, fields) {
        return sb.from('profiles').update(fields).eq('id', userId).select().single()
          .then(function (r) { if (r.error) throw r.error; return r.data; });
      },
      listInnings: function (userId) {
        return sb.from('innings').select('*').eq('user_id', userId).order('played_on', { ascending: false })
          .then(function (r) { if (r.error) throw r.error; return r.data; });
      },
      addInning: function (row) {
        return sb.from('innings').insert(row).select().single()
          .then(function (r) { if (r.error) throw r.error; return r.data; });
      },
      updateInning: function (id, row) {
        return sb.from('innings').update(row).eq('id', id).select().single()
          .then(function (r) { if (r.error) throw r.error; return r.data; });
      },
      deleteInning: function (id) {
        return sb.from('innings').delete().eq('id', id)
          .then(function (r) { if (r.error) throw r.error; });
      }
    };
  }

  /* ---------- Offline demo backend (localStorage) ---------- */
  function mockBackend() {
    var KEY = 'cric-demo-v2', SES = 'cric-demo-session';
    // localStorage can be blocked (opaque origins, strict private modes) - fall back to memory
    var mem = {};
    var store = {
      get: function (k) { try { var v = localStorage.getItem(k); return v == null ? (mem[k] || null) : v; } catch (e) { return mem[k] || null; } },
      set: function (k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) {} },
      del: function (k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} }
    };
    function load() {
      var s = store.get(KEY);
      if (s) return JSON.parse(s);
      var fresh = { profiles: [], innings: [], nextId: 1 };
      if (window.CRIC_MOCK_SEED) fresh = window.CRIC_MOCK_SEED;
      store.set(KEY, JSON.stringify(fresh));
      return fresh;
    }
    function save(d) { store.set(KEY, JSON.stringify(d)); }
    function session() { var s = store.get(SES); return s ? JSON.parse(s) : null; }
    return Promise.resolve({
      mode: 'demo',
      getSessionUser: function () { return Promise.resolve(session()); },
      signInWithEmail: function (email) {
        var u = { id: 'demo-user-1', email: email };
        store.set(SES, JSON.stringify(u));
        return Promise.resolve({ emailed: false, demo: true });
      },
      signOut: function () { store.del(SES); return Promise.resolve(); },
      onAuthChange: function () {},
      phoneOk: phoneOk,
      signInWithPin: function (phone) {
        var u = { id: 'demo-user-1', email: phoneEmail(phone), label: labelOf(phoneEmail(phone)) };
        store.set(SES, JSON.stringify(u)); return Promise.resolve(u);
      },
      signUpWithPin: function (phone, pin) { return this.signInWithPin(phone, pin); },
      changePin: function () { return Promise.resolve(); },
      getProfileByUsername: function (username) {
        var p = load().profiles.filter(function (p) { return p.username === username; })[0];
        return Promise.resolve(p || null);
      },
      searchProfiles: function (q) {
        var n = String(q).trim().toLowerCase();
        if (n.length < 2) return Promise.resolve([]);
        return Promise.resolve(load().profiles.filter(function (p) {
          return p.username.toLowerCase().indexOf(n) >= 0 || p.display_name.toLowerCase().indexOf(n) >= 0;
        }).slice(0, 10));
      },
      getMyProfile: function (userId) {
        var p = load().profiles.filter(function (p) { return p.id === userId; })[0];
        return Promise.resolve(p || null);
      },
      createProfile: function (p) {
        var d = load();
        if (d.profiles.some(function (x) { return x.username === p.username; }))
          return Promise.reject(new Error('That username is taken'));
        d.profiles.push(p); save(d); return Promise.resolve(p);
      },
      updateProfile: function (userId, fields) {
        var d = load(), p = d.profiles.filter(function (x) { return x.id === userId; })[0];
        if (!p) return Promise.reject(new Error('Profile not found'));
        Object.assign(p, fields); save(d); return Promise.resolve(p);
      },
      listInnings: function (userId) {
        return Promise.resolve(load().innings.filter(function (i) { return i.user_id === userId; })
          .sort(function (a, b) { return a.played_on < b.played_on ? 1 : -1; }));
      },
      addInning: function (row) {
        var d = load(); row.id = d.nextId++; d.innings.push(row); save(d);
        return Promise.resolve(row);
      },
      updateInning: function (id, row) {
        var d = load(), i = d.innings.filter(function (x) { return x.id === id; })[0];
        if (!i) return Promise.reject(new Error('Innings not found'));
        Object.assign(i, row); save(d); return Promise.resolve(i);
      },
      deleteInning: function (id) {
        var d = load();
        d.innings = d.innings.filter(function (x) { return x.id !== id; });
        save(d); return Promise.resolve();
      }
    });
  }

  window.CricDB = LIVE ? Promise.resolve(supaBackend()) : mockBackend();
})();

