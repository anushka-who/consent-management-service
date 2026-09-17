/* ============================================================
   Consent Console — wired to the real consent-service API.
   Same origin as the backend (served by Express as static files),
   so every call below is a real HTTP request to routes/*.js.
   ============================================================ */

const ICONS = {
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 13l3-3 3 3 5-6"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
};

const DOT_COLORS = ['dot-purple','dot-blue','dot-orange','dot-pink','dot-teal','dot-amber'];
function initials(name) { return (name || '?').split(/[\s_-]+/).map(w => w[0]).slice(0,2).join('').toUpperCase(); }
function dotColorFor(seed) {
  let h = 0; for (const c of String(seed)) h = (h*31 + c.charCodeAt(0)) >>> 0;
  return DOT_COLORS[h % DOT_COLORS.length];
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function uuid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'idem_' + Math.random().toString(36).slice(2, 10));
}

/* ============================================================
   API client — every call here hits the real Express server
   ============================================================ */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

/* ============================================================
   State
   ============================================================ */
let PURPOSES = [];               // live from GET /purposes
let sessionEvents = [];          // grants/withdrawals this console has sent, this session
const noticesCache = new Map();  // purposeId -> notices[] (refetched on demand, cached briefly)

function recordSessionEvent(event, source) {
  // an idempotent replay returns the same event_id — don't double-count it
  if (sessionEvents.some(e => e.event_id === event.event_id)) return;
  sessionEvents.push({ ...event, source });
}

function activePurposes() { return PURPOSES.filter(p => p.status === 'active'); }
function purposeById(id) { return PURPOSES.find(p => p.purpose_id === Number(id)); }

async function fetchNotices(purposeId) {
  const { ok, data } = await api(`/purposes/${purposeId}/notices`);
  const notices = ok && Array.isArray(data) ? data : [];
  noticesCache.set(purposeId, notices);
  return notices;
}
function latestPublished(notices) {
  return notices.filter(n => n.status === 'published').sort((a,b) => b.version - a.version)[0] || null;
}

/* ============================================================
   API connectivity banner
   ============================================================ */
async function checkApiStatus() {
  const title = document.getElementById('api-status-title');
  const desc = document.getElementById('api-status-desc');
  const badge = document.getElementById('env-badge');
  try {
    const { ok } = await api('/health');
    if (ok) {
      title.textContent = 'Connected to the live API';
      desc.textContent = 'Every action in this console is a real HTTP call to the consent-service running on localhost:3000, backed by Postgres.';
      badge.textContent = 'Live · localhost:3000';
    } else {
      throw new Error('unhealthy');
    }
  } catch {
    title.textContent = 'API unreachable';
    desc.textContent = 'Could not reach /health. Start the backend with "npm start" in this project, then reload this page.';
    badge.textContent = 'Offline';
    badge.style.color = 'var(--danger)';
    badge.style.background = 'var(--danger-bg)';
  }
}

/* ============================================================
   Navigation
   ============================================================ */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item[data-view]').forEach(n => {
    n.classList.toggle('active', n.dataset.view === name && n.style.pointerEvents !== 'none');
  });
}
document.getElementById('nav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item[data-view]');
  if (!item || item.style.pointerEvents === 'none') return;
  showView(item.dataset.view);
});
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-goto]');
  if (btn) showView(btn.dataset.goto);
});

/* ============================================================
   Toasts
   ============================================================ */
function toast(msg, isError = false) {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  if (isError) el.style.background = 'var(--danger)';
  el.innerHTML = (isError ? ICONS.alert : ICONS.check) + '<span>' + msg + '</span>';
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

/* ============================================================
   Modals
   ============================================================ */
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.overlay').classList.remove('active'));
});
document.querySelectorAll('.overlay').forEach(ov => {
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('active'); });
});

/* ============================================================
   Dashboard
   ============================================================ */
