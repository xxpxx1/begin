export function speakText(text, rate = 1.0, onEnd = null) {
  if (!('speechSynthesis' in window)) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = rate;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) => v.lang.includes('en-US') && v.name.includes('Samantha'))
    || voices.find((v) => v.lang.includes('en-US')) || voices[0];
  if (preferred) utter.voice = preferred;
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
    if (onError) onError('Browser ini tidak mendukung Web Speech API. Gunakan tombol Simulasi.');
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
