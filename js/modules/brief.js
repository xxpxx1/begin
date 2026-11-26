import { Store } from '../core/store.js';
import { escapeHTML } from '../core/security.js';
import { recordWordReview, getWordRecord } from '../engines/memory-srs.js?v=33';

const CONTEXTUAL_STORIES = [
  {
    id: 'brief-morning-habit',
    level: 'A1',
    category: 'Daily Routine',
    title: 'Five Minutes Every Morning',
    summarySimple: 'Short daily practice builds stronger English habits than long study sessions once a week.',
    sentences: [
      { en: 'Maya drinks a glass of warm water before checking her phone.', id: 'Maya minum segelas air hangat sebelum memeriksa ponselnya.' },
      { en: 'Then she spends five minutes reading one short English story.', id: 'Lalu ia meluangkan lima menit membaca satu cerita pendek bahasa Inggris.' },
      { en: 'She saves two unfamiliar words into her memory deck.', id: 'Ia menyimpan dua kata yang belum dikenal ke dek memorinya.' },
      { en: 'After one month, she understands daily conversations much faster.', id: 'Setelah satu bulan, ia memahami percakapan sehari-hari jauh lebih cepat.' }
    ],
    keyVocab: [
      { word: 'unfamiliar', phonetic: '/ˌʌnfəˈmɪliər/', meaning: 'Belum dikenal / asing', example: 'Write down unfamiliar words when you read.' },
      { word: 'spend', phonetic: '/spend/', meaning: 'Meluangkan (waktu)', example: 'She spends ten minutes practicing pronunciation.' }
    ],
    questions: [
      {
        q: 'What does Maya do right after drinking warm water?',
        options: ['She reads one short English story', 'She sleeps for an hour', 'She calls her teacher'],
        answerIndex: 0
      },
      {
        q: 'How many new words does she save each morning?',
        options: ['Ten words', 'Two unfamiliar words', 'Twenty words'],
        answerIndex: 1
      }
    ]
  },
  {
    id: 'brief-offline-tools',
    level: 'A2',
    category: 'Technology',
    title: 'Why Lightweight Apps Feel Faster',
    summarySimple: 'Apps that store essential data locally open quickly and still work without an internet connection.',
    sentences: [
      { en: 'Many modern apps become slow because they load heavy files from the internet.', id: 'Banyak aplikasi modern menjadi lambat karena memuat berkas berat dari internet.' },
      { en: 'When a traveler enters a subway tunnel, those apps often stop working.', id: 'Saat pelancong masuk ke terowongan kereta bawah tanah, aplikasi tersebut sering berhenti bekerja.' },
      { en: 'By caching core lessons on the device, learners can keep studying anywhere.', id: 'Dengan menyimpan materi inti di perangkat, pelajar dapat terus belajar di mana saja.' }
    ],
    keyVocab: [
      { word: 'heavy', phonetic: '/ˈhevi/', meaning: 'Berat / memakan banyak sumber daya', example: 'Heavy scripts slow down older smartphones.' },
      { word: 'anywhere', phonetic: '/ˈeniwer/', meaning: 'Di mana saja', example: 'Offline mode lets you review vocabulary anywhere.' }
    ],
    questions: [
      {
        q: 'Why do many apps stop working in a subway tunnel?',
        options: ['They rely on a live internet connection', 'The phone battery dies', 'The screen turns off'],
        answerIndex: 0
      },
      {
        q: 'What helps learners keep studying without internet?',
        options: ['Caching core lessons on the device', 'Deleting all files', 'Opening more browser tabs'],
        answerIndex: 0
      }
    ]
  },
  {
    id: 'brief-active-recall',
    level: 'B1',
    category: 'Learning Science',
    title: 'The Power of Testing Yourself',
    summarySimple: 'Trying to remember an answer without looking strengthens memory far better than rereading notes.',
    sentences: [
      { en: 'Rereading a vocabulary list feels comfortable, but your brain rarely works hard during passive review.', id: 'Membaca ulang daftar kosakata terasa nyaman, tetapi otak jarang bekerja keras saat meninjau secara pasif.' },
      { en: 'When you hide the translation and force yourself to recall the meaning, neural pathways grow stronger.', id: 'Saat kamu menyembunyikan terjemahan dan memaksa diri mengingat artinya, jalur saraf menjadi lebih kuat.' },
      { en: 'Making mistakes during practice is actually useful because it reveals which words need extra repetition.', id: 'Membuat kesalahan saat latihan sebenarnya bermanfaat karena menunjukkan kata mana yang butuh pengulangan ekstra.' }
    ],
    keyVocab: [
      { word: 'reread', phonetic: '/ˌriːˈriːd/', meaning: 'Membaca ulang', example: 'Do not just reread your notes; quiz yourself.' },
      { word: 'reveal', phonetic: '/rɪˈviːl/', meaning: 'Mengungkapkan / menunjukkan', example: 'Practice tests reveal your weak spots.' }
    ],
    questions: [
      {
        q: 'Why is passive rereading less effective than active recall?',
        options: ['The brain does not work hard to retrieve the memory', 'It takes too many hours', 'It requires an internet connection'],
        answerIndex: 0
      },
      {
        q: 'Why are mistakes during practice considered useful?',
        options: ['They reveal which words need extra repetition', 'They increase your screen brightness', 'They erase old lessons'],
        answerIndex: 0
      }
    ]
  },
  {
    id: 'brief-clear-communication',
    level: 'B2',
    category: 'Workplace',
    title: 'Writing Clear Bug Reports',
    summarySimple: 'A structured bug report saves engineering time by explaining exact steps, expected results, and actual behavior.',
    sentences: [
      { en: 'When a user simply writes that a feature is broken, engineers struggle to reproduce the issue.', id: 'Ketika pengguna hanya menulis bahwa sebuah fitur rusak, insinyur kesulitan mereproduksi masalah tersebut.' },
      { en: 'An effective report separates what should happen from what actually occurred on screen.', id: 'Laporan yang efektif memisahkan apa yang seharusnya terjadi dari apa yang benar-benar muncul di layar.' },
      { en: 'Providing concise steps turns a vague complaint into an actionable fix.', id: 'Memberikan langkah-langkah ringkas mengubah keluhan samar menjadi perbaikan yang dapat langsung ditindaklanjuti.' }
    ],
    keyVocab: [
      { word: 'reproduce', phonetic: '/ˌriːprəˈduːs/', meaning: 'Meniru / memunculkan kembali (bug)', example: 'Clear steps help developers reproduce the error.' },
      { word: 'concise', phonetic: '/kənˈsaɪs/', meaning: 'Ringkas dan padat', example: 'Keep your summary concise and specific.' }
    ],
    questions: [
      {
        q: 'What happens when a report only says a feature is broken?',
        options: ['Engineers struggle to reproduce the issue', 'The bug fixes itself automatically', 'The app becomes faster'],
        answerIndex: 0
      },
      {
        q: 'What turns a vague complaint into an actionable fix?',
        options: ['Providing concise reproduction steps', 'Writing a five-page essay', 'Using complex jargon'],
        answerIndex: 0
      }
    ]
  }
];

