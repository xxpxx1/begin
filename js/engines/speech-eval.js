export function normalizeSpeechTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function charSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return Math.max(0, 1 - dp[m][n] / Math.max(m, n, 1));
}

function computeLCSLength(seqA, seqB) {
  const m = seqA.length;
  const n = seqB.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (seqA[i - 1] === seqB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Memisahkan evaluasi bicara menjadi 3 metrik independen:
 * 1. wordMatching: kelengkapan kata target (multiset, bukan Set biasa).
 * 2. sentenceAccuracy: ketepatan susunan sintaksis (LCS + penalti kata berlebih).
 * 3. pronunciation: kepercayaan fonetik engine STT + kemiripan akustik-ortografis per kata.
 */
export function evaluateSpeechAttempt({ targetText, transcript, confidence = null }) {
  const rawTargetWords = String(targetText || '').trim().split(/\s+/).filter(Boolean);
  const targetTokens = normalizeSpeechTokens(targetText);
  const spokenTokens = normalizeSpeechTokens(transcript);

  if (targetTokens.length === 0 || spokenTokens.length === 0) {
    return {
      wordMatching: 0,
      sentenceAccuracy: 0,
      pronunciation: 0,
      hasNativeConfidence: false,
      wordBreakdown: rawTargetWords.map((w) => ({ target: w, status: 'missing', spokenMatch: '' })),
      extraWords: spokenTokens
    };
  }

  // 1. Word Matching (menghitung frekuensi kata agar duplikasi tidak dimanipulasi)
  const remainingSpoken = [...spokenTokens];
  let exactWordHits = 0;
  let phoneticSum = 0;

  const tentativeMatches = targetTokens.map((tTok, idx) => {
    const exactIdx = remainingSpoken.indexOf(tTok);
    if (exactIdx !== -1) {
      remainingSpoken.splice(exactIdx, 1);
      exactWordHits += 1;
      phoneticSum += 1;
      return { raw: rawTargetWords[idx] || tTok, token: tTok, status: 'matched', spokenMatch: tTok };
    }
    // Cari kata terdekat secara fonetik/ejaan pada sisa ucapan
    let bestSim = 0;
    let bestIdx = -1;
    for (let j = 0; j < remainingSpoken.length; j++) {
      const sim = charSimilarity(tTok, remainingSpoken[j]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = j;
      }
    }
    if (bestSim >= 0.65 && bestIdx !== -1) {
      const nearWord = remainingSpoken.splice(bestIdx, 1)[0];
      phoneticSum += bestSim;
      return { raw: rawTargetWords[idx] || tTok, token: tTok, status: 'near', spokenMatch: nearWord };
    }
    return { raw: rawTargetWords[idx] || tTok, token: tTok, status: 'missing', spokenMatch: '' };
  });

  const wordMatching = Math.round((exactWordHits / targetTokens.length) * 100);

  // 2. Sentence Accuracy (LCS menjaga urutan kata: "English learn want I" -> ~25%, bukan 100%)
  const lcsLen = computeLCSLength(targetTokens, spokenTokens);
  const recallOrder = lcsLen / targetTokens.length;
  const precisionOrder = lcsLen / Math.max(spokenTokens.length, targetTokens.length);
  const f1Order = recallOrder + precisionOrder > 0
    ? (2 * recallOrder * precisionOrder) / (recallOrder + precisionOrder)
    : 0;
  const sentenceAccuracy = Math.round(f1Order * 100);

  // Tandai kata yang sebenarnya terucap tetapi posisinya terbalik/salah urutan
  const lcsSetTokens = [];
  {
    let i = targetTokens.length;
    let j = spokenTokens.length;
    const dp = Array.from({ length: i + 1 }, () => new Array(j + 1).fill(0));
    for (let a = 1; a <= i; a++) {
      for (let b = 1; b <= j; b++) {
        dp[a][b] = targetTokens[a - 1] === spokenTokens[b - 1]
          ? dp[a - 1][b - 1] + 1
          : Math.max(dp[a - 1][b], dp[a][b - 1]);
      }
    }
    while (i > 0 && j > 0) {
      if (targetTokens[i - 1] === spokenTokens[j - 1]) {
        lcsSetTokens.unshift(targetTokens[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
  }

  let lcsCursor = 0;
  const wordBreakdown = tentativeMatches.map((m) => {
    if (m.status === 'matched') {
      if (lcsSetTokens[lcsCursor] === m.token) {
        lcsCursor += 1;
        return { target: m.raw, status: 'matched', spokenMatch: m.spokenMatch };
      }
      return { target: m.raw, status: 'order', spokenMatch: m.spokenMatch };
    }
    return { target: m.raw, status: m.status, spokenMatch: m.spokenMatch };
  });

  // 3. Pronunciation Assessment (engine confidence + akurasi fonetik token)
  const phoneticRatio = phoneticSum / targetTokens.length;
  const hasNativeConfidence = typeof confidence === 'number' && confidence > 0 && confidence <= 1;
  const pronunciation = hasNativeConfidence
    ? Math.round((confidence * 0.65 + phoneticRatio * 0.35) * 100)
    : Math.round(phoneticRatio * 100);

  return {
    wordMatching,
    sentenceAccuracy,
    pronunciation: Math.min(100, Math.max(0, pronunciation)),
    hasNativeConfidence,
    wordBreakdown,
    extraWords: remainingSpoken
  };
}

/**
 * Pengontrol perekaman suara lokal (MediaRecorder) untuk pemutaran ulang & perbandingan A/B.
 */
export class AudioRecorderController {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.lastAudioUrl = '';
    this.isRecording = false;
  }

  static isSupported() {
    return Boolean(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window !== 'undefined' &&
      typeof window.MediaRecorder !== 'undefined'
    );
  }

  async start() {
    if (!AudioRecorderController.isSupported()) {
      return { ok: false, reason: 'unsupported' };
    }
    try {
      this.stopStream();
      this.chunks = [];
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
      };
      this.mediaRecorder.start();
      this.isRecording = true;
      return { ok: true };
    } catch {
      this.isRecording = false;
      return { ok: false, reason: 'permission_denied' };
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        this.stopStream();
        resolve(this.lastAudioUrl || '');
        return;
      }
      this.mediaRecorder.onstop = () => {
        if (this.lastAudioUrl) {
          try { URL.revokeObjectURL(this.lastAudioUrl); } catch {}
        }
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mimeType });
        this.lastAudioUrl = blob.size > 0 ? URL.createObjectURL(blob) : '';
        this.isRecording = false;
        this.stopStream();
        resolve(this.lastAudioUrl);
      };
      try {
        this.mediaRecorder.stop();
      } catch {
        this.isRecording = false;
        this.stopStream();
        resolve(this.lastAudioUrl || '');
      }
    });
  }

  stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      this.stream = null;
    }
  }
}
