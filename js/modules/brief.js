import { store } from '../state.js';
import { speakText } from './speak.js';

export function initBriefModule(briefsData, notifyIsland, openSheet) {
  const container = document.getElementById('briefList');
  let activeIdx = 0;

  function formatParagraph(text, glossary) {
    return text.split(' ').map((rawWord) => {
      const clean = rawWord.toLowerCase().replace(/[^a-z]/g, '');
      return glossary[clean] ? `<span class="tap-word" data-word="${clean}">${rawWord}</span>` : rawWord;
    }).join(' ');
  }

  function render() {
    const brief = briefsData.briefs[activeIdx];
    container.innerHTML = `
      <div class="level-pills">
        ${briefsData.briefs.map((b, idx) => `<button class="level-pill ${idx === activeIdx ? 'active' : ''}" data-bidx="${idx}">${b.category}</button>`).join('')}
      </div>
      <div class="ios-card">
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-blue);">${brief.category}</span>
          <span style="font-size:12px;color:var(--text-secondary);">${brief.readTime}</span>
        </div>
        <h2 style="font-size:21px;line-height:1.3;margin-bottom:14px;">${brief.title}</h2>
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button class="btn-primary" id="playBriefBtn" style="padding:10px 14px;font-size:14px;">🎧 Putar Audio Narasi</button>
          <button class="btn-secondary" id="slowBriefBtn">0.8x</button>
        </div>
        <div class="brief-body">
          ${brief.paragraphs.map((p) => `<p style="margin-bottom:13px;">${formatParagraph(p, brief.glossary)}</p>`).join('')}
        </div>
        <p style="font-size:12px;color:var(--text-tertiary);margin-top:6px;">Ketuk kata bergaris biru untuk arti, fonetik, & simpan ke Vocab Vault.</p>
      </div>
      ${brief.quiz ? `
        <div class="ios-card">
          <div class="card-label" style="color:var(--ios-orange);margin-bottom:6px;">Comprehension Check · +20 XP</div>
          <p style="font-size:14.5px;font-weight:700;margin-bottom:12px;">${brief.quiz.question}</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${brief.quiz.options.map((opt, i) => `<button class="word-token" style="text-align:left;padding:11px 14px;" data-qopt="${i}">${opt}</button>`).join('')}
          </div>
        </div>` : ''}
    `;

    container.querySelectorAll('[data-bidx]').forEach((btn) => { btn.onclick = () => { activeIdx = Number(btn.dataset.bidx); render(); }; });
    document.getElementById('playBriefBtn').onclick = () => {
      notifyIsland('Memutar narasi...', true);
      speakText(`${brief.title}. ${brief.paragraphs.join(' ')}`, 1.0, () => {
        store.incrementRing('listening', 1, 20);
        notifyIsland('Listening selesai! Cincin Listening +1');
      });
    };
    document.getElementById('slowBriefBtn').onclick = () => {
      notifyIsland('Mode lambat (0.8x)...', true);
      speakText(`${brief.title}. ${brief.paragraphs.join(' ')}`, 0.8);
    };

    container.querySelectorAll('[data-qopt]').forEach((btn) => {
      btn.onclick = () => {
        const chosen = Number(btn.dataset.qopt);
        if (chosen === brief.quiz.answerIdx) {
          btn.style.background = 'rgba(74, 155, 127, 0.18)';
          btn.style.borderColor = 'var(--ios-green)';
          btn.style.color = 'var(--ios-green)';
          store.incrementRing('listening', 1, 20);
          notifyIsland('Pemahaman tepat! +20 XP');
        } else {
          btn.style.borderColor = 'var(--ios-red)';
          btn.style.color = 'var(--ios-red)';
          notifyIsland('Kurang tepat, baca lagi paragraf di atas');
        }
      };
    });

    container.querySelectorAll('.tap-word').forEach((el) => {
      el.onclick = () => {
        const key = el.dataset.word;
        const info = brief.glossary[key];
        if (!info) return;
        speakText(key);
        openSheet(`
          <div class="card-label">${info.pos}</div>
          <div style="display:flex;align-items:baseline;gap:10px;margin:4px 0;"><h2 style="font-size:26px;">${key}</h2><span style="color:var(--text-secondary);font-size:15px;">${info.phonetic}</span></div>
          <p style="font-size:17px;font-weight:600;color:var(--ios-blue);margin:8px 0;">${info.meaning}</p>
          <div class="ios-card" style="background:var(--bg-grouped);margin:12px 0;"><div style="font-size:12px;color:var(--text-secondary);">Contoh kalimat:</div><div style="font-size:14px;margin-top:4px;">"${info.example}"</div></div>
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
            <button class="btn-secondary" id="pronounceWordBtn">🔊 Lafalkan</button>
            <button class="btn-primary" id="saveVaultBtn">+ Simpan ke Vocab Vault</button>
          </div>
        `);
        document.getElementById('pronounceWordBtn').onclick = () => speakText(key);
        document.getElementById('saveVaultBtn').onclick = () => {
          const added = store.saveWord({ word: key, phonetic: info.phonetic, meaning: info.meaning });
          notifyIsland(added ? `"${key}" tersimpan! Cincin Vocab +1` : `"${key}" sudah ada di Vault`);
        };
      };
    });
  }
  render();
}
