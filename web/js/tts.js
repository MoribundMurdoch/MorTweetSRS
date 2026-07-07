const AUTO_KEY = "mor_tweet_srs_tts_auto";

/** @type {SpeechSynthesisUtterance | null} */
let activeUtterance = null;

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

/** Wake up speech synthesis (Chrome/Linux often needs this). */
export function primeTts() {
  const api = speechApi();
  if (!api) return;
  api.getVoices();
  if (api.paused) api.resume();
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
  const api = speechApi();
  if (!api) return;
  api.cancel();
  activeUtterance = null;
  window.setTimeout(() => {
    if (api.paused) api.resume();
  }, 0);
}

/** @returns {boolean} */
export function isSpeaking() {
  const api = speechApi();
  return Boolean(api && (api.speaking || api.pending));
}

/**
 * @param {SpeechSynthesis} api
 * @returns {SpeechSynthesisVoice | undefined}
 */
function pickVoice(api) {
  const voices = api.getVoices();
  if (!voices.length) return undefined;
  return (
    voices.find((v) => v.lang === "en-US" && v.localService) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices[0]
  );
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

  api.cancel();
  primeTts();

  const utterance = new Utterance(trimmed);
  activeUtterance = utterance;
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  const finish = () => {
    activeUtterance = null;
    opts.onEnd?.();
  };
  utterance.onend = finish;
  utterance.onerror = (event) => {
    console.warn("MorTweet TTS:", event.error ?? "speech error");
    finish();
  };

  const voice = pickVoice(api);
  if (voice) utterance.voice = voice;

  api.speak(utterance);

  // Chrome bug: first speak() after load is often swallowed.
  window.setTimeout(() => {
    if (!api.speaking && !api.pending && activeUtterance) {
      primeTts();
      api.speak(activeUtterance);
    }
  }, 120);

  return true;
}