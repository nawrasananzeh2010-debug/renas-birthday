/* ===========================================================
   نظام توجيهي نورس — النواة المشتركة (بيانات + مزامنة + مؤثرات)
   =========================================================== */
(function () {
  "use strict";
  const CFG = window.TJ_CONFIG;
  const LS_STATE = "tj_state_" + CFG.channelId;
  const LS_MSGS = "tj_msgs_" + CFG.channelId;

  /* ---------------- المواد ---------------- */
  const SUBJECTS = [
    { id: "is", name: "التربية الإسلامية", short: "الدين", icon: "🕌", color: "#059669", s1: 26, s1Units: 4 },
    { id: "ma", name: "الرياضيات", short: "الرياضيات", icon: "📐", color: "#3b82f6", s1: 13, s1Units: 3 },
    { id: "ar", name: "اللغة العربية", short: "العربي", icon: "📜", color: "#d97706", s1: 25, s1Units: 5 },
    { id: "hi", name: "تاريخ الأردن", short: "التاريخ", icon: "🏛️", color: "#db2777", s1: 13, s1Units: 3 },
  ];
  const SUBJ = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));
  const LEVELS = [0, 25, 50, 75, 100];

  function split(n, k) {
    if (!n || !k) return [];
    const base = Math.floor(n / k), extra = n % k;
    return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
  }

  function defaultState() {
    const cur = {}, p = {};
    SUBJECTS.forEach((s) => {
      cur[s.id] = { s1: split(s.s1, s.s1Units), s2: [] };
      p[s.id] = { s1: "0".repeat(s.s1), s2: "" };
    });
    return { v: 1, ts: 0, cur, p, days: {}, log: [], goal: 10 };
  }

  const sum = (a) => (a || []).reduce((x, y) => x + (+y || 0), 0);

  function normalize(st) {
    const d = defaultState();
    if (!st || typeof st !== "object") return d;
    st.v = 1;
    st.ts = +st.ts || 0;
    st.cur = st.cur || d.cur;
    st.p = st.p || d.p;
    SUBJECTS.forEach((s) => {
      st.cur[s.id] = st.cur[s.id] || d.cur[s.id];
      st.p[s.id] = st.p[s.id] || d.p[s.id];
      ["s1", "s2"].forEach((sem) => {
        const units = (st.cur[s.id][sem] || []).map((x) => Math.max(0, parseInt(x) || 0)).filter((x) => x > 0);
        st.cur[s.id][sem] = units;
        const n = sum(units);
        let str = String(st.p[s.id][sem] || "").replace(/[^0-4]/g, "");
        str = (str + "0".repeat(n)).slice(0, n);
        st.p[s.id][sem] = str;
      });
    });
    st.days = st.days && typeof st.days === "object" ? st.days : {};
    st.log = Array.isArray(st.log) ? st.log : [];
    st.goal = +st.goal || 10;
    return st;
  }

  /* ---------------- التواريخ ---------------- */
  const dayKey = (d = new Date()) => {
    const x = new Date(d);
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  };
  const EXAM = new Date(CFG.examDate);
  const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const AR_MONTHS = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
  const fmtDate = (d) => { d = new Date(d); return `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const fmtShort = (d) => { d = new Date(d); return `${d.getDate()} ${AR_MONTHS[d.getMonth()]}`; };
  const fmtTime = (d) => { d = new Date(d); let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, "0"); const ap = h >= 12 ? "م" : "ص"; h = h % 12 || 12; return `${h}:${m} ${ap}`; };
  function relTime(ts) {
    if (!ts) return "—";
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return "الآن";
    const m = Math.round(s / 60); if (m < 60) return m === 1 ? "منذ دقيقة" : m === 2 ? "منذ دقيقتين" : `منذ ${m} ${m <= 10 ? "دقائق" : "دقيقة"}`;
    const h = Math.round(m / 60); if (h < 24) return h === 1 ? "منذ ساعة" : h === 2 ? "منذ ساعتين" : `منذ ${h} ${h <= 10 ? "ساعات" : "ساعة"}`;
    const dd = Math.round(h / 24); return dd === 1 ? "أمس" : dd === 2 ? "منذ يومين" : `منذ ${dd} ${dd <= 10 ? "أيام" : "يوماً"}`;
  }

  /* ---------------- الإحصائيات ---------------- */
  function semInfo(st, sid, sem) {
    const n = sum(st.cur[sid][sem]);
    const str = st.p[sid][sem] || "";
    let q = 0, done = 0;
    for (const c of str) { q += +c; if (c === "4") done++; }
    return { n, q, done, pct: n ? (q / (4 * n)) * 100 : 0, released: n > 0 };
  }
  function groupInfo(st, sems) {
    let n = 0, q = 0, done = 0;
    SUBJECTS.forEach((s) => sems.forEach((sem) => { const i = semInfo(st, s.id, sem); n += i.n; q += i.q; done += i.done; }));
    return { n, q, done, pct: n ? (q / (4 * n)) * 100 : 0, released: n > 0 };
  }
  function subjectTotal(st, sid) {
    const a = semInfo(st, sid, "s1"), b = semInfo(st, sid, "s2");
    const n = a.n + b.n, q = a.q + b.q;
    return { n, q, done: a.done + b.done, pct: n ? (q / (4 * n)) * 100 : 0 };
  }
  function streak(st) {
    let c = 0; const d = new Date();
    const has = (k) => st.days[k] && (st.days[k].pg > 0 || st.days[k].dq > 0 || st.days[k].mn > 0);
    if (!has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (has(dayKey(d))) { c++; d.setDate(d.getDate() - 1); }
    return c;
  }
  function bestStreak(st) {
    const keys = Object.keys(st.days).filter((k) => st.days[k].pg > 0 || st.days[k].dq > 0 || st.days[k].mn > 0).sort();
    let best = 0, cur = 0, prev = null;
    keys.forEach((k) => {
      const t = new Date(k + "T12:00:00").getTime();
      cur = prev && Math.round((t - prev) / 864e5) === 1 ? cur + 1 : 1;
      best = Math.max(best, cur); prev = t;
    });
    return best;
  }
  function lastDays(st, n) {
    const out = []; const d = new Date(); d.setDate(d.getDate() - (n - 1));
    for (let i = 0; i < n; i++) {
      const k = dayKey(d); const v = st.days[k] || {};
      out.push({ key: k, date: new Date(d), pg: v.pg || 0, mn: v.mn || 0, dq: v.dq || 0 });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }
  function stats(st) {
    const s1 = groupInfo(st, ["s1"]), s2 = groupInfo(st, ["s2"]), all = groupInfo(st, ["s1", "s2"]);
    const now = Date.now();
    const msLeft = Math.max(0, EXAM - now);
    const daysLeft = Math.ceil(msLeft / 864e5);
    const today = st.days[dayKey()] || { pg: 0, mn: 0, dq: 0 };
    const l14 = lastDays(st, 14);
    const lessons14 = sum(l14.map((d) => d.dq)) / 4;
    const activeDays14 = l14.filter((d) => d.pg || d.dq || d.mn).length;
    const avgPerDay = lessons14 / 14;
    const remaining = (all.n * 4 - all.q) / 4;
    const studyDays = Math.max(1, daysLeft - 30); // آخر شهر للمراجعة
    const required = remaining / studyDays;
    const projDays = avgPerDay > 0 ? Math.ceil(remaining / avgPerDay) : null;
    const totalPages = sum(Object.values(st.days).map((d) => d.pg));
    const totalMin = sum(Object.values(st.days).map((d) => d.mn));
    let bestDay = null;
    Object.entries(st.days).forEach(([k, v]) => { if (!bestDay || (v.pg || 0) > bestDay.pg) bestDay = { key: k, pg: v.pg || 0 }; });
    const perSubjPages = {};
    SUBJECTS.forEach((s) => (perSubjPages[s.id] = 0));
    st.log.forEach((e) => { if (perSubjPages[e.s] != null) perSubjPages[e.s] += +e.pg || 0; });
    return {
      s1, s2, all, daysLeft, msLeft, today, l14, lessons14, activeDays14, avgPerDay, remaining, required, projDays,
      projDate: projDays != null ? new Date(now + projDays * 864e5) : null,
      onTrack: avgPerDay >= required, streak: streak(st), bestStreak: bestStreak(st), totalPages, totalMin, bestDay, perSubjPages,
    };
  }

  function badges(st) {
    const S = stats(st);
    const anyFull = SUBJECTS.some((s) => { const i = semInfo(st, s.id, "s1"); return i.n && i.done === i.n; });
    const list = [
      ["🚀", "أول خطوة", "سجّل أول إنجاز", st.log.length >= 1],
      ["✅", "أول درس", "أنهى أول درس كامل", S.all.done >= 1],
      ["🔟", "عشرة دروس", "أنهى 10 دروس", S.all.done >= 10],
      ["🎯", "ربع الطريق", "25% من الفصل الأول", S.s1.pct >= 25],
      ["⚡", "نص الطريق", "50% من الفصل الأول", S.s1.pct >= 50],
      ["🔥", "ثلاث أرباع", "75% من الفصل الأول", S.s1.pct >= 75],
      ["👑", "الفصل الأول كامل", "100% من الفصل الأول", S.s1.pct >= 100],
      ["📗", "مادة كاملة", "أنهى مادة كاملة", anyFull],
      ["🔗", "3 أيام ورا بعض", "سلسلة 3 أيام", S.bestStreak >= 3],
      ["💎", "أسبوع التزام", "سلسلة 7 أيام", S.bestStreak >= 7],
      ["🏆", "شهر أسطوري", "سلسلة 30 يوم", S.bestStreak >= 30],
      ["📚", "100 صفحة", "مجموع 100 صفحة", S.totalPages >= 100],
      ["🌋", "500 صفحة", "مجموع 500 صفحة", S.totalPages >= 500],
      ["🦸", "يوم بطولي", "30 صفحة أو أكثر بيوم واحد", S.bestDay && S.bestDay.pg >= 30],
    ];
    return list.map(([icon, title, desc, ok]) => ({ icon, title, desc, ok: !!ok }));
  }

  /* ---------------- الأدعية ---------------- */
  const DUAS = [
    "اللهم وفّق نورس ويسّر له أمره، واجعل التوجيهي باب خيرٍ له 🤲",
    "اللهم لا سهل إلا ما جعلته سهلاً، وأنت تجعل الحزن إذا شئت سهلاً",
    "ربِّ اشرح لي صدري، ويسّر لي أمري، واحلل عقدة من لساني، يفقهوا قولي",
    "اللهم إني أسألك فهم النبيين، وحفظ المرسلين، وإلهام الملائكة المقربين",
    "اللهم افتح على نورس فتوح العارفين، وارزقه علماً نافعاً وعملاً متقبلاً",
    "اللهم اجعل نورس من الأوائل، وأقرّ عين أهله بنجاحه وتفوّقه 🌟",
    "اللهم ذكّره ما نسي، وعلّمه ما جهل، واحفظ له ما تعلّم",
    "ربِّ زدني علماً، وألحقني بالصالحين",
    "اللهم ارزقه التركيز والبركة في الوقت، وأبعد عنه الكسل والتشتت",
    "اللهم إني استودعتك ما قرأت وما حفظت، فردّه إليّ عند حاجتي إليه",
    "اللهم اجعل تعبه في ميزان حسناته، وفرحة نجاحه قريبة يا رب 💚",
  ];
  const QUOTES = [
    "كل صفحة اليوم هي علامة بكرة 💪",
    "الاستمرارية أقوى من الحماس",
    "مش لازم تكون مثالي، لازم تكون مستمر",
    "تعب ساعة ولا ندم سنة",
    "حلمك يستاهل التعب يا بطل",
    "خطوة صغيرة كل يوم = إنجاز عظيم بالنهاية",
  ];

  /* ---------------- المزامنة / قاعدة البيانات ---------------- */
  const T_NOTIFY = CFG.channelId;            // إشعارات الأب (نص مقروء)
  const T_STATE = CFG.channelId + "-state";  // نسخة البيانات (احتياطي بدون Firebase)
  const T_DAD = CFG.channelId + "-nawras";   // رسائل الأب لنورس

  const loadLocal = () => { try { return normalize(JSON.parse(localStorage.getItem(LS_STATE))); } catch { return defaultState(); } };
  const saveLocal = (st) => { try { localStorage.setItem(LS_STATE, JSON.stringify(st)); } catch {} };
  const loadMsgs = () => { try { return JSON.parse(localStorage.getItem(LS_MSGS)) || []; } catch { return []; } };
  const saveMsgs = (m) => { try { localStorage.setItem(LS_MSGS, JSON.stringify(m.slice(-100))); } catch {} };

  async function ntfyPublish(topic, message, extra = {}) {
    const res = await fetch(CFG.ntfyServer.replace(/\/$/, "") + "/", {
      method: "POST",
      body: JSON.stringify(Object.assign({ topic, message }, extra)),
    });
    if (!res.ok) throw new Error("ntfy " + res.status);
    return res.json().catch(() => ({}));
  }
  async function ntfyPoll(topic) {
    const res = await fetch(`${CFG.ntfyServer}/${topic}/json?poll=1&since=all`, { cache: "no-store" });
    if (!res.ok) throw new Error("ntfy " + res.status);
    const txt = await res.text();
    return txt.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((m) => m && m.event === "message");
  }
  function ntfySubscribe(topic, cb, onStatus) {
    let es, retry = 0;
    const open = () => {
      try { es = new EventSource(`${CFG.ntfyServer}/${topic}/sse`); } catch { return; }
      es.onopen = () => { retry = 0; onStatus && onStatus(true); };
      es.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d.event === "message") cb(d); } catch {} };
      es.onerror = () => { onStatus && onStatus(false); es.close(); setTimeout(open, Math.min(30000, 2000 * ++retry)); };
    };
    open();
  }

  function compactForNtfy(st) {
    const c = JSON.parse(JSON.stringify(st));
    c.log = c.log.slice(-25).map((e) => Object.assign({}, e, { note: (e.note || "").slice(0, 80) }));
    const keys = Object.keys(c.days).sort();
    keys.slice(0, Math.max(0, keys.length - 60)).forEach((k) => delete c.days[k]);
    const enc = new TextEncoder();
    let s = JSON.stringify(c);
    while (enc.encode(s).length > 3900 && (c.log.length > 3 || Object.keys(c.days).length > 14)) {
      if (c.log.length > 3) c.log.splice(0, 2);
      else { const k = Object.keys(c.days).sort()[0]; delete c.days[k]; }
      s = JSON.stringify(c);
    }
    return s;
  }

  function loadScript(src) {
    return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  }

  const Store = {
    mode: "local",
    online: false,
    fb: null,
    _onState: null,
    _onMsg: null,
    _onStatus: null,
    _pushTimer: null,

    async init({ onState, onMsg, onStatus, role }) {
      this.role = role || "dad";
      this._onState = onState; this._onMsg = onMsg; this._onStatus = onStatus || (() => {});
      const local = loadLocal();
      onState(local, "local");
      loadMsgs().forEach((m) => onMsg && onMsg(m, true));

      if (CFG.firebase && CFG.firebase.databaseURL) {
        try {
          const v = "10.12.2";
          await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js`);
          await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-database-compat.js`);
          const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(CFG.firebase);
          this.fb = app.database();
          this.mode = "firebase";
          const base = `tawjihi/${CFG.channelId}`;
          this.fb.ref(".info/connected").on("value", (s) => { this.online = !!s.val(); this._onStatus(this.online, this.mode); });
          this.fb.ref(base + "/state").on("value", (snap) => {
            const remote = snap.val(), local = loadLocal();
            if (remote && (+remote.ts || 0) >= (local.ts || 0)) {
              const st = normalize(remote); saveLocal(st); this._onState(st, "remote");
            } else if (this.role === "student" && local.ts > 0) {
              this._push(local); // نسخة الجهاز أحدث — ارفعها
            }
          });
          this.fb.ref(base + "/msgs").limitToLast(60).on("child_added", (snap) => {
            const m = snap.val(); if (!m) return;
            m.id = snap.key; this._addMsg(m);
          });
          return;
        } catch (e) {
          console.warn("Firebase failed, falling back to ntfy", e);
        }
      }

      // وضع بدون Firebase: مزامنة عبر ntfy.sh
      this.mode = "ntfy";
      try {
        const msgs = await ntfyPoll(T_STATE);
        const last = msgs[msgs.length - 1];
        if (last) {
          const remote = normalize(JSON.parse(last.message));
          if (remote.ts > loadLocal().ts) { saveLocal(remote); this._onState(remote, "remote"); }
          else if (this.role === "student" && loadLocal().ts > remote.ts) this._push(loadLocal());
        } else if (this.role === "student" && loadLocal().ts > 0) this._push(loadLocal());
        this.online = true; this._onStatus(true, this.mode);
      } catch (e) { this._onStatus(false, this.mode); }
      ntfySubscribe(T_STATE, (d) => {
        try {
          const remote = normalize(JSON.parse(d.message));
          if (remote.ts > loadLocal().ts) { saveLocal(remote); this._onState(remote, "remote"); }
        } catch {}
      }, (ok) => { this.online = ok; this._onStatus(ok, this.mode); });
      try { (await ntfyPoll(T_DAD)).forEach((d) => this._addMsg({ id: d.id, t: d.time * 1000, text: d.message })); } catch {}
      ntfySubscribe(T_DAD, (d) => this._addMsg({ id: d.id, t: d.time * 1000, text: d.message }));
    },

    _addMsg(m) {
      const all = loadMsgs();
      if (all.some((x) => x.id === m.id)) return;
      all.push(m); all.sort((a, b) => a.t - b.t); saveMsgs(all);
      this._onMsg && this._onMsg(m, false);
    },

    /** حفظ الحالة محلياً وفي قاعدة البيانات */
    save(st) {
      st.ts = Date.now();
      saveLocal(st);
      clearTimeout(this._pushTimer);
      this._pushTimer = setTimeout(() => this._push(st), 600);
    },
    async _push(st) {
      try {
        if (this.mode === "firebase") await this.fb.ref(`tawjihi/${CFG.channelId}/state`).set(JSON.parse(JSON.stringify(st)));
        else await ntfyPublish(T_STATE, compactForNtfy(st), { priority: 1, title: "sync" });
        this._onStatus(true, this.mode);
      } catch (e) { console.warn(e); this._onStatus(false, this.mode); }
    },
    async flush(st) { clearTimeout(this._pushTimer); await this._push(st); },

    /** إشعار فوري للأب (كروم/الموبايل) */
    async notifyDad(title, message, tags = ["books"]) {
      const click = new URL("dad.html", location.href).href;
      try { await ntfyPublish(T_NOTIFY, message, { title, tags, priority: 4, click: click.startsWith("http") ? click : undefined }); return true; }
      catch (e) { console.warn(e); return false; }
    },

    /** رسالة من الأب لنورس */
    async sendToNawras(text) {
      const m = { t: Date.now(), text, from: "dad" };
      let ok = false;
      if (this.mode === "firebase") { try { await this.fb.ref(`tawjihi/${CFG.channelId}/msgs`).push(m); ok = true; } catch {} }
      try {
        const click = new URL("index.html", location.href).href;
        const r = await ntfyPublish(T_DAD, text, { title: "رسالة من أبوك ❤️", tags: ["heart"], priority: 4, click: click.startsWith("http") ? click : undefined });
        if (this.mode !== "firebase" && r && r.id) this._addMsg({ id: r.id, t: (r.time || Date.now() / 1000) * 1000, text });
        ok = true;
      } catch {}
      return ok;
    },

    notifyTopicUrl: () => `${CFG.ntfyServer}/${T_NOTIFY}`,
    nawrasTopicUrl: () => `${CFG.ntfyServer}/${T_DAD}`,
  };

  /* ---------------- مؤثرات وواجهة ---------------- */
  function ring(pct, { size = 120, stroke = 10, color = "#8b5cf6", color2, track = "rgba(255,255,255,.08)", id } = {}) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const gid = "g" + (id || Math.random().toString(36).slice(2));
    const c2 = color2 || color;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
      <circle class="ring-bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-c="${c}" data-pct="${Math.min(100, pct)}"
        transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
  }
  function animateRings(root = document) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.querySelectorAll(".ring-bar").forEach((el) => {
        const c = +el.dataset.c, p = +el.dataset.pct;
        el.style.strokeDashoffset = c - (c * p) / 100;
      });
    }));
  }
  function countUp(el, to, { dur = 1200, dec = 0, suffix = "" } = {}) {
    if (!el) return;
    const from = parseFloat(el.dataset.v || "0") || 0;
    el.dataset.v = to;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = (from + (to - from) * e).toFixed(dec) + suffix;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function toast(msg, type = "ok") {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + type; t.innerHTML = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add("out"), 3600);
    setTimeout(() => t.remove(), 4200);
  }

  function confetti(n = 160) {
    const cv = document.createElement("canvas");
    cv.className = "confetti";
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    const W = (cv.width = innerWidth * devicePixelRatio), H = (cv.height = innerHeight * devicePixelRatio);
    const cols = ["#a78bfa", "#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#ffffff"];
    const ps = Array.from({ length: n }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.65,
      vx: (Math.random() - 0.5) * 26 * devicePixelRatio, vy: -(12 + Math.random() * 22) * devicePixelRatio,
      s: (5 + Math.random() * 7) * devicePixelRatio, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: cols[(Math.random() * cols.length) | 0], shape: Math.random() < 0.5,
    }));
    let f = 0;
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      ps.forEach((p) => {
        p.vy += 0.55 * devicePixelRatio; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - f / 170);
        if (p.shape) ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); else { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.4, 0, 7); ctx.fill(); }
        ctx.restore();
      });
      if (++f < 180) requestAnimationFrame(tick); else cv.remove();
    };
    tick();
  }

  function starfield() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = document.createElement("canvas");
    cv.id = "stars";
    document.body.prepend(cv);
    const ctx = cv.getContext("2d");
    let W, H, pts;
    const resize = () => {
      W = cv.width = innerWidth * devicePixelRatio; H = cv.height = innerHeight * devicePixelRatio;
      pts = Array.from({ length: Math.min(90, (innerWidth * innerHeight) / 14000) | 0 }, () => ({
        x: Math.random() * W, y: Math.random() * H, r: (Math.random() * 1.6 + 0.3) * devicePixelRatio,
        vx: (Math.random() - 0.5) * 0.15 * devicePixelRatio, vy: (-Math.random() * 0.25 - 0.05) * devicePixelRatio, a: Math.random() * Math.PI * 2,
      }));
    };
    resize(); addEventListener("resize", resize);
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      pts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.a += 0.02;
        if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
        if (p.x < -5) p.x = W + 5; if (p.x > W + 5) p.x = -5;
        ctx.globalAlpha = 0.35 + Math.sin(p.a) * 0.3;
        ctx.fillStyle = "#e9d5ff"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      });
      requestAnimationFrame(tick);
    };
    tick();
  }

  let audioCtx;
  function chime(kind = "ok") {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = kind === "ok" ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 880];
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = f;
        const t = audioCtx.currentTime + i * 0.11;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.55);
      });
    } catch {}
  }

  function countdown(root) {
    const set = (sel, v) => { const el = root.querySelector(sel); if (el && el.textContent !== v) { el.textContent = v; el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); } };
    const upd = () => {
      let ms = Math.max(0, EXAM - Date.now());
      const d = Math.floor(ms / 864e5); ms -= d * 864e5;
      const h = Math.floor(ms / 36e5); ms -= h * 36e5;
      const m = Math.floor(ms / 6e4); ms -= m * 6e4;
      const s = Math.floor(ms / 1e3);
      set("[data-cd=d]", String(d)); set("[data-cd=h]", String(h).padStart(2, "0"));
      set("[data-cd=m]", String(m).padStart(2, "0")); set("[data-cd=s]", String(s).padStart(2, "0"));
    };
    upd(); setInterval(upd, 1000);
  }

  function rotator(el, list, ms = 8000) {
    if (!el) return;
    let i = Math.floor(Math.random() * list.length);
    const show = () => { el.classList.add("fade-out"); setTimeout(() => { el.textContent = list[i]; el.classList.remove("fade-out"); i = (i + 1) % list.length; }, 450); };
    el.textContent = list[i]; i = (i + 1) % list.length;
    setInterval(show, ms);
  }

  /** مخطط أعمدة بسيط مع تلميح عند المرور */
  function barChart(el, data, { color = "#8b5cf6", height = 180, label = (d) => "", tip = (d) => "" } = {}) {
    if (!el) return;
    const max = Math.max(1, ...data.map((d) => d.v));
    const nice = Math.ceil(max / 5) * 5 || 5;
    el.innerHTML = `<div class="bc" style="height:${height}px">
      <div class="bc-grid">${[1, 0.5, 0].map((g) => `<div class="bc-gl"><span>${Math.round(nice * g)}</span></div>`).join("")}</div>
      <div class="bc-bars">${data.map((d, i) => `<div class="bc-col" data-i="${i}">
          <div class="bc-bar ${d.today ? "today" : ""}" style="--h:${(d.v / nice) * 100}%;--c:${color};--d:${i * 40}ms"></div>
          <div class="bc-x">${label(d)}</div></div>`).join("")}</div>
      <div class="bc-tip"></div></div>`;
    const tipEl = el.querySelector(".bc-tip");
    el.querySelectorAll(".bc-col").forEach((col) => {
      const show = () => { const d = data[+col.dataset.i]; tipEl.innerHTML = tip(d); tipEl.style.opacity = 1;
        const r = col.getBoundingClientRect(), pr = el.getBoundingClientRect();
        tipEl.style.left = Math.min(pr.width - 10, Math.max(10, r.left - pr.left + r.width / 2)) + "px"; };
      col.addEventListener("mouseenter", show); col.addEventListener("click", show);
      col.addEventListener("mouseleave", () => (tipEl.style.opacity = 0));
    });
    requestAnimationFrame(() => requestAnimationFrame(() => el.querySelector(".bc").classList.add("in")));
  }

  function reveal() {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.08 });
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function lessonLabel(st, sid, sem, idx) {
    const units = st.cur[sid][sem]; let acc = 0;
    for (let u = 0; u < units.length; u++) { if (idx < acc + units[u]) return { unit: u + 1, inUnit: idx - acc + 1, global: idx + 1 }; acc += units[u]; }
    return { unit: 1, inUnit: idx + 1, global: idx + 1 };
  }

  window.TJ = {
    CFG, SUBJECTS, SUBJ, LEVELS, split, defaultState, normalize, dayKey, EXAM, fmtDate, fmtShort, fmtTime, relTime,
    semInfo, groupInfo, subjectTotal, stats, badges, lastDays, DUAS, QUOTES, Store, ring, animateRings, countUp, toast,
    confetti, starfield, chime, countdown, rotator, barChart, reveal, esc, sum, lessonLabel, loadLocal,
  };
})();
