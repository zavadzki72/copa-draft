/* ============================================================
   COPA DRAFT — lib/mp-api.js
   Authenticated REST calls to the multiplayer backend.
   ============================================================ */
(function () {
  function apiBase() { return (window.CONFIG.MP && window.CONFIG.MP.API_BASE) || ''; }

  async function call(method, path, body) {
    const token = window.MPAUTH.token();
    const res = await fetch(apiBase() + path, {
      method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {}
      ),
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { window.MPAUTH.logout(); throw new Error('Sessão expirada. Entre novamente.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro ao falar com o servidor.');
    return data;
  }

  window.MPAPI = {
    createRoom: () => call('POST', '/api/rooms'),
    getRoom: (code) => call('GET', '/api/rooms/' + encodeURIComponent(code)),
    joinRoom: (code) => call('POST', '/api/rooms/' + encodeURIComponent(code) + '/join'),
  };
})();
