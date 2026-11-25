import { Store, getLocalDateKey } from './core/store.js';

export { Store, getLocalDateKey };
export const getState = () => Store.getState();
export const subscribe = (fn) => Store.subscribe(fn);
export const setLevel = (lvl) => Store.setLevel(lvl);
export const setTheme = (t) => Store.setTheme(t);
export const setVoice = (uri, rate) => Store.setVoice(uri, rate);
export const toggleVaultWord = (w) => Store.toggleVaultWord(w);
export const incrementRing = (type, amount = 1, xpBonus = 15, activityId = null) =>
  Store.incrementRing(type, amount, xpBonus, activityId);
export const completeUnit = (unitId, xpBonus = 25) =>
  Store.completeUnit(unitId, xpBonus);
