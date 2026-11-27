const PRIMARY_STORE_KEY = 'begin_app_state_v2';
const OWNER_CONFIG_KEY = 'begin_owner_config_v1';
const OWNER_FEEDBACK_KEY = 'begin_owner_feedback_v1';
const OWNER_RUNTIME_ERR_KEY = 'begin_owner_runtime_errors_v1';

export const DEFAULT_SYSTEM_CONFIG = {
  endpointBaseUrl: '/api/v1',
  adapterMode: 'local', // 'local' | 'remote'
  minPassBasicPercent: 65,
  minPassHardPercent: 80,
  maxXpPerAction: 50,
  dailyRingCaps: {
    vocab: 5,
    speaking: 2,
    listening: 1
  },
  featureFlags: {
    strictLedgerGuard: true,
    separateSimulationLogs: true,
    offlineEventQueue: true,
    remoteBackendSync: false
  }
};

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function findPwaState() {
  const direct = safeJsonParse(localStorage.getItem(PRIMARY_STORE_KEY), null);
  if (direct && typeof direct === 'object') {
    return { key: PRIMARY_STORE_KEY, state: direct };
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k.startsWith('begin_owner_')) continue;
    const parsed = safeJsonParse(localStorage.getItem(k), null);
    if (parsed && typeof parsed === 'object' && ('xp' in parsed || 'rewardLedger' in parsed || 'daily' in parsed)) {
      return { key: k, state: parsed };
    }
  }
  return {
    key: PRIMARY_STORE_KEY,
    state: {
      xp: 0,
      streak: 0,
      level: 'A1',
      completedUnits: [],
      vault: [],
      daily: { vocab: 0, speaking: 0, listening: 0 },
      memory: {},
      analytics: { vocabTests: [], readingTests: [], listeningTests: [], speakingTests: [] },
      speechHistory: [],
      briefHistory: {},
      rewardLedger: {},
      eventLog: []
    }
  };
}

export class OwnerDataAdapter {
  constructor() {
    this.runtimeErrors = safeJsonParse(localStorage.getItem(OWNER_RUNTIME_ERR_KEY), []);
    this._installErrorTrap();
  }

