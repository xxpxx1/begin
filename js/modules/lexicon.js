import { Store } from '../core/store.js';
import { escapeHTML } from '../core/security.js';
import {
  getWordRecord,
  getMasteryMeta,
  isWeakRecord,
  isDueRecord,
  isMasteredRecord,
  previewNextIntervals,
  recordWordReview,
  savePersonalExample,
  evaluateRecallAnswer,
  normalizeWordKey
} from '../engines/memory-srs.js?v=30';
import {
  analyzeVocabularyState,
  buildSmartWordQueue,
  buildRecallOptions
} from '../engines/smart-engine.js?v=30';

let externalDictData = null;

const FALLBACK_WORDS = [
  { word: 'No cap', phonetic: '/noʊ kæp/', category: 'Slang', level: 'A2', meaning: 'Serius / tidak bohong (beneran)', example: 'That new update is super fast, no cap.', collocations: ['for real, no cap'] },
  { word: 'Figure out', phonetic: '/ˈfɪɡjər aʊt/', category: 'Phrasal Verb', level: 'B1', meaning: 'Memahami atau menemukan solusi', example: 'We need to figure out why the request failed.', collocations: ['figure out a way'] },
  { word: 'Keep up with', phonetic: '/kiːp ʌp wɪð/', category: 'Phrasal Verb', level: 'B1', meaning: 'Mengikuti perkembangan terbaru', example: 'She reads daily articles to keep up with technology.', collocations: ['keep up with trends'] },
  { word: 'Straightforward', phonetic: '/ˌstreɪtˈfɔːrwərd/', category: 'Adjective', level: 'B1', meaning: 'Sederhana, jelas, dan mudah dipahami', example: 'The installation steps are very straightforward.', collocations: ['straightforward process'] },
  { word: 'Catch up', phonetic: '/kætʃ ʌp/', category: 'Phrasal Verb', level: 'A2', meaning: 'Mengejar ketertinggalan / bertukar kabar', example: 'Let us grab coffee and catch up this weekend.', collocations: ['catch up soon'] },
  { word: 'Take for granted', phonetic: '/teɪk fɔːr ˈɡræntɪd/', category: 'Idiom', level: 'B2', meaning: 'Menganggap remeh sesuatu yang sudah dimiliki', example: 'People often take clean water for granted.', collocations: ['take it for granted'] }
];

function extractWordsFromSource(src) {
  const collected = [];
  if (!src || typeof src !== 'object') return collected;
  const list = Array.isArray(src) ? src : Array.isArray(src.words) ? src.words : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.word === 'string' && typeof item.meaning === 'string') {
      const rawPos = String(item.pos || item.category || item.tag || 'Vocabulary').trim();
      const catLabel = rawPos ? rawPos.charAt(0).toUpperCase() + rawPos.slice(1) : 'Vocabulary';
      collected.push({
        word: item.word.trim(),
        phonetic: item.phonetic || item.ipa || '',
        category: catLabel,
        topic: item.topic || '',
        level: String(item.level || item.cefr || 'A1').toUpperCase(),
        meaning: item.meaning.trim(),
        example: item.example || item.sentence || '',
        collocations: Array.isArray(item.collocations)
          ? item.collocations.filter((c) => c && c !== '—' && c !== '-')
          : []
      });
    }
  }
  return collected;
}

export function getAllVocabularyPool() {
  const raw = [
    ...extractWordsFromSource(externalDictData),
    ...FALLBACK_WORDS
  ];
  const seen = new Set();
  const unique = [];
  for (const w of raw) {
    const k = normalizeWordKey(w.word);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    unique.push(w);
  }
  return unique;
}

function speakWordAudio(text, rateOverride = null) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(String(text));
    utter.lang = 'en-US';
    const st = Store.getState();
    utter.rate = rateOverride ?? st.voiceRate ?? 1.0;
    if (st.voiceURI) {
      const found = window.speechSynthesis.getVoices().find((v) => v.voiceURI === st.voiceURI);
      if (found) utter.voice = found;
    }
    window.speechSynthesis.speak(utter);
  } catch {}
}

function svgIcon(name) {
  const icons = {
    brain: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/></svg>',
    cards: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="14" height="16" rx="3"/><path d="M7 3h12a2 2 0 0 1 2 2v14"/></svg>',
    recall: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    list: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    volume: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    refresh: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
  };
  return icons[name] || '';
}

function maskTargetInSentence(sentence, targetWord) {
  if (!sentence || !targetWord) return '';
  const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped, 'gi');
  return escapeHTML(sentence).replace(rx, '________');
}

