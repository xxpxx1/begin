import { store } from '../state.js';
import { speakText } from './speak.js';

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

  const posBadgeColor = (pos) => {
    if (pos === 'slang') return 'var(--ios-orange)';
    if (pos === 'noun') return 'var(--ios-blue)';
    if (pos === 'verb') return 'var(--ios-green)';
    if (pos === 'adjective') return 'var(--ios-red)';
    if (pos === 'adverb') return 'var(--ios-purple)';
    return 'var(--ios-azure)';
  };

  function getFilteredWords() {
    return dictData.words.filter((w) => {
      const matchPOS = activePOS === 'all' || w.pos === activePOS;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery = !q || w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q) || w.topic.toLowerCase().includes(q);
      return matchPOS && matchQuery;
    });
  }

  function openWordDetail(item) {
    speakText(item.word);
    openSheet(`
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="card-label" style="color:${posBadgeColor(item.pos)};">${item.pos.toUpperCase()} · ${item.level}</span>
        <span style="font-size:12px;color:var(--text-secondary);">${item.topic}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;margin:6px 0;">
        <h2 style="font-size:28px;">${item.word}</h2>
        <span style="color:var(--text-secondary);font-size:15px;">${item.phonetic}</span>
      </div>
      <p style="font-size:17px;font-weight:700;color:var(--ios-blue);margin-bottom:12px;">${item.meaning}</p>
      <div class="ios-card" style="background:var(--bg-grouped);margin-bottom:12px;padding:14px;">
        <div class="card-label" style="margin-bottom:4px;">Contoh Pemakaian Nyata</div>
        <div style="font-size:14px;line-height:1.5;">"${item.example}"</div>
      </div>
      ${item.collocations?.length ? `<div style="margin-bottom:12px;"><div class="card-label" style="margin-bottom:6px;">Frasa Serupa / Pasangan Kata</div><div style="display:flex;flex-wrap:wrap;gap:6px;">${item.collocations.map((c) => `<span class="word-chip-result word-ok" style="font-size:12px;">${c}</span>`).join('')}</div></div>` : ''}
      ${item.wordFamily?.length && item.wordFamily[0] !== '—' ? `<div style="margin-bottom:14px;"><div class="card-label" style="margin-bottom:6px;">Bentuk Kata Lain</div><div style="display:flex;flex-wrap:wrap;gap:6px;">${item.wordFamily.map((f) => `<span class="word-token" style="font-size:12px;padding:5px 10px;">${f}</span>`).join('')}</div></div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
        <button class="btn-secondary" id="dictSpeakBtn">Dengar</button>
        <button class="btn-primary" id="dictSaveBtn">+ Simpan ke Vault</button>
      </div>
    `);
    document.getElementById('dictSpeakBtn').onclick = () => speakText(item.word);
    document.getElementById('dictSaveBtn').onclick = () => {
      const added = store.saveWord({ word: item.word, phonetic: item.phonetic, meaning: item.meaning });
      notifyIsland(added ? `"${item.word}" tersimpan! Kosakata +1` : `"${item.word}" sudah tersimpan`);
    };
  }

  async function lookupOnlineWord(rawWord) {
    const query = rawWord.trim().toLowerCase();
    if (!query) return;
    notifyIsland(`Mencari "${query}"...`, true);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error();
      const [entry] = await res.json();
      const m = entry.meanings[0];
      const d = m.definitions[0];
      const phonetic = entry.phonetic || (entry.phonetics.find((p) => p.text)?.text) || '/—/';
      notifyIsland(`Ditemukan: ${entry.word}`);
      openWordDetail({ word: entry.word, pos: m.partOfSpeech || 'word', level: 'Online', topic: 'Kamus Global', phonetic, meaning: d.definition, example: d.example || `Try using "${entry.word}" in conversation today.`, collocations: m.synonyms?.slice(0, 3) || [], wordFamily: [] });
    } catch { notifyIsland(`Kata "${query}" tidak ditemukan`); }
  }

  function openFlashcardMode(list) {
    if (!list.length) return;
    let idx = 0, flipped = false;
    const renderCard = () => {
      const item = list[idx];
      openSheet(`
        <div class="card-header"><span class="card-label" style="color:var(--ios-blue);">Kartu Hafalan · ${idx + 1}/${list.length}</span><span class="card-label">${item.pos}</span></div>
        <div id="flashcardBox" class="ios-card" style="min-height:190px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;cursor:pointer;background:var(--bg-grouped);margin:10px 0 14px;padding:24px;">
          ${!flipped ? `<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">Ketuk kartu untuk melihat arti</div><div style="font-size:28px;font-weight:800;margin-bottom:6px;">${item.word}</div><div style="font-size:15px;color:var(--text-secondary);">${item.phonetic}</div>`
            : `<div style="font-size:12px;color:var(--ios-green);font-weight:700;margin-bottom:6px;">ARTI & CONTOH</div><div style="font-size:19px;font-weight:700;color:var(--ios-blue);margin-bottom:10px;">${item.meaning}</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">"${item.example}"</div>`}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px;">
          <button class="btn-secondary" id="fcAudioBtn">Dengar</button>
          <button class="btn-secondary" id="fcNextBtn">Berikutnya</button>
          <button class="btn-primary" id="fcMasterBtn">Sudah Hafal</button>
        </div>
      `);
      document.getElementById('flashcardBox').onclick = () => { flipped = !flipped; if (!flipped) speakText(item.word); renderCard(); };
      document.getElementById('fcAudioBtn').onclick = () => speakText(item.word);
      document.getElementById('fcNextBtn').onclick = () => { idx = (idx + 1) % list.length; flipped = false; speakText(list[idx].word); renderCard(); };
      document.getElementById('fcMasterBtn').onclick = () => {
        store.saveWord({ word: item.word, phonetic: item.phonetic, meaning: item.meaning });
        store.incrementRing('vocab', 1, 10);
        notifyIsland(`"${item.word}" dikuasai! +10 XP`);
        idx = (idx + 1) % list.length; flipped = false; renderCard();
      };
    };
    speakText(list[0].word); renderCard();
  }

  function openClozeQuiz(list) {
    const candidates = list.filter((w) => w.example && new RegExp(`\\b${w.word}\\b`, 'i').test(w.example));
    if (candidates.length < 2) { notifyIsland('Pilih kategori "Semua" untuk kuis'); return; }
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const masked = target.example.replace(new RegExp(`\\b${target.word}\\b`, 'i'), '________');
    const options = [target.word, ...dictData.words.filter((w) => w.word !== target.word).sort(() => 0.5 - Math.random()).slice(0, 3).map((w) => w.word)].sort(() => 0.5 - Math.random());
    openSheet(`
      <div class="card-label" style="color:var(--ios-orange);">Kuis Tebak Konteks</div>
      <h3 style="font-size:18px;margin:6px 0 12px;">Pilih kata yang tepat untuk melengkapi kalimat:</h3>
      <div class="ios-card" style="background:var(--bg-grouped);font-size:15.5px;line-height:1.55;margin-bottom:14px;">"${masked}"<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">Arti kata: ${target.meaning}</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${options.map((opt) => `<button class="word-token" style="padding:12px;text-align:center;" data-opt="${opt}">${opt}</button>`).join('')}
      </div>
    `);
    document.querySelectorAll('[data-opt]').forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.opt === target.word) { speakText(target.example); store.incrementRing('vocab', 1, 15); notifyIsland('Tepat! Cincin Kosakata +1'); setTimeout(() => openClozeQuiz(list), 900); }
        else { btn.style.borderColor = 'var(--ios-red)'; btn.style.color = 'var(--ios-red)'; notifyIsland('Belum pas, coba kata lain'); }
      };
    });
  }

  function render() {
    const filtered = getFilteredWords();
    container.innerHTML = `
      <div class="ios-card" style="padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <input id="dictSearchInput" type="search" value="${searchQuery}" placeholder="Cari slang, kata kerja, atau artinya..." style="flex:1;border:none;background:transparent;color:var(--text-primary);font-size:15px;outline:none;" />
        <span style="font-size:11.5px;font-weight:700;color:var(--ios-blue);background:var(--bg-secondary);padding:4px 9px;border-radius:99px;">${filtered.length} kata</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <button class="btn-primary" id="startFlashcardBtn" style="padding:11px;font-size:13px;">Kartu Hafalan</button>
        <button class="btn-secondary" id="startClozeBtn" style="padding:11px;font-size:13px;">Kuis Kalimat</button>
      </div>
      <div class="level-pills" style="margin-bottom:14px;">
        ${posFilters.map((f) => `<button class="level-pill ${activePOS === f.id ? 'active' : ''}" data-pos="${f.id}">${f.label}</button>`).join('')}
      </div>
      <div>
        ${filtered.length ? filtered.map((w, idx) => `
          <div class="ios-card unit-card" data-widx="${idx}" style="padding:13px 15px;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
                <span style="font-weight:800;font-size:16px;">${w.word}</span>
                <span style="font-size:11px;font-weight:700;color:${posBadgeColor(w.pos)};background:var(--bg-secondary);padding:2px 7px;border-radius:6px;">${w.pos}</span>
                <span style="font-size:11px;color:var(--text-tertiary);">${w.level}</span>
              </div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:3px;">${w.meaning}</div>
            </div>
            <button class="btn-secondary" data-speak-word="${w.word}" aria-label="Dengar" style="padding:8px 10px;">
              <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          </div>`).join('') : `
          <div class="ios-card" style="text-align:center;">
            <p style="font-size:14px;color:var(--text-secondary);margin-bottom:10px;">"${searchQuery}" belum ada di kamus offline.</p>
            <button class="btn-primary" id="onlineLookupBtn">Cari "${searchQuery}" Online</button>
          </div>`}
      </div>
    `;
    const inp = document.getElementById('dictSearchInput');
    inp.oninput = (e) => { searchQuery = e.target.value; const pos = inp.selectionStart; render(); const r = document.getElementById('dictSearchInput'); r.focus(); r.setSelectionRange(pos, pos); };
    document.querySelectorAll('[data-pos]').forEach((b) => { b.onclick = () => { activePOS = b.dataset.pos; render(); }; });
    document.querySelectorAll('[data-widx]').forEach((c) => { c.onclick = () => openWordDetail(filtered[Number(c.dataset.widx)]); });
    document.querySelectorAll('[data-speak-word]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); speakText(b.dataset.speakWord); }; });
    document.getElementById('startFlashcardBtn').onclick = () => openFlashcardMode(filtered);
    document.getElementById('startClozeBtn').onclick = () => openClozeQuiz(filtered);
    const lb = document.getElementById('onlineLookupBtn');
    if (lb) lb.onclick = () => lookupOnlineWord(searchQuery);
  }
  render();
}
