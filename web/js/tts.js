const AUTO_KEY = "mor_tweet_srs_tts_auto";

/** @returns {SpeechSynthesis | null} */
function speechApi() {
  try {
    if (typeof speechSynthesis !== "undefined") return speechSynthesis;
    if (typeof window !== "undefined" && window.speechSynthesis) return window.speechSynthesis;
    if (window.parent !== window && window.parent.speechSynthesis) return window.parent.speechSynthesis;
  } catch {
    /* cross-origin parent */
  }
  return null;
}

/** @returns {typeof SpeechSynthesisUtterance | null} */
function utteranceClass() {
  if (typeof SpeechSynthesisUtterance !== "undefined") return SpeechSynthesisUtterance;
  try {
    if (window.parent !== window && window.parent.SpeechSynthesisUtterance) {
      return window.parent.SpeechSynthesisUtterance;
    }
  } catch {
    /* cross-origin parent */
  }
  return null;
}

/** @returns {boolean} */
export function ttsSupported() {
  return speechApi() !== null && utteranceClass() !== null;
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
  speechApi()?.cancel();
}

/** @returns {boolean} */
export function isSpeaking() {
  return Boolean(speechApi()?.speaking);
}

/**
 * @param {string} text
 * @param {{ onEnd?: () => void }} [opts]
 * @returns {boolean}
 */
export function speakText(text, opts = {}) {
  const api = speechApi();
  const Utterance = utteranceClass();
  if (!api || !Utterance) return false;

  const trimmed = text.trim();
  if (!trimmed) return false;

  stopSpeech();

  const utterance = new Utterance(trimmed);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  const end = () => opts.onEnd?.();
  utterance.onend = end;
  utterance.onerror = end;

  const voices = api.getVoices();
  const preferred =
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices[0];
  if (preferred) utterance.voice = preferred;

  api.speak(utterance);
  return true;
}

/** @param {() => void} fn */
export function whenVoicesReady(fn) {
  const api = speechApi();
  if (!api) return;
  if (api.getVoices().length) {
    fn();
    return;
  }
  api.addEventListener("voiceschanged", fn, { once: true });
}