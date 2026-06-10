/* ============================================================
   COPA DRAFT — lib/mp-auth.js
   Multiplayer session: Google Identity Services login exchanged for
   the backend JWT. Session lives in its OWN localStorage key, fully
   isolated from the solo run/profile keys (no regression risk).
   ============================================================ */
(function () {
  const KEY = 'copa_draft_mp_session_v1';

  function safeGet() {
    try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function safeSet(val) {
    try { val ? localStorage.setItem(KEY, JSON.stringify(val)) : localStorage.removeItem(KEY); }
    catch (e) {}
  }

  let session = safeGet(); // { token, user: { id, name, avatar } }

  function apiBase() { return (window.CONFIG.MP && window.CONFIG.MP.API_BASE) || ''; }

  // exchange the Google credential (idToken) for the app JWT
  async function loginWithCredential(credential) {
    const res = await fetch(apiBase() + '/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: credential }),
    });
    if (!res.ok) throw new Error('Não foi possível entrar com o Google. Tente novamente.');
    session = await res.json();
    safeSet(session);
    return session;
  }

  // renders the official GIS button into `el`; onLogin(session|null, err?)
  function renderGoogleButton(el, onLogin) {
    const cid = window.CONFIG.MP && window.CONFIG.MP.GOOGLE_CLIENT_ID;
    if (!window.google || !window.google.accounts || !cid) return false;
    window.google.accounts.id.initialize({
      client_id: cid,
      callback: async (resp) => {
        try { onLogin(await loginWithCredential(resp.credential)); }
        catch (e) { onLogin(null, e); }
      },
    });
    window.google.accounts.id.renderButton(el, {
      theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with',
    });
    return true;
  }

  // entra como convidado (só apelido) — pode JOGAR em salas existentes;
  // criar sala continua exigindo a conta Google (o servidor reforça isso)
  async function loginAsGuest(name) {
    const res = await fetch(apiBase() + '/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível entrar como convidado.');
    session = data;
    safeSet(session);
    return session;
  }

  function logout() { session = null; safeSet(null); }

  window.MPAUTH = {
    isLoggedIn: () => !!(session && session.token),
    isGuest: () => !!(session && session.user && session.user.guest),
    session: () => session,
    token: () => (session ? session.token : null),
    user: () => (session ? session.user : null),
    renderGoogleButton, loginWithCredential, loginAsGuest, logout,
  };
})();
