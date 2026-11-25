import { Store } from '../core/store.js';
import { escapeHTML } from '../core/security.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const MASTERY_TIERS = [
  { level: 0, key: 'new', label: 'Baru', tone: 'neutral' },
  { level: 1, key: 'weak', label: 'Perlu Ulang', tone: 'danger' },
  { level: 2, key: 'learning', label: 'Mengenal', tone: 'warning' },
  { level: 3, key: 'strong', label: 'Kuat', tone: 'info' },
  { level: 4, key: 'mastered', label: 'Dikuasai', tone: 'success' }
];

export function normalizeWordKey(word) {
  return String(word || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function getWordRecord(wordObj) {
  const key = normalizeWordKey(wordObj?.word || wordObj);
  if (!key) return null;
  const state = Store.getState();
  const existing = state.memory?.[key];
  if (existing && typeof existing === 'object') {
    return {
      word: existing.word || String(wordObj?.word || key),
      meaning: existing.meaning || String(wordObj?.meaning || ''),
      phonetic: existing.phonetic || String(wordObj?.phonetic || ''),
      category: existing.category || String(wordObj?.category || 'General'),
      level: existing.level || String(wordObj?.level || 'A1'),
      example: existing.example || String(wordObj?.example || ''),
      personalExample: existing.personalExample || '',
      masteryLevel: Number(existing.masteryLevel) || 0,
      easeFactor: Number(existing.easeFactor) || 2.5,
      intervalDays: Number(existing.intervalDays) || 0,
      reps: Number(existing.reps) || 0,
      rightCount: Number(existing.rightCount) || 0,
      wrongCount: Number(existing.wrongCount) || 0,
      lastReviewedAt: Number(existing.lastReviewedAt) || 0,
      nextReviewAt: Number(existing.nextReviewAt) || 0
    };
  }
  return {
    word: String(wordObj?.word || key),
    meaning: String(wordObj?.meaning || ''),
    phonetic: String(wordObj?.phonetic || ''),
    category: String(wordObj?.category || 'General'),
    level: String(wordObj?.level || 'A1'),
    example: String(wordObj?.example || ''),
    personalExample: '',
    masteryLevel: 0,
    easeFactor: 2.5,
    intervalDays: 0,
    reps: 0,
    rightCount: 0,
    wrongCount: 0,
    lastReviewedAt: 0,
    nextReviewAt: 0
  };
}

export function getMasteryMeta(record) {
  const tier = Math.min(4, Math.max(0, Number(record?.masteryLevel) || 0));
  return MASTERY_TIERS[tier];
}

export function isWeakRecord(rec) {
  if (!rec) return false;
  const total = (rec.rightCount || 0) + (rec.wrongCount || 0);
  if (total === 0) return false;
  if (rec.masteryLevel === 1 && rec.wrongCount > 0) return true;
  if (rec.wrongCount > rec.rightCount) return true;
  if (rec.wrongCount >= 2 && rec.rightCount / total < 0.65) return true;
  return false;
}

export function isDueRecord(rec, now = Date.now()) {
  if (!rec || !rec.lastReviewedAt) return false;
  return (rec.nextReviewAt || 0) <= now;
}

export function isMasteredRecord(rec) {
  if (!rec) return false;
  const total = (rec.rightCount || 0) + (rec.wrongCount || 0);
  if (rec.masteryLevel >= 4 && total >= 3) return true;
  return rec.reps >= 4 && total >= 4 && rec.rightCount / total >= 0.85;
}

/**
 * Prediksi interval hari berikutnya untuk ditampilkan pada 4 tombol rating SM-2.
 */
export function previewNextIntervals(rec) {
  const ef = Number(rec?.easeFactor) || 2.5;
  const interval = Number(rec?.intervalDays) || 0;
  const reps = Number(rec?.reps) || 0;

  const hardDays = 1;
  const goodDays = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(2, Math.round(interval * ef));
  const easyDays = reps === 0 ? 4 : Math.max(goodDays + 1, Math.round(interval * ef * 1.25));

  return {
    again: 'Ulang sesi ini',
    hard: `${hardDays} hari`,
    good: `${goodDays} hari`,
    easy: `${easyDays} hari`
  };
}

/**
 * Mencatat hasil review Flashcard atau uji Active Recall dengan algoritma SM-2.
 * quality: 1 = Lupa/Salah, 2 = Sulit, 3 = Ingat, 4 = Sangat Hafal
 */
export function recordWordReview(wordObj, quality, mode = 'flashcard') {
  const key = normalizeWordKey(wordObj?.word);
  if (!key) return null;

  const q = Math.min(4, Math.max(1, Number(quality) || 1));
  const now = Date.now();
  let updatedRecord = null;

  Store.updateMemory((memoryMap, analytics) => {
    const prev = getWordRecord(wordObj);
    let { easeFactor, intervalDays, reps, rightCount, wrongCount, masteryLevel } = prev;

    if (q === 1) {
      // Jawaban salah / lupa: reset streak, tandai perlu diulang segera & besok
      reps = 0;
      intervalDays = 0;
      wrongCount += 1;
      easeFactor = Math.max(1.3, Number((easeFactor - 0.2).toFixed(2)));
      masteryLevel = 1;
    } else if (q === 2) {
      // Sulit: tetap butuh pengulangan besok
      reps = Math.max(1, reps);
      intervalDays = 1;
      rightCount += 1;
      easeFactor = Math.max(1.3, Number((easeFactor - 0.12).toFixed(2)));
      masteryLevel = masteryLevel <= 1 ? 2 : masteryLevel;
    } else if (q === 3) {
      // Ingat lancar
      intervalDays = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(2, Math.round(intervalDays * easeFactor));
      reps += 1;
      rightCount += 1;
      const acc = rightCount / (rightCount + wrongCount);
      if (reps >= 4 && acc >= 0.85) masteryLevel = 4;
      else if (reps >= 2) masteryLevel = 3;
      else masteryLevel = 2;
    } else {
      // Sangat hafal / refleks
      intervalDays = reps === 0 ? 4 : Math.max(4, Math.round(intervalDays * easeFactor * 1.25));
      reps += 1;
      rightCount += 1;
      easeFactor = Math.min(2.8, Number((easeFactor + 0.1).toFixed(2)));
      const acc = rightCount / (rightCount + wrongCount);
      if (reps >= 3 && acc >= 0.85) masteryLevel = 4;
      else masteryLevel = Math.min(4, Math.max(3, masteryLevel + 1));
    }

    const nextReviewAt = intervalDays === 0 ? now : now + intervalDays * DAY_MS;

    updatedRecord = {
      ...prev,
      word: escapeHTML(wordObj.word || prev.word).slice(0, 80),
      meaning: escapeHTML(wordObj.meaning || prev.meaning).slice(0, 160),
      phonetic: escapeHTML(wordObj.phonetic || prev.phonetic).slice(0, 80),
      category: escapeHTML(wordObj.category || prev.category).slice(0, 40),
      level: escapeHTML(wordObj.level || prev.level).slice(0, 12),
      example: escapeHTML(wordObj.example || prev.example).slice(0, 240),
      masteryLevel,
      easeFactor,
      intervalDays,
      reps,
      rightCount,
      wrongCount,
      lastReviewedAt: now,
      nextReviewAt
    };

    memoryMap[key] = updatedRecord;

    analytics.vocabTests.push({
      word: updatedRecord.word,
      correct: q >= 3,
      quality: q,
      mode,
      ts: now
    });
  });

  // Berikan XP secara idempotent (hanya jika berhasil diingat minimal level Sulit/Ingat)
  if (q >= 2) {
    Store.claimActivityReward({
      activityId: `word-mem:${key}`,
      type: 'vocab',
      amount: 1,
      xpBonus: q >= 3 ? 10 : 5,
      dailyScoped: true
    });
  }

  return updatedRecord;
}

/**
 * Menyimpan contoh kalimat personal buatan pengguna pada suatu kata.
 */
export function savePersonalExample(wordObj, rawSentence) {
  const key = normalizeWordKey(wordObj?.word);
  if (!key) return '';
  const sanitized = escapeHTML(String(rawSentence || '').trim()).slice(0, 220);

  Store.updateMemory((memoryMap) => {
    const prev = getWordRecord(wordObj);
    memoryMap[key] = {
      ...prev,
      word: escapeHTML(wordObj.word || prev.word).slice(0, 80),
      meaning: escapeHTML(wordObj.meaning || prev.meaning).slice(0, 160),
      phonetic: escapeHTML(wordObj.phonetic || prev.phonetic).slice(0, 80),
      category: escapeHTML(wordObj.category || prev.category).slice(0, 40),
      level: escapeHTML(wordObj.level || prev.level).slice(0, 12),
      example: escapeHTML(wordObj.example || prev.example).slice(0, 240),
      personalExample: sanitized
    };
  });

  return sanitized;
}

/**
 * Evaluasi jawaban Active Recall tanpa melihat arti/kata.
 */
export function evaluateRecallAnswer(userInput, targetWord) {
  const cleanUser = String(userInput || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanTarget = String(targetWord || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanUser) {
    return { exact: false, near: false, score: 0 };
  }
  if (cleanUser === cleanTarget) {
    return { exact: true, near: false, score: 100 };
  }

  // Hitung Levenshtein distance ringan untuk toleransi 1 typo huruf pada kata >= 5 huruf
  const m = cleanUser.length;
  const n = cleanTarget.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = cleanUser[i - 1] === cleanTarget[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const dist = dp[m][n];
  const maxLen = Math.max(m, n, 1);
  const similarity = Math.round(((maxLen - dist) / maxLen) * 100);
  const near = cleanTarget.length >= 5 && dist === 1;

  return { exact: false, near, score: Math.max(0, similarity) };
}
