import { Store } from '../core/store.js';
import { escapeHTML } from '../core/security.js';
import { evaluateSpeechAttempt, AudioRecorderController } from '../engines/speech-eval.js?v=22';
import { getDifficultSentences } from '../engines/smart-engine.js?v=22';

const PRACTICE_DRILLS = [
  { id: 'd1', level: 'A1', topic: 'Perkenalan', target: 'I want to learn English every day.', idHint: 'Saya ingin belajar bahasa Inggris setiap hari.' },
  { id: 'd2', level: 'A1', topic: 'Sehari-hari', target: 'Could you please speak a little slower?', idHint: 'Bisakah kamu berbicara sedikit lebih pelan?' },
  { id: 'd3', level: 'A2', topic: 'Perjalanan', target: 'What time does the next train leave for the airport?', idHint: 'Jam berapa kereta berikutnya berangkat ke bandara?' },
  { id: 'd4', level: 'B1', topic: 'Pekerjaan', target: 'I will share the updated report before our afternoon meeting.', idHint: 'Saya akan membagikan laporan terbaru sebelum rapat sore kita.' },
  { id: 'd5', level: 'B1', topic: 'Teknologi', target: 'We fixed the cache bug so the app works smoothly offline.', idHint: 'Kami memperbaiki bug cache agar aplikasi berjalan lancar saat offline.' },
  { id: 'd6', level: 'B2', topic: 'Diskusi', target: 'Consistency matters much more than studying for hours once a week.', idHint: 'Konsistensi jauh lebih penting daripada belajar berjam-jam sekali seminggu.' }
];

const SITUATION_CHALLENGES = [
  {
    id: 'sit-coffee',
    level: 'A1',
    title: 'Memesan Kopi di Kafe',
    context: 'Barista menyapamu dengan ramah dan menanyakan pesananmu.',
    npcLine: 'Hi there! What can I get started for you today?',
    target: 'I would like an iced latte with less sugar, please.',
    idHint: 'Saya ingin memesan es latte dengan sedikit gula, tolong.'
  },
  {
    id: 'sit-direction',
    level: 'A2',
    title: 'Menanyakan Arah Stasiun',
    context: 'Kamu sedang berada di pusat kota dan mencari stasiun kereta terdekat.',
    npcLine: 'You look a bit lost. Do you need help finding something?',
    target: 'Excuse me, how do I get to the nearest train station?',
    idHint: 'Permisi, bagaimana cara menuju stasiun kereta terdekat?'
  },
  {
    id: 'sit-standup',
    level: 'B1',
    title: 'Daily Standup Tim Developer',
    context: 'Rekan tim menanyakan progres perbaikan aplikasi hari ini.',
    npcLine: 'How is the authentication update going on your end?',
    target: 'I finished testing the login flow and will deploy it this afternoon.',
    idHint: 'Saya sudah selesai menguji alur login dan akan merilisnya sore ini.'
  },
  {
    id: 'sit-reschedule',
    level: 'B1',
    title: 'Mengatur Ulang Jadwal Rapat',
    context: 'Klien menelepon untuk memastikan waktu diskusi proyek.',
    npcLine: 'Are we still good for our call at two o clock?',
    target: 'Could we move our call to four because I have another meeting?',
    idHint: 'Bisakah kita memindahkan panggilan ke jam empat karena saya ada rapat lain?'
  }
];

const recorder = new AudioRecorderController();
let activeRecognition = null;

const spkState = {
  tab: 'drill', // 'drill' | 'situation' | 'history'
  drillIndex: 0,
  situationIndex: 0,
  customTarget: '',
  isListening: false,
  liveTranscript: '',
  lastAudioUrl: '',
  lastResult: null,
  statusMsg: '',
  manualDraft: ''
};

