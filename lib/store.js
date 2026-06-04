/* ============================================================
   COPA DRAFT — lib/store.js
   Persistence (Phase 4). Two stores in localStorage:
   • RUN     — a snapshot of the in-progress campaign (resume on reload)
   • PROFILE — durable across runs: lifetime achievements, settings,
               plays/titles counters.
   All access is wrapped so a blocked localStorage never crashes the game.
   ============================================================ */
(function () {
  const RUN_KEY = 'copa_draft_run_v2';
  const PROFILE_KEY = 'copa_draft_profile_v1';

  function safeGet(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  // ---- RUN snapshot ----
  function saveRun(snapshot) { safeSet(RUN_KEY, snapshot); }
  function loadRun() { return safeGet(RUN_KEY); }
  function clearRun() { safeRemove(RUN_KEY); }
  function hasRun() {
    const r = loadRun();
    return !!(r && r.phase && r.phase !== 'home' && r.phase !== 'end');
  }

  // ---- PROFILE ----
  const DEFAULT_PROFILE = { achievements: [], sound: true, plays: 0, titles: 0 };
  function loadProfile() {
    return Object.assign({}, DEFAULT_PROFILE, safeGet(PROFILE_KEY) || {});
  }
  function saveProfile(p) { safeSet(PROFILE_KEY, p); }
  function mergeAchievements(ids) {
    const p = loadProfile();
    const set = new Set(p.achievements);
    ids.forEach(id => set.add(id));
    p.achievements = [...set];
    saveProfile(p);
    return p.achievements;
  }
  function setSetting(key, value) {
    const p = loadProfile(); p[key] = value; saveProfile(p); return p;
  }
  function bumpCounters({ champion }) {
    const p = loadProfile();
    p.plays = (p.plays || 0) + 1;
    if (champion) p.titles = (p.titles || 0) + 1;
    saveProfile(p);
    return p;
  }

  window.STORE = {
    saveRun, loadRun, clearRun, hasRun,
    loadProfile, saveProfile, mergeAchievements, setSetting, bumpCounters,
  };
})();
