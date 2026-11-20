import { store } from '../state.js?v=10';

export function getEnglishVoices() {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
}

export function formatAccentTag(lang = '') {
  const up = lang.toUpperCase();
  if (up.includes('US')) return 'US English';
  if (up.includes('GB') || up.includes('UK')) return 'UK English';
  if (up.includes('AU')) return 'Australian';
  return lang || 'English';
}

export function stopSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function playTone(type = 'success') {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (type === 'error') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(145, now + 0.18);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now); osc.stop(now + 0.21);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.09);
      if (type === 'fanfare') osc.frequency.setValueAtTime(783.99, now + 0.18);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.start(now); osc.stop(now + 0.35);
    }
  } catch {}
}

export function speakText(text, rateOverride = null, onEnd = null, overrideURI = null) {
  const rate = rateOverride ?? store.state.speechRate ?? 1.0;
  if (!('speechSynthesis' in window)) {
    if (onEnd) setTimeout(onEnd, 1200);
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voices = getEnglishVoices();
  const targetURI = overrideURI || store.state.voiceURI;
  const chosen = voices.find((v) => v.voiceURI === targetURI) || voices.find((v) => v.lang.includes('US')) || voices[0];
  if (chosen) { utter.voice = chosen; utter.lang = chosen.lang; } else { utter.lang = 'en-US'; }
  utter.rate = rate;

  let finished = false;
  const done = () => { if (!finished) { finished = true; if (onEnd) onEnd(); } };
  const fallbackMs = Math.max(1600, (text.split(/\s+/).length * 520) / rate);
  const timer = setTimeout(done, fallbackMs);

  utter.onend = () => { clearTimeout(timer); done(); };
  utter.onerror = () => { clearTimeout(timer); done(); };
  window.speechSynthesis.speak(utter);
}

export function startRecognition({ onResult, onError, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onError?.('Browser tidak mendukung mic, gunakan tombol Simulasi'); onEnd?.(); return; }
  const rec = new SR();
  rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = (e) => onResult?.(e.results[0][0].transcript);
  rec.onerror = (e) => onError?.(e.error || 'Gagal merekam');
  rec.onend = () => onEnd?.();
  rec.start();
}

export function evaluateSpeech(targetSentence, spokenText) {
  const clean = (s) => s.toLowerCase().replace(/[^a-z0-9\s']/g, '').trim().split(/\s+/).filter(Boolean);
  const targetWords = clean(targetSentence);
  const spokenSet = new Set(clean(spokenText));
  const wordAnalysis = targetWords.map((w) => ({ word: w, ok: spokenSet.has(w) }));
  const matched = wordAnalysis.filter((w) => w.ok).length;
  const accuracy = targetWords.length ? Math.round((matched / targetWords.length) * 100) : 0;
  return { accuracy, wordAnalysis };
}