function speakReference(text) {
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

function playUserRecording(url) {
  if (!url) return;
  try {
    const audio = new Audio(url);
    audio.play();
  } catch {}
}

function scoreToneClass(val) {
  if (val >= 80) return 'is-high';
  if (val >= 55) return 'is-mid';
  return 'is-low';
}

function svgIcon(name) {
  const icons = {
    mic: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
    stop: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    volume: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    chat: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    history: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>'
  };
  return icons[name] || '';
}

function getCurrentPrompt() {
  if (spkState.customTarget) {
    return {
      id: 'retry-custom',
      level: Store.getState().level || 'A1',
      topic: 'Kalimat Sulit Terdeteksi',
      target: spkState.customTarget,
      idHint: 'Ulangi kalimat yang sebelumnya belum tepat susunan atau pelafalannya.'
    };
  }
  if (spkState.tab === 'situation') {
    return SITUATION_CHALLENGES[spkState.situationIndex % SITUATION_CHALLENGES.length];
  }
  return PRACTICE_DRILLS[spkState.drillIndex % PRACTICE_DRILLS.length];
}

function finalizeSpeechEvaluation(targetObj, transcript, confidence, root) {
  const evalRes = evaluateSpeechAttempt({
    targetText: targetObj.target,
    transcript,
    confidence
  });
  spkState.lastResult = {
    transcript,
    ...evalRes
  };

  Store.recordSpeechAttempt({
    id: targetObj.id,
    target: targetObj.target,
    transcript,
    scenario: targetObj.title || targetObj.topic || 'Latihan Bicara',
    wordMatching: evalRes.wordMatching,
    sentenceAccuracy: evalRes.sentenceAccuracy,
    pronunciation: evalRes.pronunciation
  });

  if (evalRes.sentenceAccuracy >= 75 && evalRes.pronunciation >= 70) {
    Store.claimActivityReward({
      activityId: `speak:${targetObj.id}`,
      type: 'speak',
      amount: 1,
      xpBonus: 15,
      dailyScoped: true
    });
  }

  renderSpeak(root);
}

async function toggleRecording(root) {
  const targetObj = getCurrentPrompt();
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (spkState.isListening) {
    spkState.isListening = false;
    if (activeRecognition) {
      try { activeRecognition.stop(); } catch {}
    }
    spkState.lastAudioUrl = await recorder.stop();
    renderSpeak(root);
    return;
  }

  if (!SpeechRec) {
    spkState.statusMsg = 'Browser ini belum mendukung Speech Recognition langsung — gunakan kolom uji transkrip di bawah.';
    renderSpeak(root);
    return;
  }

  spkState.isListening = true;
  spkState.liveTranscript = '';
  spkState.lastResult = null;
  spkState.statusMsg = 'Mendengarkan & merekam suaramu... Ucapkan kalimat target dengan jelas.';
  renderSpeak(root);

  await recorder.start();

  try {
    const rec = new SpeechRec();
    activeRecognition = rec;
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalTranscript = '';
    let finalConfidence = null;

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalTranscript += res[0].transcript;
          if (typeof res[0].confidence === 'number') {
            finalConfidence = res[0].confidence;
          }
        } else {
          interim += res[0].transcript;
        }
      }
      spkState.liveTranscript = (finalTranscript || interim).trim();
      const liveBox = document.getElementById('spkLiveTranscript');
      if (liveBox) liveBox.textContent = spkState.liveTranscript || '...';
    };

    rec.onerror = async (err) => {
      spkState.isListening = false;
      spkState.lastAudioUrl = await recorder.stop();
      spkState.statusMsg = err.error === 'not-allowed'
        ? 'Izin mikrofon ditolak browser. Aktifkan izin mikrofon di pengaturan situs.'
        : 'Suara tidak tertangkap jelas. Coba rekam ulang di tempat lebih tenang.';
      renderSpeak(root);
    };

    rec.onend = async () => {
      spkState.isListening = false;
      spkState.lastAudioUrl = await recorder.stop();
      const spoken = (finalTranscript || spkState.liveTranscript).trim();
      if (spoken) {
        spkState.statusMsg = '';
        finalizeSpeechEvaluation(targetObj, spoken, finalConfidence, root);
      } else {
        spkState.statusMsg = 'Tidak ada ucapan terdeteksi. Tekan tombol rekam dan coba lagi.';
        renderSpeak(root);
      }
    };

    rec.start();
  } catch {
    spkState.isListening = false;
    await recorder.stop();
    spkState.statusMsg = 'Gagal memulai pengenalan suara pada perangkat ini.';
    renderSpeak(root);
  }
}

