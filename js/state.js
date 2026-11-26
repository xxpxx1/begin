import { Store, getLocalDateKey } from './core/store.js?v=30';

function buildCompatState() {
  const s = Store.getState();
  const daily = s.daily || { date: getLocalDateKey(), vocab: 0, listen: 0, speak: 0 };
  return {
    ...s,
    currentLevel: s.level || 'A1',
    speechRate: s.voiceRate || 1.0,
    voiceName: s.voiceName || 'Auto (Default)',
    vocabVault: Array.isArray(s.vault) ? s.vault : [],
    completedUnits: Array.isArray(s.completedUnits) ? s.completedUnits : [],
    rings: {
      date: daily.date || getLocalDateKey(),
      vocab: { current: Number(daily.vocab || 0), target: 5 },
      listening: { current: Number(daily.listen || 0), target: 3 },
      speaking: { current: Number(daily.speak || 0), target: 3 }
    }
  };
}

Store.subscribe(() => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('begin:statechange', { detail: buildCompatState() }));
  }
});

export const store = {
  get state() {
    return buildCompatState();
  },
  toggleTheme() {
    const next = Store.getState().theme === 'light' ? 'dark' : 'light';
    Store.setTheme(next);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', next);
    }
  },
  setLevel(level) {
    Store.setLevel(level);
  },
  setVoice(voiceURI, voiceName) {
    Store.state.voiceName = voiceName || 'Auto (Default)';
    Store.setVoice(voiceURI);
  },
  setSpeechRate(rate) {
    Store.setVoice(undefined, rate);
  },
  incrementRing(type, amount = 1, xpBonus = 15, activityId = null) {
    const mappedType = type === 'listening' ? 'listen' : type === 'speaking' ? 'speak' : type;
    const aid = activityId || `verified-${mappedType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return Store.incrementRing(mappedType, amount, xpBonus, aid);
  },
  completeUnit(unitId, xpEarned = 25) {
    return Store.completeUnit(unitId, xpEarned);
  },
  saveWord(entry) {
    const s = Store.getState();
    const exists = (s.vault || []).some((item) => item.word.toLowerCase() === String(entry.word || '').toLowerCase());
    if (!exists) {
      Store.toggleVaultWord(entry);
      this.incrementRing('vocab', 1, 10, `vault-${String(entry.word || '').toLowerCase()}`);
      return true;
    }
    return false;
  }
};

export { Store, getLocalDateKey };
export const state = buildCompatState();
export const getState = () => buildCompatState();
export const subscribe = (fn) => Store.subscribe(() => fn(buildCompatState()));
export const setLevel = (lvl) => Store.setLevel(lvl);
export const setTheme = (t) => Store.setTheme(t);
export const setVoice = (uri, rate) => Store.setVoice(uri, rate);
export const toggleVaultWord = (w) => Store.toggleVaultWord(w);
export const incrementRing = (type, amount = 1, xpBonus = 15, activityId = null) =>
  store.incrementRing(type, amount, xpBonus, activityId);
export const completeUnit = (unitId, xpBonus = 25) => Store.completeUnit(unitId, xpBonus);
export default store;
