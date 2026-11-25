import { Store } from '../core/store.js';
import { analyzeVocabularyState } from './smart-engine.js?v=26';

function average(nums) {
  if (!Array.isArray(nums) || nums.length === 0) return null;
  const sum = nums.reduce((acc, n) => acc + Number(n || 0), 0);
  return Math.round(sum / nums.length);
}

function computeDelta(values) {
  if (!Array.isArray(values) || values.length < 4) return null;
  const half = Math.floor(values.length / 2);
  const older = average(values.slice(0, half));
  const newer = average(values.slice(-half));
  if (older === null || newer === null) return null;
  return newer - older;
}

function dayKeyFromTs(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Menghitung analitik kemampuan nyata berdasarkan riwayat uji tervalidasi:
 * - Vocabulary: tingkat penguasaan SRS + akurasi uji ingatan (right vs wrong).
 * - Speaking: rata-rata tertimbang 3 metrik bicara (wordMatching, sentenceAccuracy, pronunciation).
 * - Reading: skor kuis pemahaman bacaan pada Daily Brief.
 * - Listening: skor pemahaman cerita yang diputar audionya + latihan audio-only.
 */
export function computeRealLearningAnalytics(allWords = []) {
  const state = Store.getState();
  const memEntries = Object.values(state.memory || {});
  const buckets = analyzeVocabularyState(allWords);

  // 1. Vocabulary Skill
  let totalRight = 0;
  let totalWrong = 0;
  let testedWordsCount = 0;
  for (const rec of memEntries) {
    const r = Number(rec.rightCount || 0);
    const w = Number(rec.wrongCount || 0);
    totalRight += r;
    totalWrong += w;
    if (r + w > 0 || Number(rec.lastReviewedAt || 0) > 0) {
      testedWordsCount += 1;
    }
  }
  const totalVocabAttempts = totalRight + totalWrong;
  const recallAccuracy = totalVocabAttempts > 0 ? Math.round((totalRight / totalVocabAttempts) * 100) : null;
  const poolSize = Math.max(allWords.length, testedWordsCount, 1);
  const masteryWeighted = buckets.mastered.length * 1.0 + buckets.learning.length * 0.55;
  const coverageRatio = Math.min(100, Math.round((masteryWeighted / poolSize) * 100));

  const vocabScore =
    testedWordsCount === 0
      ? null
      : recallAccuracy !== null
      ? Math.round(recallAccuracy * 0.65 + coverageRatio * 0.35)
      : coverageRatio;

  // 2. Speaking Skill
  const speakTests = Array.isArray(state.analytics?.speakingTests) ? state.analytics.speakingTests : [];
  const recentSpeak = speakTests.slice(-15);
  const speakComposites = recentSpeak.map((s) =>
    Math.round(
      Number(s.sentenceAccuracy || 0) * 0.4 +
      Number(s.pronunciation || 0) * 0.4 +
      Number(s.wordMatching || 0) * 0.2
    )
  );
  const speakingScore = average(speakComposites);
  const speakingDelta = computeDelta(speakComposites);

  // 3. Reading Comprehension Skill
  const briefRecords = Object.values(state.briefHistory || {}).filter((b) => b && b.completed);
  const readingTests = Array.isArray(state.analytics?.readingTests) ? state.analytics.readingTests : [];
  const readingScores =
    readingTests.length > 0
      ? readingTests.slice(-15).map((r) => Number(r.score || 0))
      : briefRecords.map((b) => Number(b.scorePercent || 0));
  const readingScore = average(readingScores);
  const readingDelta = computeDelta(readingScores);

  // 4. Listening Comprehension Skill
  const listeningTests = Array.isArray(state.analytics?.listeningTests) ? state.analytics.listeningTests : [];
  const listenedBriefScores = briefRecords
    .filter((b) => Boolean(b.listened))
    .map((b) => Number(b.scorePercent || 0));
  const listeningScores =
    listeningTests.length > 0
      ? listeningTests.slice(-15).map((l) => Number(l.score || 0))
      : listenedBriefScores;
  const listeningScore = average(listeningScores);
  const listeningDelta = computeDelta(listeningScores);

  const skills = [
    {
      key: 'vocabulary',
      label: 'Vocabulary',
      targetTab: 'word',
      score: vocabScore,
      samples: totalVocabAttempts,
      delta: null,
      detail:
        testedWordsCount === 0
          ? 'Belum ada kata yang diuji'
          : `${buckets.mastered.length} dikuasai • akurasi ${recallAccuracy ?? 0}%`
    },
    {
      key: 'speaking',
      label: 'Speaking',
      targetTab: 'speak',
      score: speakingScore,
      samples: speakTests.length,
      delta: speakingDelta,
      detail:
        speakTests.length === 0
          ? 'Belum ada rekaman uji bicara'
          : `${speakTests.length} percobaan • susunan & pelafalan`
    },
    {
      key: 'reading',
      label: 'Reading',
      targetTab: 'brief',
      score: readingScore,
      samples: readingScores.length,
      delta: readingDelta,
      detail:
        readingScores.length === 0
          ? 'Belum ada kuis bacaan selesai'
          : `${briefRecords.length} cerita tervalidasi`
    },
    {
      key: 'listening',
      label: 'Listening',
      targetTab: 'brief',
      score: listeningScore,
      samples: listeningScores.length,
      delta: listeningDelta,
      detail:
        listeningScores.length === 0
          ? 'Putar audio cerita lalu jawab kuis'
          : `${listeningScores.length} sesi audio + pemahaman`
    }
  ];

  const testedSkills = skills.filter((s) => typeof s.score === 'number');
  const overallScore = testedSkills.length > 0 ? average(testedSkills.map((s) => s.score)) : null;

  // Estimasi kesiapan CEFR hanya meningkat jika skor uji nyata memenuhi ambang
  let estimatedCEFR = state.level || 'A1';
  if (overallScore !== null && testedSkills.length >= 2) {
    if (overallScore >= 85 && testedSkills.length >= 3) estimatedCEFR = 'B2';
    else if (overallScore >= 72) estimatedCEFR = 'B1';
    else if (overallScore >= 55) estimatedCEFR = 'A2';
    else estimatedCEFR = 'A1';
  }

  // Tentukan langkah berikutnya yang paling berdampak
  let nextAction = {
    title: 'Mulai Uji Ingatan Kosakata',
    reason: 'Uji 5 kata pertama tanpa melihat arti untuk memetakan daya ingat awalmu.',
    cta: 'Buka Word',
    targetTab: 'word'
  };

  if (buckets.weak.length > 0 || buckets.due.length > 0) {
    const priorityTotal = buckets.weak.length + buckets.due.length;
    nextAction = {
      title: `Ulangi ${priorityTotal} Kata Prioritas`,
      reason:
        buckets.weak.length > 0
          ? `Ada ${buckets.weak.length} kata lemah yang perlu diperkuat sebelum lupa.`
          : `Ada ${buckets.due.length} kartu SRS yang sudah jatuh tempo hari ini.`,
      cta: 'Latih Kata',
      targetTab: 'word'
    };
  } else if (speakingScore === null || speakingScore < 75) {
    nextAction = {
      title: speakingScore === null ? 'Uji Pelafalan & Susunan Kalimat' : 'Perbaiki Akurasi Bicara',
      reason:
        speakingScore === null
          ? 'Rekam 1 kalimat untuk mengukur Word Matching, Sentence Order, dan Pronunciation.'
          : `Skor bicara rata-rata masih ${speakingScore}%. Latih pengucapan kalimat target.`,
      cta: 'Buka Speak',
      targetTab: 'speak'
    };
  } else if (readingScore === null || readingScore < 80) {
    nextAction = {
      title: 'Baca & Dengarkan Daily Brief',
      reason: 'Latih pemahaman konteks dan simpan kosakata baru langsung ke sistem SRS.',
      cta: 'Buka Brief',
      targetTab: 'brief'
    };
  }

  // Konsistensi 7 hari terakhir dari timestamp tervalidasi
  const dayCounts = {};
  for (const rec of memEntries) {
    if (rec.lastReviewedAt) {
      const k = dayKeyFromTs(rec.lastReviewedAt);
      dayCounts[k] = (dayCounts[k] || 0) + 1;
    }
  }
  for (const sp of speakTests) {
    if (sp.ts) {
      const k = dayKeyFromTs(sp.ts);
      dayCounts[k] = (dayCounts[k] || 0) + 1;
    }
  }
  for (const br of briefRecords) {
    if (br.ts) {
      const k = dayKeyFromTs(br.ts);
      dayCounts[k] = (dayCounts[k] || 0) + 1;
    }
  }

  const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const weeklyActivity = [];
  const now = new Date();
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = dayKeyFromTs(d.getTime());
    weeklyActivity.push({
      dateKey: key,
      dayLabel: dayNames[d.getDay()],
      count: dayCounts[key] || 0,
      isToday: offset === 0
    });
  }

  const totalVerifiedTests =
    totalVocabAttempts + speakTests.length + readingScores.length;

  return {
    skills,
    overallScore,
    estimatedCEFR,
    recallAccuracy,
    totalVerifiedTests,
    buckets,
    nextAction,
    weeklyActivity
  };
}

