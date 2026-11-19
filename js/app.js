import { store } from './state.js?v=5';
import { speakText, startRecognition, evaluateSpeech, getEnglishVoices, formatAccentTag } from './modules/speak.js?v=5';
import { initPathModule } from './modules/path.js?v=5';
import { initBriefModule } from './modules/brief.js?v=5';
import { initLexiconModule } from './modules/lexicon.js?v=5';

let toastTimer = null;

function notifyIsland(message, persistent = false) {
  const toast = document.getElementById('floatingToast');
  const textEl = document.getElementById('toastText');
  const dotEl = document.getElementById('toastDot');
  textEl.textContent = message;
  toast.classList.add('show');
  if (persistent) dotEl.classList.add('recording'); else dotEl.classList.remove('recording');
  clearTimeout(toastTimer);
  if (!persistent) {
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      dotEl.classList.remove('recording');
    }, 2600);
  }
}

function openSheet(html) { document.getElementById('sheetContent').innerHTML = html; document.getElementById('sheetBackdrop').classList.add('open'); }
function closeSheet() { document.getElementById('sheetBackdrop').classList.remove('open'); }

function openVoicePicker() {
  let accentFilter = 'ALL';
  const renderSheet = () => {
    const voices = getEnglishVoices();
    const filtered = voices.filter((v) => accentFilter === 'ALL' || v.lang.toUpperCase().includes(accentFilter));
    openSheet(`
      <div class="card-label" style="color:var(--ios-blue);">Voice & Accent Studio</div>
      <h3 style="font-size:20px;margin:2px 0 4px;">Pilih Suara Native</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Aktif: <strong>${store.state.voiceName || 'Auto (Default)'}</strong></p>
      <div class="level-pills" style="margin-bottom:12px;">
        ${['ALL', 'US', 'GB', 'AU'].map((t) => `<button class="level-pill ${accentFilter === t ? 'active' : ''}" data-vfilter="${t}">${t === 'ALL' ? 'Semua' : t === 'US' ? '🇺🇸 US' : t === 'GB' ? '🇬🇧 UK' : '🇦🇺 AU'}</button>`).join('')}
      </div>
      <div style="max-height:46dvh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
        ${filtered.length ? filtered.map((v) => {
          const isSel = store.state.voiceURI === v.voiceURI;
          const name = v.name.replace(/Microsoft |Google |Android /g, '');
          return `<div class="ios-card" style="margin:0;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;border:${isSel ? '1.5px solid var(--ios-blue)' : '0.5px solid var(--separator)'};">
            <div style="flex:1;cursor:pointer;" data-select-uri="${v.voiceURI}" data-select-name="${name}">
              <div style="font-weight:700;font-size:14px;">${isSel ? '✓ ' : ''}${name}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${formatAccentTag(v.lang)} · ${v.localService ? 'Offline Ready' : 'Online'}</div>
            </div>
            <button class="btn-secondary" style="padding:6px 10px;font-size:12px;" data-preview-uri="${v.voiceURI}">🔊 Tes</button>
          </div>`;
        }).join('') : `<div class="ios-card" style="text-align:center;font-size:13px;">Memuat suara sistem...<br/><button class="btn-secondary" id="reloadVoicesBtn" style="margin-top:10px;">↻ Muat Ulang</button></div>`}
      </div>
    `);
    document.querySelectorAll('[data-vfilter]').forEach((b) => { b.onclick = () => { accentFilter = b.dataset.vfilter; renderSheet(); }; });
    document.querySelectorAll('[data-preview-uri]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); speakText("Hello! Let's practice English fluency together.", 1.0, null, b.dataset.previewUri); }; });
    document.querySelectorAll('[data-select-uri]').forEach((el) => { el.onclick = () => { store.setVoice(el.dataset.selectUri, el.dataset.selectName); speakText("Voice updated.", 1.0, null, el.dataset.selectUri); notifyIsland(`Suara: ${el.dataset.selectName}`); renderSheet(); }; });
    const rb = document.getElementById('reloadVoicesBtn'); if (rb) rb.onclick = renderSheet;
  };
  renderSheet();
}

function renderDashboard() {
  const { rings, xp, currentLevel, vocabVault } = store.state;
  document.getElementById('xpValue').textContent = `${xp} XP`;
  document.getElementById('levelValue').textContent = currentLevel;
  document.getElementById('vaultCount').textContent = `${vocabVault.length} Kata`;

  const setRing = (id, cur, target, r) => {
    const c = 2 * Math.PI * r;
    const el = document.getElementById(id);
    el.style.strokeDasharray = `${c}`;
    el.style.strokeDashoffset = `${c * (1 - Math.min(cur / target, 1))}`;
  };
  setRing('ringVocab', rings.vocab.current, rings.vocab.target, 48);
  setRing('ringListen', rings.listening.current, rings.listening.target, 36);
  setRing('ringSpeak', rings.speaking.current, rings.speaking.target, 24);

  document.getElementById('statVocab').textContent = `${rings.vocab.current}/${rings.vocab.target}`;
  document.getElementById('statListen').textContent = `${rings.listening.current}/${rings.listening.target}`;
  document.getElementById('statSpeak').textContent = `${rings.speaking.current}/${rings.speaking.target}`;

  const vaultList = document.getElementById('vaultPreviewList');
  vaultList.innerHTML = vocabVault.slice(0, 4).map((item) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:0.5px solid var(--separator);">
      <div><span style="font-weight:700;">${item.word}</span><span style="font-size:12px;color:var(--text-secondary);margin-left:6px;">${item.phonetic}</span><div style="font-size:13px;color:var(--text-secondary);">${item.meaning}</div></div>
      <button class="btn-secondary" data-say="${item.word}">🔊</button>
    </div>`
  ).join('');
  vaultList.querySelectorAll('[data-say]').forEach((b) => { b.onclick = () => speakText(b.dataset.say); });
}

function initSpeakStudio(scenariosData) {
  let shIdx = 0, rpIdx = 0;
  const studioEl = document.getElementById('speakStudioContainer');

  function renderStudio() {
    const item = scenariosData.shadowing[shIdx];
    const rp = scenariosData.roleplays[rpIdx];
    studioEl.innerHTML = `
      <div class="ios-card">
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-purple);">Shadowing (${shIdx + 1}/${scenariosData.shadowing.length}) · ${item.level}</span>
          <button class="btn-secondary" id="nextShadowBtn" style="padding:5px 10px;font-size:12px;">Ganti Kalimat ↻</button>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Konteks: ${item.context}</p>
        <div style="font-size:18.5px;font-weight:700;line-height:1.4;margin-bottom:8px;">"${item.sentence}"</div>
        <p style="font-size:12px;color:var(--ios-blue);margin-bottom:10px;">💡 ${item.tip}</p>
        <div class="waveform" id="speakWaveform"><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div></div>
        <div id="studioResult" style="margin-bottom:12px;"></div>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <button class="btn-secondary" id="playNativeBtn" style="flex:1;">🔊 Native (1.0x)</button>
          <button class="btn-secondary" id="playSlowBtn" style="flex:1;">🐢 Lambat (0.75x)</button>
        </div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;">
          <button class="btn-primary" id="recordShadowBtn">🎙️ Rekam Suara</button>
          <button class="btn-secondary" id="demoShadowBtn">⚡ Demo</button>
        </div>
      </div>

      <div class="ios-card">
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-green);">Roleplay AI (${rpIdx + 1}/${scenariosData.roleplays.length})</span>
          <button class="btn-secondary" id="nextRpBtn" style="padding:5px 10px;font-size:12px;">Skenario Lain ↻</button>
        </div>
        <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${rp.title}</div>
        <p style="font-size:14px;margin-bottom:8px;line-height:1.45;">🤖 "${rp.aiPrompt}"</p>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Target balasan: <em>"${rp.suggestedReply}"</em></p>
        <div id="rpResult" style="margin-bottom:10px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1.3fr 0.8fr;gap:6px;">
          <button class="btn-secondary" id="playRoleplayBtn" style="font-size:12px;">🎧 AI</button>
          <button class="btn-primary" id="recordRpBtn" style="font-size:12px;padding:10px;">🎙️ Jawab</button>
          <button class="btn-secondary" id="demoRpBtn" style="font-size:12px;">⚡ Demo</button>
        </div>
      </div>
    `;

    const evalBlock = (target, spoken, elId) => {
      const res = evaluateSpeech(target, spoken);
      document.getElementById(elId).innerHTML = `<div class="ios-card" style="background:var(--bg-grouped);padding:11px;margin:0;"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;"><span>Skor Pelafalan: <strong>${res.accuracy}%</strong></span><span>Filler: <strong>${res.fillerCount}</strong></span></div><div>${res.wordAnalysis.map((w) => `<span class="word-chip-result ${w.ok ? 'word-ok' : 'word-miss'}">${w.word}</span>`).join('')}</div></div>`;
      if (res.accuracy >= 65) { store.incrementRing('speaking', 1, 20); notifyIsland(`Skor ${res.accuracy}%! Speaking +1`); }
      else notifyIsland(`Skor ${res.accuracy}%, coba tirukan lagi`);
    };

    document.getElementById('nextShadowBtn').onclick = () => { shIdx = (shIdx + 1) % scenariosData.shadowing.length; renderStudio(); };
    document.getElementById('playNativeBtn').onclick = () => speakText(item.sentence, 1.0);
    document.getElementById('playSlowBtn').onclick = () => speakText(item.sentence, 0.75);
    document.getElementById('recordShadowBtn').onclick = () => {
      const wave = document.getElementById('speakWaveform'); wave.classList.add('active'); notifyIsland('Mendengarkan...', true);
      startRecognition({ onResult: (t) => evalBlock(item.sentence, t, 'studioResult'), onError: (e) => notifyIsland(`Mic: ${e}`), onEnd: () => wave.classList.remove('active') });
    };
    document.getElementById('demoShadowBtn').onclick = () => evalBlock(item.sentence, item.sentence, 'studioResult');

    document.getElementById('nextRpBtn').onclick = () => { rpIdx = (rpIdx + 1) % scenariosData.roleplays.length; renderStudio(); };
    document.getElementById('playRoleplayBtn').onclick = () => speakText(rp.aiPrompt, 1.0);
    document.getElementById('recordRpBtn').onclick = () => {
      notifyIsland('Ucapkan jawaban roleplay...', true);
      startRecognition({ onResult: (t) => evalBlock(rp.suggestedReply, t, 'rpResult'), onError: (e) => notifyIsland(`Mic: ${e}`), onEnd: () => {} });
    };
    document.getElementById('demoRpBtn').onclick = () => evalBlock(rp.suggestedReply, rp.suggestedReply, 'rpResult');
  }
  renderStudio();
}