export function renderSpeak(containerEl) {
  const root =
    containerEl ||
    document.getElementById('speakContainer') ||
    document.getElementById('speakView') ||
    document.getElementById('view-speak') ||
    document.getElementById('panel-speak') ||
    document.querySelector('[data-view="speak"]');

  if (!root) return;

  const state = Store.getState();
  const history = [...(state.speechHistory || [])].reverse();
  const weakSentences = getDifficultSentences(3);
  const promptObj = getCurrentPrompt();

  let mainBody = '';

  if (spkState.tab === 'history') {
    mainBody = `
      <div class="p3-card">
        <div style="font-size:14px;font-weight:800;margin-bottom:4px;">Riwayat Latihan Bicara (${history.length})</div>
        <div style="font-size:12.5px;color:var(--text-secondary,#64748B);margin-bottom:12px;">
          Ketuk "Latih Ulang" pada kalimat yang skor susunan atau pelafalannya masih di bawah 75%.
        </div>
        ${
          history.length === 0
            ? `<div style="padding:18px;text-align:center;color:var(--text-secondary,#64748B);font-size:13.5px;">
                Belum ada riwayat rekaman latihan bicara.
              </div>`
            : `<div style="display:flex;flex-direction:column;gap:10px;">
                ${history
                  .slice(0, 25)
                  .map(
                    (h) => `
                    <div style="padding:12px;border-radius:14px;background:rgba(148,163,184,0.09);display:flex;flex-direction:column;gap:6px;">
                      <div style="display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--text-secondary,#64748B);">
                        <span>${escapeHTML(h.scenario)}</span>
                        <span style="font-variant-numeric:tabular-nums;">Kata ${h.wordMatching}% • Susunan ${h.sentenceAccuracy}% • Lafal ${h.pronunciation}%</span>
                      </div>
                      <div style="font-size:14px;font-weight:700;">"${escapeHTML(h.target)}"</div>
                      <div style="font-size:12.5px;color:var(--text-secondary,#475569);">Terucap: "${escapeHTML(h.transcript)}"</div>
                      <div style="display:flex;gap:8px;margin-top:2px;">
                        <button type="button" class="mem-btn mem-btn-ghost" style="min-height:36px;font-size:12px;" data-spk-ref="${escapeHTML(h.target)}">${svgIcon('volume')} Referensi</button>
                        <button type="button" class="mem-btn mem-btn-primary" style="min-height:36px;font-size:12px;" data-spk-retry="${escapeHTML(h.target)}">Latih Ulang</button>
                      </div>
                    </div>
                  `
                  )
                  .join('')}
              </div>`
        }
      </div>
    `;
  } else {
    const res = spkState.lastResult;
    mainBody = `
      ${
        weakSentences.length > 0 && !spkState.customTarget
          ? `<div class="p3-card" style="padding:12px 14px;">
              <div style="font-size:11.5px;font-weight:800;color:#D97706;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">
                Smart Engine • Kalimat Perlu Diulang (${weakSentences.length})
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <span style="font-size:13px;font-weight:600;">"${escapeHTML(weakSentences[0].target)}"</span>
                <button type="button" class="mem-btn mem-btn-primary" style="min-height:36px;font-size:12px;white-space:nowrap;" data-spk-retry="${escapeHTML(weakSentences[0].target)}">
                  Latih Sekarang
                </button>
              </div>
            </div>`
          : ''
      }

      <div class="p3-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
          <span class="mem-badge tone-info">${escapeHTML(promptObj.level || 'A1')} • ${escapeHTML(promptObj.title || promptObj.topic)}</span>
          <button type="button" class="mem-btn mem-btn-ghost" style="min-height:36px;font-size:12px;" data-spk-action="next-prompt">
            Ganti Tantangan
          </button>
        </div>

        ${
          spkState.tab === 'situation' && promptObj.context
            ? `<div style="padding:10px 12px;border-radius:12px;background:rgba(26,109,255,0.07);margin-bottom:10px;">
                <div style="font-size:12px;color:var(--text-secondary,#475569);margin-bottom:4px;">${escapeHTML(promptObj.context)}</div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <span style="font-size:13.5px;font-weight:700;">Partner: "${escapeHTML(promptObj.npcLine)}"</span>
                  <button type="button" class="mem-btn mem-btn-ghost" style="min-height:34px;padding:6px 10px;" data-spk-ref="${escapeHTML(promptObj.npcLine)}" aria-label="Dengar partner">${svgIcon('volume')}</button>
                </div>
              </div>`
            : ''
        }

        <div style="font-size:11.5px;font-weight:700;color:var(--text-secondary,#64748B);margin-bottom:4px;">
          KALIMAT TARGET YANG HARUS DIUCAPKAN
        </div>
        <div style="font-size:18px;font-weight:800;line-height:1.4;margin-bottom:6px;">
          "${escapeHTML(promptObj.target)}"
        </div>
        <div style="font-size:13px;color:var(--text-secondary,#64748B);margin-bottom:14px;">
          Arti: ${escapeHTML(promptObj.idHint)}
        </div>

        <button type="button" class="spk-mic-btn ${spkState.isListening ? 'is-recording' : ''}" data-spk-action="toggle-mic">
          ${spkState.isListening ? `${svgIcon('stop')} Hentikan Rekaman` : `${svgIcon('mic')} Mulai Bicara & Rekam`}
        </button>

        <div class="spk-ab-row">
          <button type="button" class="mem-btn mem-btn-ghost" data-spk-ref="${escapeHTML(promptObj.target)}">
            ${svgIcon('volume')} Suara Referensi
          </button>
          <button type="button" class="mem-btn mem-btn-ghost" data-spk-action="play-user" ${spkState.lastAudioUrl ? '' : 'disabled style="opacity:0.45;"'}>
            ${svgIcon('play')} Rekaman Kamu
          </button>
        </div>

        ${
          spkState.isListening || spkState.liveTranscript
            ? `<div style="margin-top:10px;padding:10px 12px;border-radius:11px;background:rgba(148,163,184,0.1);font-size:13px;">
                <strong>Transkrip langsung:</strong> <span id="spkLiveTranscript">${escapeHTML(spkState.liveTranscript || '...')}</span>
              </div>`
            : ''
        }

        ${
          spkState.statusMsg
            ? `<div style="margin-top:10px;font-size:12.5px;color:#D97706;font-weight:600;">${escapeHTML(spkState.statusMsg)}</div>`
            : ''
        }

        ${
          res
            ? `
              <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color,rgba(15,23,42,0.1));">
                <div style="font-size:12px;font-weight:800;color:var(--text-secondary,#64748B);text-transform:uppercase;">
                  Hasil Evaluasi 3 Metrik Terpisah
                </div>
                <div class="spk-metrics-grid">
                  <div class="spk-metric-box">
                    <div class="spk-metric-val ${scoreToneClass(res.wordMatching)}">${res.wordMatching}%</div>
                    <div class="spk-metric-lbl">Word Matching</div>
                  </div>
                  <div class="spk-metric-box">
                    <div class="spk-metric-val ${scoreToneClass(res.sentenceAccuracy)}">${res.sentenceAccuracy}%</div>
                    <div class="spk-metric-lbl">Sentence Order</div>
                  </div>
                  <div class="spk-metric-box">
                    <div class="spk-metric-val ${scoreToneClass(res.pronunciation)}">${res.pronunciation}%</div>
                    <div class="spk-metric-lbl">Pronunciation</div>
                  </div>
                </div>

                <div style="font-size:12.5px;color:var(--text-secondary,#475569);margin-bottom:6px;">
                  <strong>Ucapanmu:</strong> "${escapeHTML(res.transcript)}"
                </div>

                <div style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748B);margin-top:8px;">
                  Analisis Kesalahan Per Kata:
                </div>
                <div class="spk-word-chips">
                  ${res.wordBreakdown
                    .map((w) => {
                      const tag =
                        w.status === 'matched'
                          ? ''
                          : w.status === 'order'
                          ? ' (urutan)'
                          : w.status === 'near'
                          ? ` (~${w.spokenMatch})`
                          : ' (terlewat)';
                      return `<span class="spk-chip st-${w.status}">${escapeHTML(w.target + tag)}</span>`;
                    })
                    .join('')}
                </div>
              </div>
            `
            : ''
        }
      </div>
    `;
  }

  root.innerHTML = `
    <div class="p3-shell">
      <div class="mem-tabs" role="tablist">
        <button type="button" class="mem-tab-btn ${spkState.tab === 'drill' ? 'active' : ''}" data-spk-tab="drill">
          ${svgIcon('mic')} Latihan Kalimat
        </button>
        <button type="button" class="mem-tab-btn ${spkState.tab === 'situation' ? 'active' : ''}" data-spk-tab="situation">
          ${svgIcon('chat')} Situasi Nyata
        </button>
        <button type="button" class="mem-tab-btn ${spkState.tab === 'history' ? 'active' : ''}" data-spk-tab="history">
          ${svgIcon('history')} Riwayat (${history.length})
        </button>
      </div>
      ${mainBody}
    </div>
  `;

  bindSpeakEvents(root);
}

