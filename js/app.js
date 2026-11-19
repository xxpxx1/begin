import { store } from './state.js';
import { speakText, startRecognition, evaluateSpeech, getEnglishVoices, formatAccentTag } from './modules/speak.js';
import { initPathModule } from './modules/path.js';
import { initBriefModule } from './modules/brief.js';
import { initLexiconModule } from './modules/lexicon.js';

let islandTimer = null;

function notifyIsland(message, persistent = false) {
  const island = document.getElementById('dynamicIsland');
  const textEl = document.getElementById('islandText');
  const dotEl = document.getElementById('islandDot');
  textEl.textContent = message;
  island.classList.add('expanded');
  if (persistent) dotEl.classList.add('recording'); else dotEl.classList.remove('recording');
  clearTimeout(islandTimer);
  if (!persistent) {
    islandTimer = setTimeout(() => {
      island.classList.remove('expanded');
      dotEl.classList.remove('recording');
      textEl.textContent = `Begin · ${store.state.streakDays}d Streak`;
    }, 2800);
  }
}

function openSheet(html) {
  document.getElementById('sheetContent').innerHTML = html;
  document.getElementById('sheetBackdrop').classList.add('open');
}

function closeSheet() {
  document.getElementById('sheetBackdrop').classList.remove('open');
}

function openVoicePicker() {
  let accentFilter = 'ALL';

  const renderSheet = () => {
    const voices = getEnglishVoices();
    const filtered = voices.filter((v) => {
      if (accentFilter === 'ALL') return true;
      return v.lang.toUpperCase().includes(accentFilter);
    });

    openSheet(`
      <div class="card-label" style="color:var(--ios-blue);">Voice & Accent Studio</div>
      <h3 style="font-size:20px;margin:2px 0 4px;">Pilih Suara Native</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
        Aktif: <strong>${store.state.voiceName || 'Auto (Default)'}</strong>
      </p>

      <div class="level-pills" style="margin-bottom:12px;">
        ${['ALL', 'US', 'GB', 'AU'].map((tag) => `
          <button class="level-pill ${accentFilter === tag ? 'active' : ''}" data-vfilter="${tag}">
            ${tag === 'ALL' ? 'Semua' : tag === 'US' ? '🇺🇸 US' : tag === 'GB' ? '🇬🇧 UK' : '🇦🇺 AU'}
          </button>`).join('')}
      </div>

      <div style="max-height:46dvh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
        ${filtered.length ? filtered.map((v) => {
          const isSelected = store.state.voiceURI === v.voiceURI;
          const cleanName = v.name.replace(/Microsoft |Google |Android /g, '');
          return `
          <div class="ios-card" style="margin:0;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;border:${isSelected ? '1.5px solid var(--ios-blue)' : '0.5px solid var(--separator)'};">
            <div style="flex:1;cursor:pointer;" data-select-uri="${v.voiceURI}" data-select-name="${cleanName}">
              <div style="font-weight:700;font-size:14px;">
                ${isSelected ? '✓ ' : ''}${cleanName}
              </div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
                ${formatAccentTag(v.lang)} · ${v.localService ? 'Offline Ready' : 'Online'}
              </div>
            </div>
            <button class="btn-secondary" style="padding:6px 10px;font-size:12px;" data-preview-uri="${v.voiceURI}">🔊 Tes</button>
          </div>`;
        }).join('') : `
          <div class="ios-card" style="text-align:center;color:var(--text-secondary);font-size:13px;">
            Daftar suara sedang dimuat oleh sistem.<br/>
            <button class="btn-secondary" id="reloadVoicesBtn" style="margin-top:10px;">↻ Muat Ulang Suara</button>
          </div>`}
      </div>
    `);

    document.querySelectorAll('[data-vfilter]').forEach((btn) => {
      btn.onclick = () => { accentFilter = btn.dataset.vfilter; renderSheet(); };
    });

    document.querySelectorAll('[data-preview-uri]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        speakText("Hello! Let's practice English fluency together.", 1.0, null, btn.dataset.previewUri);
      };
    });

    document.querySelectorAll('[data-select-uri]').forEach((el) => {
      el.onclick = () => {
        store.setVoice(el.dataset.selectUri, el.dataset.selectName);
        speakText("Voice updated.", 1.0, null, el.dataset.selectUri);
        notifyIsland(`Suara: ${el.dataset.selectName}`);
        renderSheet();
      };
    });

    const reloadBtn = document.getElementById('reloadVoicesBtn');
    if (reloadBtn) reloadBtn.onclick = renderSheet;
  };

  renderSheet();
}

function renderDashboard() {
  const { rings, xp, streakDays, currentLevel, vocabVault } = store.state;
  document.getElementById('islandText').textContent = `Begin · ${streakDays}d Streak`;
  document.getElementById('xpValue').textContent = `${xp} XP`;
  document.getElementById('levelValue').textContent = currentLevel;
  document.getElementById('vaultCount').textContent = `${vocabVault.length} Kata`;

  const setRing = (id, cur, target, radius) => {
    const circle = document.getElementById(id);
    const c = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${c}`;
    circle.style.strokeDashoffset = `${c * (1 - Math.min(cur / target, 1))}`;
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
      <div>
        <span style="font-weight:700;">${item.word}</span>
        <span style="font-size:12px;color:var(--text-secondary);margin-left:6px;">${item.phonetic}</span>
        <div style="font-size:13px;color:var(--text-secondary);">${item.meaning}</div>
      </div>
      <button class="btn-secondary" data-say="${item.word}">🔊</button>
    </div>`
  ).join('');
  vaultList.querySelectorAll('[data-say]').forEach((btn) => { btn.onclick = () => speakText(btn.dataset.say); });
}

