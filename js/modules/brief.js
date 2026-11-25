import { escapeHTML } from '../core/security.js';
import { store } from '../state.js?v=20';
import { speakText, stopSpeech, playTone } from './speak.js?v=20';

const SPEEDS = [
  { val: 0.65, label: '0.65x' },
  { val: 0.85, label: '0.85x' },
  { val: 1.0,  label: '1.0x' },
  { val: 1.2,  label: '1.2x' }
];

export function initBriefModule(briefsData, notifyIsland, openSheet) {
  const container = document.getElementById('briefList');
  let activeIdx = 0;
  let isPlaying = false;

  function syncPlayBtn() {
    const btn = document.getElementById('playBriefBtn');
    if (!btn) return;
    if (isPlaying) {
      btn.className = 'btn-stop';
      btn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg><span>Hentikan Narasi</span>`;
    } else {
      btn.className = 'btn-primary';
      btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Putar Narasi (${store.state.speechRate}x)</span>`;
    }
  }

  function stopNarration() {
    stopSpeech();
    isPlaying = false;
    syncPlayBtn();
  }
  window.__stopBriefAudio = stopNarration;

  function formatParagraph(text, glossary) {
    return text.split(' ').map((raw) => {
      const clean = raw.toLowerCase().replace(/[^a-z]/g, '');
      return glossary[clean] ? `<span class="tap-word" data-word="${clean}">${raw}</span>` : raw;
    }).join(' ');
  }

  function render() {
    const brief = briefsData.briefs[activeIdx];
    const rate = store.state.speechRate || 1.0;

    container.innerHTML = `
      <div class="level-pills">
        ${briefsData.briefs.map((b, idx) => `<button class="level-pill ${idx === activeIdx ? 'active' : ''}" data-bidx="${idx}">${b.category}</button>`).join('')}
      </div>
      <div class="ios-card">
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-blue);">${brief.category} · Level ${brief.level || 'B1'}</span>
          <span style="font-size:12px;color:var(--text-secondary);">${brief.readTime}</span>
        </div>
        <h2 style="font-size:21px;line-height:1.3;margin-bottom:12px;">${brief.title}</h2>
        <div class="speed-bar">
          ${SPEEDS.map((s) => `<button class="speed-pill ${rate === s.val ? 'active' : ''}" data-bspeed="${s.val}">${s.label}</button>`).join('')}
        </div>
        <button class="btn-primary" id="playBriefBtn" style="margin-bottom:16px;"></button>
        <div class="brief-body">
          ${brief.paragraphs.map((p) => `<p style="margin-bottom:13px;">${formatParagraph(p, brief.glossary)}</p>`).join('')}
        </div>
      </div>
      ${brief.quiz ? `
        <div class="ios-card">
          <div class="card-header">
            <span class="card-label" style="color:var(--ios-orange);">Uji Pemahaman · +20 XP</span>
            <span style="font-size:11px;font-weight:700;color:var(--text-secondary);">Level ${brief.level || 'B1'}</span>
          </div>
          <p style="font-size:14.5px;font-weight:700;margin-bottom:12px;line-height:1.45;">${brief.quiz.question}</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${brief.quiz.options.map((opt, i) => `<button class="word-token quiz-opt" style="text-align:left;padding:12px 14px;line-height:1.4;" data-qopt="${i}">${opt}</button>`).join('')}
          </div>
        </div>` : ''}
    `;

    syncPlayBtn();
    container.querySelectorAll('[data-bidx]').forEach((b) => { b.onclick = () => { stopNarration(); activeIdx = Number(b.dataset.bidx); render(); }; });
    container.querySelectorAll('[data-bspeed]').forEach((b) => {
      b.onclick = () => { store.setSpeechRate(Number(b.dataset.bspeed)); if (isPlaying) stopNarration(); render(); };
    });

    document.getElementById('playBriefBtn').onclick = () => {
      if (isPlaying) { stopNarration(); return; }
      isPlaying = true;
      syncPlayBtn();
      speakText(`${brief.title}. ${brief.paragraphs.join(' ')}`, store.state.speechRate, () => {
        if (isPlaying) { isPlaying = false; syncPlayBtn(); store.incrementRing('listening', 1, 20); playTone('success'); }
      });
    };

    container.querySelectorAll('[data-qopt]').forEach((btn) => {
      btn.onclick = () => {
        const chosen = Number(btn.dataset.qopt);
        if (chosen === brief.quiz.answerIdx) {
          btn.classList.add('opt-correct');
          playTone('success');
          if (navigator.vibrate) navigator.vibrate(12);
          store.incrementRing('listening', 1, 20);
        } else {
          btn.classList.add('opt-wrong');
          playTone('error');
          if (navigator.vibrate) navigator.vibrate(35);
        }
      };
    });

    container.querySelectorAll('.tap-word').forEach((el) => {
      el.onclick = () => {
        if (isPlaying) stopNarration();
        const key = el.dataset.word;
        const info = brief.glossary[key];
        if (!info) return;
        speakText(key);
        openSheet(`
          <div class="card-label">${info.pos}</div>
          <div style="display:flex;align-items:baseline;gap:10px;margin:4px 0;"><h2 style="font-size:26px;">${key}</h2><span style="color:var(--text-secondary);font-size:15px;">${info.phonetic}</span></div>
          <p style="font-size:17px;font-weight:600;color:var(--ios-blue);margin:8px 0;">${info.meaning}</p>
          <div class="ios-card" style="background:var(--bg-grouped);margin:12px 0;"><div style="font-size:12px;color:var(--text-secondary);">Contoh:</div><div style="font-size:14px;margin-top:4px;">"${info.example}"</div></div>
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
            <button class="btn-secondary" id="pronounceWordBtn">Dengar</button>
            <button class="btn-primary" id="saveVaultBtn">+ Simpan ke Vault</button>
          </div>
        `);
        document.getElementById('pronounceWordBtn').onclick = () => speakText(key);
        document.getElementById('saveVaultBtn').onclick = () => {
          const added = store.saveWord({ word: key, phonetic: info.phonetic, meaning: info.meaning });
          notifyIsland(added ? `"${key}" tersimpan!` : `"${key}" sudah ada di Vault`);
        };
      };
    });
  }
  render();
}
