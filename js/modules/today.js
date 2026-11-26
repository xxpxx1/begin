import { Store } from '../core/store.js';
import { escapeHTML } from '../core/security.js';
import { getAllVocabularyPool } from './lexicon.js?v=34';
import {
  computeRealLearningAnalytics,
  exportProgressSnapshot,
  importProgressSnapshot
} from '../engines/analytics-engine.js?v=34';

const tdyState = {
  selectedDayKey: null,
  backupOpen: false,
  backupDraft: '',
  backupStatus: ''
};

function navigateToSection(tabName) {
  let clean = String(tabName || '').toLowerCase();
  if (clean === 'word') clean = 'words';
  if (!clean) return;
  const selectors = [
    `[data-tab="${clean}"]`,
    `[data-view="${clean}"]`,
    `[data-target="${clean}"]`,
    `[data-page="${clean}"]`,
    `#tab-${clean}`,
    `#nav-${clean}`,
    `button[aria-controls*="${clean}" i]`
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && typeof el.click === 'function') {
      el.click();
      return;
    }
  }
}

function barToneClass(score) {
  if (typeof score !== 'number') return '';
  if (score >= 78) return 'is-good';
  if (score >= 55) return 'is-mid';
  return 'is-low';
}

function svgIcon(name) {
  const icons = {
    spark: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    arrow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    chart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
  };
  return icons[name] || '';
}

function getFriendlyProgressCopy(overallScore) {
  if (overallScore === null || overallScore === undefined) {
    return {
      title: 'Mulai Langkah Pertamamu',
      subtitle: 'Selesaikan 1 latihan singkat hari ini untuk melihat perkembangan belajarmu.'
    };
  }
  const pct = Math.max(0, Math.min(100, Math.round(Number(overallScore) || 0)));
  if (pct < 50) {
    return {
      title: 'Progres Terus Bertumbuh',
      subtitle: 'Gabungan latihan kosakata, pelafalan, dan pemahaman cerita.'
    };
  }
  if (pct < 80) {
    return {
      title: 'Ritme Belajarmu Bagus!',
      subtitle: 'Gabungan latihan kosakata, pelafalan, dan pemahaman cerita.'
    };
  }
  return {
    title: 'Siap Naik Level!',
    subtitle: 'Penguasaan kosakata, pelafalan, dan bacaanmu sudah sangat konsisten.'
  };
}

