const STORAGE_KEY = 'begin_pwa_state_v1';
const todayStr = () => new Date().toISOString().slice(0, 10);

const defaultState = () => ({
  theme: 'light',
  currentLevel: 'A1',
  xp: 120,
  streakDays: 3,
  lastActiveDate: todayStr(),
  rings: {
    date: todayStr(),
    vocab: { current: 2, target: 5 },
    listening: { current: 1, target: 3 },
    speaking: { current: 1, target: 3 }
  },
  completedUnits: [],
  vocabVault: [
    { word: 'reluctant', phonetic: '/rɪˈlʌktənt/', meaning: 'enggan / ragu-ragu', savedAt: todayStr() }
  ]
});

class Store {
  constructor() {
    this.state = this.load();
    this.checkDailyReset();
  }
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
    } catch { return defaultState(); }
  }
  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    window.dispatchEvent(new CustomEvent('begin:statechange', { detail: this.state }));
  }
  checkDailyReset() {
    const today = todayStr();
    if (this.state.rings.date !== today) {
      this.state.rings = { date: today, vocab: { current: 0, target: 5 }, listening: { current: 0, target: 3 }, speaking: { current: 0, target: 3 } };
      this.save();
    }
  }
  toggleTheme() {
    this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', this.state.theme);
    this.save();
  }
  setLevel(level) { this.state.currentLevel = level; this.save(); }
  incrementRing(type, amount = 1, xpBonus = 15) {
    this.checkDailyReset();
    if (this.state.rings[type]) this.state.rings[type].current += amount;
    this.state.xp += xpBonus;
    this.save();
  }
  completeUnit(unitId, xpEarned) {
    if (!this.state.completedUnits.includes(unitId)) this.state.completedUnits.push(unitId);
    this.state.xp += xpEarned;
    this.save();
  }
  saveWord(entry) {
    const exists = this.state.vocabVault.some((item) => item.word.toLowerCase() === entry.word.toLowerCase());
    if (!exists) {
      this.state.vocabVault.unshift({ ...entry, savedAt: todayStr() });
      this.incrementRing('vocab', 1, 10);
      return true;
    }
    return false;
  }
}

export const store = new Store();