function formatDueText(rec) {
  if (!rec || !rec.lastReviewedAt) return 'Belum diuji';
  const diff = (rec.nextReviewAt || 0) - Date.now();
  if (diff <= 0) return 'Jatuh tempo sekarang';
  const hours = Math.round(diff / (60 * 60 * 1000));
  if (hours < 24) return `Ulang ${hours} jam lagi`;
  return `Ulang ${Math.round(hours / 24)} hari lagi`;
}

const uiState = {
  subTab: 'flashcard',
  deckFilter: 'ALL', // 'ALL' | 'A1' | 'A2' | 'B1' | 'B2' | 'SLANG'
  queue: [],
  cursor: 0,
  revealed: false,
  recallMode: 'type', // 'type' | 'choice' | 'cloze'
  recallAudioOnly: false,
  recallFeedback: null,
  recallDraft: '',
  bankFilter: 'all',
  bankLevelFilter: 'ALL',
  bankSearch: '',
  editingWordKey: null
};

function filterByDeckTag(words, tag) {
  if (!tag || tag === 'ALL') return words;
  if (tag === 'SLANG') {
    const slangs = words.filter((w) => String(w.category || '').toLowerCase().includes('slang'));
    return slangs.length ? slangs : words;
  }
  const byLvl = words.filter((w) => String(w.level || '').toUpperCase() === tag);
  return byLvl.length ? byLvl : words;
}

function ensureSessionQueue(allWords, forceRebuild = false) {
  if (forceRebuild || uiState.queue.length === 0) {
    const scopedPool = filterByDeckTag(allWords, uiState.deckFilter);
    const built = buildSmartWordQueue(scopedPool, 10);
    uiState.queue = built.queue;
    uiState.cursor = 0;
    uiState.revealed = false;
    uiState.recallFeedback = null;
    uiState.recallDraft = '';
  }
}

function requeueCurrentCard() {
  if (uiState.queue.length <= 1) return;
  const current = uiState.queue[uiState.cursor];
  const insertAt = Math.min(uiState.queue.length, uiState.cursor + 3);
  uiState.queue.splice(insertAt, 0, { ...current, priorityReason: 'requeue' });
}

function advanceCard() {
  uiState.revealed = false;
  uiState.recallFeedback = null;
  uiState.recallDraft = '';
  uiState.cursor += 1;
}

