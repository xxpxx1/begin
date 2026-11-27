import { OwnerDataAdapter } from './adapter.js?v=1';

const adapter = new OwnerDataAdapter();

const MODULES = [
  { id: 'overview', num: '01', label: 'Overview', icon: 'grid' },
  { id: 'users', num: '02', label: 'User Management', icon: 'users' },
  { id: 'learning', num: '03', label: 'Learning Analytics', icon: 'activity' },
  { id: 'retention', num: '04', label: 'Engagement & Retention', icon: 'trending' },
  { id: 'technical', num: '05', label: 'Technical Monitoring', icon: 'cpu' },
  { id: 'security', num: '06', label: 'Security & Audit Log', icon: 'shield' },
  { id: 'feedback', num: '07', label: 'Feedback & UX', icon: 'message' },
  { id: 'config', num: '08', label: 'System Config', icon: 'sliders' }
];

let activeModule = 'overview';
let auditFilter = 'all';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function iconSvg(name) {
  const map = {
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
    message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>'
  };
  return map[name] || '';
}

function showToast(msg) {
  const el = document.getElementById('ownerToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2400);
}

function renderNav() {
  const nav = document.getElementById('ownerNav');
  nav.innerHTML = MODULES.map(
    (m) => `
      <button type="button" class="own-nav-item ${m.id === activeModule ? 'active' : ''}" data-mod="${m.id}">
        <span class="own-nav-num">${m.num}</span>
        ${iconSvg(m.icon)}
        <span>${esc(m.label)}</span>
      </button>
    `
  ).join('');
}

function renderOverview(snap) {
  const { metrics, technical, config, state } = snap;
  const daily = state.daily || { vocab: 0, speaking: 0, listening: 0 };
  const caps = config.dailyRingCaps || { vocab: 5, speaking: 2, listening: 1 };

  const rings = [
    { label: 'Kosakata (SRS / Recall)', done: Number(daily.vocab || 0), cap: Number(caps.vocab || 5), color: 'var(--accent-emerald)' },
    { label: 'Latihan Bicara Terukur', done: Number(daily.speaking || 0), cap: Number(caps.speaking || 2), color: 'var(--accent-sky)' },
    { label: 'Daily Brief & Pemahaman', done: Number(daily.listening || 0), cap: Number(caps.listening || 1), color: '#818CF8' }
  ];

  return `
    <div class="own-page-head">
      <div>
        <h1 class="own-page-title jakarta">01 · Overview</h1>
        <p class="own-page-desc">Ringkasan kondisi belajar, XP tervalidasi, dan status antrean lokal BEGIN.</p>
      </div>
      <span class="own-badge ${config.featureFlags.remoteBackendSync ? 'tone-emerald' : 'tone-sky'}">
        ${config.featureFlags.remoteBackendSync ? 'Backend API Connected' : 'Local Adapter Active'}
      </span>
    </div>

    <div class="own-kpi-grid">
      <div class="own-card is-emerald">
        <div class="own-kpi-label">XP Tervalidasi Ledger</div>
        <div class="own-kpi-value" style="color:var(--accent-emerald);">${metrics.verifiedLedgerXp} XP</div>
        <div class="own-kpi-meta">State XP: ${metrics.totalXp} · ${metrics.signaturePresent ? 'Signature Valid' : 'Unsealed'}</div>
      </div>
      <div class="own-card">
        <div class="own-kpi-label">Latihan Bicara Nyata</div>
        <div class="own-kpi-value">${metrics.realSpeechAttempts}</div>
        <div class="own-kpi-meta">${metrics.simulatedSpeechAttempts} simulasi terpisah (0 XP)</div>
      </div>
      <div class="own-card">
        <div class="own-kpi-label">Kosakata &amp; Unit</div>
        <div class="own-kpi-value">${metrics.trackedWordsCount} <span style="font-size:14px;color:var(--text-secondary);">kata</span></div>
        <div class="own-kpi-meta">${metrics.completedUnitsCount} unit CEFR (${esc(metrics.currentLevel)})</div>
      </div>
      <div class="own-card">
        <div class="own-kpi-label">Antrean Offline Event</div>
        <div class="own-kpi-value">${metrics.unsyncedEventsCount}</div>
        <div class="own-kpi-meta">Cache SW: ${technical.cachedAssetCount} berkas (${technical.storageKB} KB)</div>
      </div>
    </div>

    <div class="own-card">
      <div class="own-sec-title">
        <span>Target Harian Perangkat Aktif</span>
        <span class="own-badge tone-muted">Streak ${metrics.streak} hari</span>
      </div>
      ${rings
        .map((r) => {
          const pct = Math.min(100, Math.round((r.done / Math.max(1, r.cap)) * 100));
          return `
            <div class="own-bar-row">
              <div class="own-bar-head">
                <span>${r.label}</span>
                <span>${r.done} / ${r.cap}</span>
              </div>
              <div class="own-bar-track">
                <div class="own-bar-fill" style="width:${Math.max(4, pct)}%;background:${r.color};"></div>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderUsers(snap) {
  const { metrics } = snap;
  return `
    <div class="own-page-head">
      <div>
        <h1 class="own-page-title jakarta">02 · User Management</h1>
        <p class="own-page-desc">Identitas sesi lokal saat ini &amp; skema tabel pengguna untuk integrasi Learning DB.</p>
      </div>
      <span class="own-badge tone-sky">1 Local Profile · Multi-User Ready</span>
    </div>

    <div class="own-card">
      <div class="own-sec-title">
        <span>Direktori Pengguna Aktif</span>
        <span class="mono" style="font-size:11px;color:var(--text-secondary);">GET ${esc(snap.config.endpointBaseUrl)}/owner/users</span>
      </div>
      <div class="own-table-wrap">
        <table class="own-table">
          <thead>
            <tr>
              <th>User / Device ID</th>
              <th>Role</th>
              <th>Level CEFR</th>
              <th>Verified XP</th>
              <th>Unit Selesai</th>
              <th>Status Sinkron</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="mono">local-owner-device-01</td>
              <td><span class="own-badge tone-emerald">Owner / Tester</span></td>
              <td>${esc(metrics.currentLevel)}</td>
              <td>${metrics.verifiedLedgerXp} XP</td>
              <td>${metrics.completedUnitsCount}</td>
              <td><span class="own-badge tone-amber">Local Storage Only</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="own-card">
      <div class="own-sec-title"><span>Kontrak Payload Sinkronisasi Learning DB</span></div>
      <pre class="own-code-box">${esc(JSON.stringify({
        endpoint: 'POST /api/v1/learning/sync',
        userId: 'usr_uuid_when_auth_enabled',
        deviceId: 'local-owner-device-01',
        cefrLevel: metrics.currentLevel,
        verifiedXp: metrics.verifiedLedgerXp,
        completedUnits: snap.state.completedUnits || [],
        pendingEvents: metrics.unsyncedEventsCount
      }, null, 2))}</pre>
    </div>
  `;
}

function renderLearning(snap) {
  const { metrics, memoryEntries } = snap;
  const weakWords = memoryEntries
    .map(([word, rec]) => ({
      word,
      wrong: Number(rec.wrongCount || 0),
      right: Number(rec.rightCount || 0),
      mastery: Number(rec.masteryLevel || 0)
    }))
    .filter((w) => w.wrong > 0 || w.right > 0)
    .sort((a, b) => b.wrong - a.wrong || a.mastery - b.mastery)
    .slice(0, 8);

  const bars = [
    { label: 'Vocabulary Recall Accuracy', val: metrics.vocabAccuracy, color: 'var(--accent-emerald)' },
    { label: 'Speaking Pronunciation & Order', val: metrics.speakingAccuracy, color: 'var(--accent-sky)' },
    { label: 'Daily Brief Comprehension', val: metrics.listeningAccuracy, color: '#818CF8' }
  ];

  return `
    <div class="own-page-head">
      <div>
        <h1 class="own-page-title jakarta">03 · Learning Analytics</h1>
        <p class="own-page-desc">Analisis performa nyata lintas keterampilan dari memori SRS dan riwayat uji.</p>
      </div>
      <span class="own-badge tone-emerald">Data Aktual Perangkat</span>
    </div>

    <div class="own-card">
      <div class="own-sec-title"><span>Distribusi Akurasi Keterampilan</span></div>
      ${bars
        .map(
          (b) => `
          <div class="own-bar-row">
            <div class="own-bar-head">
              <span>${b.label}</span>
              <span>${b.val}%</span>
            </div>
            <div class="own-bar-track">
              <div class="own-bar-fill" style="width:${Math.max(3, b.val)}%;background:${b.color};"></div>
            </div>
          </div>
        `
        )
        .join('')}
    </div>

    <div class="own-card">
      <div class="own-sec-title">
        <span>Kosakata dengan Tingkat Kesalahan Tertinggi</span>
        <span class="own-badge tone-muted">${memoryEntries.length} kata terlacak</span>
      </div>
      ${
        weakWords.length === 0
          ? '<p style="font-size:13px;color:var(--text-secondary);">Belum ada riwayat evaluasi kata. Coba selesaikan 1 sesi Flashcard atau Uji Ingatan di tab Words.</p>'
          : `<div class="own-table-wrap">
              <table class="own-table">
                <thead>
                  <tr><th>Kata</th><th>Benar</th><th>Salah</th><th>Level SRS</th></tr>
                </thead>
                <tbody>
                  ${weakWords
                    .map(
                      (w) => `
                      <tr>
                        <td><strong>${esc(w.word)}</strong></td>
                        <td style="color:var(--accent-emerald);">${w.right}</td>
                        <td style="color:var(--accent-rose);">${w.wrong}</td>
                        <td>Tier ${w.mastery} / 4</td>
                      </tr>
                    `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
      }
    </div>
  `;
}

function renderRetention(snap) {
  const days = snap.metrics.weeklyActivity;
  const maxCount = Math.max(1, ...days.map((d) => d.count));
  const activeDays = days.filter((d) => d.count > 0).length;

  return `
    <div class="own-page-head">
      <div>
        <h1 class="own-page-title jakarta">04 · Engagement &amp; Retention</h1>
        <p class="own-page-desc">Konsistensi aktivitas 7 hari terakhir dan wadah kohort D1/D7/D30 untuk Analytics DB.</p>
      </div>
      <span class="own-badge tone-sky">${activeDays} / 7 Hari Aktif</span>
    </div>

    <div class="own-card">
      <div class="own-sec-title"><span>Aktivitas Terverifikasi 7 Hari Terakhir</span></div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;align-items:end;height:140px;padding-top:16px;">
        ${days
          .map((d) => {
            const pct = d.count === 0 ? 8 : Math.max(18, Math.round((d.count / maxCount) * 100));
            return `
              <div style="display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end;">
                <span style="font-size:11px;font-weight:700;color:${d.count > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)'};">${d.count}</span>
                <div style="width:100%;max-width:34px;height:${pct}%;border-radius:8px;background:${d.count > 0 ? 'var(--accent-emerald)' : 'rgba(148,163,184,0.16)'};"></div>
                <span style="font-size:11px;color:var(--text-secondary);">${esc(d.label)}</span>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>

    <div class="own-kpi-grid">
      <div class="own-card">
        <div class="own-kpi-label">Day-1 Retention</div>
        <div class="own-kpi-value" style="color:var(--text-secondary);">—</div>
        <div class="own-kpi-meta">Menunggu Analytics DB</div>
      </div>
      <div class="own-card">
        <div class="own-kpi-label">Day-7 Retention</div>
        <div class="own-kpi-value" style="color:var(--text-secondary);">—</div>
        <div class="own-kpi-meta">Menunggu Analytics DB</div>
      </div>
      <div class="own-card">
        <div class="own-kpi-label">Day-30 Retention</div>
        <div class="own-kpi-value" style="color:var(--text-secondary);">—</div>
        <div class="own-kpi-meta">Menunggu Analytics DB</div>
      </div>
      <div class="own-card">
        <div class="own-kpi-label">Current Streak</div>
        <div class="own-kpi-value" style="color:var(--accent-emerald);">${snap.metrics.streak} hari</div>
        <div class="own-kpi-meta">Tercatat lokal</div>
      </div>
    </div>
  `;
}

function renderTechnical(snap) {
  const { technical, metrics, config } = snap;
  return `
    <div class="own-page-head">
      <div>
        <h1 class="own-page-title jakarta">05 · Technical Monitoring</h1>
        <p class="own-page-desc">Kesehatan Service Worker, kapasitas penyimpanan lokal, API audio browser, dan log error.</p>
      </div>
      <span class="own-badge ${technical.online ? 'tone-emerald' : 'tone-amber'}">
        ${technical.online ? 'Network Online' : 'Offline Mode'}
      </span>
    </div>

    <div class="own-kpi-grid">
      <div class="own-card">
        <div class="own-kpi-label">Service Worker</div>
        <div class="own-kpi-value" style="font-size:19px;text-transform:uppercase;">${esc(technical.swState)}</div>
        <div class="own-kpi-meta">${technical.cacheNames.length} cache bucket</div>
      </div>
      <div class="own-card">
        <div class="own-kpi-label">Aset Offline Tersimpan</div>
        <div class="own-kpi-value">${technical.cachedAssetCount}</div>
        <div class="own-kpi-meta mono" style="font-size:10.5px;">${esc(technical.cacheNames[0] || 'none')}</div>
      </div>
      <div class="own-card">
        <div class="own-kpi-label">LocalStorage Terpakai</div>
        <div class="own-kpi-value">${technical.storageKB} KB</div>
        <div class="own-kpi-meta">Batas standar ~5.120 KB</div>
      </div>
      <div class="own-card">
        <div class="own-kpi-label">Web Speech API</div>
        <div class="own-kpi-value" style="font-size:17px;">${technical.speechRecSupported ? 'Mic + TTS' : 'TTS Only'}</div>
        <div class="own-kpi-meta">SpeechSynthesis: ${technical.speechSynthSupported ? 'OK' : 'N/A'}</div>
      </div>
    </div>

    <div class="own-card">
      <div class="own-sec-title">
        <span>Runtime Error Trap</span>
        <span class="own-badge ${technical.runtimeErrors.length ? 'tone-rose' : 'tone-emerald'}">
          ${technical.runtimeErrors.length} error tercatat
        </span>
      </div>
      ${
        technical.runtimeErrors.length === 0
          ? '<p style="font-size:13px;color:var(--text-secondary);">Tidak ada runtime JavaScript error yang tertangkap pada sesi ini.</p>'
          : technical.runtimeErrors
              .map(
                (err) => `
                <div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:12.5px;">
                  <div style="color:var(--accent-rose);font-weight:700;">${esc(err.message)}</div>
                  <div class="mono" style="font-size:11px;color:var(--text-muted);">${esc(err.source)}:${err.line} · ${fmtTime(err.ts)}</div>
                </div>
              `
              )
              .join('')
      }
    </div>
  

    <div class="own-card">
      <div class="own-sec-title">
        <span>Arsitektur Kesiapan Produksi (BEGIN Ecosystem)</span>
        <span class="own-badge tone-emerald">Decoupled Ready</span>
      </div>
      <div class="eco-flow">
        <div class="eco-node">
          <div class="eco-node-title">BEGIN PWA (Client Edge)</div>
          <div class="eco-node-sub">Local learning state (${esc(snap.storageKey)}) + offline content</div>
        </div>
        <div class="eco-arrow">↓</div>
        <div class="eco-split">
          <div class="eco-node">
            <div class="eco-node-title">Analytics Client</div>
            <div class="eco-node-sub">Anonymous events, consent, offline queue (${metrics.unsyncedEventsCount} pending)</div>
          </div>
          <div class="eco-node">
            <div class="eco-node-title">Learning Client</div>
            <div class="eco-node-sub">XP (${metrics.totalXp}), streak (${metrics.streak}h), lesson progress</div>
          </div>
        </div>
        <div class="eco-arrow">↓</div>
        <div class="eco-node">
          <div class="eco-node-title">Backend API (${esc(config.endpointBaseUrl)})</div>
          <div class="eco-node-sub">Validation · Authentication · Rate limiting · Idempotency Guard</div>
        </div>
        <div class="eco-arrow">↓</div>
        <div class="eco-split">
          <div class="eco-node">
            <div class="eco-node-title">Analytics DB</div>
            <div class="eco-node-sub">Events, sessions, aggregates</div>
          </div>
          <div class="eco-node">
            <div class="eco-node-title">Learning DB</div>
            <div class="eco-node-sub">Progress, XP, SRS records</div>
          </div>
        </div>
        <div class="eco-arrow">↓</div>
        <div class="eco-node is-owner">
          <div class="eco-node-title" style="color:var(--accent-emerald);">BEGIN OWNER CONSOLE</div>
          <div class="eco-node-sub">Private analytics and management via OwnerDataAdapter</div>
        </div>
      </div>
    </div>
  `;
}

function renderSecurity(snap) {
  const { eventLog, ledgerEntries, metrics } = snap;
  const rows =
    eventLog.length > 0
      ? eventLog
      : ledgerEntries.map((l) => ({
          type: `${l.type}_verified`,
          entityId: l.id,
          xp: l.xp,
          simulated: false,
          ts: l.ts,
          synced: false
        }));

  const filtered = rows.filter((r) => {
    if (auditFilter === 'verified') return !r.simulated && r.xp > 0;
    if (auditFilter === 'simulated') return Boolean(r.simulated);
    return true;
  });

  return `
    <div class="own-page-head">
      <div>
        <h1 class="own-page-title jakarta">06 · Security &amp; Audit Log</h1>
        <p class="own-page-desc">Jejak mutasi XP idempoten, pemisahan aktivitas simulasi, dan validasi integritas ledger.</p>
      </div>
      <span class="own-badge ${metrics.signaturePresent ? 'tone-emerald' : 'tone-amber'}">
        ${metrics.signaturePresent ? 'Ledger Signature Verified' : 'No Signature Yet'}
      </span>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button type="button" class="own-btn ${auditFilter === 'all' ? 'own-btn-emerald' : 'own-btn-ghost'}" data-audit-filter="all">Semua (${rows.length})</button>
      <button type="button" class="own-btn ${auditFilter === 'verified' ? 'own-btn-emerald' : 'own-btn-ghost'}" data-audit-filter="verified">Terverifikasi (+XP)</button>
      <button type="button" class="own-btn ${auditFilter === 'simulated' ? 'own-btn-emerald' : 'own-btn-ghost'}" data-audit-filter="simulated">Simulasi (0 XP)</button>
    </div>

    <div class="own-card">
      <div class="own-table-wrap">
        <table class="own-table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Event Type</th>
              <th>Entity / Activity ID</th>
              <th>XP</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? '<tr><td colspan="5" style="color:var(--text-secondary);">Belum ada catatan pada filter ini.</td></tr>'
                : filtered
                    .slice(0, 50)
                    .map(
                      (ev) => `
                      <tr>
                        <td class="mono" style="font-size:11.5px;">${fmtTime(ev.ts)}</td>
                        <td class="mono">${esc(ev.type)}</td>
                        <td class="mono" style="font-size:11.5px;">${esc(ev.entityId || '—')}</td>
                        <td><strong>${ev.simulated ? '0' : `+${ev.xp}`}</strong></td>
                        <td>
                          ${
                            ev.simulated
                              ? '<span class="own-badge tone-amber">Simulated · Ignored</span>'
                              : '<span class="own-badge tone-emerald">Verified</span>'
                          }
                        </td>
                      </tr>
                    `
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderFeedback(snap) {
  return `
    <div class="own-page-head">
      <div>
        <h1 class="own-page-title jakarta">07 · Feedback &amp; User Experience</h1>
        <p class="own-page-desc">Log catatan QA lokal &amp; wadah inbox masukan pengguna saat API publik diaktifkan.</p>
      </div>
      <span class="own-badge tone-sky">${snap.feedback.length} Catatan</span>
    </div>

    <div class="own-card">
      <div class="own-sec-title"><span>Tambah Catatan QA / Masukan Baru</span></div>
      <div style="display:grid;grid-template-columns:1fr;gap:10px;">
        <div style="display:grid;grid-template-columns:150px 1fr;gap:8px;">
          <select id="fbCategory" class="own-select">
            <option value="UX / UI">UX / UI</option>
            <option value="Bug / Audio">Bug / Audio</option>
            <option value="Security / XP">Security / XP</option>
            <option value="Content">Content</option>
          </select>
          <input type="text" id="fbTitleInput" class="own-input" placeholder="Tulis temuan bug atau ide peningkatan..." />
        </div>
        <div>
          <button type="button" class="own-btn own-btn-emerald" id="addFeedbackBtn">Simpan Catatan</button>
        </div>
      </div>
    </div>

    <div class="own-card">
      <div class="own-sec-title"><span>Daftar Catatan &amp; Status (Ketuk badge untuk ubah status)</span></div>
      ${snap.feedback
        .map((item) => {
          const tone = item.status === 'resolved' ? 'tone-emerald' : item.status === 'planned' ? 'tone-sky' : 'tone-amber';
          return `
            <div class="own-config-row">
              <div>
                <div style="font-size:13.5px;font-weight:700;">${esc(item.title)}</div>
                <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">${esc(item.category)} · ${fmtTime(item.createdAt)}</div>
              </div>
              <button type="button" class="own-badge ${tone}" style="border:none;cursor:pointer;" data-toggle-fb="${esc(item.id)}">
                ${esc(item.status.toUpperCase())}
              </button>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderConfig(snap) {
  const { config } = snap;
  return `
    <div class="own-page-head">
      <div>
        <h1 class="own-page-title jakarta">08 · System Configuration</h1>
        <p class="own-page-desc">Pengaturan parameter produk, batas XP, dan sakelar integrasi Backend API.</p>
      </div>
      <button type="button" class="own-btn own-btn-emerald" id="saveConfigBtn">Simpan Konfigurasi</button>
    </div>

    <div class="own-card">
      <div class="own-sec-title"><span>Endpoint &amp; Parameter Penilaian</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;">
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:5px;">Backend API Base URL</label>
          <input type="text" id="cfgEndpoint" class="own-input mono" value="${esc(config.endpointBaseUrl)}" />
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:5px;">Min. Pass Skor Basic (A1–B1)</label>
          <input type="number" id="cfgPassBasic" class="own-input" min="40" max="95" value="${config.minPassBasicPercent}" />
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:5px;">Min. Pass Skor Hard (B2–C1)</label>
          <input type="number" id="cfgPassHard" class="own-input" min="50" max="100" value="${config.minPassHardPercent}" />
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:5px;">Batas Maksimal XP / Aksi</label>
          <input type="number" id="cfgMaxXp" class="own-input" min="5" max="200" value="${config.maxXpPerAction}" />
        </div>
      </div>
    </div>

    <div class="own-card">
      <div class="own-sec-title"><span>Feature Flags &amp; Guards</span></div>
      ${[
        ['strictLedgerGuard', 'Strict XP Idempotency Ledger', 'Blokir mutasi XP tanpa activityId unik dan tanda tangan integritas.'],
        ['separateSimulationLogs', 'Isolasi Log Simulasi (0 XP)', 'Catat tombol Simulasi sebagai speaking_demo tanpa menambah progres nyata.'],
        ['offlineEventQueue', 'Offline Event Queue', 'Simpan event belajar secara lokal saat offline untuk disinkronkan nanti.'],
        ['remoteBackendSync', 'Aktifkan Sinkronisasi Backend API', 'Alihkan adapter dari Local Sandbox ke endpoint REST API saat server siap.']
      ]
        .map(
          ([key, title, desc]) => `
          <div class="own-config-row">
            <div>
              <div style="font-size:13.5px;font-weight:700;">${title}</div>
              <div style="font-size:12px;color:var(--text-secondary);">${desc}</div>
            </div>
            <label class="own-switch">
              <input type="checkbox" data-flag="${key}" ${config.featureFlags[key] ? 'checked' : ''} />
              <span class="own-switch-slider"></span>
            </label>
          </div>
        `
        )
        .join('')}
    </div>
  `;
}

async function renderConsole() {
  renderNav();
  const snap = await adapter.getTelemetrySnapshot();
  const main = document.getElementById('ownerMain');

  const modeLabel = document.getElementById('adapterModeLabel');
  if (modeLabel) {
    modeLabel.textContent = snap.config.featureFlags.remoteBackendSync ? 'API Ready' : 'Local';
  }

  const views = {
    overview: renderOverview,
    users: renderUsers,
    learning: renderLearning,
    retention: renderRetention,
    technical: renderTechnical,
    security: renderSecurity,
    feedback: renderFeedback,
    config: renderConfig
  };

  main.innerHTML = (views[activeModule] || renderOverview)(snap);
}

document.getElementById('ownerNav').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mod]');
  if (!btn) return;
  activeModule = btn.getAttribute('data-mod');
  renderConsole();
});

document.getElementById('ownerMain').addEventListener('click', (e) => {
  const fBtn = e.target.closest('[data-audit-filter]');
  if (fBtn) {
    auditFilter = fBtn.getAttribute('data-audit-filter');
    renderConsole();
    return;
  }

  if (e.target.id === 'addFeedbackBtn') {
    const titleEl = document.getElementById('fbTitleInput');
    const catEl = document.getElementById('fbCategory');
    if (titleEl && titleEl.value.trim()) {
      adapter.addFeedbackItem({ category: catEl.value, title: titleEl.value.trim() });
      showToast('Catatan QA tersimpan ke Owner Inbox');
      renderConsole();
    }
    return;
  }

  const fbToggle = e.target.closest('[data-toggle-fb]');
  if (fbToggle) {
    adapter.toggleFeedbackStatus(fbToggle.getAttribute('data-toggle-fb'));
    renderConsole();
    return;
  }

  if (e.target.id === 'saveConfigBtn') {
    const cur = adapter.getConfig();
    const flags = { ...cur.featureFlags };
    document.querySelectorAll('[data-flag]').forEach((chk) => {
      flags[chk.getAttribute('data-flag')] = chk.checked;
    });
    adapter.saveConfig({
      ...cur,
      endpointBaseUrl: document.getElementById('cfgEndpoint').value.trim() || '/api/v1',
      minPassBasicPercent: Number(document.getElementById('cfgPassBasic').value) || 65,
      minPassHardPercent: Number(document.getElementById('cfgPassHard').value) || 80,
      maxXpPerAction: Number(document.getElementById('cfgMaxXp').value) || 50,
      adapterMode: flags.remoteBackendSync ? 'remote' : 'local',
      featureFlags: flags
    });
    showToast('Konfigurasi sistem berhasil disimpan');
    renderConsole();
  }
});

document.getElementById('exportSnapshotBtn').addEventListener('click', async () => {
  const snap = await adapter.getTelemetrySnapshot();
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `begin-owner-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Snapshot JSON diunduh');
});

renderConsole();
