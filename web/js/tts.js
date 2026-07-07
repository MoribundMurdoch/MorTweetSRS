const AUTO_KEY = "mor_tweet_srs_tts_auto";

/** @returns {boolean} */
export function ttsSupported() {
  return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
}

/** @returns {boolean} */
export function autoSpeakEnabled() {
  if (!ttsSupported()) return false;
  return localStorage.getItem(AUTO_KEY) !== "false";
}

/** @param {boolean} on */
export function setAutoSpeakEnabled(on) {
  localStorage.setItem(AUTO_KEY, on ? "true" : "false");
}

export function stopSpeech() {
  if (!ttsSupported()) return;
  speechSynthesis.cancel();
}

/** @returns {boolean} */
export function isSpeaking() {
  return ttsSupported() && speechSynthesis.speaking;
}

/**
 * @param {string} text
 * @param {{ onEnd?: () => void }} [opts]
 * @returns {boolean}
 */
export function speakText(text, opts = {}) {
  if (!ttsSupported()) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  stopSpeech();

  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  const end = () => opts.onEnd?.();
  utterance.onend = end;
  utterance.onerror = end;

  const voices = speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices[0];
  if (preferred) utterance.voice = preferred;

  speechSynthesis.speak(utterance);
  return true;
}

/** @param {() => void} fn */
export function whenVoicesReady(fn) {
  if (!ttsSupported()) return;
  if (speechSynthesis.getVoices().length) {
    fn();
    return;
  }
  speechSynthesis.addEventListener("voiceschanged", fn, { once: true });
}