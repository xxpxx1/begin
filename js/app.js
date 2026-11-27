import { escapeHTML } from './core/security.js';
import { store } from './state.js?v=35';
import { initSpeak, speakText, stopSpeech, playTone, startRecognition, evaluateSpeech, getEnglishVoices, formatAccentTag } from './modules/speak.js?v=35';
import { initPathModule } from './modules/path.js?v=35';
import { initBriefModule } from './modules/brief.js?v=35';
import { initLexiconModule } from './modules/lexicon.js?v=35';
import { renderToday } from './modules/today.js?v=35';

let toastTimer = null;
let isLandingMode = true;

function notifyIsland(message, persistent = false) {
  const toast = document.getElementById('floatingToast');
  const textEl = document.getElementById('toastText');
  const dotEl = document.getElementById('toastDot');
  if (!toast) return;
  textEl.textContent = message;
  toast.classList.add('show');
  if (persistent) dotEl.classList.add('recording'); else dotEl.classList.remove('recording');
  clearTimeout(toastTimer);
  if (!persistent) toastTimer = setTimeout(() => { toast.classList.remove('show'); dotEl.classList.remove('recording'); }, 2400);
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
    const step = (now) => {
      const p = Math.min((now - start) / 750, 1);
      el.textContent = `${Math.round(target * (1 - Math.pow(1 - p, 3)))}${suffix}`;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function setAppMode(openApp, targetTab = 'today') {
  if (targetTab === 'word') targetTab = 'words';
  if (navigator.vibrate) navigator.vibrate(8);
  if (typeof window.__stopBriefAudio === 'function') window.__stopBriefAudio();
  else stopSpeech();

  isLandingMode = !openApp;
  const landingView = document.getElementById('view-landing');
  const tabBar = document.getElementById('bottomTabBar');
  const mainContainer = document.getElementById('mainContainer');
  const switchBtn = document.getElementById('modeSwitchBtn');
  const appShell = document.getElementById('appShell');

  const syncLandingTheme = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                   document.body.getAttribute('data-theme') === 'dark' ||
                   document.body.classList.contains('dark') ||
                   document.body.classList.contains('dark-theme');
    const shell = document.getElementById('appShell');
    const meta = document.getElementById('metaThemeColor');
    if (shell) shell.classList.toggle('theme-dark', isDark);
    if (meta) meta.setAttribute('content', isDark ? '#071326' : '#E2DBD0');
  };
  syncLandingTheme();
  new MutationObserver(syncLandingTheme).observe(document.documentElement, { attributes: true });
  new MutationObserver(syncLandingTheme).observe(document.body, { attributes: true });


  document.querySelectorAll('.tab-view').forEach((v) => {
    v.classList.remove('active');
    v.style.display = '';
  });
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  if (landingView) landingView.style.display = '';
  if (tabBar) tabBar.style.display = '';

  if (openApp) {
    landingView.classList.remove('active');
    tabBar.classList.remove('hidden');
    mainContainer.classList.remove('landing-active');
    appShell?.classList.remove('is-landing');
    switchBtn.textContent = 'Beranda';
    document.getElementById(`view-${targetTab}`)?.classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${targetTab}"]`)?.classList.add('active');
    requestAnimationFrame(() => updateTabGlider(targetTab));
  } else {
    landingView.classList.add('active');
    tabBar.classList.add('hidden');
    mainContainer.classList.add('landing-active');
    appShell?.classList.add('is-landing');
    switchBtn.textContent = 'Buka Aplikasi';
    animateLandingCounters();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openVoicePicker() {
  let accentFilter = 'ALL';
  const speeds = [[0.65,'Sangat Lambat'],[0.85,'Lambat'],[1.0,'Normal'],[1.2,'Cepat']];
  const renderSheet = () => {
    const voices = getEnglishVoices();
    const filtered = voices.filter((v) => accentFilter === 'ALL' || v.lang.toUpperCase().includes(accentFilter));
    openSheet(`
      <div class="card-label" style="color:var(--ios-blue);">Pengaturan Suara & Kecepatan AI</div>
      <h3 style="font-size:20px;margin:2px 0 10px;">Kecepatan Bicara Global</h3>
      <div class="speed-bar" style="margin-bottom:14px;">
        ${speeds.map(([val, lbl]) => `<button class="speed-pill ${store.state.speechRate === val ? 'active' : ''}" data-gspeed="${val}">${val}x<br/><span style="font-size:9.5px;font-weight:500;">${lbl}</span></button>`).join('')}
      </div>
      <div class="level-pills" style="margin-bottom:10px;">
        ${['ALL', 'US', 'GB', 'AU'].map((t) => `<button class="level-pill ${accentFilter === t ? 'active' : ''}" data-vfilter="${t}">${t === 'ALL' ? 'Semua Aksen' : t}</button>`).join('')}
      </div>
      <div style="max-height:38dvh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
        ${filtered.map((v) => {
          const isSel = store.state.voiceURI === v.voiceURI;
          const name = v.name.replace(/Microsoft |Google |Android /g, '');
          return `<div class="ios-card" style="margin:0;padding:11px 14px;display:flex;justify-content:space-between;align-items:center;border:${isSel ? '1.5px solid var(--ios-blue)' : '1px solid var(--separator)'};">
            <div style="flex:1;cursor:pointer;" data-select-uri="${v.voiceURI}" data-select-name="${name}">
              <div style="font-weight:700;font-size:14px;">${isSel ? '✓ ' : ''}${name}</div>
              <div style="font-size:11px;color:var(--text-secondary);">${formatAccentTag(v.lang)}</div>
            </div>
            <button class="btn-secondary" style="padding:6px 10px;font-size:12px;" data-preview-uri="${v.voiceURI}">Tes</button>
          </div>`;
        }).join('')}
      </div>
    `);
    document.querySelectorAll('[data-gspeed]').forEach((b) => { b.onclick = () => { store.setSpeechRate(Number(b.dataset.gspeed)); speakText("Speed updated.", store.state.speechRate); renderSheet(); }; });
    document.querySelectorAll('[data-vfilter]').forEach((b) => { b.onclick = () => { accentFilter = b.dataset.vfilter; renderSheet(); }; });
    document.querySelectorAll('[data-preview-uri]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); speakText("Hello! Let's practice English fluency.", null, null, b.dataset.previewUri); }; });
    document.querySelectorAll('[data-select-uri]').forEach((el) => { el.onclick = () => { store.setVoice(el.dataset.selectUri, el.dataset.selectName); speakText("Voice updated.", null, null, el.dataset.selectUri); renderSheet(); }; });
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
    if (!el) return;
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
      <div><span style="font-weight:700;">${escapeHTML(item.word)}</span><span style="font-size:12px;color:var(--text-secondary);margin-left:6px;">${item.phonetic}</span><div style="font-size:13px;color:var(--text-secondary);">${escapeHTML(item.meaning)}</div></div>
      <button class="btn-secondary" data-say="${escapeHTML(item.word)}" style="padding:7px 9px;"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
    </div>`
  ).join('');
  vaultList.querySelectorAll('[data-say]').forEach((b) => { b.onclick = () => speakText(b.dataset.say); });
  renderToday();
}

function initSpeakStudio(scenariosData) {
  let shIdx = 0, rpIdx = 0;
  const studioEl = document.getElementById('speakStudioContainer');
  const speeds = [[0.65,'0.65x'],[0.85,'0.85x'],[1.0,'1.0x'],[1.2,'1.2x']];

  function renderStudio() {
    const item = scenariosData.shadowing[shIdx];
    const rp = scenariosData.roleplays[rpIdx];
    const curRate = store.state.speechRate || 1.0;

    studioEl.innerHTML = `
      <div class="ios-card">
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-blue);">Kecepatan Suara AI</span>
          <span style="font-size:11.5px;font-weight:700;color:var(--text-secondary);">${curRate === 0.65 ? 'Sangat Lambat' : curRate === 0.85 ? 'Lambat' : curRate === 1.2 ? 'Cepat' : 'Normal'}</span>
        </div>
        <div class="speed-bar" style="margin-bottom:0;">
          ${speeds.map(([val, lbl]) => `<button class="speed-pill ${curRate === val ? 'active' : ''}" data-sspeed="${val}">${lbl}</button>`).join('')}
        </div>
      </div>

      <div class="ios-card">
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-purple);">Latihan Tirukan Kalimat · ${shIdx + 1}/${scenariosData.shadowing.length}</span>
          <button class="btn-secondary" id="nextShadowBtn" style="padding:5px 10px;font-size:12px;">Ganti Kalimat</button>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Situasi: ${item.context} · Level ${item.level}</p>
        <div style="font-size:18px;font-weight:800;line-height:1.4;margin-bottom:8px;">"${item.sentence}"</div>
        <p style="font-size:12px;color:var(--ios-blue);margin-bottom:10px;">Tips: ${item.tip}</p>
        <div class="waveform" id="speakWaveform"><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div></div>
        <div id="studioResult" style="margin-bottom:12px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1.4fr 0.8fr;gap:7px;">
          <button class="btn-secondary" id="playNativeBtn" style="font-size:12.5px;">Dengar AI</button>
          <button class="btn-primary" id="recordShadowBtn" style="padding:11px;font-size:12.5px;">Rekam Suara</button>
          <button class="btn-secondary" id="demoShadowBtn" style="font-size:12.5px;">Simulasi</button>
        </div>
      </div>

      <div class="ios-card">
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-green);">Simulasi Percakapan · ${rpIdx + 1}/${scenariosData.roleplays.length}</span>
          <button class="btn-secondary" id="nextRpBtn" style="padding:5px 10px;font-size:12px;">Topik Lain</button>
        </div>
        <div style="font-weight:800;font-size:15px;margin-bottom:6px;">${rp.title}</div>
        <div style="background:var(--bg-grouped);padding:10px 12px;border-radius:12px;margin-bottom:8px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-secondary);">PERTANYAAN AI:</div>
          <div style="font-size:14px;font-weight:600;margin-top:2px;">"${rp.aiPrompt}"</div>
        </div>
        <div style="background:rgba(16,185,129,0.09);padding:10px 12px;border-radius:12px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--ios-green);">JAWABAN KAMU:</div>
          <div style="font-size:13.5px;font-weight:600;margin-top:2px;">"${rp.suggestedReply}"</div>
        </div>
        <div id="rpResult" style="margin-bottom:10px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1.4fr 0.8fr;gap:7px;">
          <button class="btn-secondary" id="playRoleplayBtn" style="font-size:12.5px;">Dengar AI</button>
          <button class="btn-primary" id="recordRpBtn" style="font-size:12.5px;padding:11px;">Jawab Suara</button>
          <button class="btn-secondary" id="demoRpBtn" style="font-size:12.5px;">Simulasi</button>
        </div>
      </div>
    `;

    studioEl.querySelectorAll('[data-sspeed]').forEach((b) => { b.onclick = () => { store.setSpeechRate(Number(b.dataset.sspeed)); renderStudio(); }; });

    const evalBlock = (target, spoken, elId) => {
      const res = evaluateSpeech(target, spoken);
      const ok = res.accuracy >= 65;
      document.getElementById(elId).innerHTML = `<div class="ios-card" style="background:var(--bg-grouped);padding:11px;margin:0;"><div style="font-size:12.5px;margin-bottom:6px;">Akurasi Pelafalan: <strong style="color:${ok ? 'var(--ios-green)' : 'var(--ios-red)'};">${res.accuracy}%</strong></div><div>${res.wordAnalysis.map((w) => `<span class="word-chip-result ${w.ok ? 'word-ok' : 'word-miss'}">${escapeHTML(w.word)}</span>`).join('')}</div></div>`;
      if (ok) { playTone('success'); store.incrementRing('speaking', 1, 20); }
      else { playTone('error'); if (navigator.vibrate) navigator.vibrate(35); }
    };

    document.getElementById('nextShadowBtn').onclick = () => { shIdx = (shIdx + 1) % scenariosData.shadowing.length; renderStudio(); };
    document.getElementById('playNativeBtn').onclick = () => speakText(item.sentence);
    document.getElementById('recordShadowBtn').onclick = () => {
      const wave = document.getElementById('speakWaveform'); wave.classList.add('active'); notifyIsland('Mendengarkan...', true);
      startRecognition({ onResult: (t) => evalBlock(item.sentence, t, 'studioResult'), onError: (e) => notifyIsland(`Mic: ${e}`), onEnd: () => wave.classList.remove('active') });
    };
    document.getElementById('demoShadowBtn').onclick = () => evalBlock(item.sentence, item.sentence, 'studioResult');

    document.getElementById('nextRpBtn').onclick = () => { rpIdx = (rpIdx + 1) % scenariosData.roleplays.length; renderStudio(); };
    document.getElementById('playRoleplayBtn').onclick = () => speakText(rp.aiPrompt);
    document.getElementById('recordRpBtn').onclick = () => {
      notifyIsland('Ucapkan jawabanmu...', true);
      startRecognition({ onResult: (t) => evalBlock(rp.suggestedReply, t, 'rpResult'), onError: (e) => notifyIsland(`Mic: ${e}`), onEnd: () => {} });
    };
    document.getElementById('demoRpBtn').onclick = () => evalBlock(rp.suggestedReply, rp.suggestedReply, 'rpResult');
  }
  renderStudio();
}

async function bootstrap() {
  document.documentElement.setAttribute('data-theme', store.state.theme);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=35').catch(() => {});
  if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = () => getEnglishVoices();

  let landingSlangPool = [
    { word: "no cap", phonetic: "/noʊ kæp/", meaning: "serius / tidak bohong (beneran)", example: "That new update is super fast, no cap." },
    { word: "lowkey", phonetic: "/ˈloʊkiː/", meaning: "diam-diam / sebenarnya", example: "I am lowkey excited to try this feature." },
    { word: "hit me up", phonetic: "/hɪt miː ʌp/", meaning: "kabari aku / hubungi aku nanti", example: "Hit me up whenever you are free tonight." }
  ];
  let slangCursor = 0;
  const capFirst = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const showLandingSlang = () => {
    const idx = slangCursor % landingSlangPool.length;
    const cur = landingSlangPool[idx];
    document.getElementById('landingSlangWord').textContent = capFirst(cur.word);
    document.getElementById('landingSlangPhonetic').textContent = cur.phonetic;
    document.getElementById('landingSlangMeaning').textContent = capFirst(cur.meaning);
    document.getElementById('landingSlangExample').textContent = `“${cur.example}”`;
    const cnt = document.getElementById('landingSlangCounter');
    if (cnt) cnt.textContent = `${idx + 1} / ${landingSlangPool.length}`;
  };
  const nextSlangAction = () => {
    slangCursor = (slangCursor + 1) % landingSlangPool.length;
    showLandingSlang();
    speakText(landingSlangPool[slangCursor].word);
  };
  document.getElementById('shuffleLandingSlangBtn').onclick = nextSlangAction;
  const refBtn = document.getElementById('refreshLandingSlangBtn');
  if (refBtn) refBtn.onclick = nextSlangAction;
  document.getElementById('playLandingSlangBtn').onclick = () => speakText(`${landingSlangPool[slangCursor].word}. ${landingSlangPool[slangCursor].example}`);
  const offBtn = document.getElementById('offlineBadgeBtn');
  if (offBtn) offBtn.onclick = () => notifyIsland('100% Siap Offline di perangkatmu');

  document.getElementById('heroStartBtn').onclick = () => setAppMode(true, 'today');
  document.getElementById('brandHomeBtn').onclick = () => setAppMode(false);
  document.getElementById('modeSwitchBtn').onclick = () => setAppMode(isLandingMode, 'today');
  document.querySelectorAll('[data-jump]').forEach((el) => { el.onclick = () => setAppMode(true, el.dataset.jump); });
  document.querySelectorAll('[data-mission]').forEach((el) => { el.onclick = () => setAppMode(true, el.dataset.mission); });
  document.querySelectorAll('.tab-btn').forEach((b) => { b.onclick = () => setAppMode(true, b.dataset.tab); });

  document.getElementById('voicePickerBtn').onclick = openVoicePicker;
  document.getElementById('themeToggleBtn').onclick = () => { store.toggleTheme(); notifyIsland(`Mode ${store.state.theme === 'dark' ? 'Dark' : 'Light'} aktif`); };
  document.getElementById('sheetBackdrop').onclick = (e) => { if (e.target.id === 'sheetBackdrop') closeSheet(); };

  window.addEventListener('begin:statechange', renderDashboard);
  renderDashboard();
  animateLandingCounters();
  window.addEventListener('resize', () => {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab && !isLandingMode) updateTabGlider(activeTab);
  });

  const [levelsData, briefsData, scenariosData, dictData] = await Promise.all([
    fetch('./data/levels.json?v=35').then((r) => r.json()),
    fetch('./data/briefs.json?v=35').then((r) => r.json()),
    fetch('./data/scenarios.json?v=35').then((r) => r.json()),
    fetch('./data/dictionary.json?v=35').then((r) => r.json())
  ]);
  initPathModule(levelsData, notifyIsland, openSheet, closeSheet);
  initBriefModule(briefsData, notifyIsland, openSheet);
  initSpeak(scenariosData);
  initLexiconModule(dictData, notifyIsland, openSheet);
  const slangs = dictData.words.filter((w) => w.pos === 'slang');
  if (slangs.length) { landingSlangPool = slangs; showLandingSlang(); }
}
bootstrap();

// === LANDING THEME SYNC ===
(function attachLandingThemeSync() {
  const detectDark = () => {
    const root = document.documentElement;
    const body = document.body;
    const attrTheme = (root.getAttribute('data-theme') || body.getAttribute('data-theme') || '').toLowerCase();
    if (attrTheme === 'dark') return true;
    if (attrTheme === 'light') return false;

    if (
      root.classList.contains('dark') ||
      root.classList.contains('dark-theme') ||
      body.classList.contains('dark') ||
      body.classList.contains('dark-theme') ||
      body.classList.contains('dark-mode')
    ) return true;

    const btn = document.getElementById('themeToggleBtn');
    if (btn && btn.querySelector('circle')) return true;

    const bg = getComputedStyle(body).backgroundColor;
    const m = bg && bg.match(/[\d.]+/g);
    if (m && m.length >= 3) {
      const alpha = m.length >= 4 ? Number(m[3]) : 1;
      if (alpha > 0.1) {
        const lum = (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3;
        return lum < 128;
      }
    }
    return false;
  };

  const apply = () => {
    const shell = document.getElementById('appShell');
    if (!shell) return;
    const isDark = detectDark();
    shell.setAttribute('data-landing-theme', isDark ? 'dark' : 'light');
    const meta = document.getElementById('metaThemeColor');
    if (meta) meta.setAttribute('content', isDark ? '#071326' : '#E2DBD0');
  };

  apply();
  window.addEventListener('DOMContentLoaded', apply);
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  if (document.body) {
    new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    new MutationObserver(apply).observe(btn, { childList: true, subtree: true });
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('#themeToggleBtn')) {
      requestAnimationFrame(apply);
      setTimeout(apply, 30);
    }
  });
})();
