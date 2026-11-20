import { store } from './state.js?v=8';
import { speakText, startRecognition, evaluateSpeech, getEnglishVoices, formatAccentTag } from './modules/speak.js?v=8';
import { initPathModule } from './modules/path.js?v=8';
import { initBriefModule } from './modules/brief.js?v=8';
import { initLexiconModule } from './modules/lexicon.js?v=8';

let toastTimer = null;
let isLandingMode = true;

function notifyIsland(message, persistent = false) {
  const toast = document.getElementById('floatingToast');
  const textEl = document.getElementById('toastText');
  const dotEl = document.getElementById('toastDot');
  textEl.textContent = message;
  toast.classList.add('show');
  if (persistent) dotEl.classList.add('recording'); else dotEl.classList.remove('recording');
  clearTimeout(toastTimer);
  if (!persistent) {
    toastTimer = setTimeout(() => { toast.classList.remove('show'); dotEl.classList.remove('recording'); }, 2600);
  }
}

function openSheet(html) { document.getElementById('sheetContent').innerHTML = html; document.getElementById('sheetBackdrop').classList.add('open'); }
function closeSheet() { document.getElementById('sheetBackdrop').classList.remove('open'); }


function updateTabGlider(targetTab) {
  const glider = document.getElementById('tabGlider');
  const btn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
  if (!glider || !btn || !btn.offsetWidth) return;
  glider.style.width = `${btn.offsetWidth}px`;
  glider.style.transform = `translateX(${btn.offsetLeft - 6}px)`;
}

