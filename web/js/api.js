/* Verified Beats Studio — shared API client + nav */
window.VBEATS_API = window.VBEATS_API || 'https://vbeats-api.onrender.com';

const api = {
  base: window.VBEATS_API,
  get token() { return localStorage.getItem('vbeats_token') || ''; },
  set token(t) { t ? localStorage.setItem('vbeats_token', t) : localStorage.removeItem('vbeats_token'); },

  async req(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const res = await fetch(this.base + path, { ...opts, headers });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      const msg = (data && (data.error?.message || data.message)) || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return data;
  },
  get(path) { return this.req(path); },
  post(path, body) {
    return this.req(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
  postForm(path, formData) {
    return this.req(path, { method: 'POST', body: formData });
  },

  async signup(email, password, name) {
    const d = await this.post('/v1/auth/signup', { email, password, name });
    if (d.token) this.token = d.token;
    if (d.accessToken) this.token = d.accessToken;
    return d;
  },
  async login(email, password) {
    const d = await this.post('/v1/auth/login', { email, password });
    if (d.token) this.token = d.token;
    if (d.accessToken) this.token = d.accessToken;
    return d;
  },
  logout() { this.token = ''; },
  loggedIn() { return !!this.token; },

  marketplace(params = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) q.set(k, v);
    return this.get('/v1/beats/marketplace?' + q.toString());
  },
  beat(id) { return this.get('/v1/beats/' + encodeURIComponent(id)); },
  verify(id) { return this.post('/v1/beats/' + encodeURIComponent(id) + '/verify', {}); },
  nft(id) { return this.get('/v1/beats/' + encodeURIComponent(id) + '/nft'); },
  upload(formData) { return this.postForm('/v1/beats/upload', formData); },

  mediaUrl(beat) {
    const u = beat.audioUrl || beat.fileUrl || '';
    if (!u) return '';
    if (/^https?:\/\//.test(u)) return u;
    return this.base + u;
  },
  artUrl(beat) {
    const u = beat.imageUrl || beat.artworkUrl || '';
    if (u && /^https?:\/\//.test(u)) return u;
    return 'assets/logo.png';
  },
};

function nav(active) {
  const links = [
    ['index.html', 'Home'], ['marketplace.html', 'Marketplace'],
    ['studio.html', 'Studio'], ['chat.html', 'Chat'], ['upload.html', 'Upload'],
  ];
  const el = document.getElementById('nav');
  el.innerHTML =
    '<div class="nav-in">' +
    '<a class="brand" href="index.html"><img src="assets/logo.png" alt="logo"><span>Verified Beats Studio</span></a>' +
    '<div class="nav-links">' +
    links.map(([h, t]) => `<a href="${h}" class="${h === active ? 'on' : ''}">${t}</a>`).join('') +
    '</div><div class="nav-right" id="nav-user"></div></div>';
  renderUser();
}

function renderUser() {
  const box = document.getElementBy('nav-user') || document.getElementById('nav-user');
  if (!box) return;
  if (api.loggedIn()) {
    box.innerHTML = '<span>Signed in</span> <button class="btn ghost small" id="logout">Log out</button>';
    document.getElementById('logout').onclick = () => { api.logout(); location.reload(); };
  } else {
    box.innerHTML = '<a class="btn ghost small" href="upload.html">Sign in</a>';
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDur(sec) {
  if (!sec && sec !== 0) return '';
  sec = Math.round(Number(sec) || 0);
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function showErr(boxId, msg) {
  const b = document.getElementById(boxId);
  if (b) b.innerHTML = '<div class="err">' + esc(msg) + '</div>';
}