async function bootstrap() {
  document.documentElement.setAttribute('data-theme', store.state.theme);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=5').catch(() => {});
  if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = () => getEnglishVoices();

  const switchTab = (tabName) => {
    document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.getElementById(`view-${tabName}`)?.classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`)?.classList.add('active');
  };

  document.querySelectorAll('.tab-btn').forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });
  document.getElementById('continueLearningBtn').onclick = () => switchTab('path');
  document.getElementById('voicePickerBtn').onclick = openVoicePicker;
  document.getElementById('themeToggleBtn').onclick = () => { store.toggleTheme(); notifyIsland(`Mode ${store.state.theme === 'dark' ? 'Dark' : 'Light'} aktif`); };
  document.getElementById('sheetBackdrop').onclick = (e) => { if (e.target.id === 'sheetBackdrop') closeSheet(); };

  const [levelsData, briefsData, scenariosData, dictData] = await Promise.all([
    fetch('./data/levels.json?v=5').then((r) => r.json()),
    fetch('./data/briefs.json?v=5').then((r) => r.json()),
    fetch('./data/scenarios.json?v=5').then((r) => r.json()),
    fetch('./data/dictionary.json?v=5').then((r) => r.json())
  ]);

  initPathModule(levelsData, notifyIsland, openSheet, closeSheet);
  initBriefModule(briefsData, notifyIsland, openSheet);
  initSpeakStudio(scenariosData);
  initLexiconModule(dictData, notifyIsland, openSheet);
  window.addEventListener('begin:statechange', renderDashboard);
  renderDashboard();
}
bootstrap();