function renderBankResultsHTML(allWords) {
  const q = uiState.bankSearch.trim().toLowerCase();
  const filtered = allWords
    .map((w) => ({ ...w, memory: getWordRecord(w) }))
    .filter((w) => {
      if (
        q &&
        !w.word.toLowerCase().includes(q) &&
        !w.meaning.toLowerCase().includes(q) &&
        !String(w.topic || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      if (uiState.bankLevelFilter !== 'ALL') {
        if (uiState.bankLevelFilter === 'SLANG') {
          if (!String(w.category || '').toLowerCase().includes('slang')) return false;
        } else if (String(w.level || '').toUpperCase() !== uiState.bankLevelFilter) {
          return false;
        }
      }
      if (uiState.bankFilter === 'weak') return isWeakRecord(w.memory);
      if (uiState.bankFilter === 'due') return isDueRecord(w.memory);
      if (uiState.bankFilter === 'mastered') return isMasteredRecord(w.memory);
      if (uiState.bankFilter === 'personal') return Boolean(w.memory.personalExample);
      return true;
    });

  if (filtered.length === 0) {
    return `<div class="mem-card" style="text-align:center;color:var(--text-secondary,#64748B);font-size:13.5px;">
      Tidak ada kosakata yang cocok dengan pencarian "${escapeHTML(uiState.bankSearch)}".
    </div>`;
  }

  const shown = filtered.slice(0, 80);
  const countBanner = `<div style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748B);padding:0 2px;">
    Menampilkan ${shown.length} dari ${filtered.length} kosakata
  </div>`;

  return (
    countBanner +
    shown
      .map((item) => {
        const meta = getMasteryMeta(item.memory);
        const wKey = normalizeWordKey(item.word);
        const isEditing = uiState.editingWordKey === wKey;
        return `
          <div class="mem-dict-item">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
              <div>
                <div style="font-size:16px;font-weight:800;">
                  ${escapeHTML(item.word)}
                  <span style="font-size:12px;font-weight:500;color:var(--text-secondary,#64748B);">${escapeHTML(item.phonetic || '')}</span>
                </div>
                <div style="font-size:13.5px;color:var(--ios-blue,#1A6DFF);font-weight:600;">${escapeHTML(item.meaning)}</div>
              </div>
              <span class="mem-badge tone-${meta.tone}">${escapeHTML(meta.label)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary,#64748B);font-variant-numeric:tabular-nums;">
              ${escapeHTML(item.level || 'A1')} • ${escapeHTML(item.category || 'Vocabulary')}${item.topic ? ` (${escapeHTML(item.topic)})` : ''} • ${item.memory.rightCount} benar / ${item.memory.wrongCount} salah • ${formatDueText(item.memory)}
            </div>
            ${
              item.example
                ? `<div style="font-size:12.5px;color:var(--text-secondary,#475569);font-style:italic;">"${escapeHTML(item.example)}"</div>`
                : ''
            }
            ${
              item.memory.personalExample
                ? `<div style="font-size:12.5px;padding:8px 10px;border-radius:10px;background:rgba(151,125,255,0.12);">
                    <strong>Kalimatmu:</strong> "${escapeHTML(item.memory.personalExample)}"
                  </div>`
                : ''
            }
            ${
              isEditing
                ? `<div style="display:flex;gap:6px;margin-top:4px;">
                    <input type="text" class="mem-input" id="bankPersonal-${escapeHTML(wKey)}" placeholder="Tulis contoh kalimat personal..." value="${escapeHTML(item.memory.personalExample || '')}" />
                    <button type="button" class="mem-btn mem-btn-primary" data-mem-bank-save="${escapeHTML(item.word)}">Simpan</button>
                  </div>`
                : `<div style="display:flex;gap:8px;margin-top:2px;flex-wrap:wrap;">
                    <button type="button" class="mem-btn mem-btn-ghost" style="min-height:36px;font-size:12px;" data-mem-bank-speak="${escapeHTML(item.word)}">${svgIcon('volume')} Dengar</button>
                    <button type="button" class="mem-btn mem-btn-ghost" style="min-height:36px;font-size:12px;" data-mem-bank-slow="${escapeHTML(item.word)}">0.75x</button>
                    <button type="button" class="mem-btn mem-btn-ghost" style="min-height:36px;font-size:12px;" data-mem-bank-edit="${escapeHTML(wKey)}">Kalimat Personal</button>
                    <button type="button" class="mem-btn mem-btn-primary" style="min-height:36px;font-size:12px;" data-mem-bank-drill="${escapeHTML(item.word)}">Latih</button>
                  </div>`
            }
          </div>
        `;
      })
      .join('')
  );
}

export function renderLexicon(containerEl) {
  const root =
    (containerEl && containerEl.nodeType === 1 ? containerEl : null) ||
    document.getElementById('lexiconContainer') ||
    document.getElementById('lexiconList') ||
    document.getElementById('view-words');

  if (!root) return;

  const allWords = getAllVocabularyPool();
  const buckets = analyzeVocabularyState(allWords);
  const smartPlan = buildSmartWordQueue(filterByDeckTag(allWords, uiState.deckFilter), 10);
  ensureSessionQueue(allWords, false);

  const currentItem = uiState.queue[uiState.cursor] || null;
  const currentRec = currentItem ? getWordRecord(currentItem) : null;
  const masteryMeta = currentRec ? getMasteryMeta(currentRec) : null;

  const deckFilterChips = ['ALL', 'A1', 'A2', 'B1', 'B2', 'SLANG']
    .map(
      (tag) =>
        `<button type="button" class="mem-filter-chip ${uiState.deckFilter === tag ? 'active' : ''}" data-mem-deck="${tag}">${tag === 'ALL' ? `Semua (${allWords.length})` : tag}</button>`
    )
    .join('');

  let bodyHTML = '';

  if (uiState.subTab === 'flashcard') {
    if (!currentItem) {
      bodyHTML = `
        <div class="mem-card" style="text-align:center;">
          <div class="mem-badge tone-success" style="margin:0 auto 10px;">${svgIcon('check')} Sesi Memori Selesai</div>
          <div class="mem-word-title" style="font-size:20px;">Semua Kartu Sesi Ini Telah Diulang</div>
          <p class="mem-phonetic">Kata yang masih lemah otomatis dijadwalkan ulang oleh Smart Engine.</p>
          <button type="button" class="mem-btn mem-btn-primary" data-mem-action="new-session">
            ${svgIcon('refresh')} Mulai Sesi Prioritas Berikutnya
          </button>
        </div>
      `;
    } else {
      const intervals = previewNextIntervals(currentRec);
      const priorityBadge =
        currentItem.priorityReason === 'weak'
          ? '<span class="mem-badge tone-danger">Prioritas Kata Lemah</span>'
          : currentItem.priorityReason === 'requeue'
          ? '<span class="mem-badge tone-warning">Pengulangan Sesi</span>'
          : currentItem.priorityReason === 'due'
          ? '<span class="mem-badge tone-warning">Jatuh Tempo SRS</span>'
          : `<span class="mem-badge tone-info">${escapeHTML(currentItem.level || 'A1')}</span>`;

      const meterBars = [1, 2, 3, 4]
        .map((n) => `<div class="mem-meter-seg ${currentRec.masteryLevel >= n ? 'filled' : ''}"></div>`)
        .join('');

      const collocs = Array.isArray(currentItem.collocations) ? currentItem.collocations : [];

      bodyHTML = `
        <div class="mem-filter-row" style="margin-bottom:2px;">${deckFilterChips}</div>
        <div class="mem-card">
          <div class="mem-card-top">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              ${priorityBadge}
              <span class="mem-badge tone-${masteryMeta.tone}">${escapeHTML(masteryMeta.label)}</span>
            </div>
            <span style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748B);">
              ${uiState.cursor + 1} / ${uiState.queue.length}
            </span>
          </div>

          <div class="mem-meter" aria-label="Tingkat penguasaan kata">${meterBars}</div>

          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div>
              <div class="mem-word-title">${escapeHTML(currentItem.word)}</div>
              <div class="mem-phonetic">
                ${escapeHTML(currentItem.phonetic || '/—/')} • ${escapeHTML(currentItem.category || 'Vocabulary')}
                ${currentRec.rightCount + currentRec.wrongCount > 0 ? ` • ${currentRec.rightCount} benar / ${currentRec.wrongCount} salah` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button type="button" class="mem-btn mem-btn-ghost" data-mem-action="speak-word" aria-label="Dengar pelafalan normal">
                ${svgIcon('volume')}
              </button>
              <button type="button" class="mem-btn mem-btn-ghost" style="padding:0 10px;font-size:12px;" data-mem-action="speak-word-slow" aria-label="Dengar pelafalan lambat">
                0.75x
              </button>
            </div>
          </div>

          ${
            !uiState.revealed
              ? `<button type="button" class="mem-btn mem-btn-primary" style="width:100%;margin-top:8px;" data-mem-action="reveal-card">
                  Uji Ingatanmu Dulu — Buka Arti &amp; Nilai
                </button>`
              : `
                <div class="mem-reveal-box">
                  <div style="font-size:16px;font-weight:800;color:var(--ios-blue,#1A6DFF);margin-bottom:6px;">
                    ${escapeHTML(currentItem.meaning)}
                  </div>
                  ${
                    currentItem.example
                      ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13.5px;line-height:1.45;">
                          <span>"${escapeHTML(currentItem.example)}"</span>
                          <button type="button" class="mem-btn mem-btn-ghost" style="min-height:34px;padding:6px 10px;" data-mem-action="speak-example" aria-label="Dengar contoh kalimat">
                            ${svgIcon('volume')}
                          </button>
                        </div>`
                      : ''
                  }
                  ${
                    collocs.length > 0
                      ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                          <span style="font-size:11px;font-weight:700;color:var(--text-secondary,#64748B);">Frasa umum:</span>
                          ${collocs.map((c) => `<span class="mem-badge tone-info">${escapeHTML(c)}</span>`).join('')}
                        </div>`
                      : ''
                  }
                </div>

                <div class="mem-personal-box">
                  <div style="font-size:11.5px;font-weight:700;color:var(--text-secondary,#64748B);margin-bottom:6px;">
                    CONTOH KALIMAT PERSONALMU
                  </div>
                  <div style="display:flex;gap:6px;">
                    <input
                      type="text"
                      id="memPersonalInput"
                      class="mem-input"
                      placeholder="Tulis kalimatmu sendiri memakai kata ini..."
                      value="${escapeHTML(currentRec.personalExample || '')}"
                    />
                    <button type="button" class="mem-btn mem-btn-primary" data-mem-action="save-personal">
                      Simpan
                    </button>
                  </div>
                </div>

                <div style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748B);margin-top:14px;">
                  Seberapa kuat ingatanmu pada kata ini?
                </div>
                <div class="mem-srs-grid">
                  <button type="button" class="mem-srs-btn q-1" data-mem-rate="1">Lupa<span>${intervals.again}</span></button>
                  <button type="button" class="mem-srs-btn q-2" data-mem-rate="2">Sulit<span>${intervals.hard}</span></button>
                  <button type="button" class="mem-srs-btn q-3" data-mem-rate="3">Ingat<span>${intervals.good}</span></button>
                  <button type="button" class="mem-srs-btn q-4" data-mem-rate="4">Hafal<span>${intervals.easy}</span></button>
                </div>
              `
          }
        </div>
      `;
    }
  } else if (uiState.subTab === 'recall') {
    if (!currentItem) {
      bodyHTML = `
        <div class="mem-card" style="text-align:center;">
          <div class="mem-badge tone-success" style="margin:0 auto 10px;">${svgIcon('check')} Uji Ingatan Selesai</div>
          <div class="mem-word-title" style="font-size:20px;">Latihan Tanpa Melihat Jawaban Selesai</div>
          <p class="mem-phonetic">Kata yang salah tadi otomatis masuk antrean prioritas besok.</p>
          <button type="button" class="mem-btn mem-btn-primary" data-mem-action="new-session">
            ${svgIcon('refresh')} Latih Ulang Sesi Baru
          </button>
        </div>
      `;
    } else {
      const hintSentence = currentRec.personalExample || currentItem.example;
      const masked = maskTargetInSentence(hintSentence, currentItem.word);
      const choices = uiState.recallMode === 'choice' ? buildRecallOptions(currentItem, allWords) : [];
      const isCloze = uiState.recallMode === 'cloze';

      bodyHTML = `
        <div class="mem-card">
          <div class="mem-card-top">
            <span class="mem-badge tone-info">${isCloze ? 'Kalimat Rumpang (Cloze)' : 'Uji Ingatan Aktif'}</span>
            <span style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748B);">
              ${uiState.cursor + 1} / ${uiState.queue.length}
            </span>
          </div>

          <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
            <button type="button" class="mem-filter-chip ${uiState.recallMode === 'type' ? 'active' : ''}" data-mem-recall-mode="type">
              Ketik Jawaban
            </button>
            <button type="button" class="mem-filter-chip ${uiState.recallMode === 'cloze' ? 'active' : ''}" data-mem-recall-mode="cloze">
              Kalimat Rumpang
            </button>
            <button type="button" class="mem-filter-chip ${uiState.recallMode === 'choice' ? 'active' : ''}" data-mem-recall-mode="choice">
              Pilihan Cepat
            </button>
            <button type="button" class="mem-filter-chip ${uiState.recallAudioOnly ? 'active' : ''}" data-mem-action="toggle-audio-only">
              Mode Audio
            </button>
          </div>

          ${
            uiState.recallAudioOnly
              ? `<div style="padding:14px;border-radius:14px;background:rgba(151,125,255,0.12);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
                  <span style="font-size:13.5px;font-weight:700;">Dengarkan audio lalu tulis kata bahasa Inggrisnya:</span>
                  <button type="button" class="mem-btn mem-btn-primary" data-mem-action="speak-word">
                    ${svgIcon('volume')} Putar
                  </button>
                </div>`
              : isCloze
              ? `<div style="margin-bottom:12px;">
                  <div style="font-size:11.5px;font-weight:700;color:var(--text-secondary,#64748B);margin-bottom:4px;">LENGKAPI KALIMAT KONTEKS</div>
                  <div style="font-size:16.5px;font-weight:800;color:var(--text-primary,#0F172A);line-height:1.45;">
                    "${masked || `Petunjuk arti: ${escapeHTML(currentItem.meaning)}`}"
                  </div>
                  <div style="font-size:13px;color:var(--ios-blue,#1A6DFF);font-weight:600;margin-top:6px;">
                    Arti kata: ${escapeHTML(currentItem.meaning)}
                  </div>
                </div>`
              : `<div style="margin-bottom:12px;">
                  <div style="font-size:11.5px;font-weight:700;color:var(--text-secondary,#64748B);margin-bottom:4px;">ARTI BAHASA INDONESIA</div>
                  <div style="font-size:18px;font-weight:800;color:var(--text-primary,#0F172A);">${escapeHTML(currentItem.meaning)}</div>
                  ${masked ? `<div style="font-size:13px;color:var(--text-secondary,#475569);margin-top:6px;">Konteks: "${masked}"</div>` : ''}
                </div>`
          }

          ${
            !uiState.recallFeedback
              ? uiState.recallMode !== 'choice'
                ? `<div style="display:flex;gap:8px;">
                    <input
                      type="text"
                      id="memRecallInput"
                      class="mem-input"
                      autocomplete="off"
                      autocapitalize="none"
                      spellcheck="false"
                      placeholder="Ketik kata bahasa Inggris..."
                      value="${escapeHTML(uiState.recallDraft)}"
                    />
                    <button type="button" class="mem-btn mem-btn-primary" data-mem-action="submit-recall">Periksa</button>
                  </div>`
                : `<div class="mem-choice-grid">
                    ${choices
                      .map(
                        (opt) =>
                          `<button type="button" class="mem-choice-btn" data-mem-choice="${escapeHTML(opt.word)}">${escapeHTML(opt.word)}</button>`
                      )
                      .join('')}
                  </div>`
              : `
                <div class="mem-reveal-box" style="border-color:${uiState.recallFeedback.passed ? 'rgba(5,150,105,0.35)' : 'rgba(220,38,38,0.35)'};">
                  <div style="font-size:14px;font-weight:800;color:${uiState.recallFeedback.passed ? '#059669' : '#DC2626'};margin-bottom:4px;">
                    ${escapeHTML(uiState.recallFeedback.headline)}
                  </div>
                  <div style="font-size:15px;font-weight:800;">
                    Jawaban benar: ${escapeHTML(currentItem.word)} <span style="font-weight:500;opacity:0.8;">${escapeHTML(currentItem.phonetic || '')}</span>
                  </div>
                  <div style="font-size:13px;margin-top:4px;">${escapeHTML(currentItem.meaning)}</div>
                  <div style="display:flex;gap:8px;margin-top:12px;">
                    <button type="button" class="mem-btn mem-btn-ghost" data-mem-action="speak-word">${svgIcon('volume')} Dengar</button>
                    <button type="button" class="mem-btn mem-btn-primary" style="flex:1;" data-mem-action="next-recall">Kartu Berikutnya</button>
                  </div>
                </div>
              `
          }
        </div>
      `;
    }
  } else {
    const personalCount = allWords.filter((w) => Boolean(getWordRecord(w).personalExample)).length;

    bodyHTML = `
      <input
        type="search"
        id="memBankSearch"
        class="mem-input"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        placeholder="Cari kata, arti, atau topik (mis. cow, slang)..."
        value="${escapeHTML(uiState.bankSearch)}"
      />
      <div class="mem-filter-row">
        <button type="button" class="mem-filter-chip ${uiState.bankFilter === 'all' ? 'active' : ''}" data-mem-filter="all">Semua (${allWords.length})</button>
        <button type="button" class="mem-filter-chip ${uiState.bankFilter === 'weak' ? 'active' : ''}" data-mem-filter="weak">Lemah (${buckets.weak.length})</button>
        <button type="button" class="mem-filter-chip ${uiState.bankFilter === 'due' ? 'active' : ''}" data-mem-filter="due">Jatuh Tempo (${buckets.due.length})</button>
        <button type="button" class="mem-filter-chip ${uiState.bankFilter === 'mastered' ? 'active' : ''}" data-mem-filter="mastered">Dikuasai (${buckets.mastered.length})</button>
        <button type="button" class="mem-filter-chip ${uiState.bankFilter === 'personal' ? 'active' : ''}" data-mem-filter="personal">Kalimat Personal (${personalCount})</button>
      </div>
      <div class="mem-filter-row" style="margin-top:-4px;">
        ${['ALL', 'A1', 'A2', 'B1', 'B2', 'SLANG']
          .map(
            (lvl) =>
              `<button type="button" class="mem-filter-chip ${uiState.bankLevelFilter === lvl ? 'active' : ''}" data-mem-bank-lvl="${lvl}">${lvl === 'ALL' ? 'Semua Level' : lvl}</button>`
          )
          .join('')}
      </div>

      <div id="memBankResults" style="display:flex;flex-direction:column;gap:10px;">
        ${renderBankResultsHTML(allWords)}
      </div>
    `;
  }

  root.innerHTML = `
    <div class="mem-shell">
      <div class="mem-smart-banner">
        <div>
          <div class="mem-banner-title">${svgIcon('brain')} Smart Learning Engine</div>
          <div class="mem-banner-desc">${escapeHTML(smartPlan.focusSummary)}</div>
        </div>
      </div>

      <div class="mem-kpi-strip">
        <div class="mem-kpi-pill">
          <div class="mem-kpi-num is-weak">${buckets.weak.length}</div>
          <div class="mem-kpi-lbl">Kata Lemah</div>
        </div>
        <div class="mem-kpi-pill">
          <div class="mem-kpi-num is-due">${buckets.due.length}</div>
          <div class="mem-kpi-lbl">Jatuh Tempo</div>
        </div>
        <div class="mem-kpi-pill">
          <div class="mem-kpi-num">${buckets.learning.length}</div>
          <div class="mem-kpi-lbl">Dipelajari</div>
        </div>
        <div class="mem-kpi-pill">
          <div class="mem-kpi-num is-mastered">${buckets.mastered.length}</div>
          <div class="mem-kpi-lbl">Dikuasai</div>
        </div>
      </div>

      <div class="mem-tabs" role="tablist">
        <button type="button" class="mem-tab-btn ${uiState.subTab === 'flashcard' ? 'active' : ''}" data-mem-tab="flashcard">
          ${svgIcon('cards')} Flashcard SRS
        </button>
        <button type="button" class="mem-tab-btn ${uiState.subTab === 'recall' ? 'active' : ''}" data-mem-tab="recall">
          ${svgIcon('recall')} Uji Ingatan
        </button>
        <button type="button" class="mem-tab-btn ${uiState.subTab === 'bank' ? 'active' : ''}" data-mem-tab="bank">
          ${svgIcon('list')} Peta Memori
        </button>
      </div>

      ${bodyHTML}
    </div>
  `;

  bindLexiconEvents(root);
}

function bindLexiconEvents(root) {
  if (root.dataset.memBound === '1') return;
  root.dataset.memBound = '1';

  root.addEventListener('click', (e) => {
    const pool = getAllVocabularyPool();
    const cur = uiState.queue[uiState.cursor];

    const tabBtn = e.target.closest('[data-mem-tab]');
    if (tabBtn) {
      uiState.subTab = tabBtn.getAttribute('data-mem-tab');
      uiState.revealed = false;
      uiState.recallFeedback = null;
      renderLexicon(root);
      return;
    }

    const deckBtn = e.target.closest('[data-mem-deck]');
    if (deckBtn) {
      uiState.deckFilter = deckBtn.getAttribute('data-mem-deck');
      ensureSessionQueue(pool, true);
      renderLexicon(root);
      return;
    }

    const filterBtn = e.target.closest('[data-mem-filter]');
    if (filterBtn) {
      uiState.bankFilter = filterBtn.getAttribute('data-mem-filter');
      renderLexicon(root);
      return;
    }

    const bankLvlBtn = e.target.closest('[data-mem-bank-lvl]');
    if (bankLvlBtn) {
      uiState.bankLevelFilter = bankLvlBtn.getAttribute('data-mem-bank-lvl');
      renderLexicon(root);
      return;
    }

    const recallModeBtn = e.target.closest('[data-mem-recall-mode]');
    if (recallModeBtn) {
      uiState.recallMode = recallModeBtn.getAttribute('data-mem-recall-mode');
      uiState.recallFeedback = null;
      renderLexicon(root);
      return;
    }

    const rateBtn = e.target.closest('[data-mem-rate]');
    if (rateBtn && cur) {
      const quality = Number(rateBtn.getAttribute('data-mem-rate'));
      recordWordReview(cur, quality, 'flashcard');
      Store.incrementRing('vocab', 1, quality >= 3 ? 12 : 5, `vocab-fc-${normalizeWordKey(cur.word)}`);
      if (quality <= 2) requeueCurrentCard();
      advanceCard();
      renderLexicon(root);
      return;
    }

    const choiceBtn = e.target.closest('[data-mem-choice]');
    if (choiceBtn && cur && !uiState.recallFeedback) {
      const picked = choiceBtn.getAttribute('data-mem-choice');
      const res = evaluateRecallAnswer(picked, cur.word);
      const passed = res.exact;
      recordWordReview(cur, passed ? 3 : 1, 'recall-choice');
      Store.incrementRing('vocab', 1, passed ? 14 : 4, `vocab-rc-${normalizeWordKey(cur.word)}`);
      if (!passed) requeueCurrentCard();
      uiState.recallFeedback = {
        passed,
        headline: passed ? 'Tepat! Pilihanmu benar.' : 'Kurang tepat — kata ini masuk antrean ulang.'
      };
      renderLexicon(root);
      return;
    }

    const bankSpeak = e.target.closest('[data-mem-bank-speak]');
    if (bankSpeak) {
      speakWordAudio(bankSpeak.getAttribute('data-mem-bank-speak'));
      return;
    }

    const bankSlow = e.target.closest('[data-mem-bank-slow]');
    if (bankSlow) {
      speakWordAudio(bankSlow.getAttribute('data-mem-bank-slow'), 0.72);
      return;
    }

    const bankEdit = e.target.closest('[data-mem-bank-edit]');
    if (bankEdit) {
      uiState.editingWordKey = bankEdit.getAttribute('data-mem-bank-edit');
      renderLexicon(root);
      return;
    }

    const bankSave = e.target.closest('[data-mem-bank-save]');
    if (bankSave) {
      const targetWord = bankSave.getAttribute('data-mem-bank-save');
      const wObj = pool.find((w) => normalizeWordKey(w.word) === normalizeWordKey(targetWord));
      const inp = document.getElementById(`bankPersonal-${normalizeWordKey(targetWord)}`);
      if (wObj && inp) {
        savePersonalExample(wObj, inp.value);
      }
      uiState.editingWordKey = null;
      renderLexicon(root);
      return;
    }

    const bankDrill = e.target.closest('[data-mem-bank-drill]');
    if (bankDrill) {
      const targetWord = bankDrill.getAttribute('data-mem-bank-drill');
      const found = pool.find((w) => normalizeWordKey(w.word) === normalizeWordKey(targetWord));
      if (found) {
        uiState.queue.splice(uiState.cursor, 0, { ...found, priorityReason: 'manual' });
        uiState.subTab = 'flashcard';
        uiState.revealed = false;
        renderLexicon(root);
      }
      return;
    }

    const actBtn = e.target.closest('[data-mem-action]');
    if (!actBtn) return;
    const action = actBtn.getAttribute('data-mem-action');

    if (action === 'speak-word' && cur) {
      speakWordAudio(cur.word);
    } else if (action === 'speak-word-slow' && cur) {
      speakWordAudio(cur.word, 0.72);
    } else if (action === 'speak-example' && cur?.example) {
      speakWordAudio(cur.example);
    } else if (action === 'reveal-card') {
      uiState.revealed = true;
      renderLexicon(root);
    } else if (action === 'save-personal' && cur) {
      const inp = document.getElementById('memPersonalInput');
      if (inp) savePersonalExample(cur, inp.value);
      renderLexicon(root);
    } else if (action === 'toggle-audio-only') {
      uiState.recallAudioOnly = !uiState.recallAudioOnly;
      if (uiState.recallAudioOnly && cur) speakWordAudio(cur.word);
      renderLexicon(root);
    } else if (action === 'submit-recall' && cur) {
      const inp = document.getElementById('memRecallInput');
      const val = inp ? inp.value : uiState.recallDraft;
      const res = evaluateRecallAnswer(val, cur.word);
      const passed = res.exact || res.near;
      recordWordReview(cur, res.exact ? 4 : res.near ? 3 : 1, 'recall-type');
      Store.incrementRing('vocab', 1, passed ? 15 : 4, `vocab-rt-${normalizeWordKey(cur.word)}`);
      if (!passed) requeueCurrentCard();
      uiState.recallFeedback = {
        passed,
        headline: res.exact
          ? 'Sempurna! Terjawab tanpa melihat kamus.'
          : res.near
          ? 'Hampir tepat (1 huruf meleset) — dianggap ingat.'
          : 'Belum tepat — kata ini dijadwalkan ulang otomatis.'
      };
      renderLexicon(root);
    } else if (action === 'next-recall') {
      advanceCard();
      renderLexicon(root);
    } else if (action === 'new-session') {
      ensureSessionQueue(pool, true);
      renderLexicon(root);
    }
  });

  // PENTING: Saat mengetik di #memBankSearch, perbarui #memBankResults SAJA agar fokus & keyboard HP tetap terbuka
  root.addEventListener('input', (e) => {
    if (e.target.id === 'memBankSearch') {
      uiState.bankSearch = e.target.value;
      const resultsBox = document.getElementById('memBankResults');
      if (resultsBox) {
        resultsBox.innerHTML = renderBankResultsHTML(getAllVocabularyPool());
      }
    } else if (e.target.id === 'memRecallInput') {
      uiState.recallDraft = e.target.value;
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'memRecallInput') {
      e.preventDefault();
      const submitBtn = root.querySelector('[data-mem-action="submit-recall"]');
      if (submitBtn) submitBtn.click();
    }
  });
}

export function initLexiconModule(dictData) {
  if (dictData && typeof dictData === 'object') {
    externalDictData = dictData;
    uiState.queue = [];
  }
  renderLexicon(document.getElementById('lexiconContainer'));
}

export const initLexicon = initLexiconModule;
export default { renderLexicon, initLexicon, initLexiconModule, getAllVocabularyPool };