function renderDashboard() {
  const total = PURPOSES.length;
  const active = activePurposes().length;
  const grants = sessionEvents.filter(e => e.event_type === 'grant').length;
  const withdrawals = sessionEvents.filter(e => e.event_type === 'withdrawal').length;
  const rate = (grants + withdrawals) ? ((withdrawals / (grants + withdrawals)) * 100).toFixed(1) : '0.0';

  const stats = [
    { label:'Purposes (live)', value: total, icon:'shield', bg:'pastel-purple', fg:'purple', delta: active + ' active' },
    { label:'Grants this session', value: grants, icon:'check', bg:'pastel-teal', fg:'dot-teal', delta:'via this console' },
    { label:'Withdrawals this session', value: withdrawals, icon:'x', bg:'pastel-pink', fg:'dot-pink', delta:'via this console' },
    { label:'Session withdrawal rate', value: rate + '%', icon:'chart', bg:'pastel-blue', fg:'blue', delta: (grants+withdrawals) ? 'of ' + (grants+withdrawals) + ' actions' : 'no actions yet' },
  ];
  document.getElementById('stat-grid').innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="icon" style="background:var(--${s.bg}); color:var(--${s.fg});">${ICONS[s.icon]}</div>
      <div class="value">${s.value}</div>
      <div class="label">${s.label}</div>
      <div class="delta up">${s.delta}</div>
    </div>
  `).join('');

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toDateString();
    const granted = sessionEvents.filter(e => e.event_type === 'grant' && new Date(e.event_at).toDateString() === key).length;
    const withdrawn = sessionEvents.filter(e => e.event_type === 'withdrawal' && new Date(e.event_at).toDateString() === key).length;
    days.push({ label: d.toLocaleDateString('en-IN',{weekday:'short'}), granted, withdrawn });
  }
  const max = Math.max(1, ...days.map(d => Math.max(d.granted, d.withdrawn)));
  document.getElementById('chart-legend').innerHTML = `
    <div class="legend-item"><span class="legend-dot" style="background:var(--blue);"></span>Granted</div>
    <div class="legend-item"><span class="legend-dot" style="background:var(--danger);"></span>Withdrawn</div>
  `;
  document.getElementById('chart-bars').innerHTML = days.map(d => `
    <div class="bar-col">
      <div class="bar-group">
        <div class="bar" style="height:${d.granted ? (d.granted/max*100) : 2}%"></div>
        <div class="bar withdrawn" style="height:${d.withdrawn ? (d.withdrawn/max*100) : 2}%"></div>
      </div>
      <div class="bar-label">${d.label}</div>
    </div>
  `).join('');

  const body = document.getElementById('recent-events-body');
  const recent = [...sessionEvents].reverse().slice(0, 8);
  body.innerHTML = recent.length ? recent.map(e => {
    const purpose = purposeById(e.purpose_id);
    const pillClass = e.event_type === 'grant' ? 'pill-success' : 'pill-danger';
    const pillLabel = e.event_type === 'grant' ? 'Granted' : 'Withdrawn';
    return `<tr>
      <td><div class="row-entity"><div class="dot" style="background:var(--${dotColorFor(e.principal_ref)});">${initials(e.principal_ref)}</div>${e.principal_ref}</div></td>
      <td>${purpose ? purpose.code : 'purpose #' + e.purpose_id}</td>
      <td><span class="pill ${pillClass}">${pillLabel}</span></td>
      <td class="muted-cell">${e.source}</td>
      <td class="muted-cell">${fmtDate(e.event_at)}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="5"><div class="empty-state">${ICONS.shield}<div class="t">No actions yet this session</div>Grant or withdraw consent from Principal Lookup or the API Playground to see it here.</div></td></tr>`;
}

/* ============================================================
   Purposes
   ============================================================ */
function renderPurposes() {
  const search = (document.getElementById('purpose-search').value || '').toLowerCase();
  const filter = document.getElementById('purpose-filter').value;

  const list = PURPOSES.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (search && !p.code.toLowerCase().includes(search) && !p.description.toLowerCase().includes(search)) return false;
    return true;
  }).sort((a,b) => b.purpose_id - a.purpose_id);

  const grid = document.getElementById('purpose-grid');
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">${ICONS.doc}<div class="t">No purposes match</div>Try a different search or filter, or create one.</div>`;
    return;
  }

  grid.innerHTML = list.map(p => {
    const statusPill = p.status === 'active'
      ? '<span class="pill pill-success">Active</span>'
      : '<span class="pill pill-neutral">Retired</span>';
    return `
      <div class="purpose-card">
        <div class="top">
          <div class="icon" style="background:var(--pastel-purple); color:var(--purple);">${ICONS.shield}</div>
          ${statusPill}
        </div>
        <h4 class="mono" style="font-size:13px;">${p.code}</h4>
        <p>${p.description}</p>
        <div class="meta">
          <span>#${p.purpose_id} · ${fmtDate(p.created_at)}</span>
          ${p.status === 'active' ? `<button class="btn btn-secondary btn-sm" data-retire="${p.purpose_id}">Retire</button>` : ''}
        </div>
      </div>`;
  }).join('');
}
document.getElementById('purpose-search').addEventListener('input', renderPurposes);
document.getElementById('purpose-filter').addEventListener('change', renderPurposes);

