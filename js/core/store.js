import { escapeHTML } from './security.js';

const STORAGE_KEY = 'begin_app_state_v2';
const LEGACY_KEYS = ['begin_state_v1', 'begin_app_state_v1', 'beginState'];
const VALID_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const RING_CAPS = { vocab: 5, listen: 3, speak: 3 };
const MAX_XP_PER_ACTION = 50;
const MAX_AMOUNT_PER_ACTION = 5;

/**
 * Mengembalikan tanggal lokal perangkat dalam format YYYY-MM-DD (bukan UTC).
 */
export function getLocalDateKey(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function clampInt(val, min, max, fallback = 0) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function computeIntegritySig(state) {
  const payload = JSON.stringify({
    xp: state.xp,
    ledgerKeys: Object.keys(state.rewardLedger || {}).sort(),
    completedUnits: [...(state.completedUnits || [])].sort()
  });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function defaultState() {
  const base = {
    schemaVersion: 2,
    xp: 0,
    level: 'A1',
    theme: 'light',
    voiceRate: 1.0,
    voiceURI: '',
    daily: {
      date: getLocalDateKey(),
      vocab: 0,
      listen: 0,
      speak: 0
    },
    vault: [],
    completedUnits: [],
    eventLog: [],
    rewardLedger: {},
    memory: {},
    speechHistory: [],
    briefHistory: {},
    analytics: {
      vocabTests: [],
      readingTests: [],
      listeningTests: [],
      speakingTests: []
    },
    _sig: ''
  };
  base._sig = computeIntegritySig(base);
  return base;
}

/**
 * Validasi mendalam seluruh struktur state dari localStorage.
 */
export function validateState(raw) {
  const def = defaultState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return def;

  const todayLocal = getLocalDateKey();
  const rawDaily = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
  const isSameDay = rawDaily.date === todayLocal;

  const daily = {
    date: todayLocal,
    vocab: isSameDay ? clampInt(rawDaily.vocab, 0, RING_CAPS.vocab, 0) : 0,
    listen: isSameDay ? clampInt(rawDaily.listen, 0, RING_CAPS.listen, 0) : 0,
    speak: isSameDay ? clampInt(rawDaily.speak, 0, RING_CAPS.speak, 0) : 0
  };

  // Validasi rewardLedger sebagai sumber kebenaran XP
  const rewardLedger = {};
  let verifiedXp = 0;
  if (raw.rewardLedger && typeof raw.rewardLedger === 'object' && !Array.isArray(raw.rewardLedger)) {
    for (const [k, entry] of Object.entries(raw.rewardLedger)) {
      if (typeof k !== 'string' || k.length === 0 || k.length > 120) continue;
      if (!entry || typeof entry !== 'object') continue;
      const xp = clampInt(entry.xp, 0, MAX_XP_PER_ACTION, 0);
      const ts = clampInt(entry.ts, 0, Number.MAX_SAFE_INTEGER, Date.now());
      const type = typeof entry.type === 'string' ? escapeHTML(entry.type).slice(0, 24) : 'general';
      rewardLedger[k] = { xp, ts, type };
      verifiedXp += xp;
    }
  }

  const completedUnits = Array.isArray(raw.completedUnits)
    ? [...new Set(raw.completedUnits.filter((u) => typeof u === 'string' && u.length <= 40))]
    : [];

  const vault = Array.isArray(raw.vault)
    ? raw.vault
        .filter((item) => item && typeof item.word === 'string')
        .slice(0, 500)
        .map((item) => ({
          word: escapeHTML(item.word).slice(0, 80),
          meaning: escapeHTML(item.meaning || '').slice(0, 160),
          phonetic: escapeHTML(item.phonetic || '').slice(0, 80),
          example: escapeHTML(item.example || '').slice(0, 240),
          note: escapeHTML(item.note || '').slice(0, 240),
          savedAt: clampInt(item.savedAt, 0, Number.MAX_SAFE_INTEGER, Date.now())
        }))
    : [];

  const level = VALID_LEVELS.includes(raw.level) ? raw.level : 'A1';
  const theme = raw.theme === 'dark' ? 'dark' : 'light';
  const voiceRate = Math.min(1.5, Math.max(0.6, Number(raw.voiceRate) || 1.0));
  const voiceURI = typeof raw.voiceURI === 'string' ? raw.voiceURI.slice(0, 160) : '';

  const memory = raw.memory && typeof raw.memory === 'object' && !Array.isArray(raw.memory) ? raw.memory : {};
  const speechHistory = Array.isArray(raw.speechHistory) ? raw.speechHistory.slice(-100) : [];
  const briefHistory = raw.briefHistory && typeof raw.briefHistory === 'object' && !Array.isArray(raw.briefHistory) ? raw.briefHistory : {};

  const rawAna = raw.analytics && typeof raw.analytics === 'object' ? raw.analytics : {};
  const analytics = {
    vocabTests: Array.isArray(rawAna.vocabTests) ? rawAna.vocabTests.slice(-200) : [],
    readingTests: Array.isArray(rawAna.readingTests) ? rawAna.readingTests.slice(-200) : [],
    listeningTests: Array.isArray(rawAna.listeningTests) ? rawAna.listeningTests.slice(-200) : [],
    speakingTests: Array.isArray(rawAna.speakingTests) ? rawAna.speakingTests.slice(-200) : []
  };

  // XP dikunci agar tidak pernah melebihi total transaksi sah di rewardLedger
  const sanitizedXp = Object.keys(rewardLedger).length > 0
    ? Math.min(clampInt(raw.xp, 0, 1000000, verifiedXp), verifiedXp)
    : 0;

  const validated = {
    schemaVersion: 2,
    xp: sanitizedXp,
    level,
    theme,
    voiceRate,
    voiceURI,
    daily,
    vault,
    completedUnits,
    rewardLedger,
    memory,
    speechHistory,
    briefHistory,
    analytics,
    _sig: ''
  };

  if (raw._sig && raw._sig !== computeIntegritySig({ ...validated, xp: clampInt(raw.xp, 0, 1000000, 0) })) {
    validated.xp = verifiedXp;
  }
  validated._sig = computeIntegritySig(validated);
  return validated;
}

class BeginStore {
  constructor() {
    this.listeners = new Set();
    this.state = this._load();
    this._save();
  }

  _load() {
    try {
      // Hapus cache state lama yang masih memakai dummy progress awal
      for (const oldKey of LEGACY_KEYS) {
        if (localStorage.getItem(oldKey) !== null) {
          localStorage.removeItem(oldKey);
        }
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return validateState(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  _save() {
    this.state.daily.date = getLocalDateKey();
    this.state._sig = computeIntegritySig(this.state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Abaikan jika private mode membatasi quota
    }
    this.listeners.forEach((fn) => {
      try { fn(this.state); } catch {}
    });
  }

  _ensureLocalDay() {
    const today = getLocalDateKey();
    if (this.state.daily.date !== today) {
      this.state.daily = { date: today, vocab: 0, listen: 0, speak: 0 };
    }
  }

  getState() {
    this._ensureLocalDay();
    return this.state;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setLevel(level) {
    if (!VALID_LEVELS.includes(level)) return;
    this.state.level = level;
    this._save();
  }

  setTheme(theme) {
    this.state.theme = theme === 'dark' ? 'dark' : 'light';
    if (typeof document !== 'undefined' && document.documentElement) document.documentElement.setAttribute('data-theme', this.state.theme);
    this._save();
  }

  setVoice(voiceURI, voiceRate) {
    if (typeof voiceURI === 'string') this.state.voiceURI = voiceURI.slice(0, 160);
    if (voiceRate !== undefined) {
      this.state.voiceRate = Math.min(1.5, Math.max(0.6, Number(voiceRate) || 1.0));
    }
    this._save();
  }

  toggleVaultWord(wordObj) {
    if (!wordObj || typeof wordObj.word !== 'string') return false;
    const cleanWord = escapeHTML(wordObj.word).trim().slice(0, 80);
    const idx = this.state.vault.findIndex((w) => w.word.toLowerCase() === cleanWord.toLowerCase());
    if (idx >= 0) {
      this.state.vault.splice(idx, 1);
      this._save();
      return false;
    }
    this.state.vault.unshift({
      word: cleanWord,
      meaning: escapeHTML(wordObj.meaning || '').slice(0, 160),
      phonetic: escapeHTML(wordObj.phonetic || '').slice(0, 80),
      example: escapeHTML(wordObj.example || '').slice(0, 240),
      note: '',
      savedAt: Date.now()
    });
    this.logEvent({ type: 'word_saved', entityId: cleanWord, xp: 0, simulated: false });
    this._save();
    return true;
  }

  /**
   * Sistem reward & ring idempotent:
   * - Satu activityId hanya memberi XP 1x (atau 1x per hari jika dailyScoped = true).
   * - Tanpa activityId yang valid, XP tidak akan bertambah.
   */
  logEvent({ type, entityId = '', xp = 0, simulated = false } = {}) {
    if (!type) return;
    if (!Array.isArray(this.state.eventLog)) this.state.eventLog = [];
    this.state.eventLog.push({
      eventId: `${type}:${String(entityId).slice(0, 48)}:${Date.now()}`,
      type: String(type).slice(0, 40),
      entityId: String(entityId).slice(0, 64),
      xp: simulated ? 0 : clampInt(xp, 0, MAX_XP_PER_ACTION, 0),
      simulated: Boolean(simulated),
      dateKey: getLocalDateKey(),
      ts: Date.now(),
      synced: false
    });
    if (this.state.eventLog.length > 400) {
      this.state.eventLog = this.state.eventLog.slice(-400);
    }
  }

  claimActivityReward({ activityId, type = 'vocab', amount = 1, xpBonus = 15, dailyScoped = true } = {}) {
    this._ensureLocalDay();
    if (!activityId || typeof activityId !== 'string') {
      return { awarded: false, reason: 'missing_activity_id' };
    }
    if (!Object.prototype.hasOwnProperty.call(RING_CAPS, type)) {
      return { awarded: false, reason: 'invalid_ring_type' };
    }

    const safeAmount = clampInt(amount, 1, MAX_AMOUNT_PER_ACTION, 1);
    const safeXp = clampInt(xpBonus, 0, MAX_XP_PER_ACTION, 10);
    const ledgerKey = dailyScoped
      ? `${type}:${activityId.slice(0, 64)}:${getLocalDateKey()}`
      : `${type}:${activityId.slice(0, 64)}`;

    if (this.state.rewardLedger[ledgerKey]) {
      return { awarded: false, reason: 'already_claimed' };
    }

    this.state.rewardLedger[ledgerKey] = {
      xp: safeXp,
      ts: Date.now(),
      type
    };
    this.state.xp += safeXp;
    this.state.daily[type] = Math.min(
      RING_CAPS[type],
      (this.state.daily[type] || 0) + safeAmount
    );
    this.logEvent({ type: `${type}_verified`, entityId: activityId, xp: safeXp, simulated: false });

    this._save();
    return { awarded: true, xpAwarded: safeXp, totalXp: this.state.xp };
  }

  /**
   * Wrapper aman untuk pemanggil lama incrementRing(type, amount, xpBonus, activityId).
   */
  incrementRing(type, amount = 1, xpBonus = 15, activityId = null) {
    if (!activityId) {
      return { awarded: false, reason: 'unverified_action_blocked' };
    }
    return this.claimActivityReward({
      activityId,
      type,
      amount,
      xpBonus,
      dailyScoped: true
    });
  }

  /**
   * Penyelesaian unit yang idempotent: unit yang sama hanya memberi XP 1 kali.
   */
  completeUnit(unitId, xpBonus = 25) {
    if (!unitId || typeof unitId !== 'string') {
      return { awarded: false, reason: 'invalid_unit_id' };
    }
    const cleanId = unitId.slice(0, 40);
    const ledgerKey = `unit:${cleanId}`;

    if (!this.state.completedUnits.includes(cleanId)) {
      this.state.completedUnits.push(cleanId);
    }

    if (this.state.rewardLedger[ledgerKey]) {
      this._save();
      return { awarded: false, reason: 'unit_already_rewarded' };
    }

    const safeXp = clampInt(xpBonus, 5, MAX_XP_PER_ACTION, 25);
    this.state.rewardLedger[ledgerKey] = {
      xp: safeXp,
      ts: Date.now(),
      type: 'unit'
    };
    this.state.xp += safeXp;
    this.logEvent({ type: 'unit_completed', entityId: cleanId, xp: safeXp, simulated: false });
    this._save();
    return { awarded: true, xpAwarded: safeXp, totalXp: this.state.xp };
  }


  updateMemory(mutatorFn) {
    if (typeof mutatorFn !== 'function') return;
    if (!this.state.memory || typeof this.state.memory !== 'object') {
      this.state.memory = {};
    }
    if (!this.state.analytics || typeof this.state.analytics !== 'object') {
      this.state.analytics = { vocabTests: [], readingTests: [], listeningTests: [], speakingTests: [] };
    }
    mutatorFn(this.state.memory, this.state.analytics);
    if (Array.isArray(this.state.analytics.vocabTests) && this.state.analytics.vocabTests.length > 250) {
      this.state.analytics.vocabTests = this.state.analytics.vocabTests.slice(-250);
    }
    this._save();
  }


  recordSpeechAttempt(entry) {
    if (!entry || typeof entry.target !== 'string') return;
    if (entry.simulated) {
      this.logEvent({ type: 'speaking_demo', entityId: entry.id || entry.target, xp: 0, simulated: true });
      this._save();
      return;
    }
    this.logEvent({ type: 'speaking_attempt', entityId: entry.id || entry.target, xp: 0, simulated: false });
    if (!Array.isArray(this.state.speechHistory)) this.state.speechHistory = [];
    if (!this.state.analytics || typeof this.state.analytics !== 'object') {
      this.state.analytics = { vocabTests: [], readingTests: [], listeningTests: [], speakingTests: [] };
    }
    const cleanEntry = {
      id: String(entry.id || Date.now()).slice(0, 48),
      target: escapeHTML(entry.target).slice(0, 240),
      transcript: escapeHTML(entry.transcript || '').slice(0, 240),
      scenario: escapeHTML(entry.scenario || 'Latihan Kalimat').slice(0, 80),
      wordMatching: clampInt(entry.wordMatching, 0, 100, 0),
      sentenceAccuracy: clampInt(entry.sentenceAccuracy, 0, 100, 0),
      pronunciation: clampInt(entry.pronunciation, 0, 100, 0),
      ts: Date.now()
    };
    this.state.speechHistory.push(cleanEntry);
    if (this.state.speechHistory.length > 100) {
      this.state.speechHistory = this.state.speechHistory.slice(-100);
    }
    this.state.analytics.speakingTests.push({
      wordMatching: cleanEntry.wordMatching,
      sentenceAccuracy: cleanEntry.sentenceAccuracy,
      pronunciation: cleanEntry.pronunciation,
      ts: cleanEntry.ts
    });
    if (this.state.analytics.speakingTests.length > 200) {
      this.state.analytics.speakingTests = this.state.analytics.speakingTests.slice(-200);
    }
    this._save();
  }

  recordBriefCompletion(storyId, { scorePercent = 0, correctCount = 0, totalQuestions = 0, listened = false } = {}) {
    if (!storyId || typeof storyId !== 'string') return;
    const cleanId = storyId.slice(0, 48);
    if (!this.state.briefHistory || typeof this.state.briefHistory !== 'object') {
      this.state.briefHistory = {};
    }
    if (!this.state.analytics || typeof this.state.analytics !== 'object') {
      this.state.analytics = { vocabTests: [], readingTests: [], listeningTests: [], speakingTests: [] };
    }
    const pct = clampInt(scorePercent, 0, 100, 0);
    const now = Date.now();
    this.state.briefHistory[cleanId] = {
      completed: true,
      scorePercent: pct,
      correctCount: clampInt(correctCount, 0, 20, 0),
      totalQuestions: clampInt(totalQuestions, 1, 20, 1),
      listened: Boolean(listened),
      ts: now
    };
    this.state.analytics.readingTests.push({ storyId: cleanId, score: pct, ts: now });
    if (this.state.analytics.readingTests.length > 200) {
      this.state.analytics.readingTests = this.state.analytics.readingTests.slice(-200);
    }
    if (listened) {
      this.state.analytics.listeningTests.push({ storyId: cleanId, score: pct, ts: now });
      if (this.state.analytics.listeningTests.length > 200) {
        this.state.analytics.listeningTests = this.state.analytics.listeningTests.slice(-200);
      }
    }
    this._save();
  }

  resetAllProgress() {
    this.state = defaultState();
    this._save();
  }
}

export const Store = new BeginStore();
