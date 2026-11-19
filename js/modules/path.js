import { store } from '../state.js';
import { speakText, startRecognition, evaluateSpeech } from './speak.js';

export function initPathModule(levelsData, notifyIsland, openSheet, closeSheet) {
  const pillsEl = document.getElementById('levelPills');
  const unitsEl = document.getElementById('unitsList');

  function render() {
    const activeLvl = store.state.currentLevel;
    pillsEl.innerHTML = levelsData.levels.map((lvl) =>
      `<button class="level-pill ${lvl.id === activeLvl ? 'active' : ''}" data-lvl="${lvl.id}">${lvl.id} · ${lvl.title}</button>`
    ).join('');

    pillsEl.querySelectorAll('.level-pill').forEach((btn) => { btn.onclick = () => store.setLevel(btn.dataset.lvl); });

    const currentLevelObj = levelsData.levels.find((l) => l.id === activeLvl) || levelsData.levels[0];
    unitsEl.innerHTML = `
      <div class="ios-card" style="background: linear-gradient(135deg, ${currentLevelObj.color}22, transparent);">
        <div class="card-label" style="color:${currentLevelObj.color}">CEFR ${currentLevelObj.id}</div>
        <h3 style="font-size:20px;margin:2px 0;">${currentLevelObj.title}</h3>
        <p style="font-size:13px;color:var(--text-secondary);">${currentLevelObj.subtitle}</p>
      </div>
      ${currentLevelObj.units.map((unit, idx) => {
        const done = store.state.completedUnits.includes(unit.id);
        return `
        <div class="ios-card unit-card" data-unit="${unit.id}">
          <div style="display:flex;align-items:center;gap:14px;">
            <div class="unit-badge" style="background:${done ? 'var(--ios-green)' : currentLevelObj.color}">${done ? '✓' : idx + 1}</div>
            <div>
              <div style="font-weight:700;font-size:16px;">${unit.title}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${unit.duration} · +${unit.xp} XP</div>
            </div>
          </div>
          <span style="color:var(--ios-blue);font-weight:700;font-size:18px;">›</span>
        </div>`;
      }).join('')}
    `;

    unitsEl.querySelectorAll('.unit-card').forEach((card) => {
      card.onclick = () => {
        const unit = currentLevelObj.units.find((u) => u.id === card.dataset.unit);
        if (unit) launchLesson(unit);
      };
    });
  }

  function launchLesson(unit) {
    let step = 0;
    function renderStep() {
      const ex = unit.exercises[step];
      if (!ex) {
        store.completeUnit(unit.id, unit.xp);
        store.incrementRing('vocab', 1, 0);
        notifyIsland(`Unit selesai! +${unit.xp} XP`);
        closeSheet();
        return;
      }

      if (ex.type === 'arrange') {
        let selected = [];
        const renderArrange = () => {
          openSheet(`
            <div class="card-label">Latihan ${step + 1}/${unit.exercises.length} · Susun Kalimat</div>
            <h3 style="font-size:18px;margin:6px 0 14px;">${ex.prompt}</h3>
            <div class="answer-box">
              ${selected.length ? selected.map((w, i) => `<button class="word-token" data-rem="${i}">${w}</button>`).join('') : '<span style="color:var(--text-tertiary);font-size:13px;">Ketuk kata di bawah untuk menyusun...</span>'}
            </div>
            <div class="token-pool">
              ${ex.tokens.map((tok, idx) => {
                const isUsed = selected.filter((s) => s === tok).length >= ex.tokens.filter((t) => t === tok).length;
                return `<button class="word-token ${isUsed ? 'used' : ''}" data-add="${idx}">${tok}</button>`;
              }).join('')}
            </div>
            <button class="btn-primary" id="checkArrangeBtn">Periksa Jawaban</button>
          `);
          document.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { selected.push(ex.tokens[Number(b.dataset.add)]); renderArrange(); }; });
          document.querySelectorAll('[data-rem]').forEach((b) => { b.onclick = () => { selected.splice(Number(b.dataset.rem), 1); renderArrange(); }; });
          document.getElementById('checkArrangeBtn').onclick = () => {
            if (selected.join(' ') === ex.answer.join(' ')) {
              speakText(ex.answer.join(' '));
              notifyIsland('Tepat sekali! +15 XP');
              step++;
              setTimeout(renderStep, 600);
            } else { notifyIsland('Urutan belum pas, coba lagi'); }
          };
        };
        renderArrange();
      } else if (ex.type === 'speak') {
        openSheet(`
          <div class="card-label">Latihan ${step + 1}/${unit.exercises.length} · Speaking Check</div>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${ex.prompt}</p>
          <div class="ios-card" style="margin-top:10px;background:var(--bg-grouped);">
            <div style="font-size:18px;font-weight:700;line-height:1.4;">"${ex.target}"</div>
            <button class="btn-secondary" id="listenTargetBtn" style="margin-top:10px;">🔊 Dengar Contoh</button>
          </div>
          <div id="lessonSpeakFeedback" style="margin:12px 0;"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button class="btn-primary" id="lessonMicBtn">🎙️ Mulai Bicara</button>
            <button class="btn-secondary" id="lessonSimBtn">⚡ Simulasi Suara</button>
          </div>
        `);
        document.getElementById('listenTargetBtn').onclick = () => speakText(ex.target);
        const handleEvaluation = (transcript) => {
          const res = evaluateSpeech(ex.target, transcript);
          document.getElementById('lessonSpeakFeedback').innerHTML = `
            <div style="font-size:13px;margin-bottom:6px;">Akurasi Pelafalan: <strong>${res.accuracy}%</strong></div>
            <div>${res.wordAnalysis.map((w) => `<span class="word-chip-result ${w.ok ? 'word-ok' : 'word-miss'}">${w.word}</span>`).join('')}</div>
          `;
          if (res.accuracy >= 70) {
            store.incrementRing('speaking', 1, 20);
            notifyIsland(`Akurasi ${res.accuracy}%! Cincin Speaking bertambah`);
            step++;
            setTimeout(renderStep, 1300);
          }
        };
        document.getElementById('lessonMicBtn').onclick = () => {
          notifyIsland('Mendengarkan suara...', true);
          startRecognition({ onResult: (t) => handleEvaluation(t), onError: (err) => notifyIsland(`Mic info: ${err}`), onEnd: () => {} });
        };
        document.getElementById('lessonSimBtn').onclick = () => handleEvaluation(ex.target);
      }
    }
    renderStep();
  }

  window.addEventListener('begin:statechange', render);
  render();
}
