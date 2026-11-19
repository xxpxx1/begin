import { store } from '../state.js';

export function getEnglishVoices() {
  if (!('speechSynthesis' in window)) return [];
  const all = window.speechSynthesis.getVoices();
  const enVoices = all.filter((v) => v.lang.toLowerCase().startsWith('en'));
  return enVoices.length ? enVoices : all;
}

export function formatAccentTag(lang) {
  const code = (lang || '').toUpperCase();
  if (code.includes('US')) return '🇺🇸 US';
  if (code.includes('GB') || code.includes('UK')) return '🇬🇧 UK';
  if (code.includes('AU')) return '🇦🇺 AU';
  if (code.includes('IN')) return '🇮🇳 IN';
  if (code.includes('CA')) return '🇨🇦 CA';
  return `🌐 ${code || 'EN'}`;
}

export function speakText(text, rate = 1.0, onEnd = null, overrideVoiceURI = null) {
  if (!('speechSynthesis' in window)) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate;

  const voices = getEnglishVoices();
  const targetURI = overrideVoiceURI !== null ? overrideVoiceURI : store.state.voiceURI;
  const chosen = voices.find((v) => v.voiceURI === targetURI)
    || voices.find((v) => v.lang.includes('en-US') && v.name.includes('Samantha'))
    || voices.find((v) => v.lang.includes('en-US'))
    || voices[0];

  if (chosen) {
    utter.voice = chosen;
    utter.lang = chosen.lang;
  } else {
    utter.lang = 'en-US';
  }

  if (onEnd) utter.onend = onEnd;
  window.speechSynthesis.speak(utter);
}

export function evaluateSpeech(targetSentence, spokenTranscript) {
  const clean = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
  const targetWords = clean(targetSentence);
  const spokenWords = clean(spokenTranscript);
  let matchedCount = 0;
  const wordAnalysis = targetWords.map((word) => {
    const found = spokenWords.includes(word);
    if (found) matchedCount++;
    return { word, ok: found };
  });
  const accuracy = targetWords.length ? Math.round((matchedCount / targetWords.length) * 100) : 0;
  const fillers = spokenWords.filter((w) => ['um', 'uh', 'er', 'like'].includes(w));
  return { accuracy, wordAnalysis, fillerCount: fillers.length, transcript: spokenTranscript };
}

export function startRecognition({ onStart, onResult, onError, onEnd }) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    if (onError) onError('Browser ini tidak mendukung Web Speech API. Gunakan tombol Demo.');
    return null;
  }
  const recognition = new SpeechRec();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => onStart && onStart();
  recognition.onresult = (e) => onResult && onResult(e.results[0][0].transcript);
  recognition.onerror = (e) => onError && onError(e.error);
  recognition.onend = () => onEnd && onEnd();
  recognition.start();
  return recognition;
}