export function renderToday(containerEl) {
  const host =
    (containerEl && containerEl.nodeType === 1 ? containerEl : null) ||
    document.getElementById('todayContainer') ||
    document.getElementById('view-today') ||
    document.querySelector('[data-view="today"]');

  if (!host) return;

  let root = document.getElementById('todayAnalyticsContainer');
  if (!root) {
    const legacyNodes = Array.from(host.children);
    if (legacyNodes.length > 0) {
      const legacyVault = document.createElement('div');
      legacyVault.id = 'todayLegacyCompat';
      legacyVault.style.display = 'none';
      legacyVault.setAttribute('aria-hidden', 'true');
      legacyNodes.forEach((el) => legacyVault.appendChild(el));
      host.appendChild(legacyVault);
    }
    root = document.createElement('div');
    root.id = 'todayAnalyticsContainer';
    host.appendChild(root);
  }

  const state = Store.getState();
  const pool = typeof getAllVocabularyPool === 'function' ? getAllVocabularyPool() : [];
  const report = computeRealLearningAnalytics(pool);

  const d = state.daily || { vocab: 0, listen: 0, speak: 0 }; const dp = { wordsReviewed: d.vocab || 0, speakCompleted: d.speak || 0, storiesRead: d.listen || 0 };
  const dailyTargets = [
    {
      label: 'Uji Kosakata (SRS / Recall)',
      current: Math.min(5, Number(dp.wordsReviewed || 0)),
      goal: 5,
      tab: 'word'
    },
    {
      label: 'Latihan Bicara Terukur',
      current: Math.min(2, Number(dp.speakCompleted || 0)),
      goal: 2,
      tab: 'speak'
    },
    {
      label: 'Daily Brief + Kuis Pemahaman',
      current: Math.min(1, Number(dp.storiesRead || 0)),
      goal: 1,
      tab: 'brief'
    }
  ];

  const maxWeekCount = Math.max(4, ...report.weeklyActivity.map((d) => d.count));
  const selectedDay =
    report.weeklyActivity.find((d) => d.dateKey === tdyState.selectedDayKey) ||
    report.weeklyActivity[report.weeklyActivity.length - 1];

  const recentLogs = [
    ...(state.speechHistory || []).slice(-3).map((s) => ({
      type: 'Speak',
      title: s.target,
      meta: `Kata ${s.wordMatching}% • Susunan ${s.sentenceAccuracy}% • Lafal ${s.pronunciation}%`,
      ts: s.ts || 0
    })),
    ...Object.entries(state.briefHistory || {})
      .filter(([, v]) => v && v.completed)
      .map(([id, v]) => ({
        type: 'Brief',
        title: id.replace(/^brief-/, '').replace(/-/g, ' '),
        meta: `Pemahaman ${v.scorePercent}% (${v.correctCount}/${v.totalQuestions} benar)`,
        ts: v.ts || 0
      }))
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 4);

  root.innerHTML = `
    <div class="tdy-shell">
      <div class="tdy-hero">
        <div class="tdy-hero-top">
          <span class="tdy-cefr-pill">${svgIcon('spark')} Kesiapan CEFR ${escapeHTML(report.estimatedCEFR)}</span>
          <span style="font-size:12px;font-weight:700;opacity:0.9;font-variant-numeric:tabular-nums;">
            ${report.totalVerifiedTests} Uji Tervalidasi
          </span>
        </div>
        <div style="font-size:21px;font-weight:800;line-height:1.25;">
          ${getFriendlyProgressCopy(report.overallScore).title}
        </div>
        <div style="font-size:13px;opacity:0.9;margin-top:4px;line-height:1.45;">
          ${getFriendlyProgressCopy(report.overallScore).subtitle}
        </div>
        <div style="margin:12px 0 4px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;margin-bottom:6px;">
            <span style="opacity:0.92;">Progres Level ${escapeHTML(report.estimatedCEFR)}</span>
            <span style="color:#F9CE69;font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;">${report.overallScore !== null ? `${report.overallScore}%` : '0%'}</span>
          </div>
          <div style="height:10px;border-radius:999px;background:rgba(255,255,255,0.2);overflow:hidden;">
            <div style="width:${report.overallScore !== null ? Math.max(6, Math.min(100, Number(report.overallScore))) : 4}%;height:100%;border-radius:999px;background:#F9CE69;transition:width 0.6s cubic-bezier(0.22,1,0.36,1);"></div>
          </div>
        </div>

        <div class="tdy-stat-row">
          <div class="tdy-stat-box">
            <div class="tdy-stat-num">${Number(state.streak || (report.weeklyActivity.filter(x => x.count > 0).length))}</div>
            <div class="tdy-stat-lbl">Hari Streak</div>
          </div>
          <div class="tdy-stat-box">
            <div class="tdy-stat-num">${Number(state.xp || 0)}</div>
            <div class="tdy-stat-lbl">Total XP</div>
          </div>
          <div class="tdy-stat-box">
            <div class="tdy-stat-num">${report.buckets.mastered.length}</div>
            <div class="tdy-stat-lbl">Kata Dikuasai</div>
          </div>
        </div>
      </div>

      <div class="p3-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-size:11.5px;font-weight:800;color:var(--ios-blue,#1A6DFF);text-transform:uppercase;letter-spacing:0.04em;">
              Langkah Prioritas Smart Engine
            </div>
            <div style="font-size:16px;font-weight:800;margin-top:2px;">
              ${escapeHTML(report.nextAction.title)}
            </div>
            <div style="font-size:13px;color:var(--text-secondary,#64748B);margin-top:3px;line-height:1.45;">
              ${escapeHTML(report.nextAction.reason)}
            </div>
          </div>
          <button type="button" class="mem-btn mem-btn-primary" style="white-space:nowrap;" data-tdy-nav="${escapeHTML(report.nextAction.targetTab)}">
            ${escapeHTML(report.nextAction.cta)} ${svgIcon('arrow')}
          </button>
        </div>
      </div>

      <div class="p3-card">
        <div style="font-size:14.5px;font-weight:800;">Target Terukur Hari Ini</div>
        <div style="font-size:12.5px;color:var(--text-secondary,#64748B);margin-top:2px;">
          Setiap target hanya terisi setelah evaluasi selesai dikerjakan.
        </div>
        <div class="tdy-goal-list">
          ${dailyTargets
            .map((g) => {
              const done = g.current >= g.goal;
              return `
                <div class="tdy-goal-item">
                  <div>
                    <div style="font-size:13.5px;font-weight:700;">${escapeHTML(g.label)}</div>
                    <div style="font-size:12px;color:${done ? '#059669' : 'var(--text-secondary,#64748B)'};font-weight:600;font-variant-numeric:tabular-nums;">
                      ${g.current} / ${g.goal} selesai
                    </div>
                  </div>
                  ${
                    done
                      ? `<span class="mem-badge tone-success">${svgIcon('check')} Tuntas</span>`
                      : `<button type="button" class="mem-btn mem-btn-ghost" style="min-height:36px;font-size:12px;" data-tdy-nav="${escapeHTML(g.tab)}">Mulai</button>`
                  }
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <div class="p3-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="font-size:14.5px;font-weight:800;display:flex;align-items:center;gap:6px;">
            ${svgIcon('chart')} Real Learning Analytics
          </div>
          ${
            report.recallAccuracy !== null
              ? `<span class="mem-badge tone-info">Retensi ${report.recallAccuracy}%</span>`
              : ''
          }
        </div>
        <div style="font-size:12.5px;color:var(--text-secondary,#64748B);margin-top:2px;">
          Pemetaan 4 keterampilan bahasa berdasarkan riwayat pengujian aktual.
        </div>

        <div class="tdy-skill-grid">
          ${report.skills
            .map((sk) => {
              const hasScore = typeof sk.score === 'number';
              const deltaText =
                typeof sk.delta === 'number' && sk.delta !== 0
                  ? ` (${sk.delta > 0 ? '+' : ''}${sk.delta}%)`
                  : '';
              return `
                <div class="tdy-skill-card" data-tdy-nav="${escapeHTML(sk.targetTab)}" style="cursor:pointer;">
                  <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-size:13px;font-weight:800;">${escapeHTML(sk.label)}</span>
                    <span style="font-size:15px;font-weight:800;color:${hasScore ? 'var(--text-primary,#0F172A)' : 'var(--text-secondary,#64748B)'};">
                      ${hasScore ? `${sk.score}%` : '—'}
                    </span>
                  </div>
                  <div class="tdy-bar-track">
                    <div class="tdy-bar-fill ${barToneClass(sk.score)}" style="width:${hasScore ? sk.score : 0}%;"></div>
                  </div>
                  <div style="font-size:11.5px;color:var(--text-secondary,#64748B);line-height:1.35;">
                    ${escapeHTML(sk.detail + deltaText)}
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <div class="p3-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="font-size:14.5px;font-weight:800;">Konsistensi 7 Hari Terakhir</div>
          <span style="font-size:12px;font-weight:700;color:var(--ios-blue,#1A6DFF);font-variant-numeric:tabular-nums;">
            ${escapeHTML(selectedDay.dayLabel)}: ${selectedDay.count} aktivitas
          </span>
        </div>

        <div class="tdy-week-chart">
          ${report.weeklyActivity
            .map((d) => {
              const pct = d.count === 0 ? 8 : Math.min(100, Math.round((d.count / maxWeekCount) * 100));
              const isSelected = selectedDay.dateKey === d.dateKey;
              return `
                <div class="tdy-day-col ${d.count > 0 ? 'has-activity' : ''} ${d.isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" data-tdy-day="${escapeHTML(d.dateKey)}">
                  <div class="tdy-day-bar" style="height:${pct}%;"></div>
                  <div class="tdy-day-lbl">${escapeHTML(d.dayLabel)}</div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      ${
        recentLogs.length > 0
          ? `<div class="p3-card">
              <div style="font-size:14.5px;font-weight:800;margin-bottom:8px;">Riwayat Evaluasi Terbaru</div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                ${recentLogs
                  .map(
                    (item) => `
                    <div style="padding:10px 12px;border-radius:12px;background:rgba(148,163,184,0.08);display:flex;align-items:center;justify-content:space-between;gap:10px;">
                      <div>
                        <div style="font-size:13px;font-weight:700;">${escapeHTML(item.title)}</div>
                        <div style="font-size:11.5px;color:var(--text-secondary,#64748B);">${escapeHTML(item.meta)}</div>
                      </div>
                      <span class="mem-badge tone-neutral">${escapeHTML(item.type)}</span>
                    </div>
                  `
                  )
                  .join('')}
              </div>
            </div>`
          : ''
      }

      <div class="p3-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div>
            <div style="font-size:14px;font-weight:800;">Cadangan &amp; Pemulihan Data Lokal</div>
            <div style="font-size:12px;color:var(--text-secondary,#64748B);">Simpan atau pindahkan progres belajar lintas perangkat.</div>
          </div>
          <button type="button" class="mem-btn mem-btn-ghost" style="min-height:36px;font-size:12px;" data-tdy-action="toggle-backup">
            ${svgIcon('download')} ${tdyState.backupOpen ? 'Tutup' : 'Kelola'}
          </button>
        </div>

        ${
          tdyState.backupOpen
            ? `<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;gap:8px;">
                  <button type="button" class="mem-btn mem-btn-primary" style="flex:1;font-size:12.5px;" data-tdy-action="export-json">
                    Salin / Unduh JSON
                  </button>
                  <button type="button" class="mem-btn mem-btn-ghost" style="flex:1;font-size:12.5px;" data-tdy-action="import-json">
                    Pulihkan dari Teks
                  </button>
                </div>
                <textarea
                  id="tdyBackupBox"
                  rows="4"
                  class="mem-input"
                  style="font-size:12px;font-family:monospace;"
                  placeholder="Tempel JSON cadangan di sini untuk memulihkan progres..."
                >${escapeHTML(tdyState.backupDraft)}</textarea>
                ${
                  tdyState.backupStatus
                    ? `<div style="font-size:12px;font-weight:700;color:var(--ios-blue,#1A6DFF);">${escapeHTML(tdyState.backupStatus)}</div>`
                    : ''
                }
              </div>`
            : ''
        }
      </div>
    </div>
  `;

  bindTodayEvents(root);
}

function bindTodayEvents(root) {
  if (root.dataset.tdyBound === '1') return;
  root.dataset.tdyBound = '1';

  root.addEventListener('click', (e) => {
    const navEl = e.target.closest('[data-tdy-nav]');
    if (navEl) {
      navigateToSection(navEl.getAttribute('data-tdy-nav'));
      return;
    }

    const dayCol = e.target.closest('[data-tdy-day]');
    if (dayCol) {
      tdyState.selectedDayKey = dayCol.getAttribute('data-tdy-day');
      renderToday(root);
      return;
    }

    const actBtn = e.target.closest('[data-tdy-action]');
    if (!actBtn) return;
    const action = actBtn.getAttribute('data-tdy-action');

    if (action === 'toggle-backup') {
      tdyState.backupOpen = !tdyState.backupOpen;
      tdyState.backupStatus = '';
      renderToday(root);
    } else if (action === 'export-json') {
      const jsonStr = exportProgressSnapshot();
      tdyState.backupDraft = jsonStr;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(jsonStr);
        }
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `begin-progress-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        tdyState.backupStatus = 'Cadangan JSON disalin ke clipboard & diunduh.';
      } catch {
        tdyState.backupStatus = 'Cadangan JSON ditampilkan di kotak bawah — salin secara manual.';
      }
      renderToday(root);
    } else if (action === 'import-json') {
      const box = document.getElementById('tdyBackupBox');
      const raw = box ? box.value : tdyState.backupDraft;
      const res = importProgressSnapshot(raw);
      tdyState.backupStatus = res.message;
      renderToday(root);
    }
  });
}

export const initToday = renderToday;

export default { renderToday, initToday };