document.getElementById('purpose-grid').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-retire]');
  if (!btn) return;
  const id = btn.dataset.retire;
  btn.disabled = true;
  const { ok, data } = await api(`/purposes/${id}/retire`, { method: 'POST' });
  if (ok) {
    const p = purposeById(id);
    if (p) p.status = 'retired';
    toast(`Purpose #${id} retired`);
    renderPurposes();
    renderDashboard();
    populateNoticePurposeSelects();
  } else {
    toast(data?.error || 'Could not retire purpose', true);
    btn.disabled = false;
  }
});

document.getElementById('btn-new-purpose').addEventListener('click', () => openModal('overlay-purpose'));
document.getElementById('form-purpose').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('pf-code').value.trim();
  const description = document.getElementById('pf-desc').value.trim();
  if (!code || !description) return;
  const submitBtn = e.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  const { ok, data } = await api('/purposes', { method: 'POST', body: { code, description } });
  submitBtn.disabled = false;
  if (ok) {
    PURPOSES.unshift(data);
    e.target.reset();
    closeModal('overlay-purpose');
    renderPurposes();
    renderDashboard();
    populateNoticePurposeSelects();
    toast(`Purpose "${data.code}" created (#${data.purpose_id})`);
  } else {
    toast(data?.error || 'Could not create purpose', true);
  }
});

/* ============================================================
   Notices
   ============================================================ */
function populateNoticePurposeSelects() {
  const options = activePurposes()
    .sort((a,b) => a.code.localeCompare(b.code))
    .map(p => `<option value="${p.purpose_id}">${p.code} (#${p.purpose_id})</option>`).join('');
  document.getElementById('notices-purpose-select').innerHTML = options || '<option value="">No active purposes</option>';
  document.getElementById('nf-purpose').innerHTML = options || '<option value="">No active purposes</option>';
}

async function renderNoticesForSelectedPurpose() {
  const sel = document.getElementById('notices-purpose-select');
  const purposeId = sel.value;
  const container = document.getElementById('notice-groups');
  if (!purposeId) {
    container.innerHTML = `<div class="empty-state">${ICONS.doc}<div class="t">No active purposes yet</div>Create one on the Purposes page first.</div>`;
    return;
  }
  container.innerHTML = `<div class="empty-state">Loading notices for this purpose…</div>`;
  const notices = await fetchNotices(purposeId);
  const purpose = purposeById(purposeId);

  if (!notices.length) {
    container.innerHTML = `<div class="empty-state">${ICONS.doc}<div class="t">No notices yet for ${purpose ? purpose.code : purposeId}</div>Draft one with the button above.</div>`;
    return;
  }

  const sorted = [...notices].sort((a,b) => b.version - a.version);
  container.innerHTML = `
    <div class="notice-group">
      <div class="notice-group-title">${purpose ? purpose.code : 'Purpose #' + purposeId}
        <span class="pill pill-neutral">${sorted.length} version${sorted.length>1?'s':''}</span>
      </div>
      ${sorted.map(versionRow).join('')}
    </div>`;
}

