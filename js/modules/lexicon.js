import { store } from '../state.js';
import { speakText } from './speak.js';

export function initLexiconModule(dictData, notifyIsland, openSheet) {
  const container = document.getElementById('lexiconContainer');
  let activePOS = 'all';
  let searchQuery = '';

  const posFilters = [
    { id: 'all', label: 'Semua' },
    { id: 'noun', label: 'Noun (Benda)' },
    { id: 'verb', label: 'Verb (Kerja)' },
    { id: 'adjective', label: 'Adjective (Sifat)' },
    { id: 'adverb', label: 'Adverb' },
    { id: 'phrasal verb', label: 'Phrasal Verb' }
  ];

  const posBadgeColor = (pos) => {
    if (pos === 'noun') return 'var(--ios-blue)';
    if (pos === 'verb') return 'var(--ios-green)';
    if (pos === 'adjective') return 'var(--ios-red)';
    if (pos === 'adverb') return 'var(--ios-orange)';
    return 'var(--ios-purple)';
  };

  function getFilteredWords() {
    return dictData.words.filter((w) => {
      const matchPOS = activePOS === 'all' || w.pos === activePOS;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery = !q
        || w.word.toLowerCase().includes(q)
        || w.meaning.toLowerCase().includes(q)
        || w.topic.toLowerCase().includes(q);
      return matchPOS && matchQuery;
    });
  }

  function openWordDetail(item) {
    speakText(item.word);
    openSheet(`
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="card-label" style="color:${posBadgeColor(item.pos)};">${item.pos} · CEFR ${item.level}</span>
        <span style="font-size:12px;color:var(--text-secondary);">${item.topic}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;margin:6px 0;">
        <h2 style="font-size:28px;">${item.word}</h2>
        <span style="color:var(--text-secondary);font-size:15px;">${item.phonetic}</span>
      </div>
      <p style="font-size:17px;font-weight:700;color:var(--ios-blue);margin-bottom:12px;">${item.meaning}</p>

      <div class="ios-card" style="background:var(--bg-grouped);margin-bottom:12px;padding:14px;">
        <div class="card-label" style="margin-bottom:4px;">Contoh Kalimat</div>
        <div style="font-size:14px;line-height:1.5;">"${item.example}"</div>
      </div>

      ${item.collocations && item.collocations.length ? `
        <div style="margin-bottom:12px;">
          <div class="card-label" style="margin-bottom:6px;">Natural Collocations (Pasangan Kata)</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${item.collocations.map((c) => `<span class="word-chip-result word-ok" style="font-size:12px;">${c}</span>`).join('')}
          </div>
        </div>` : ''}

      ${item.wordFamily && item.wordFamily.length ? `
        <div style="margin-bottom:14px;">
          <div class="card-label" style="margin-bottom:6px;">Word Family (Kata Turunan)</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${item.wordFamily.map((f) => `<span class="word-token" style="font-size:12px;padding:5px 10px;">${f}</span>`).join('')}
          </div>
        </div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
        <button class="btn-secondary" id="dictSpeakBtn">🔊 Lafalkan</button>
        <button class="btn-primary" id="dictSaveBtn">+ Simpan ke Vault</button>
      </div>
    `);

    document.getElementById('dictSpeakBtn').onclick = () => speakText(item.word);
    document.getElementById('dictSaveBtn').onclick = () => {
      const added = store.saveWord({ word: item.word, phonetic: item.phonetic, meaning: item.meaning });
      notifyIsland(added ? `"${item.word}" tersimpan! Cincin Vocab +1` : `"${item.word}" sudah ada di Vault`);
    };
  }

  async function lookupOnlineWord(rawWord) {
    const query = rawWord.trim().toLowerCase();
    if (!query) return;
    notifyIsland(`Mencari "${query}"...`, true);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      const entry = data[0];
      const meaningObj = entry.meanings[0];
      const defObj = meaningObj.definitions[0];
      const phonetic = entry.phonetic || (entry.phonetics.find((p) => p.text)?.text) || '/—/';

      notifyIsland(`Ditemukan: ${entry.word}`);
      openWordDetail({
        word: entry.word,
        pos: meaningObj.partOfSpeech || 'word',
        level: 'Live',
        topic: 'Online Dictionary',
        phonetic,
        meaning: defObj.definition,
        example: defObj.example || `Try using "${entry.word}" in a sentence today.`,
        collocations: meaningObj.synonyms ? meaningObj.synonyms.slice(0, 3) : [],
        wordFamily: []
      });
    } catch {
      notifyIsland(`Kata "${query}" tidak ditemukan`);
    }
  }

  function openFlashcardMode(list) {
    if (!list.length) return;
    let idx = 0;
    let flipped = false;

    const renderCard = () => {
      const item = list[idx];
      openSheet(`
        <div class="card-header">
          <span class="card-label" style="color:var(--ios-blue);">Flip Flashcard · ${idx + 1}/${list.length}</span>
          <span class="card-label">${item.pos}</span>
        </div>

        <div id="flashcardBox" class="ios-card" style="min-height:200px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;cursor:pointer;background:var(--bg-grouped);margin:10px 0 14px;padding:24px;">
          ${!flipped ? `
            <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">Ketuk kartu untuk balik ↻</div>
            <div style="font-size:30px;font-weight:800;margin-bottom:6px;">${item.word}</div>
            <div style="font-size:15px;color:var(--text-secondary);">${item.phonetic}</div>
          ` : `
            <div style="font-size:12px;color:var(--ios-green);font-weight:700;margin-bottom:6px;">ARTI & KONTEKS</div>
            <div style="font-size:20px;font-weight:700;color:var(--ios-blue);margin-bottom:10px;">${item.meaning}</div>
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">"${item.example}"</div>
          `}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px;">
          <button class="btn-secondary" id="fcAudioBtn">🔊 Suara</button>
          <button class="btn-secondary" id="fcNextBtn">Lanjut →</button>
          <button class="btn-primary" id="fcMasterBtn">✓ Hafal (+10 XP)</button>
        </div>
      `);

      document.getElementById('flashcardBox').onclick = () => {
        flipped = !flipped;
        if (!flipped) speakText(item.word);
        renderCard();
      };
      document.getElementById('fcAudioBtn').onclick = () => speakText(item.word);
      document.getElementById('fcNextBtn').onclick = () => {
        idx = (idx + 1) % list.length;
        flipped = false;
        speakText(list[idx].word);
        renderCard();
      };
      document.getElementById('fcMasterBtn').onclick = () => {
        store.saveWord({ word: item.word, phonetic: item.phonetic, meaning: item.meaning });
        store.incrementRing('vocab', 1, 10);
        notifyIsland(`"${item.word}" dikuasai! +10 XP`);
        idx = (idx + 1) % list.length;
        flipped = false;
        renderCard();
      };
    };

    speakText(list[0].word);
    renderCard();
  }

  function openClozeQuiz(list) {
    const candidates = list.filter((w) => w.example && w.example.toLowerCase().includes(w.word.toLowerCase()));
    if (candidates.length < 2) {
      notifyIsland('Pilih kategori "Semua" untuk kuis konteks');
      return;
    }
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const regex = new RegExp(`\\b${target.word}\\b`, 'i');
    const maskedSentence = target.example.replace(regex, '________');

    const distractors = dictData.words
      .filter((w) => w.word !== target.word)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map((w) => w.word);
    const options = [target.word, ...distractors].sort(() => 0.5 - Math.random());

    openSheet(`
      <div class="card-label" style="color:var(--ios-orange);">Context Cloze Quiz</div>
      <h3 style="font-size:18px;margin:6px 0 12px;">Lengkapi kalimat berikut:</h3>
      <div class="ios-card" style="background:var(--bg-grouped);font-size:16px;line-height:1.55;margin-bottom:14px;">
        "${maskedSentence}"
        <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">Petunjuk: ${target.meaning}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${options.map((opt) => `<button class="word-token" style="padding:12px;text-align:center;" data-opt="${opt}">${opt}</button>`).join('')}
      </div>
    `);

    document.querySelectorAll('[data-opt]').forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.opt === target.word) {
          speakText(target.example);
          store.incrementRing('vocab', 1, 15);
          notifyIsland('Benar! Cincin Vocab +1');
          setTimeout(() => openClozeQuiz(list), 900);
        } else {
          btn.style.borderColor = 'var(--ios-red)';
          btn.style.color = 'var(--ios-red)';
          notifyIsland('Kurang tepat, coba kata lain');
        }
      };
    });
  }

  function render() {
    const filtered = getFilteredWords();
    container.innerHTML = `
      <div class="ios-card" style="padding:12px 14px;margin-bottom:12px;">
        <input id="dictSearchInput" type="search" value="${searchQuery}"
          placeholder="Cari kata (Inggris / Indonesia)..."
          style="width:100%;border:none;background:transparent;color:var(--text-primary);font-size:15px;outline:none;" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <button class="btn-primary" id="startFlashcardBtn" style="padding:11px;font-size:13px;">🃏 Flashcard Mode</button>
        <button class="btn-secondary" id="startClozeBtn" style="padding:11px;font-size:13px;">⚡ Kuis Konteks</button>
      </div>

      <div class="level-pills">
        ${posFilters.map((f) => `
          <button class="level-pill ${activePOS === f.id ? 'active' : ''}" data-pos="${f.id}">${f.label}</button>
        `).join('')}
      </div>

      <div id="dictWordList">
        ${filtered.length ? filtered.map((w, idx) => `
          <div class="ios-card unit-card" data-widx="${idx}" style="padding:14px 16px;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-weight:800;font-size:16px;">${w.word}</span>
                <span style="font-size:11px;font-weight:700;color:${posBadgeColor(w.pos)};background:var(--bg-secondary);padding:2px 7px;border-radius:6px;">${w.pos}</span>
                <span style="font-size:11px;color:var(--text-tertiary);">${w.level}</span>
              </div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:3px;">${w.meaning}</div>
            </div>
            <button class="btn-secondary" data-speak-word="${w.word}" style="padding:7px 10px;">🔊</button>
          </div>
        `).join('') : `
          <div class="ios-card" style="text-align:center;">
            <p style="font-size:14px;color:var(--text-secondary);margin-bottom:10px;">
              "${searchQuery}" belum ada di kamus offline.
            </p>
            <button class="btn-primary" id="onlineLookupBtn">🌐 Cari "${searchQuery}" Online</button>
          </div>
        `}
      </div>
    `;

    const inputEl = document.getElementById('dictSearchInput');
    inputEl.oninput = (e) => {
      searchQuery = e.target.value;
      const pos = inputEl.selectionStart;
      render();
      const refocused = document.getElementById('dictSearchInput');
      refocused.focus();
      refocused.setSelectionRange(pos, pos);
    };

    document.querySelectorAll('[data-pos]').forEach((btn) => {
      btn.onclick = () => { activePOS = btn.dataset.pos; render(); };
    });

    document.querySelectorAll('[data-widx]').forEach((card) => {
      card.onclick = () => openWordDetail(filtered[Number(card.dataset.widx)]);
    });

    document.querySelectorAll('[data-speak-word]').forEach((btn) => {
      btn.onclick = (e) => { e.stopPropagation(); speakText(btn.dataset.speakWord); };
    });

    document.getElementById('startFlashcardBtn').onclick = () => openFlashcardMode(filtered);
    document.getElementById('startClozeBtn').onclick = () => openClozeQuiz(filtered);

    const lookupBtn = document.getElementById('onlineLookupBtn');
    if (lookupBtn) lookupBtn.onclick = () => lookupOnlineWord(searchQuery);
  }

  render();
}