const brfState = {
  levelFilter: 'ALL',
  selectedId: CONTEXTUAL_STORIES[0].id,
  showTranslation: false,
  activeSentenceIdx: -1,
  listenedStoryIds: new Set(),
  answers: {}, // { [storyId]: { [qIdx]: optIdx } }
  quizFeedback: {} // { [storyId]: { passed, scorePercent, correctCount, total } }
};

function speakSentence(text, onEnd) {
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
    if (typeof onEnd === 'function') utter.onend = onEnd;
    window.speechSynthesis.speak(utter);
  } catch {}
}

function playStoryWithSubtitles(story, root) {
  if (!story || !Array.isArray(story.sentences)) return;
  brfState.listenedStoryIds.add(story.id);
  let idx = 0;

  const step = () => {
    if (brfState.selectedId !== story.id || idx >= story.sentences.length) {
      brfState.activeSentenceIdx = -1;
      renderBrief(root);
      return;
    }
    brfState.activeSentenceIdx = idx;
    renderBrief(root);
    const line = story.sentences[idx].en;
    idx += 1;
    speakSentence(line, step);
  };

  step();
}

function svgIcon(name) {
  const icons = {
    volume: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    stop: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  };
  return icons[name] || '';
}

export function renderBrief(containerEl) {
  const root =
    (containerEl && containerEl.nodeType === 1 ? containerEl : null) ||
    document.getElementById('briefList') ||
    document.getElementById('briefContainer') ||
    document.getElementById('briefView') ||
    document.getElementById('view-brief') ||
    document.getElementById('panel-brief') ||
    document.querySelector('[data-view="brief"]');

  if (!root) return;

  const state = Store.getState();
  const visibleStories = CONTEXTUAL_STORIES.filter(
    (s) => brfState.levelFilter === 'ALL' || s.level === brfState.levelFilter
  );
  const story =
    visibleStories.find((s) => s.id === brfState.selectedId) ||
    visibleStories[0] ||
    CONTEXTUAL_STORIES[0];
  brfState.selectedId = story.id;

  const savedHistory = state.briefHistory?.[story.id] || null;
  const userAns = brfState.answers[story.id] || {};
  const feedback = brfState.quizFeedback[story.id] || null;
  const isPlayingAll = brfState.activeSentenceIdx >= 0;

  root.innerHTML = `
    <div class="p3-shell">
      <div class="mem-filter-row">
        ${['ALL', 'A1', 'A2', 'B1', 'B2']
          .map(
            (lvl) =>
              `<button type="button" class="mem-filter-chip ${brfState.levelFilter === lvl ? 'active' : ''}" data-brf-lvl="${lvl}">${lvl === 'ALL' ? 'Semua Level' : lvl}</button>`
          )
          .join('')}
      </div>

      <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;">
        ${visibleStories
          .map((s) => {
            const done = Boolean(state.briefHistory?.[s.id]?.completed);
            return `<button type="button" class="mem-filter-chip ${s.id === story.id ? 'active' : ''}" data-brf-story="${escapeHTML(s.id)}">
              ${escapeHTML(s.level)} • ${escapeHTML(s.title)} ${done ? '✓' : ''}
            </button>`;
          })
          .join('')}
      </div>

      <div class="p3-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="mem-badge tone-info">CEFR ${escapeHTML(story.level)}</span>
            <span class="mem-badge tone-neutral">${escapeHTML(story.category)}</span>
          </div>
          ${savedHistory ? `<span class="mem-badge tone-success">${svgIcon('check')} Skor ${savedHistory.scorePercent}%</span>` : ''}
        </div>

        <div style="font-size:20px;font-weight:800;line-height:1.3;margin-bottom:12px;">
          ${escapeHTML(story.title)}
        </div>

        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <button type="button" class="mem-btn mem-btn-primary" style="flex:1;" data-brf-action="play-story">
            ${isPlayingAll ? `${svgIcon('stop')} Hentikan Audio` : `${svgIcon('volume')} Audio + Subtitle`}
          </button>
          <button type="button" class="mem-btn mem-btn-ghost" data-brf-action="toggle-translation">
            ${brfState.showTranslation ? 'Sembunyikan Arti' : 'Terjemahan'}
          </button>
        </div>

        <div style="font-size:11.5px;font-weight:700;color:var(--text-secondary,#64748B);margin-bottom:6px;">
          TEKS &amp; SUBTITLE INTERAKTIF (KETUK KALIMAT UNTUK MENDENGAR)
        </div>
        <div>
          ${story.sentences
            .map(
              (s, idx) => `
              <div class="brf-sentence ${brfState.activeSentenceIdx === idx ? 'is-active' : ''}" data-brf-line="${idx}">
                <div class="brf-en">${escapeHTML(s.en)}</div>
                ${brfState.showTranslation ? `<div class="brf-id">${escapeHTML(s.id)}</div>` : ''}
              </div>
            `
            )
            .join('')}
        </div>

        <div style="margin-top:14px;padding:12px 14px;border-radius:14px;background:rgba(26,109,255,0.07);border:1px solid rgba(26,109,255,0.16);">
          <div style="font-size:11.5px;font-weight:800;color:var(--ios-blue,#1A6DFF);text-transform:uppercase;margin-bottom:4px;">
            Ringkasan Bahasa Inggris Sederhana
          </div>
          <div style="font-size:13.5px;line-height:1.5;font-weight:500;">
            ${escapeHTML(story.summarySimple)}
          </div>
        </div>
      </div>

      <div class="p3-card">
        <div style="font-size:14px;font-weight:800;margin-bottom:4px;">Kosakata Penting dalam Konteks</div>
        <div style="font-size:12.5px;color:var(--text-secondary,#64748B);margin-bottom:10px;">
          Tambahkan kata baru langsung ke sistem Spaced Repetition di tab Word.
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${story.keyVocab
            .map((v, vIdx) => {
              const rec = getWordRecord(v);
              const inMemory = rec && (rec.lastReviewedAt > 0 || rec.masteryLevel > 0);
              return `
                <div class="brf-vocab-item">
                  <div>
                    <div style="font-size:15px;font-weight:800;">${escapeHTML(v.word)} <span style="font-size:12px;font-weight:500;color:var(--text-secondary,#64748B);">${escapeHTML(v.phonetic)}</span></div>
                    <div style="font-size:13px;color:var(--ios-blue,#1A6DFF);font-weight:600;">${escapeHTML(v.meaning)}</div>
                  </div>
                  <button type="button" class="mem-btn ${inMemory ? 'mem-btn-ghost' : 'mem-btn-primary'}" style="min-height:36px;font-size:12px;white-space:nowrap;" data-brf-save-vocab="${vIdx}">
                    ${inMemory ? `${svgIcon('check')} Tersimpan` : `${svgIcon('plus')} Simpan`}
                  </button>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <div class="p3-card">
        <div style="font-size:14px;font-weight:800;margin-bottom:4px;">Pertanyaan Pemahaman (Validasi Selesai)</div>
        <div style="font-size:12.5px;color:var(--text-secondary,#64748B);margin-bottom:12px;">
          Jawab pertanyaan berikut untuk mengukur pemahaman bacaan &amp; mengklaim XP cerita ini.
        </div>

        ${story.questions
          .map(
            (qObj, qIdx) => `
            <div style="margin-bottom:14px;">
              <div style="font-size:13.5px;font-weight:700;margin-bottom:4px;">${qIdx + 1}. ${escapeHTML(qObj.q)}</div>
              ${qObj.options
                .map((opt, optIdx) => {
                  const picked = userAns[qIdx] === optIdx;
                  let cls = 'brf-quiz-opt';
                  if (feedback) {
                    if (optIdx === qObj.answerIndex) cls += ' correct';
                    else if (picked) cls += ' wrong';
                  } else if (picked) {
                    cls += ' selected';
                  }
                  return `<button type="button" class="${cls}" data-brf-q="${qIdx}" data-brf-opt="${optIdx}">${escapeHTML(opt)}</button>`;
                })
                .join('')}
            </div>
          `
          )
          .join('')}

        <button type="button" class="mem-btn mem-btn-primary" style="width:100%;" data-brf-action="submit-quiz">
          Periksa Pemahaman &amp; Selesaikan Cerita
        </button>

        ${
          feedback
            ? `<div style="margin-top:12px;padding:12px;border-radius:12px;background:rgba(26,109,255,0.08);font-size:13.5px;font-weight:700;color:${feedback.passed ? '#059669' : '#D97706'};">
                Skor Pemahaman: ${feedback.scorePercent}% (${feedback.correctCount}/${feedback.total} benar).
                ${feedback.passed ? ' Progres reading/listening dan XP telah dicatat!' : ' Coba periksa kembali teks di atas untuk mencapai 100%.'}
              </div>`
            : ''
        }
      </div>
    </div>
  `;

  bindBriefEvents(root);
}

function bindBriefEvents(root) {
  if (root.dataset.brfBound === '1') return;
  root.dataset.brfBound = '1';

  root.addEventListener('click', (e) => {
    const story = CONTEXTUAL_STORIES.find((s) => s.id === brfState.selectedId) || CONTEXTUAL_STORIES[0];

    const lvlBtn = e.target.closest('[data-brf-lvl]');
    if (lvlBtn) {
      brfState.levelFilter = lvlBtn.getAttribute('data-brf-lvl');
      brfState.activeSentenceIdx = -1;
      renderBrief(root);
      return;
    }

    const storyBtn = e.target.closest('[data-brf-story]');
    if (storyBtn) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      brfState.selectedId = storyBtn.getAttribute('data-brf-story');
      brfState.activeSentenceIdx = -1;
      renderBrief(root);
      return;
    }

    const lineEl = e.target.closest('[data-brf-line]');
    if (lineEl) {
      const idx = Number(lineEl.getAttribute('data-brf-line'));
      const line = story.sentences[idx];
      if (line) {
        brfState.listenedStoryIds.add(story.id);
        brfState.activeSentenceIdx = idx;
        renderBrief(root);
        speakSentence(line.en, () => {
          brfState.activeSentenceIdx = -1;
          renderBrief(root);
        });
      }
      return;
    }

    const saveVocabBtn = e.target.closest('[data-brf-save-vocab]');
    if (saveVocabBtn) {
      const vIdx = Number(saveVocabBtn.getAttribute('data-brf-save-vocab'));
      const vocabObj = story.keyVocab[vIdx];
      if (vocabObj) {
        recordWordReview({ ...vocabObj, level: story.level, category: story.category }, 2, 'brief-context');
        renderBrief(root);
      }
      return;
    }

    const optBtn = e.target.closest('[data-brf-q]');
    if (optBtn) {
      const qIdx = Number(optBtn.getAttribute('data-brf-q'));
      const optIdx = Number(optBtn.getAttribute('data-brf-opt'));
      if (!brfState.answers[story.id]) brfState.answers[story.id] = {};
      brfState.answers[story.id][qIdx] = optIdx;
      delete brfState.quizFeedback[story.id];
      renderBrief(root);
      return;
    }

    const actBtn = e.target.closest('[data-brf-action]');
    if (!actBtn) return;
    const action = actBtn.getAttribute('data-brf-action');

    if (action === 'toggle-translation') {
      brfState.showTranslation = !brfState.showTranslation;
      renderBrief(root);
    } else if (action === 'play-story') {
      if (brfState.activeSentenceIdx >= 0) {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        brfState.activeSentenceIdx = -1;
        renderBrief(root);
      } else {
        playStoryWithSubtitles(story, root);
      }
    } else if (action === 'submit-quiz') {
      const ans = brfState.answers[story.id] || {};
      let correctCount = 0;
      story.questions.forEach((qObj, idx) => {
        if (ans[idx] === qObj.answerIndex) correctCount += 1;
      });
      const total = story.questions.length;
      const scorePercent = Math.round((correctCount / total) * 100);
      const passed = scorePercent >= 50;

      brfState.quizFeedback[story.id] = { passed, scorePercent, correctCount, total };
      Store.recordBriefCompletion(story.id, {
        scorePercent,
        correctCount,
        totalQuestions: total,
        listened: brfState.listenedStoryIds.has(story.id)
      });

      if (passed) {
        Store.claimActivityReward({
          activityId: `brief:${story.id}`,
          type: 'listen',
          amount: 1,
          xpBonus: 20,
          dailyScoped: false
        });
      }
      renderBrief(root);
    }
  });
}


export function initBriefModule(briefsData) {
  const list = Array.isArray(briefsData) ? briefsData : briefsData?.briefs;
  if (Array.isArray(list)) {
    const existingIds = new Set(CONTEXTUAL_STORIES.map((s) => s.id));
    list.forEach((b, idx) => {
      const id = b.id || `brief-json-${idx}`;
      if (existingIds.has(id)) return;
      const rawSentences = Array.isArray(b.sentences)
        ? b.sentences
        : String(b.content || b.body || b.text || '')
            .split(/(?<=[.!?])\s+/)
            .filter(Boolean)
            .map((en) => ({ en, id: '' }));
      if (!rawSentences.length) return;
      CONTEXTUAL_STORIES.push({
        id,
        level: b.level || 'A2',
        category: b.category || b.topic || 'Daily Brief',
        title: b.title || `Story ${idx + 1}`,
        summarySimple: b.summary || b.subtitle || rawSentences[0].en,
        sentences: rawSentences.map((s) =>
          typeof s === 'string' ? { en: s, id: '' } : { en: s.en || s.text || '', id: s.id || s.translation || '' }
        ),
        keyVocab: Array.isArray(b.vocab || b.keyVocab) ? (b.vocab || b.keyVocab) : [],
        questions: Array.isArray(b.questions || b.quiz) ? (b.questions || b.quiz) : []
      });
    });
  }
  renderBrief(document.getElementById('briefList'));
}

export const initBrief = initBriefModule;
export default { renderBrief, initBrief, initBriefModule };