  _installErrorTrap() {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (ev) => {
      this.recordRuntimeError({
        message: ev.message || 'Unknown script error',
        source: ev.filename ? ev.filename.split('/').pop() : 'owner',
        line: ev.lineno || 0
      });
    });
  }

  recordRuntimeError(err) {
    this.runtimeErrors.unshift({
      id: `err_${Date.now()}`,
      message: String(err.message || 'Error').slice(0, 180),
      source: String(err.source || 'app').slice(0, 60),
      line: Number(err.line || 0),
      ts: Date.now()
    });
    this.runtimeErrors = this.runtimeErrors.slice(0, 40);
    localStorage.setItem(OWNER_RUNTIME_ERR_KEY, JSON.stringify(this.runtimeErrors));
  }

  getConfig() {
    const saved = safeJsonParse(localStorage.getItem(OWNER_CONFIG_KEY), null);
    if (!saved) return structuredClone(DEFAULT_SYSTEM_CONFIG);
    return {
      ...DEFAULT_SYSTEM_CONFIG,
      ...saved,
      dailyRingCaps: { ...DEFAULT_SYSTEM_CONFIG.dailyRingCaps, ...(saved.dailyRingCaps || {}) },
      featureFlags: { ...DEFAULT_SYSTEM_CONFIG.featureFlags, ...(saved.featureFlags || {}) }
    };
  }

  saveConfig(nextConfig) {
    localStorage.setItem(OWNER_CONFIG_KEY, JSON.stringify(nextConfig));
    return this.getConfig();
  }

  getFeedbackItems() {
    const list = safeJsonParse(localStorage.getItem(OWNER_FEEDBACK_KEY), null);
    if (Array.isArray(list)) return list;
    const seeded = [
      {
        id: 'fb-001',
        category: 'UX / Light Mode',
        title: 'Hero landing page diberi pencahayaan hangat #F9CE69',
        status: 'resolved',
        createdAt: Date.now() - 86400000
      },
      {
        id: 'fb-002',
        category: 'Security / XP',
        title: 'Pemisahan log speaking_demo (0 XP) dan speaking_attempt terverifikasi',
        status: 'resolved',
        createdAt: Date.now() - 3600000
      }
    ];
    localStorage.setItem(OWNER_FEEDBACK_KEY, JSON.stringify(seeded));
    return seeded;
  }

  addFeedbackItem({ category, title }) {
    const list = this.getFeedbackItems();
    list.unshift({
      id: `fb-${String(list.length + 1).padStart(3, '0')}`,
      category: String(category || 'General').slice(0, 40),
      title: String(title || '').slice(0, 200),
      status: 'open',
      createdAt: Date.now()
    });
    localStorage.setItem(OWNER_FEEDBACK_KEY, JSON.stringify(list));
    return list;
  }

  toggleFeedbackStatus(id) {
    const order = ['open', 'planned', 'resolved'];
    const list = this.getFeedbackItems().map((item) => {
      if (item.id !== id) return item;
      const next = order[(order.indexOf(item.status) + 1) % order.length];
      return { ...item, status: next };
    });
    localStorage.setItem(OWNER_FEEDBACK_KEY, JSON.stringify(list));
    return list;
  }

  async getTelemetrySnapshot() {
    const { key, state } = findPwaState();
    const config = this.getConfig();
    const ledger = state.rewardLedger && typeof state.rewardLedger === 'object' ? state.rewardLedger : {};
    const ledgerEntries = Object.entries(ledger).map(([id, v]) => ({
      id,
      type: v?.type || 'unknown',
      xp: Number(v?.xp || 0),
      ts: Number(v?.ts || 0)
    }));

    const eventLog = Array.isArray(state.eventLog) ? state.eventLog : [];
    const speechHistory = Array.isArray(state.speechHistory) ? state.speechHistory : [];
    const memoryEntries = state.memory && typeof state.memory === 'object' ? Object.entries(state.memory) : [];

    // Hitung ukuran storage & cache offline
    let storageBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      storageBytes += (k?.length || 0) + (localStorage.getItem(k)?.length || 0);
    }

    let cacheNames = [];
    let cachedAssetCount = 0;
    if ('caches' in window) {
      try {
        cacheNames = await caches.keys();
        for (const cName of cacheNames) {
          const c = await caches.open(cName);
          const reqs = await c.keys();
          cachedAssetCount += reqs.length;
        }
      } catch {}
    }

    let swState = 'unsupported';
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('../');
        swState = reg?.active ? 'active' : reg ? 'installing' : 'unregistered';
      } catch {
        swState = 'error';
      }
    }

    // Hitung akurasi 4 keterampilan
    const avg = (arr, fn) => (arr.length ? Math.round(arr.reduce((s, x) => s + fn(x), 0) / arr.length) : 0);
    const vocabAccuracy = avg(
      memoryEntries.filter(([, m]) => (m.rightCount || 0) + (m.wrongCount || 0) > 0),
      ([, m]) => (m.rightCount / ((m.rightCount || 0) + (m.wrongCount || 0))) * 100
    );
    const speakingAccuracy = avg(speechHistory, (s) => Number(s.sentenceAccuracy || 0));
    const briefVals = Object.values(state.briefHistory || {});
    const listeningAccuracy = avg(briefVals, (b) => Number(b.scorePercent || 0));

    // Agregasi 7 hari terakhir untuk Engagement & Retention
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const keyStr = `${y}-${m}-${day}`;
      const label = d.toLocaleDateString('id-ID', { weekday: 'short' });
      const count =
        eventLog.filter((e) => e.dateKey === keyStr && !e.simulated).length ||
        ledgerEntries.filter((e) => {
          if (!e.ts) return false;
          const ed = new Date(e.ts);
          return ed.getFullYear() === y && ed.getMonth() === d.getMonth() && ed.getDate() === d.getDate();
        }).length;
      days.push({ dateKey: keyStr, label, count });
    }

    return {
      sourceMode: config.adapterMode,
      storageKey: key,
      state,
      config,
      metrics: {
        totalXp: Number(state.xp || 0),
        verifiedLedgerXp: ledgerEntries.reduce((s, e) => s + e.xp, 0),
        signaturePresent: Boolean(state._sig),
        streak: Number(state.streak || 0),
        currentLevel: state.level || 'A1',
        completedUnitsCount: Array.isArray(state.completedUnits) ? state.completedUnits.length : 0,
        vaultCount: Array.isArray(state.vault) ? state.vault.length : 0,
        trackedWordsCount: memoryEntries.length,
        realSpeechAttempts: speechHistory.length,
        simulatedSpeechAttempts: eventLog.filter((e) => e.type === 'speaking_demo' || e.simulated).length,
        unsyncedEventsCount: eventLog.filter((e) => !e.synced).length,
        vocabAccuracy,
        speakingAccuracy,
        listeningAccuracy,
        weeklyActivity: days
      },
      memoryEntries,
      speechHistory,
      ledgerEntries: ledgerEntries.sort((a, b) => b.ts - a.ts),
      eventLog: [...eventLog].sort((a, b) => (b.ts || 0) - (a.ts || 0)),
      technical: {
        swState,
        cacheNames,
        cachedAssetCount,
        storageKB: (storageBytes / 1024).toFixed(2),
        speechRecSupported: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
        speechSynthSupported: 'speechSynthesis' in window,
        online: navigator.onLine,
        runtimeErrors: this.runtimeErrors
      },
      feedback: this.getFeedbackItems()
    };
  }
}