function animateLandingCounters() {
  document.querySelectorAll('.kpi-num[data-target]').forEach((el) => {
    const target = Number(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    const start = performance.now();
    const duration = 850;
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = `${Math.round(target * eased)}${suffix}`;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function setAppMode(openApp, targetTab = 'today') {
  if (navigator.vibrate) navigator.vibrate(8);
  window.__stopBriefAudio?.();
  isLandingMode = !openApp;
  const landingView = document.getElementById('view-landing');
  const tabBar = document.getElementById('bottomTabBar');
  const mainContainer = document.getElementById('mainContainer');
  const switchBtn = document.getElementById('modeSwitchBtn');

  document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));

  if (openApp) {
    landingView.classList.remove('active');
    tabBar.classList.remove('hidden');
    mainContainer.classList.remove('landing-active');
    switchBtn.textContent = 'Beranda';
    document.getElementById(`view-${targetTab}`)?.classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${targetTab}"]`)?.classList.add('active');
    requestAnimationFrame(() => updateTabGlider(targetTab));
  } else {
    landingView.classList.add('active');
    tabBar.classList.add('hidden');
    mainContainer.classList.add('landing-active');
    switchBtn.textContent = 'Buka Aplikasi';
    animateLandingCounters();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openVoicePicker() {
  let accentFilter = 'ALL';
  const renderSheet = () => {
    const voices = getEnglishVoices();
    const filtered = voices.filter((v) => accentFilter === 'ALL' || v.lang.toUpperCase().includes(accentFilter));
    openSheet(`
      <div class="card-label" style="color:var(--ios-blue);">Pengaturan Suara Native</div>
      <h3 style="font-size:20px;margin:2px 0 4px;">Pilih Suara & Aksen</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Aktif: <strong>${store.state.voiceName || 'Auto (Default)'}</strong></p>
      <div class="level-pills" style="margin-bottom:12px;">
        ${['ALL', 'US', 'GB', 'AU'].map((t) => `<button class="level-pill ${accentFilter === t ? 'active' : ''}" data-vfilter="${t}">${t === 'ALL' ? 'Semua' : t === 'US' ? 'US' : t === 'GB' ? 'UK' : 'AU'}</button>`).join('')}
      </div>
      <div style="max-height:46dvh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
        ${filtered.length ? filtered.map((v) => {
          const isSel = store.state.voiceURI === v.voiceURI;
          const name = v.name.replace(/Microsoft |Google |Android /g, '');
          return `<div class="ios-card" style="margin:0;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;border:${isSel ? '1.5px solid var(--ios-blue)' : '1px solid var(--separator)'};">
            <div style="flex:1;cursor:pointer;" data-select-uri="${v.voiceURI}" data-select-name="${name}">
              <div style="font-weight:700;font-size:14px;">${isSel ? '✓ ' : ''}${name}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${formatAccentTag(v.lang)} · ${v.localService ? 'Offline' : 'Online'}</div>
            </div>
            <button class="btn-secondary" style="padding:6px 10px;font-size:12px;" data-preview-uri="${v.voiceURI}">Tes</button>
          </div>`;
        }).join('') : `<div class="ios-card" style="text-align:center;font-size:13px;">Memuat daftar suara...<br/><button class="btn-secondary" id="reloadVoicesBtn" style="margin-top:10px;">Muat Ulang</button></div>`}
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
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--separator);">
      <div><span style="font-weight:700;">${item.word}</span><span style="font-size:12px;color:var(--text-secondary);margin-left:6px;">${item.phonetic}</span><div style="font-size:13px;color:var(--text-secondary);">${item.meaning}</div></div>
      <button class="btn-secondary" data-say="${item.word}" style="padding:7px 9px;"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
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
      <div class="ios-card" style="background:rgba(26,109,255,0.06);border-color:rgba(26,109,255,0.22);padding:14px;">
        <div class="card-label" style="color:var(--ios-blue);margin-bottom:4px;">Cara Latihan di Menu Speak</div>
        <div style="font-size:12.5px;color:var(--text-primary);line-height:1.5;">
          <strong>Langkah 1:</strong> Tekan <em>Dengar Contoh</em> untuk menyimak pelafalan asli.<br/>
          <strong>Langkah 2:</strong> Tekan <em>Rekam & Tirukan</em> lalu ucapkan kalimatnya. Kata hijau = tepat, merah = ulangi.
        </div>
      </div>

      <div class="ios-card">
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-purple);">Latihan 1 · Tirukan Kalimat (${shIdx + 1}/${scenariosData.shadowing.length})</span>
          <button class="btn-secondary" id="nextShadowBtn" style="padding:5px 10px;font-size:12px;">Ganti Kalimat</button>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Situasi: ${item.context} · Level ${item.level}</p>
        <div style="font-size:18px;font-weight:800;line-height:1.4;margin-bottom:8px;">"${item.sentence}"</div>
        <p style="font-size:12px;color:var(--ios-blue);margin-bottom:10px;">Tips: ${item.tip}</p>
        <div class="waveform" id="speakWaveform"><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div></div>
        <div id="studioResult" style="margin-bottom:12px;"></div>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <button class="btn-secondary" id="playNativeBtn" style="flex:1;">1. Dengar Normal</button>
          <button class="btn-secondary" id="playSlowBtn" style="flex:1;">Dengar Lambat</button>
        </div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;">
          <button class="btn-primary" id="recordShadowBtn">2. Rekam & Tirukan</button>
          <button class="btn-secondary" id="demoShadowBtn">Tes Demo</button>
        </div>
      </div>

      <div class="ios-card">
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-green);">Latihan 2 · Simulasi Percakapan AI (${rpIdx + 1}/${scenariosData.roleplays.length})</span>
          <button class="btn-secondary" id="nextRpBtn" style="padding:5px 10px;font-size:12px;">Topik Lain</button>
        </div>
        <div style="font-weight:800;font-size:15px;margin-bottom:6px;">${rp.title}</div>
        <div style="background:var(--bg-grouped);padding:10px 12px;border-radius:12px;margin-bottom:8px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-secondary);">PERTANYAAN PARTNER AI:</div>
          <div style="font-size:14px;font-weight:600;margin-top:2px;">"${rp.aiPrompt}"</div>
        </div>
        <div style="background:rgba(16,185,129,0.08);padding:10px 12px;border-radius:12px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--ios-green);">GILIRAN KAMU MENJAWAB (BACA KALIMAT INI):</div>
          <div style="font-size:13.5px;font-weight:600;margin-top:2px;">"${rp.suggestedReply}"</div>
        </div>
        <div id="rpResult" style="margin-bottom:10px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1.4fr 0.8fr;gap:6px;">
          <button class="btn-secondary" id="playRoleplayBtn" style="font-size:12px;">1. Dengar AI</button>
          <button class="btn-primary" id="recordRpBtn" style="font-size:12px;padding:10px;">2. Rekam Jawaban</button>
          <button class="btn-secondary" id="demoRpBtn" style="font-size:12px;">Demo</button>
        </div>
      </div>
    `;

    const evalBlock = (target, spoken, elId) => {
      const res = evaluateSpeech(target, spoken);
      document.getElementById(elId).innerHTML = `<div class="ios-card" style="background:var(--bg-grouped);padding:11px;margin:0;"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;"><span>Skor Pelafalan: <strong>${res.accuracy}%</strong></span><span>Kata Tepat</span></div><div>${res.wordAnalysis.map((w) => `<span class="word-chip-result ${w.ok ? 'word-ok' : 'word-miss'}">${w.word}</span>`).join('')}</div></div>`;
      if (res.accuracy >= 65) { store.incrementRing('speaking', 1, 20); notifyIsland(`Skor ${res.accuracy}%! Cincin Berbicara +1`); }
      else notifyIsland(`Skor ${res.accuracy}%, coba ulangi perlahan`);
    };

    document.getElementById('nextShadowBtn').onclick = () => { shIdx = (shIdx + 1) % scenariosData.shadowing.length; renderStudio(); };
    document.getElementById('playNativeBtn').onclick = () => speakText(item.sentence, 1.0);
    document.getElementById('playSlowBtn').onclick = () => speakText(item.sentence, 0.75);
    document.getElementById('recordShadowBtn').onclick = () => {
      const wave = document.getElementById('speakWaveform'); wave.classList.add('active'); notifyIsland('Silakan ucapkan kalimatnya...', true);
      startRecognition({ onResult: (t) => evalBlock(item.sentence, t, 'studioResult'), onError: (e) => notifyIsland(`Mic: ${e}`), onEnd: () => wave.classList.remove('active') });
    };
    document.getElementById('demoShadowBtn').onclick = () => evalBlock(item.sentence, item.sentence, 'studioResult');

    document.getElementById('nextRpBtn').onclick = () => { rpIdx = (rpIdx + 1) % scenariosData.roleplays.length; renderStudio(); };
    document.getElementById('playRoleplayBtn').onclick = () => speakText(rp.aiPrompt, 1.0);
    document.getElementById('recordRpBtn').onclick = () => {
      notifyIsland('Silakan ucapkan jawabanmu...', true);
      startRecognition({ onResult: (t) => evalBlock(rp.suggestedReply, t, 'rpResult'), onError: (e) => notifyIsland(`Mic: ${e}`), onEnd: () => {} });
    };
    document.getElementById('demoRpBtn').onclick = () => evalBlock(rp.suggestedReply, rp.suggestedReply, 'rpResult');
  }
  renderStudio();
}

async function bootstrap() {
  document.documentElement.setAttribute('data-theme', store.state.theme);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=8').catch(() => {});
  if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = () => getEnglishVoices();

  // Landing Page Controls
  const heroDemoSentence = "No worries, let's grab a coffee and catch up!";
  document.getElementById('heroPlayBtn').onclick = () => speakText(heroDemoSentence, 1.0);
  const runHeroEval = (spoken) => {
    const res = evaluateSpeech(heroDemoSentence, spoken);
    document.getElementById('heroVoiceResult').innerHTML = `<div style="font-size:12px;margin-bottom:4px;">Akurasi Pelafalan: <strong>${res.accuracy}%</strong></div><div>${res.wordAnalysis.map((w) => `<span class="word-chip-result ${w.ok ? 'word-ok' : 'word-miss'}">${w.word}</span>`).join('')}</div>`;
  };
  document.getElementById('heroMicBtn').onclick = () => {
    notifyIsland('Ucapkan kalimat di kartu...', true);
    startRecognition({ onResult: runHeroEval, onError: (e) => notifyIsland(`Mic: ${e}`), onEnd: () => {} });
  };
  document.getElementById('heroSimBtn').onclick = () => runHeroEval(heroDemoSentence);

  document.getElementById('heroStartBtn').onclick = () => setAppMode(true, 'today');
  document.getElementById('heroExploreBtn').onclick = () => setAppMode(true, 'words');
  document.getElementById('bannerOpenAppBtn').onclick = () => setAppMode(true, 'today');
  document.getElementById('brandHomeBtn').onclick = () => setAppMode(false);
  document.getElementById('modeSwitchBtn').onclick = () => setAppMode(isLandingMode, 'today');

  document.querySelectorAll('[data-jump]').forEach((card) => {
    card.onclick = () => setAppMode(true, card.dataset.jump);
  });
  document.querySelectorAll('[data-mission]').forEach((row) => {
    row.onclick = () => setAppMode(true, row.dataset.mission);
  });

  document.querySelectorAll('.tab-btn').forEach((b) => { b.onclick = () => setAppMode(true, b.dataset.tab); });
  document.getElementById('voicePickerBtn').onclick = openVoicePicker;
  document.getElementById('themeToggleBtn').onclick = () => { store.toggleTheme(); notifyIsland(`Mode ${store.state.theme === 'dark' ? 'Dark' : 'Light'} aktif`); };
  document.getElementById('sheetBackdrop').onclick = (e) => { if (e.target.id === 'sheetBackdrop') closeSheet(); };

  const [levelsData, briefsData, scenariosData, dictData] = await Promise.all([
    fetch('./data/levels.json?v=8').then((r) => r.json()),
    fetch('./data/briefs.json?v=8').then((r) => r.json()),
    fetch('./data/scenarios.json?v=8').then((r) => r.json()),
    fetch('./data/dictionary.json?v=8').then((r) => r.json())
  ]);

  initPathModule(levelsData, notifyIsland, openSheet, closeSheet);
  initBriefModule(briefsData, notifyIsland, openSheet);
  initSpeakStudio(scenariosData);
  initLexiconModule(dictData, notifyIsland, openSheet);
  window.addEventListener('begin:statechange', renderDashboard);
  renderDashboard();
  animateLandingCounters();
  window.addEventListener('resize', () => {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab && !isLandingMode) updateTabGlider(activeTab);
  });
}
bootstrap();