function versionRow(n) {
  const isDraft = n.status === 'draft';
  const pill = isDraft
    ? '<span class="pill pill-warning">Draft — needs approval</span>'
    : '<span class="pill pill-success">Published</span>';
  return `
    <div class="version-row">
      <div class="version-badge">v${n.version}</div>
      <div class="info">
        <div class="title">${isDraft ? 'Awaiting a second approver' : 'Published ' + fmtDate(n.published_at)}</div>
        <div class="sub">Drafted by ${n.created_by}${n.approved_by ? ' · approved by ' + n.approved_by : ''}</div>
      </div>
      ${pill}
      <div class="actions">
        <button class="btn btn-secondary btn-sm" data-view-notice="${n.notice_id}">View text</button>
        ${isDraft ? `<button class="btn btn-primary btn-sm" data-approve-notice="${n.notice_id}">Approve &amp; publish</button>` : ''}
      </div>
    </div>`;
}

document.getElementById('notices-purpose-select').addEventListener('change', renderNoticesForSelectedPurpose);

document.getElementById('notice-groups').addEventListener('click', async (e) => {
  const viewBtn = e.target.closest('[data-view-notice]');
  const approveBtn = e.target.closest('[data-approve-notice]');
  const purposeId = document.getElementById('notices-purpose-select').value;
  const notices = noticesCache.get(purposeId) || [];

  if (viewBtn) {
    const n = notices.find(x => String(x.notice_id) === viewBtn.dataset.viewNotice);
    const purpose = purposeById(purposeId);
    document.getElementById('nv-title').textContent = `${purpose ? purpose.code : purposeId} · v${n.version}`;
    document.getElementById('nv-meta').innerHTML = n.status === 'published'
      ? `<span class="pill pill-success">Published</span> <span class="muted-cell" style="margin-left:8px;">Immutable since ${fmtDate(n.published_at)}</span>`
      : `<span class="pill pill-warning">Draft</span> <span class="muted-cell" style="margin-left:8px;">Drafted by ${n.created_by}</span>`;
    document.getElementById('nv-body').textContent = n.content;
    openModal('overlay-notice');
  }

  if (approveBtn) {
    const actor = document.getElementById('notice-actor').value.trim();
    if (!actor) { toast('Enter your name in "Your name" first', true); return; }
    approveBtn.disabled = true;
    const { ok, data } = await api(`/notices/${approveBtn.dataset.approveNotice}/publish`, {
      method: 'POST',
      body: { approved_by: actor },
    });
    if (ok) {
      toast('Notice published — this version is now immutable');
      renderNoticesForSelectedPurpose();
    } else {
      toast(data?.error || "Couldn't publish (likely: you're the same person who drafted it)", true);
      approveBtn.disabled = false;
    }
  }
});

document.getElementById('btn-new-notice').addEventListener('click', () => {
  const currentPurpose = document.getElementById('notices-purpose-select').value;
  if (currentPurpose) document.getElementById('nf-purpose').value = currentPurpose;
  openModal('overlay-draft-notice');
});
document.getElementById('form-notice').addEventListener('submit', async (e) => {
  e.preventDefault();
  const purposeId = document.getElementById('nf-purpose').value;
  const content = document.getElementById('nf-body').value.trim();
  const actor = document.getElementById('notice-actor').value.trim();
  if (!purposeId) { toast('No active purpose selected', true); return; }
  if (!actor) { toast('Enter your name in "Your name" first', true); return; }
  if (!content) return;
  const submitBtn = e.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  const { ok, data } = await api(`/purposes/${purposeId}/notices`, {
    method: 'POST',
    body: { content, created_by: actor },
  });
  submitBtn.disabled = false;
  if (ok) {
    e.target.reset();
    closeModal('overlay-draft-notice');
    document.getElementById('notices-purpose-select').value = purposeId;
    renderNoticesForSelectedPurpose();
    toast(`Draft v${data.version} saved — needs an approver other than ${actor}`);
  } else {
    toast(data?.error || 'Could not save draft', true);
  }
});

/* ============================================================
   Consent log (session activity, built from real API responses)
   ============================================================ */
