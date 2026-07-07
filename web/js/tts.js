const AUTO_KEY = "mor_tweet_srs_tts_auto";

/** @type {SpeechSynthesisUtterance | null} */
let activeUtterance = null;

/** @type {Promise<SpeechSynthesisVoice[]> | null} */
let voicesPromise = null;

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

/** Chromium on Linux loads voices asynchronously via speech-dispatcher. */
export function ensureVoices() {
  const api = speechApi();
  if (!api) return Promise.resolve([]);

  const existing = api.getVoices();
  if (existing.length) return Promise.resolve(existing);

  if (voicesPromise) return voicesPromise;

  voicesPromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(api.getVoices());
    };

    const onVoices = () => finish();
    api.addEventListener("voiceschanged", onVoices);
    api.getVoices();

    window.setTimeout(() => finish(), 100);
    window.setTimeout(() => finish(), 500);
    window.setTimeout(() => {
      api.removeEventListener("voiceschanged", onVoices);
      finish();
    }, 4000);
  });

  return voicesPromise;
}

/** Wake up speech synthesis (Chrome/Linux often needs this). */
export function primeTts() {
  const api = speechApi();
  if (!api) return;
  api.getVoices();
  if (api.paused) api.resume();
  void ensureVoices();
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
  if (api.speaking || api.pending) api.cancel();
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

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = english.length ? english : voices;

  return (
    pool.find((v) => v.default) ??
    pool.find((v) => /english.*america/i.test(v.name)) ??
    pool.find((v) => v.name.includes("espeak") && v.lang.startsWith("en")) ??
    pool.find((v) => v.lang === "en-US" && v.localService) ??
    pool.find((v) => v.lang === "en-US") ??
    pool.find((v) => v.lang.startsWith("en")) ??
    pool[0]
  );
}

/**
 * @param {SpeechSynthesis} api
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void }} opts
 */
function startUtterance(api, text, opts) {
  const Utterance = utteranceClass();
  if (!Utterance) return false;

  if (api.paused) api.resume();

  const utterance = new Utterance(text);
  activeUtterance = utterance;
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  const voice = pickVoice(api);
  if (voice) utterance.voice = voice;

  const finish = () => {
    if (activeUtterance === utterance) activeUtterance = null;
    opts.onEnd?.();
  };

  utterance.onstart = () => opts.onStart?.();
  utterance.onend = finish;
  utterance.onerror = (event) => {
    const reason = event.error ?? "speech-error";
    if (reason !== "interrupted") {
      console.warn("MorTweet TTS:", reason);
      opts.onError?.(reason);
    }
    finish();
  };

  api.speak(utterance);
  return true;
}

/**
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void }} [opts]
 * @returns {boolean}
 */
export function speakText(text, opts = {}) {
  const api = speechApi();
  if (!api || !utteranceClass()) return false;

  const trimmed = text.trim();
  if (!trimmed) return false;

  if (api.speaking || api.pending) api.cancel();
  primeTts();

  let started = false;
  const markStarted = () => {
    started = true;
  };

  const trySpeak = () => {
    if (started || api.speaking || api.pending) return;
    startUtterance(api, trimmed, {
      onStart: markStarted,
      onEnd: opts.onEnd,
      onError: opts.onError,
    });
  };

  trySpeak();

  // Chrome/Linux: first speak() after load is often swallowed.
  window.setTimeout(trySpeak, 300);

  void ensureVoices().then(trySpeak);

  return true;
}