function bindSpeakEvents(root) {
  if (root.dataset.spkBound === '1') return;
  root.dataset.spkBound = '1';

  root.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-spk-tab]');
    if (tabBtn) {
      spkState.tab = tabBtn.getAttribute('data-spk-tab');
      spkState.customTarget = '';
      spkState.lastResult = null;
      spkState.statusMsg = '';
      renderSpeak(root);
      return;
    }

    const refBtn = e.target.closest('[data-spk-ref]');
    if (refBtn) {
      speakReference(refBtn.getAttribute('data-spk-ref'));
      return;
    }

    const retryBtn = e.target.closest('[data-spk-retry]');
    if (retryBtn) {
      spkState.customTarget = retryBtn.getAttribute('data-spk-retry');
      spkState.tab = 'drill';
      spkState.lastResult = null;
      spkState.statusMsg = '';
      renderSpeak(root);
      return;
    }

    const actBtn = e.target.closest('[data-spk-action]');
    if (!actBtn) return;
    const action = actBtn.getAttribute('data-spk-action');

    if (action === 'toggle-mic') {
      toggleRecording(root);
    } else if (action === 'play-user') {
      playUserRecording(spkState.lastAudioUrl);
    } else if (action === 'next-prompt') {
      spkState.customTarget = '';
      spkState.lastResult = null;
      spkState.statusMsg = '';
      if (spkState.tab === 'situation') spkState.situationIndex += 1;
      else spkState.drillIndex += 1;
      renderSpeak(root);
    }
  });
}

export const initSpeak = renderSpeak;
export const speakText = renderSpeak;
export const stopSpeech = renderSpeak;
export const playTone = renderSpeak;
export const startRecognition = renderSpeak;
export const evaluateSpeech = renderSpeak;
export const getEnglishVoices = renderSpeak;
export const formatAccentTag = renderSpeak;
export default { renderSpeak, initSpeak };