export function exportProgressSnapshot() {
  const payload = {
    app: 'Begin English Learning PWA',
    exportedAt: new Date().toISOString(),
    schemaVersion: 4,
    state: Store.getState()
  };
  return JSON.stringify(payload, null, 2);
}

export function importProgressSnapshot(rawJsonText) {
  try {
    const parsed = JSON.parse(String(rawJsonText || ''));
    const incoming = parsed && typeof parsed === 'object' && parsed.state ? parsed.state : parsed;
    if (!incoming || typeof incoming !== 'object') {
      return { ok: false, message: 'Format berkas JSON tidak dikenali.' };
    }
    const validMarkers = ['xp', 'level', 'vocabMemory', 'speechHistory', 'briefHistory', 'analytics'];
    const hasMarker = validMarkers.some((k) => Object.prototype.hasOwnProperty.call(incoming, k));
    if (!hasMarker) {
      return { ok: false, message: 'Berkas JSON tidak berisi data progres Begin.' };
    }
    localStorage.setItem('begin_app_state_v4', JSON.stringify(incoming));
    Store.state = Store._load();
    Store._save();
    return { ok: true, message: 'Progres berhasil dipulihkan!' };
  } catch {
    return { ok: false, message: 'Gagal membaca JSON. Pastikan berkas tidak rusak.' };
  }
}