function renderLog() {
  const purposeSel = document.getElementById('log-purpose-filter');
  const currentValue = purposeSel.value;
  purposeSel.innerHTML = '<option value="all">All purposes</option>' +
    PURPOSES.map(p => `<option value="${p.purpose_id}">${p.code}</option>`).join('');
  purposeSel.value = currentValue || 'all';

  const search = (document.getElementById('log-search').value || '').toLowerCase();
  const purposeFilter = purposeSel.value;
  const actionFilter = document.getElementById('log-action-filter').value;

  const rows = [...sessionEvents].reverse().filter(e => {
    if (purposeFilter !== 'all' && String(e.purpose_id) !== purposeFilter) return false;
    if (actionFilter === 'granted' && e.event_type !== 'grant') return false;
    if (actionFilter === 'withdrawn' && e.event_type !== 'withdrawal') return false;
    if (search && !e.principal_ref.toLowerCase().includes(search)) return false;
    return true;
  });

  const body = document.getElementById('log-body');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state">${ICONS.shield}<div class="t">No session activity yet</div>Grant or withdraw consent from Principal Lookup or the API Playground.</div></td></tr>`;
    return;
  }
  body.innerHTML = rows.map(e => {
    const purpose = purposeById(e.purpose_id);
    const pillClass = e.event_type === 'grant' ? 'pill-success' : 'pill-danger';
    const pillLabel = e.event_type === 'grant' ? 'Granted' : 'Withdrawn';
    return `<tr>
      <td><div class="row-entity"><div class="dot" style="background:var(--${dotColorFor(e.principal_ref)});">${initials(e.principal_ref)}</div>${e.principal_ref}</div></td>
      <td>${purpose ? purpose.code : 'purpose #' + e.purpose_id}</td>
      <td><span class="pill ${pillClass}">${pillLabel}</span></td>
      <td class="muted-cell mono">#${e.notice_id}</td>
      <td class="mono muted-cell">${e.idempotency_key}</td>
      <td class="muted-cell">${fmtDate(e.event_at)}</td>
    </tr>`;
  }).join('');
}
document.getElementById('log-search').addEventListener('input', renderLog);
document.getElementById('log-purpose-filter').addEventListener('change', renderLog);
document.getElementById('log-action-filter').addEventListener('change', renderLog);

/* ============================================================
   Principal lookup
   ============================================================ */
let currentPrincipalRef = null;

