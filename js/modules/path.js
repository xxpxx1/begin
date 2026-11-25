import { escapeHTML } from '../core/security.js';
import { store } from '../state.js?v=21';
import { speakText, playTone, startRecognition, evaluateSpeech } from './speak.js?v=21';

export function initPathModule(levelsData, notifyIsland, openSheet, closeSheet) {
  const pillsEl = document.getElementById('levelPills');
  const unitsEl = document.getElementById('unitsList');
  let activeLevel = store.state.currentLevel || 'A1';

  const difficultyNote = {
    A1: 'Pemula · Kosakata dasar & tempo santai',
    A2: 'Dasar · Percakapan harian & rencana',
    B1: 'Menengah · Opini & pemecahan masalah',
    B2: 'Menengah Atas · Nuansa kerja & kata pengecoh',
    C1: 'Mahir · Retorika strategis & akurasi tinggi'
  };

  function render() {
    pillsEl.innerHTML = levelsData.levels.map((lvl) => `
      <button class="level-pill ${lvl.id === activeLevel ? 'active' : ''}" data-lvl="${lvl.id}">${lvl.id} · ${lvl.title}</button>
    `).join('');
    pillsEl.querySelectorAll('[data-lvl]').forEach((btn) => {
      btn.onclick = () => { activeLevel = btn.dataset.lvl; store.setLevel(activeLevel); render(); };
    });

    const levelObj = levelsData.levels.find((l) => l.id === activeLevel) || levelsData.levels[0];
    unitsEl.innerHTML = `
      <div class="ios-card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="card-label" style="color:${levelObj.color};">CEFR ${levelObj.id}</div>
          <span style="font-size:11px;font-weight:700;color:var(--ios-blue);">${difficultyNote[levelObj.id] || ''}</span>
        </div>
        <h2 style="font-size:21px;margin:4px 0 2px;">${levelObj.title}</h2>
        <p style="font-size:13px;color:var(--text-secondary);">${levelObj.subtitle}</p>
      </div>
      ${levelObj.units.map((u, idx) => {
        const done = store.state.completedUnits.includes(u.id);
        return `
          <div class="ios-card unit-card interactive" data-uid="${u.id}">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="unit-badge" style="background:${done ? 'var(--ios-green)' : levelObj.color};">${done ? '✓' : idx + 1}</div>
              <div>
                <div style="font-weight:700;font-size:15px;">${escapeHTML(u.title)}</div>
                <div style="font-size:12px;color:var(--text-secondary);">${u.duration} · +${u.xp} XP</div>
              </div>
            </div>
            <span style="color:var(--ios-blue);font-weight:800;font-size:18px;">›</span>
          </div>`;
      }).join('')}
    `;
    unitsEl.querySelectorAll('[data-uid]').forEach((card) => {
      card.onclick = () => launchUnit(levelObj, levelObj.units.find((u) => u.id === card.dataset.uid));
    });
  }

  function launchUnit(levelObj, unit) {
    let step = 0;
    const isHard = ['B2', 'C1'].includes(levelObj.id);
    const minPass = isHard ? 80 : 65;

    function showAppreciation(sentence, xpGain, onContinue) {
      playTone('fanfare');
      if (navigator.vibrate) navigator.vibrate([15, 40, 25]);
      openSheet(`
        <div class="praise-stage">
          <div class="praise-badge">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="card-label" style="color:var(--ios-green);">+${xpGain} XP EARNED</div>
          <h2 class="jakarta-heading" style="font-size:26px;margin:4px 0 6px;">${isHard ? 'Outstanding!' : 'Perfect!'}</h2>
          <p style="font-size:14.5px;font-weight:700;color:var(--text-primary);margin-bottom:14px;">"${sentence}"</p>
          <div style="display:grid;grid-template-columns:1fr 1.8fr;gap:8px;">
            <button class="btn-secondary" id="replayPraiseBtn">Dengar Ulang</button>
            <button class="btn-primary" id="nextAfterAudioBtn" disabled style="opacity:0.65;">Menyimak AI...</button>
          </div>
        </div>
      `);
      const nextBtn = document.getElementById('nextAfterAudioBtn');
      const unlockNext = () => {
        if (!nextBtn) return;
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
        nextBtn.textContent = step + 1 < unit.exercises.length ? 'Lanjut Soal Berikutnya →' : 'Selesaikan Unit ✓';
      };
      speakText(sentence, null, unlockNext);
      document.getElementById('replayPraiseBtn').onclick = () => speakText(sentence);
      nextBtn.onclick = onContinue;
    }

    function renderExercise() {
      if (step >= unit.exercises.length) {
        store.completeUnit(unit.id, unit.xp);
        closeSheet();
        render();
        return;
      }
      const ex = unit.exercises[step];

      if (ex.type === 'arrange') {
        const distractors = isHard ? ['however', 'nearly'] : [];
        const pool = [...ex.tokens, ...distractors].sort(() => Math.random() - 0.5);
        let picked = []; // { token, idx }
        let checked = false;

        const drawArrange = () => {
          openSheet(`
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span class="card-label" style="color:var(--ios-blue);">Soal ${step + 1} dari ${unit.exercises.length} · Susun Kalimat</span>
              <span style="font-size:11px;font-weight:700;color:var(--text-secondary);">Level ${levelObj.id}</span>
            </div>
            <h3 style="font-size:18px;margin:8px 0 6px;line-height:1.4;">${ex.prompt}</h3>
            <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Ketuk kata untuk menyusun. Hijau = posisi tepat, merah = urutan salah.</p>
            <div class="answer-box" id="ansBox">
              ${picked.length ? picked.map((item, i) => {
                let cls = 'word-token';
                if (checked) cls += item.token === ex.answer[i] ? ' token-correct' : ' token-wrong';
                return `<span class="${cls}" data-rem="${i}">${item.token}</span>`;
              }).join('') : '<span style="color:var(--text-tertiary);font-size:13px;">Ketuk kata di bawah untuk menyusun kalimat...</span>'}
            </div>
            <div class="token-pool" id="poolBox">
              ${pool.map((tok, i) => `<span class="word-token ${picked.some((p) => p.idx === i) ? 'used' : ''}" data-add="${i}">${tok}</span>`).join('')}
            </div>
            <button class="btn-primary" id="checkArrangeBtn">Periksa Susunan</button>
          `);

          document.querySelectorAll('[data-add]').forEach((el) => {
            el.onclick = () => { checked = false; const idx = Number(el.dataset.add); picked.push({ token: pool[idx], idx }); drawArrange(); };
          });
          document.querySelectorAll('[data-rem]').forEach((el) => {
            el.onclick = () => { checked = false; picked.splice(Number(el.dataset.rem), 1); drawArrange(); };
          });
          document.getElementById('checkArrangeBtn').onclick = () => {
            if (!picked.length) return;
            checked = true;
            const isAllRight = picked.length === ex.answer.length && picked.every((p, i) => p.token === ex.answer[i]);
            if (isAllRight) {
              drawArrange();
              setTimeout(() => showAppreciation(ex.answer.join(' '), 15, () => { step++; renderExercise(); }), 420);
            } else {
              playTone('error');
              if (navigator.vibrate) navigator.vibrate(35);
              drawArrange();
            }
          };
        };
        drawArrange();
      } else {
        openSheet(`
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="card-label" style="color:var(--ios-green);">Soal ${step + 1} dari ${unit.exercises.length} · Pelafalan</span>
            <span style="font-size:11px;font-weight:700;color:var(--text-secondary);">Min. Skor ${minPass}%</span>
          </div>
          <h3 style="font-size:17px;margin:8px 0 6px;">${ex.prompt}</h3>
          <div class="ios-card" style="background:var(--bg-grouped);font-size:18px;font-weight:800;margin-bottom:10px;">"${ex.target}"</div>
          <div class="waveform" id="unitWave"><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div></div>
          <div id="unitSpeakFeedback" style="margin-bottom:10px;"></div>
          <div style="display:grid;grid-template-columns:1fr 1.4fr 0.8fr;gap:8px;">
            <button class="btn-secondary" id="unitListenBtn">Dengar</button>
            <button class="btn-primary" id="unitRecBtn">Rekam Suara</button>
            <button class="btn-secondary" id="unitSimBtn">Simulasi</button>
          </div>
        `);

        const handleEval = (spoken) => {
          const res = evaluateSpeech(ex.target, spoken);
          const passed = res.accuracy >= minPass;
          document.getElementById('unitSpeakFeedback').innerHTML = `
            <div style="margin-bottom:6px;font-size:13px;">Skor: <strong style="color:${passed ? 'var(--ios-green)' : 'var(--ios-red)'};">${res.accuracy}%</strong></div>
            <div>${res.wordAnalysis.map((w) => `<span class="word-chip-result ${w.ok ? 'word-ok' : 'word-miss'}">${escapeHTML(w.word)}</span>`).join('')}</div>
          `;
          if (passed) {
            store.incrementRing('speaking', 1, 15);
            setTimeout(() => showAppreciation(ex.target, 20, () => { step++; renderExercise(); }), 550);
          } else {
            playTone('error');
            if (navigator.vibrate) navigator.vibrate(35);
          }
        };

        document.getElementById('unitListenBtn').onclick = () => speakText(ex.target);
        document.getElementById('unitRecBtn').onclick = () => {
          const w = document.getElementById('unitWave'); w.classList.add('active');
          startRecognition({ onResult: handleEval, onError: () => {}, onEnd: () => w.classList.remove('active') });
        };
        document.getElementById('unitSimBtn').onclick = () => handleEval(ex.target);
      }
    }
    renderExercise();
  }
  render();
}
