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
} from '../engines/memory-srs.js?v=25';
import {
  analyzeVocabularyState,
  buildSmartWordQueue,
  buildRecallOptions
} from '../engines/smart-engine.js?v=25';


const FALLBACK_WORDS = [
  { word: 'No cap', phonetic: '/noʊ kæp/', category: 'Slang', level: 'A2', meaning: 'Serius / tidak bohong (beneran)', example: 'That new update is super fast, no cap.' },
  { word: 'Figure out', phonetic: '/ˈfɪɡjər aʊt/', category: 'Phrasal Verb', level: 'B1', meaning: 'Memahami atau menemukan solusi', example: 'We need to figure out why the request failed.' },
  { word: 'Keep up with', phonetic: '/kiːp ʌp wɪð/', category: 'Phrasal Verb', level: 'B1', meaning: 'Mengikuti perkembangan terbaru', example: 'She reads daily articles to keep up with technology.' },
  { word: 'Straightforward', phonetic: '/ˌstreɪtˈfɔːrwərd/', category: 'Adjective', level: 'B1', meaning: 'Sederhana, jelas, dan mudah dipahami', example: 'The installation steps are very straightforward.' },
  { word: 'Catch up', phonetic: '/kætʃ ʌp/', category: 'Phrasal Verb', level: 'A2', meaning: 'Mengejar ketertinggalan / bertukar kabar', example: 'Let us grab coffee and catch up this weekend.' },
  { word: 'Take for granted', phonetic: '/teɪk fɔːr ˈɡræntɪd/', category: 'Idiom', level: 'B2', meaning: 'Menganggap remeh sesuatu yang sudah dimiliki', example: 'People often take clean water for granted.' }
];

function extractWordsFromModule(mod) {
  const collected = [];
  if (!mod || typeof mod !== 'object') return collected;
  for (const val of Object.values(mod)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (!item || typeof item !== 'object') continue;
        if (typeof item.word === 'string' && typeof item.meaning === 'string') {
          collected.push({
            word: item.word,
            phonetic: item.phonetic || item.ipa || '',
            category: item.category || item.tag || 'Vocabulary',
            level: item.level || item.cefr || 'A1',
            meaning: item.meaning,
            example: item.example || item.sentence || ''
          });
        }
        if (Array.isArray(item.vocab)) {
          for (const v of item.vocab) {
            if (v && typeof v.word === 'string') {
              collected.push({
                word: v.word,
                phonetic: v.phonetic || '',
                category: item.category || 'Unit Vocab',
                level: item.level || 'A1',
                meaning: v.meaning || v.def || '',
                example: v.example || ''
              });
            }
          }
        }
      }
    }
  }
  return collected;
}

