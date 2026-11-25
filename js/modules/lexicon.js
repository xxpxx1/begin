import { store } from '../state.js?v=21';
import { speakText, playTone } from './speak.js?v=21';

function shuffleNoRepeatSlot(options, correctVal, prevSlot) {
  let arr = [...options];
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (arr.indexOf(correctVal) !== prevSlot) break;
  }
  return arr;
}

export function initLexiconModule(dictData, notifyIsland, openSheet) {
  const container = document.getElementById('lexiconContainer');
  let activePOS = 'all';
  let searchQuery = '';

  const posFilters = [
    { id: 'all', label: 'Semua' },
    { id: 'slang', label: 'Slang & Gaul' },
    { id: 'noun', label: 'Noun (Benda)' },
    { id: 'verb', label: 'Verb (Kerja)' },
    { id: 'adjective', label: 'Adjective (Sifat)' },
    { id: 'adverb', label: 'Adverb' },
    { id: 'phrasal verb', label: 'Phrasal Verb' }
  ];

  const posBadgeColor = (pos) => ({
    slang: 'var(--ios-orange)', noun: 'var(--ios-blue)', verb: 'var(--ios-green)',
    adjective: 'var(--ios-red)', adverb: 'var(--ios-purple)'
  }[pos] || 'var(--ios-azure)');

  function getFilteredWords() {
    return dictData.words.filter((w) => {
      const matchPOS = activePOS === 'all' || w.pos === activePOS;
      const q = searchQuery.trim().toLowerCase();
      return matchPOS && (!q || w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q));
    });
  }

  function openWordDetail(item) {
    speakText(item.word);
    openSheet(`
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="card-label" style="color:${posBadgeColor(item.pos)};">${item.pos.toUpperCase()} · ${item.level}</span>
        <span style="font-size:12px;color:var(--text-secondary);">${item.topic}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;margin:6px 0;"><h2 style="font-size:28px;">${item.word}</h2><span style="color:var(--text-secondary);font-size:15px;">${item.phonetic}</span></div>
      <p style="font-size:17px;font-weight:700;color:var(--ios-blue);margin-bottom:12px;">${item.meaning}</p>
      <div class="ios-card" style="background:var(--bg-grouped);margin-bottom:12px;padding:14px;">
        <div class="card-label" style="margin-bottom:4px;">Contoh Kalimat</div>
        <div style="font-size:14px;line-height:1.5;">"${item.example}"</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
        <button class="btn-secondary" id="dictSpeakBtn">Dengar</button>
        <button class="btn-primary" id="dictSaveBtn">+ Simpan ke Vault</button>
      </div>
    `);
    document.getElementById('dictSpeakBtn').onclick = () => speakText(item.word);
    document.getElementById('dictSaveBtn').onclick = () => {
      const added = store.saveWord({ word: item.word, phonetic: item.phonetic, meaning: item.meaning });
      notifyIsland(added ? `"${item.word}" tersimpan!` : `"${item.word}" sudah ada di Vault`);
    };
  }

  function openFlashcardMode(list) {
    if (!list.length) return;
    let idx = 0, flipped = false;
    const renderCard = () => {
      const item = list[idx];
      openSheet(`
        <div class="card-header"><span class="card-label" style="color:var(--ios-blue);">Kartu Hafalan · ${idx + 1}/${list.length}</span><span class="card-label">${item.pos}</span></div>
        <div id="flashcardBox" class="ios-card" style="min-height:185px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;cursor:pointer;background:var(--bg-grouped);margin:10px 0 14px;padding:24px;">
          ${!flipped ? `<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">Ketuk kartu untuk melihat arti</div><div style="font-size:28px;font-weight:800;margin-bottom:6px;">${item.word}</div><div style="font-size:15px;color:var(--text-secondary);">${item.phonetic}</div>`
            : `<div style="font-size:19px;font-weight:700;color:var(--ios-blue);margin-bottom:10px;">${item.meaning}</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">"${item.example}"</div>`}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px;">
          <button class="btn-secondary" id="fcAudioBtn">Dengar</button>
          <button class="btn-secondary" id="fcNextBtn">Lewati</button>
          <button class="btn-primary" id="fcMasterBtn">Hafal (+10 XP)</button>
        </div>
      `);
      document.getElementById('flashcardBox').onclick = () => { flipped = !flipped; renderCard(); };
      document.getElementById('fcAudioBtn').onclick = () => speakText(item.word);
      document.getElementById('fcNextBtn').onclick = () => { idx = (idx + 1) % list.length; flipped = false; speakText(list[idx].word); renderCard(); };
      document.getElementById('fcMasterBtn').onclick = () => {
        playTone('success');
        store.saveWord({ word: item.word, phonetic: item.phonetic, meaning: item.meaning });
        store.incrementRing('vocab', 1, 10);
        idx = (idx + 1) % list.length; flipped = false; speakText(list[idx].word); renderCard();
      };
    };
    speakText(list[0].word); renderCard();
  }

  function openClozeQuiz(list) {
    const pool = list.filter((w) => w.example && new RegExp(`\\b${w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(w.example));
    if (pool.length < 4) { notifyIsland('Pilih kategori "Semua" untuk memulai kuis'); return; }

    const questions = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
    let qIdx = 0, score = 0, prevSlot = -1, locked = false;
    const missedWords = [];

    const renderQuestion = () => {
      if (qIdx >= questions.length) {
        playTone('fanfare');
        openSheet(`
          <div class="praise-stage">
            <div class="card-label" style="color:var(--ios-blue);">HASIL KUIS KOSAKATA</div>
            <h2 class="jakarta-heading" style="font-size:32px;margin:6px 0;">${score} / ${questions.length} Tepat</h2>
            <p style="font-size:13.5px;color:var(--text-secondary);margin-bottom:14px;">Total +${score * 10} XP ditambahkan ke progres harianmu.</p>
            ${missedWords.length ? `<div style="text-align:left;background:var(--bg-card-solid);padding:12px;border-radius:14px;margin-bottom:14px;"><div class="card-label" style="margin-bottom:6px;">Perlu Diulang:</div>${missedWords.map((m) => `<div style="font-size:13px;margin-bottom:4px;"><strong>${m.word}</strong> — ${m.meaning}</div>`).join('')}</div>` : ''}
            <button class="btn-primary" id="retryQuizBtn">Mainkan Sesi Baru</button>
          </div>
        `);
        document.getElementById('retryQuizBtn').onclick = () => openClozeQuiz(list);
        return;
      }

      locked = false;
      const target = questions[qIdx];
      const regex = new RegExp(`\\b${target.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const masked = target.example.replace(regex, '________');
      const distractors = dictData.words.filter((w) => w.word !== target.word).sort(() => Math.random() - 0.5).slice(0, 3).map((w) => w.word);
      const options = shuffleNoRepeatSlot([target.word, ...distractors], target.word, prevSlot);
      prevSlot = options.indexOf(target.word);

      openSheet(`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span class="card-label" style="color:var(--ios-blue);">Soal ${qIdx + 1} / ${questions.length}</span>
          <span style="font-size:12px;font-weight:800;color:var(--ios-green);">Skor: ${score}</span>
        </div>
        <h3 style="font-size:17px;margin-bottom:10px;">Lengkapi kalimat berikut:</h3>
        <div class="ios-card" style="background:var(--bg-grouped);font-size:15px;line-height:1.55;margin-bottom:14px;">
          "${masked}"
          <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">Petunjuk arti: ${target.meaning}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${options.map((opt) => `<button class="word-token quiz-opt" style="padding:13px 10px;text-align:center;" data-opt="${opt}">${opt}</button>`).join('')}
        </div>
      `);

      document.querySelectorAll('[data-opt]').forEach((btn) => {
        btn.onclick = () => {
          if (locked) return;
          const chosen = btn.dataset.opt;
          if (chosen === target.word) {
            locked = true;
            score++;
            btn.classList.add('opt-correct');
            playTone('success');
            if (navigator.vibrate) navigator.vibrate(12);
            store.incrementRing('vocab', 1, 10);
            speakText(target.example, null, () => { qIdx++; renderQuestion(); });
          } else {
            btn.classList.add('opt-wrong');
            playTone('error');
            if (navigator.vibrate) navigator.vibrate(35);
            if (!missedWords.some((m) => m.word === target.word)) missedWords.push(target);
          }
        };
      });
    };
    renderQuestion();
  }

  function render() {
    const filtered = getFilteredWords();
    container.innerHTML = `
      <div class="ios-card" style="padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <input id="dictSearchInput" type="search" value="${searchQuery}" placeholder="Cari slang atau kosakata..." style="flex:1;border:none;background:transparent;color:var(--text-primary);font-size:15px;outline:none;" />
        <span style="font-size:11.5px;font-weight:700;color:var(--ios-blue);background:var(--bg-secondary);padding:4px 9px;border-radius:99px;">${filtered.length} kata</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <button class="btn-primary" id="startFlashcardBtn" style="padding:11px;font-size:13px;">Kartu Hafalan</button>
        <button class="btn-secondary" id="startClozeBtn" style="padding:11px;font-size:13px;">Kuis 10 Soal</button>
      </div>
      <div class="level-pills" style="margin-bottom:14px;">
        ${posFilters.map((f) => `<button class="level-pill ${activePOS === f.id ? 'active' : ''}" data-pos="${f.id}">${f.label}</button>`).join('')}
      </div>
      <div>
        ${filtered.map((w, idx) => `
          <div class="ios-card unit-card interactive" data-widx="${idx}" style="padding:13px 15px;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
                <span style="font-weight:800;font-size:16px;">${w.word}</span>
                <span style="font-size:11px;font-weight:700;color:${posBadgeColor(w.pos)};background:var(--bg-secondary);padding:2px 7px;border-radius:6px;">${w.pos}</span>
                <span style="font-size:11px;color:var(--text-tertiary);">${w.level}</span>
              </div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:3px;">${w.meaning}</div>
            </div>
            <button class="btn-secondary" data-speak-word="${w.word}" style="padding:8px 10px;"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
          </div>`).join('')}
      </div>
    `;
    const inp = document.getElementById('dictSearchInput');
    inp.oninput = (e) => { searchQuery = e.target.value; const pos = inp.selectionStart; render(); const r = document.getElementById('dictSearchInput'); r.focus(); r.setSelectionRange(pos, pos); };
    document.querySelectorAll('[data-pos]').forEach((b) => { b.onclick = () => { activePOS = b.dataset.pos; render(); }; });
    document.querySelectorAll('[data-widx]').forEach((c) => { c.onclick = () => openWordDetail(filtered[Number(c.dataset.widx)]); });
    document.querySelectorAll('[data-speak-word]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); speakText(b.dataset.speakWord); }; });
    document.getElementById('startFlashcardBtn').onclick = () => openFlashcardMode(filtered);
    document.getElementById('startClozeBtn').onclick = () => openClozeQuiz(filtered);
  }
  render();
}