function initSpeakStudio(scenariosData) {
  let shIdx = 0;
  const studioEl = document.getElementById('speakStudioContainer');

  function renderStudio() {
    const item = scenariosData.shadowing[shIdx];
    const rp = scenariosData.roleplays[0];
    studioEl.innerHTML = `
      <div class="ios-card">
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-purple);">Shadowing Studio · ${item.level}</span>
          <button class="btn-secondary" id="nextShadowBtn" style="padding:5px 10px;font-size:12px;">Ganti Kalimat ↻</button>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Konteks: ${item.context}</p>
        <div style="font-size:19px;font-weight:700;line-height:1.4;margin-bottom:8px;">"${item.sentence}"</div>
        <p style="font-size:12px;color:var(--ios-blue);margin-bottom:12px;">💡 ${item.tip}</p>
        <div class="waveform" id="speakWaveform">
          <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
        </div>
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
        <div class="card-label" style="color:var(--ios-green);">Roleplay AI · ${rp.title}</div>
        <p style="font-size:14px;margin:8px 0;font-weight:600;">🤖 "${rp.aiPrompt}"</p>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Saran jawaban: <em>"${rp.suggestedReply}"</em></p>
        <button class="btn-secondary" id="playRoleplayBtn" style="width:100%;">🎧 Dengar Pertanyaan AI</button>
      </div>
    `;

    document.getElementById('nextShadowBtn').onclick = () => { shIdx = (shIdx + 1) % scenariosData.shadowing.length; renderStudio(); };
    document.getElementById('playNativeBtn').onclick = () => speakText(item.sentence, 1.0);
    document.getElementById('playSlowBtn').onclick = () => speakText(item.sentence, 0.75);
    document.getElementById('playRoleplayBtn').onclick = () => speakText(rp.aiPrompt, 1.0);

    const showResult = (spoken) => {
      const res = evaluateSpeech(item.sentence, spoken);
      document.getElementById('studioResult').innerHTML = `
        <div class="ios-card" style="background:var(--bg-grouped);padding:12px;margin:0;">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
            <span>Skor Pelafalan: <strong>${res.accuracy}%</strong></span>
            <span>Filler: <strong>${res.fillerCount}</strong></span>
          </div>
          <div>${res.wordAnalysis.map((w) => `<span class="word-chip-result ${w.ok ? 'word-ok' : 'word-miss'}">${w.word}</span>`).join('')}</div>
        </div>
      `;
      if (res.accuracy >= 65) {
        store.incrementRing('speaking', 1, 20);
        notifyIsland(`Skor ${res.accuracy}%! Cincin Speaking bertambah`);
      } else { notifyIsland(`Skor ${res.accuracy}%, coba tirukan ritmenya lagi`); }
    };

    document.getElementById('recordShadowBtn').onclick = () => {
      const wave = document.getElementById('speakWaveform');
      wave.classList.add('active');
      notifyIsland('Mendengarkan pelafalan...', true);
      startRecognition({ onResult: (t) => showResult(t), onError: (err) => notifyIsland(`Mic: ${err}`), onEnd: () => wave.classList.remove('active') });
    };
    document.getElementById('demoShadowBtn').onclick = () => showResult(item.sentence);
  }
  renderStudio();
}

async function bootstrap() {
  document.documentElement.setAttribute('data-theme', store.state.theme);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = () => getEnglishVoices();

  const switchTab = (tabName) => {
    document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.getElementById(`view-${tabName}`).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
  };

  document.querySelectorAll('.tab-btn').forEach((btn) => { btn.onclick = () => switchTab(btn.dataset.tab); });
  document.getElementById('continueLearningBtn').onclick = () => switchTab('path');
  document.getElementById('voicePickerBtn').onclick = openVoicePicker;
  document.getElementById('themeToggleBtn').onclick = () => { store.toggleTheme(); notifyIsland(`Mode ${store.state.theme === 'dark' ? 'Dark' : 'Light'} aktif`); };
  document.getElementById('sheetBackdrop').onclick = (e) => { if (e.target.id === 'sheetBackdrop') closeSheet(); };

  const [levelsData, briefsData, scenariosData, dictData] = await Promise.all([
    fetch('./data/levels.json').then((r) => r.json()),
    fetch('./data/briefs.json').then((r) => r.json()),
    fetch('./data/scenarios.json').then((r) => r.json()),
    fetch('./data/dictionary.json').then((r) => r.json())
  ]);

  initPathModule(levelsData, notifyIsland, openSheet, closeSheet);
  initBriefModule(briefsData, notifyIsland, openSheet);
  initSpeakStudio(scenariosData);
  initLexiconModule(dictData, notifyIsland, openSheet);
  window.addEventListener('begin:statechange', renderDashboard);
  renderDashboard();
}
bootstrap();