async function renderPrincipal(ref) {
  currentPrincipalRef = ref;
  const result = document.getElementById('principal-result');
  result.innerHTML = `<div class="panel"><div class="empty-state">Looking up ${ref}…</div></div>`;

  const purposes = activePurposes();
  const [statuses, historyRes] = await Promise.all([
    Promise.all(purposes.map(async p => {
      const { ok, data } = await api(`/consent/check?principal_ref=${encodeURIComponent(ref)}&purpose_id=${p.purpose_id}`);
      return { purpose: p, status: ok ? data.status : 'not_granted' };
    })),
    api(`/consent/principals/${encodeURIComponent(ref)}/history`),
  ]);

  const history = historyRes.ok && Array.isArray(historyRes.data) ? historyRes.data : [];

  const statusTiles = statuses.map(({ purpose, status }) => {
    const pillClass = status === 'granted' ? 'pill-success' : status === 'withdrawn' ? 'pill-danger' : 'pill-neutral';
    const pillLabel = status === 'granted' ? 'Valid' : status === 'withdrawn' ? 'Withdrawn' : 'No consent';
    return `
      <div class="status-tile">
        <span class="name">${purpose.code}</span>
        <div class="actions-row">
          <span class="pill ${pillClass}">${pillLabel}</span>
          <button class="btn btn-secondary btn-sm" data-grant="${purpose.purpose_id}">Grant</button>
          <button class="btn btn-danger-ghost btn-sm" data-withdraw="${purpose.purpose_id}">Withdraw</button>
        </div>
      </div>`;
  }).join('') || `<div class="empty-state" style="grid-column:1/-1;">${ICONS.shield}<div class="t">No active purposes to show</div>Create one on the Purposes page.</div>`;

  const timelineItems = history.map(ev => {
    const purpose = purposeById(ev.purpose_id);
    const isGrant = ev.event_type === 'grant';
    return `
      <div class="timeline-item">
        <div class="timeline-dot" style="background:${isGrant ? 'var(--success-bg)' : 'var(--danger-bg)'}; color:${isGrant ? 'var(--success)' : 'var(--danger)'};">${isGrant ? ICONS.check : ICONS.x}</div>
        <div class="head">
          <span class="title">${isGrant ? 'Granted' : 'Withdrew'} consent for ${purpose ? purpose.code : 'purpose #' + ev.purpose_id}</span>
          <span class="time">${fmtDate(ev.event_at)}</span>
        </div>
        <div class="desc">notice #${ev.notice_id} · idempotency ${ev.idempotency_key}</div>
      </div>`;
  }).join('');

  result.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="dot" style="width:44px;height:44px;font-size:14px;background:var(--${dotColorFor(ref)});">${initials(ref)}</div>
          <div>
            <h3>${ref}</h3>
            <div class="sub mono">Live from /consent/check and /consent/principals/${ref}/history</div>
          </div>
        </div>
      </div>
      <div class="status-grid">${statusTiles}</div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h3>Full history</h3><div class="sub">Real rows from the append-only consent_events table.</div></div></div>
      <div class="timeline">${timelineItems || '<div class="empty-state">No events yet for this principal.</div>'}</div>
    </div>`;
}

async function doGrantOrWithdraw(kind, principalRef, purposeId) {
  const notices = await fetchNotices(purposeId);
  const published = latestPublished(notices);
  if (!published) {
    toast(`No published notice for this purpose yet — publish one on the Notices page first`, true);
    return;
  }
  const endpoint = kind === 'grant' ? '/consent/grants' : '/consent/withdrawals';
  const { ok, status, data } = await api(endpoint, {
    method: 'POST',
    body: {
      principal_ref: principalRef,
      purpose_id: Number(purposeId),
      notice_id: published.notice_id,
      idempotency_key: uuid(),
    },
  });
  if (ok) {
    recordSessionEvent(data, 'principal-lookup');
    toast(`${kind === 'grant' ? 'Granted' : 'Withdrew'} consent for ${principalRef} (HTTP ${status})`);
    renderDashboard();
    renderLog();
    if (currentPrincipalRef) renderPrincipal(currentPrincipalRef);
  } else {
    toast(data?.error || `Could not ${kind}`, true);
  }
}

document.getElementById('principal-result').addEventListener('click', (e) => {
  const grantBtn = e.target.closest('[data-grant]');
  const withdrawBtn = e.target.closest('[data-withdraw]');
  if (grantBtn) doGrantOrWithdraw('grant', currentPrincipalRef, grantBtn.dataset.grant);
  if (withdrawBtn) doGrantOrWithdraw('withdrawal', currentPrincipalRef, withdrawBtn.dataset.withdraw);
});

const principalSearch = document.getElementById('principal-search');
principalSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && principalSearch.value.trim()) renderPrincipal(principalSearch.value.trim());
});
document.getElementById('principal-suggestions').innerHTML = `<span class="muted-cell" style="font-size:12px;">Type a principal ref and press Enter — any string works, the API treats unknown ones as "no permission", not an error.</span>`;

/* ============================================================
   API playground — real requests, same-origin
   ============================================================ */
async function findDemoPurposeAndNotice() {
  const candidates = activePurposes().slice(0, 20);
  for (const p of candidates) {
    const notices = await fetchNotices(p.purpose_id);
    const published = latestPublished(notices);
    if (published) return { purpose: p, notice: published };
  }
  return { purpose: candidates[0] || null, notice: null };
}

function syntaxHighlight(json) {
  const str = JSON.stringify(json, null, 2);
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"]+)":/g, '<span class="k">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="s">"$1"</span>');
}

const DEMO_PRINCIPAL_REF = 'api-playground-demo';
let API_ENDPOINTS = [];

async function buildApiEndpoints() {
  const { purpose, notice } = await findDemoPurposeAndNotice();
  const grantKey = uuid();
  const withdrawKey = uuid();

  API_ENDPOINTS = [
    {
      method: 'POST', methodClass: 'method-post', path: '/consent/grants',
      desc: "Record that a principal said yes. The same idempotency key sent twice returns the same event (HTTP 200) instead of creating a duplicate — click Send twice to see it.",
      disabled: !notice,
      note: !notice ? 'No published notice found among the first 20 active purposes — publish one on the Notices page, then reload.' : null,
      request: notice ? { principal_ref: DEMO_PRINCIPAL_REF, purpose_id: purpose.purpose_id, notice_id: notice.notice_id, idempotency_key: grantKey } : null,
      call: () => api('/consent/grants', { method: 'POST', body: { principal_ref: DEMO_PRINCIPAL_REF, purpose_id: purpose.purpose_id, notice_id: notice.notice_id, idempotency_key: grantKey } }),
    },
    {
      method: 'POST', methodClass: 'method-post', path: '/consent/withdrawals',
      desc: "Record that a principal said no. Withdrawing something never granted returns a 409, not a silent success — try this before granting above.",
      disabled: !notice,
      note: !notice ? 'Needs the same published notice as the grant card above.' : null,
      request: notice ? { principal_ref: DEMO_PRINCIPAL_REF, purpose_id: purpose.purpose_id, notice_id: notice.notice_id, idempotency_key: withdrawKey } : null,
      call: () => api('/consent/withdrawals', { method: 'POST', body: { principal_ref: DEMO_PRINCIPAL_REF, purpose_id: purpose.purpose_id, notice_id: notice.notice_id, idempotency_key: withdrawKey } }),
    },
    {
      method: 'GET', methodClass: 'method-get', path: '/consent/check',
      desc: "Ask whether a principal's permission for a purpose is currently valid. Unknown principals get \"not_granted\", not an error.",
      disabled: !purpose,
      request: purpose ? { principal_ref: DEMO_PRINCIPAL_REF, purpose_id: purpose.purpose_id } : null,
      call: () => api(`/consent/check?principal_ref=${encodeURIComponent(DEMO_PRINCIPAL_REF)}&purpose_id=${purpose.purpose_id}`),
    },
    {
      method: 'GET', methodClass: 'method-get', path: '/consent/principals/{ref}/history',
      desc: "Return a principal's full consent history in order, exactly as recorded.",
      disabled: !purpose,
      request: { principal_ref: DEMO_PRINCIPAL_REF },
      call: () => api(`/consent/principals/${encodeURIComponent(DEMO_PRINCIPAL_REF)}/history`),
    },
  ];
}

function renderApiPlayground() {
  const grid = document.getElementById('api-grid');
  grid.innerHTML = API_ENDPOINTS.map((ep, i) => `
    <div class="api-card">
      <div class="method-row">
        <span class="method-tag ${ep.methodClass}">${ep.method}</span>
        <span class="path">${ep.path}</span>
      </div>
      <div class="desc">${ep.desc}</div>
      ${ep.note ? `<div class="hint" style="color:var(--warning); margin-bottom:10px;">${ep.note}</div>` : ''}
      <div class="console-label">Request</div>
      <div class="console">${ep.request ? syntaxHighlight(ep.request) : '<span class="c">// unavailable</span>'}</div>
      <button class="btn btn-primary btn-sm" style="margin-top:14px; align-self:flex-start;" data-try="${i}" ${ep.disabled ? 'disabled' : ''}>Send request</button>
      <div class="console-label" id="resp-label-${i}" style="display:none;">Response</div>
      <div class="console" id="resp-${i}" style="display:none;"></div>
    </div>
  `).join('');
}
document.getElementById('api-grid').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-try]');
  if (!btn) return;
  const i = btn.dataset.try;
  const ep = API_ENDPOINTS[i];
  const label = document.getElementById('resp-label-' + i);
  const respEl = document.getElementById('resp-' + i);
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending…';
  label.style.display = 'block';
  respEl.style.display = 'block';
  respEl.innerHTML = '<span class="c">// waiting for the server…</span>';
  const { status, data } = await ep.call();
  respEl.innerHTML = `<span class="c">// HTTP ${status}</span>\n` + syntaxHighlight(data);
  if ((ep.path === '/consent/grants' || ep.path === '/consent/withdrawals') && data && data.event_id) {
    recordSessionEvent(data, 'api-playground');
    renderDashboard();
    renderLog();
  }
  btn.disabled = false;
  btn.textContent = 'Send request';
});

/* ============================================================
   Init
   ============================================================ */
async function init() {
  checkApiStatus();
  const { ok, data } = await api('/purposes');
  PURPOSES = ok && Array.isArray(data) ? data : [];

  renderDashboard();
  renderPurposes();
  populateNoticePurposeSelects();
  renderNoticesForSelectedPurpose();
  renderLog();

  await buildApiEndpoints();
  renderApiPlayground();
}
init();