export function getAllVocabularyPool() {
  const raw = [

    FALLBACK_WORDS
  ].flat();

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

function speakText(text) {
  if (!('speechSynthesis' in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(String(text));
    utter.lang = 'en-US';
    const st = Store.getState();
    utter.rate = st.voiceRate || 1.0;
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
  queue: [],
  cursor: 0,
  revealed: false,
  recallMode: 'type',
  recallAudioOnly: false,
  recallFeedback: null,
  recallDraft: '',
  bankFilter: 'all',
  bankSearch: '',
  editingWordKey: null
};

function ensureSessionQueue(allWords, forceRebuild = false) {
  if (forceRebuild || uiState.queue.length === 0) {
    const built = buildSmartWordQueue(allWords, 10);
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

export function renderLexicon(containerEl) {
  const root =
    containerEl ||
    document.getElementById('lexiconContainer') ||
    document.getElementById('lexiconList') ||
    document.getElementById('wordView') ||
    document.getElementById('wordsView') ||
    document.getElementById('view-word') ||
    document.getElementById('panel-word') ||
    document.querySelector('[data-view="word"]');

  if (!root) return;

  const allWords = getAllVocabularyPool();
  const buckets = analyzeVocabularyState(allWords);
  const smartPlan = buildSmartWordQueue(allWords, 10);
  ensureSessionQueue(allWords, false);

  const currentItem = uiState.queue[uiState.cursor] || null;
  const currentRec = currentItem ? getWordRecord(currentItem) : null;
  const masteryMeta = currentRec ? getMasteryMeta(currentRec) : null;

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

      bodyHTML = `
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
            <button type="button" class="mem-btn mem-btn-ghost" data-mem-action="speak-word" aria-label="Dengar pelafalan">
              ${svgIcon('volume')}
            </button>
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

      bodyHTML = `
        <div class="mem-card">
          <div class="mem-card-top">
            <span class="mem-badge tone-info">Uji Ingatan Aktif</span>
            <span style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748B);">
              ${uiState.cursor + 1} / ${uiState.queue.length}
            </span>
          </div>

          <div style="display:flex;gap:6px;margin-bottom:12px;">
            <button type="button" class="mem-filter-chip ${uiState.recallMode === 'type' ? 'active' : ''}" data-mem-recall-mode="type">
              Ketik Jawaban
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
              ? `<div style="padding:14px;border-radius:14px;background:rgba(26,109,255,0.08);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
                  <span style="font-size:13.5px;font-weight:700;">Dengarkan audio lalu tulis kata bahasa Inggrisnya:</span>
                  <button type="button" class="mem-btn mem-btn-primary" data-mem-action="speak-word">
                    ${svgIcon('volume')} Putar
                  </button>
                </div>`
              : `<div style="margin-bottom:12px;">
                  <div style="font-size:11.5px;font-weight:700;color:var(--text-secondary,#64748B);margin-bottom:4px;">ARTI BAHASA INDONESIA</div>
                  <div style="font-size:18px;font-weight:800;color:var(--text-primary,#0F172A);">${escapeHTML(currentItem.meaning)}</div>
                  ${masked ? `<div style="font-size:13px;color:var(--text-secondary,#475569);margin-top:6px;">Konteks: "${masked}"</div>` : ''}
                </div>`
          }

          ${
            !uiState.recallFeedback
              ? uiState.recallMode === 'type'
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
    const q = uiState.bankSearch.trim().toLowerCase();
    const filtered = allWords
      .map((w) => ({ ...w, memory: getWordRecord(w) }))
      .filter((w) => {
        if (q && !w.word.toLowerCase().includes(q) && !w.meaning.toLowerCase().includes(q)) return false;
        if (uiState.bankFilter === 'weak') return isWeakRecord(w.memory);
        if (uiState.bankFilter === 'due') return isDueRecord(w.memory);
        if (uiState.bankFilter === 'mastered') return isMasteredRecord(w.memory);
        if (uiState.bankFilter === 'personal') return Boolean(w.memory.personalExample);
        return true;
      });

    const personalCount = allWords.filter((w) => Boolean(getWordRecord(w).personalExample)).length;

    bodyHTML = `
      <input
        type="search"
        id="memBankSearch"
        class="mem-input"
        placeholder="Cari kata atau arti..."
        value="${escapeHTML(uiState.bankSearch)}"
      />
      <div class="mem-filter-row">
        <button type="button" class="mem-filter-chip ${uiState.bankFilter === 'all' ? 'active' : ''}" data-mem-filter="all">Semua (${allWords.length})</button>
        <button type="button" class="mem-filter-chip ${uiState.bankFilter === 'weak' ? 'active' : ''}" data-mem-filter="weak">Lemah (${buckets.weak.length})</button>
        <button type="button" class="mem-filter-chip ${uiState.bankFilter === 'due' ? 'active' : ''}" data-mem-filter="due">Jatuh Tempo (${buckets.due.length})</button>
        <button type="button" class="mem-filter-chip ${uiState.bankFilter === 'mastered' ? 'active' : ''}" data-mem-filter="mastered">Dikuasai (${buckets.mastered.length})</button>
        <button type="button" class="mem-filter-chip ${uiState.bankFilter === 'personal' ? 'active' : ''}" data-mem-filter="personal">Kalimat Personal (${personalCount})</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;">
        ${
          filtered.length === 0
            ? `<div class="mem-card" style="text-align:center;color:var(--text-secondary,#64748B);font-size:13.5px;">
                Belum ada kosakata pada filter ini.
              </div>`
            : filtered
                .slice(0, 60)
                .map((item) => {
                  const meta = getMasteryMeta(item.memory);
                  const wKey = normalizeWordKey(item.word);
                  const isEditing = uiState.editingWordKey === wKey;
                  return `
                    <div class="mem-dict-item">
                      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
                        <div>
                          <div style="font-size:16px;font-weight:800;">${escapeHTML(item.word)} <span style="font-size:12px;font-weight:500;color:var(--text-secondary,#64748B);">${escapeHTML(item.phonetic || '')}</span></div>
                          <div style="font-size:13.5px;color:var(--ios-blue,#1A6DFF);font-weight:600;">${escapeHTML(item.meaning)}</div>
                        </div>
                        <span class="mem-badge tone-${meta.tone}">${escapeHTML(meta.label)}</span>
                      </div>
                      <div style="font-size:12px;color:var(--text-secondary,#64748B);font-variant-numeric:tabular-nums;">
                        ${escapeHTML(item.level || 'A1')} • ${item.memory.rightCount} benar / ${item.memory.wrongCount} salah • ${formatDueText(item.memory)}
                      </div>
                      ${
                        item.memory.personalExample
                          ? `<div style="font-size:12.5px;padding:8px 10px;border-radius:10px;background:rgba(26,109,255,0.07);">
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
                          : `<div style="display:flex;gap:8px;margin-top:2px;">
                              <button type="button" class="mem-btn mem-btn-ghost" style="min-height:36px;font-size:12px;" data-mem-bank-speak="${escapeHTML(item.word)}">${svgIcon('volume')} Dengar</button>
                              <button type="button" class="mem-btn mem-btn-ghost" style="min-height:36px;font-size:12px;" data-mem-bank-edit="${escapeHTML(wKey)}">Kalimat Personal</button>
                              <button type="button" class="mem-btn mem-btn-primary" style="min-height:36px;font-size:12px;" data-mem-bank-drill="${escapeHTML(item.word)}">Latih</button>
                            </div>`
                      }
                    </div>
                  `;
                })
                .join('')
        }
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

    const recallModeBtn = e.target.closest('[data-mem-recall-mode]');
    if (recallModeBtn) {
      uiState.recallMode = recallModeBtn.getAttribute('data-mem-recall-mode');
      uiState.recallFeedback = null;
      renderLexicon(root);
      return;
    }

    const filterBtn = e.target.closest('[data-mem-filter]');
    if (filterBtn) {
      uiState.bankFilter = filterBtn.getAttribute('data-mem-filter');
      renderLexicon(root);
      return;
    }

    const rateBtn = e.target.closest('[data-mem-rate]');
    if (rateBtn && cur) {
      const q = Number(rateBtn.getAttribute('data-mem-rate'));
      recordWordReview(cur, q, 'flashcard');
      if (q === 1) requeueCurrentCard();
      advanceCard();
      renderLexicon(root);
      return;
    }

    const choiceBtn = e.target.closest('[data-mem-choice]');
    if (choiceBtn && cur && !uiState.recallFeedback) {
      const picked = choiceBtn.getAttribute('data-mem-choice');
      const res = evaluateRecallAnswer(picked, cur.word);
      const q = res.exact ? 3 : 1;
      recordWordReview(cur, q, 'recall-choice');
      if (!res.exact) requeueCurrentCard();
      uiState.recallFeedback = {
        passed: res.exact,
        headline: res.exact ? 'Tepat! Ingatanmu akurat.' : 'Belum tepat — kata ini dimasukkan kembali ke antrean ulang.'
      };
      renderLexicon(root);
      return;
    }

    const bankSpeak = e.target.closest('[data-mem-bank-speak]');
    if (bankSpeak) {
      speakText(bankSpeak.getAttribute('data-mem-bank-speak'));
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
      const wordName = bankSave.getAttribute('data-mem-bank-save');
      const wKey = normalizeWordKey(wordName);
      const inp = document.getElementById(`bankPersonal-${wKey}`);
      const targetObj = pool.find((x) => normalizeWordKey(x.word) === wKey);
      if (targetObj && inp) {
        savePersonalExample(targetObj, inp.value);
      }
      uiState.editingWordKey = null;
      renderLexicon(root);
      return;
    }

    const bankDrill = e.target.closest('[data-mem-bank-drill]');
    if (bankDrill) {
      const wKey = normalizeWordKey(bankDrill.getAttribute('data-mem-bank-drill'));
      const targetObj = pool.find((x) => normalizeWordKey(x.word) === wKey);
      if (targetObj) {
        uiState.queue.splice(uiState.cursor, 0, { ...targetObj, priorityReason: 'weak' });
        uiState.subTab = 'recall';
        uiState.recallFeedback = null;
        renderLexicon(root);
      }
      return;
    }

    const actBtn = e.target.closest('[data-mem-action]');
    if (!actBtn) return;
    const action = actBtn.getAttribute('data-mem-action');

    if (action === 'reveal-card') {
      uiState.revealed = true;
      renderLexicon(root);
      if (cur) speakText(cur.word);
    } else if (action === 'speak-word' && cur) {
      speakText(cur.word);
    } else if (action === 'speak-example' && cur) {
      speakText(cur.example);
    } else if (action === 'save-personal' && cur) {
      const inp = document.getElementById('memPersonalInput');
      if (inp) savePersonalExample(cur, inp.value);
      renderLexicon(root);
    } else if (action === 'toggle-audio-only') {
      uiState.recallAudioOnly = !uiState.recallAudioOnly;
      renderLexicon(root);
      if (uiState.recallAudioOnly && cur) speakText(cur.word);
    } else if (action === 'submit-recall' && cur) {
      const inp = document.getElementById('memRecallInput');
      const val = inp ? inp.value : '';
      const res = evaluateRecallAnswer(val, cur.word);
      const passed = res.exact || res.near;
      const q = res.exact ? 4 : res.near ? 3 : 1;
      recordWordReview(cur, q, 'recall-type');
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

  root.addEventListener('input', (e) => {
    if (e.target.id === 'memBankSearch') {
      uiState.bankSearch = e.target.value;
      renderLexicon(root);
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

export const initLexicon = renderLexicon;
export const initLexiconModule = renderLexicon;
export default { renderLexicon, initLexicon, getAllVocabularyPool };
