import { Store } from '../core/store.js';
import {
  getWordRecord,
  isWeakRecord,
  isDueRecord,
  isMasteredRecord,
  normalizeWordKey
} from './memory-srs.js';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];

/**
 * Mengklasifikasikan seluruh kosakata berdasarkan kondisi memori aktual pengguna.
 */
export function analyzeVocabularyState(allWords = []) {
  const now = Date.now();
  const weak = [];
  const due = [];
  const learning = [];
  const mastered = [];
  const unseen = [];

  for (const item of allWords) {
    if (!item || !item.word) continue;
    const rec = getWordRecord(item);
    const merged = { ...item, memory: rec };

    if (isWeakRecord(rec)) {
      weak.push(merged);
    } else if (isDueRecord(rec, now)) {
      due.push(merged);
    } else if (isMasteredRecord(rec)) {
      mastered.push(merged);
    } else if (rec.lastReviewedAt > 0 || rec.rightCount > 0 || rec.wrongCount > 0) {
      learning.push(merged);
    } else {
      unseen.push(merged);
    }
  }

  // Urutkan kata lemah dari rasio kesalahan tertinggi & review terlama
  weak.sort((a, b) => {
    const scoreA = (a.memory.wrongCount - a.memory.rightCount) * 10 - a.memory.masteryLevel;
    const scoreB = (b.memory.wrongCount - b.memory.rightCount) * 10 - b.memory.masteryLevel;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (a.memory.lastReviewedAt || 0) - (b.memory.lastReviewedAt || 0);
  });

  // Urutkan jatuh tempo dari yang paling terlambat diulang
  due.sort((a, b) => (a.memory.nextReviewAt || 0) - (b.memory.nextReviewAt || 0));

  return {
    weak,
    due,
    learning,
    mastered,
    unseen,
    totalTracked: weak.length + due.length + learning.length + mastered.length
  };
}

/**
 * Menyusun antrean belajar adaptif:
 * - Jika pengguna punya kata yang sering salah (misal 7 kata lemah), sistem memprioritaskannya
 *   terlebih dahulu sebelum memberikan kata-kata baru.
 */
export function buildSmartWordQueue(allWords = [], sessionSize = 10) {
  const state = Store.getState();
  const userLevel = state.level || 'A1';
  const buckets = analyzeVocabularyState(allWords);
  const queue = [];
  const seenKeys = new Set();

  const pushUnique = (item, priorityReason) => {
    const k = normalizeWordKey(item.word);
    if (!k || seenKeys.has(k) || queue.length >= sessionSize) return;
    seenKeys.add(k);
    queue.push({ ...item, priorityReason });
  };

  // 1. Prioritas Utama: Semua kata lemah / sering salah (hingga kapasitas sesi)
  for (const w of buckets.weak) {
    pushUnique(w, 'weak');
  }

  // 2. Prioritas Kedua: Kata yang sudah jatuh tempo Spaced Repetition
  for (const d of buckets.due) {
    pushUnique(d, 'due');
  }

  // 3. Prioritas Ketiga: Kata yang sedang dipelajari namun belum mencapai tingkat Dikuasai
  for (const l of buckets.learning) {
    pushUnique(l, 'learning');
  }

  // 4. Prioritas Keempat: Kata baru sesuai level CEFR aktif dulu, baru level lain
  const levelMatchUnseen = buckets.unseen.filter(
    (u) => String(u.level || 'A1').toUpperCase() === userLevel.toUpperCase()
  );
  const otherUnseen = buckets.unseen.filter(
    (u) => String(u.level || 'A1').toUpperCase() !== userLevel.toUpperCase()
  );

  for (const u of [...levelMatchUnseen, ...otherUnseen]) {
    pushUnique(u, 'new');
  }

  // Jika semua kata sudah masuk kategori mastered dan sesi belum penuh, ambil yang paling lama tidak diulang
  if (queue.length < sessionSize && buckets.mastered.length > 0) {
    const oldestMastered = [...buckets.mastered].sort(
      (a, b) => (a.memory.lastReviewedAt || 0) - (b.memory.lastReviewedAt || 0)
    );
    for (const m of oldestMastered) {
      pushUnique(m, 'refresh');
    }
  }

  const counts = {
    weak: queue.filter((i) => i.priorityReason === 'weak').length,
    due: queue.filter((i) => i.priorityReason === 'due').length,
    learning: queue.filter((i) => i.priorityReason === 'learning').length,
    new: queue.filter((i) => i.priorityReason === 'new' || i.priorityReason === 'refresh').length
  };

  let focusSummary = 'Sesi adaptif siap berdasarkan riwayat memorimu.';
  if (counts.weak > 0) {
    focusSummary = `${counts.weak} kata yang masih sering salah diprioritaskan lebih dulu sebelum materi baru.`;
  } else if (counts.due > 0) {
    focusSummary = `${counts.due} kata jatuh tempo pengulangan otomatis hari ini.`;
  } else if (counts.new > 0) {
    focusSummary = `Semua kata lemah terkendali — ${counts.new} kosakata baru level ${userLevel} siap dilatih.`;
  }

  return {
    queue,
    counts,
    buckets,
    focusSummary
  };
}

/**
 * Mengidentifikasi kalimat yang sulit diucapkan dari riwayat Speak.
 */
export function getDifficultSentences(limit = 5) {
  const history = Store.getState().speechHistory || [];
  return history
    .filter((entry) => entry && (Number(entry.sentenceAccuracy) < 75 || Number(entry.pronunciation) < 75))
    .slice(-limit)
    .reverse();
}

/**
 * Menghitung level CEFR yang benar-benar dikuasai berdasarkan akurasi memori & unit selesai.
 */
export function evaluateVerifiedCefrLevel(allWords = []) {
  const state = Store.getState();
  const completedUnits = new Set(state.completedUnits || []);
  const breakdown = {};

  for (const lvl of CEFR_ORDER) {
    const levelWords = allWords.filter((w) => String(w.level || 'A1').toUpperCase() === lvl);
    const masteredInLevel = levelWords.filter((w) => isMasteredRecord(getWordRecord(w))).length;
    const ratio = levelWords.length > 0 ? Math.round((masteredInLevel / levelWords.length) * 100) : 0;
    breakdown[lvl] = {
      totalWords: levelWords.length,
      masteredWords: masteredInLevel,
      masteryPercent: ratio,
      verified: levelWords.length > 0 && ratio >= 75
    };
  }

  let verifiedLevel = 'Belum Terverifikasi';
  for (const lvl of CEFR_ORDER) {
    if (breakdown[lvl]?.verified) verifiedLevel = lvl;
    else break;
  }

  return {
    activeLevel: state.level || 'A1',
    verifiedLevel,
    completedUnitCount: completedUnits.size,
    breakdown
  };
}

/**
 * Menghasilkan 4 opsi pilihan jawaban pengecoh cerdas untuk mode pilihan cepat Active Recall.
 */
export function buildRecallOptions(targetItem, allWords = []) {
  const targetKey = normalizeWordKey(targetItem?.word);
  const pool = allWords.filter(
    (w) => w && w.word && normalizeWordKey(w.word) !== targetKey
  );
  // Prioritaskan pengecoh dengan kategori atau panjang kata mirip
  const scored = pool
    .map((w) => {
      let sim = Math.random();
      if (w.category && w.category === targetItem.category) sim += 1.5;
      if (Math.abs(w.word.length - targetItem.word.length) <= 3) sim += 0.8;
      return { item: w, sim };
    })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3)
    .map((x) => x.item);

  const options = [targetItem, ...scored];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}
