const AUTO_KEY = "mor_tweet_srs_tts_auto";
const PROVIDER_KEY = "mor_tweet_srs_tts_provider";

/** @typedef {'browser' | 'google'} TtsProvider */

/** @type {SpeechSynthesisUtterance | null} */
let activeUtterance = null;

/** @type {HTMLAudioElement | null} */
let activeAudio = null;

/** @type {boolean} */
let googleSpeaking = false;

/** @type {boolean} */
let googleStopping = false;

/** @type {Promise<SpeechSynthesisVoice[]> | null} */
let voicesPromise = null;

/** @returns {TtsProvider} */
export function getTtsProvider() {
  const saved = localStorage.getItem(PROVIDER_KEY);
  return saved === "browser" ? "browser" : "google";
}

/** @param {TtsProvider} provider */
export function setTtsProvider(provider) {
  localStorage.setItem(PROVIDER_KEY, provider);
}

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

function browserTtsAvailable() {
  return speechApi() !== null && utteranceClass() !== null;
}

/** @returns {boolean} */
export function ttsSupported() {
  if (getTtsProvider() === "google") return true;
  return browserTtsAvailable();
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
  googleStopping = true;
  googleSpeaking = false;

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }

  const api = speechApi();
  if (api && (api.speaking || api.pending)) api.cancel();
  activeUtterance = null;

  window.setTimeout(() => {
    googleStopping = false;
    if (api?.paused) api.resume();
  }, 0);
}

/** @returns {boolean} */
export function isSpeaking() {
  if (googleSpeaking) return true;
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
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void }} opts
 */
function speakBrowser(text, opts) {
  const api = speechApi();
  if (!api || !utteranceClass()) {
    opts.onError?.("browser-unavailable");
    return false;
  }

  if (api.speaking || api.pending) api.cancel();
  primeTts();

  let started = false;
  const markStarted = () => {
    started = true;
    opts.onStart?.();
  };

  const startUtterance = () => {
    if (started || api.speaking || api.pending) return;

    const Utterance = utteranceClass();
    if (!Utterance) return;

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

    utterance.onstart = markStarted;
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
  };

  startUtterance();
  window.setTimeout(startUtterance, 300);
  void ensureVoices().then(startUtterance);
  return true;
}

/** @param {string} text */
function googleTtsUrl(text) {
  const q = encodeURIComponent(text.slice(0, 200));
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${q}&tl=en`;
}

/** @param {string} text */
function splitForGoogle(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= 200) return [trimmed];

  const chunks = [];
  let rest = trimmed;
  while (rest.length > 200) {
    let cut = rest.lastIndexOf(" ", 200);
    if (cut < 80) cut = 200;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * @param {string} chunk
 * @returns {Promise<void>}
 */
function playGoogleChunk(chunk) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(googleTtsUrl(chunk));
    activeAudio = audio;
    audio.onended = () => {
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };
    audio.onerror = () => {
      if (activeAudio === audio) activeAudio = null;
      reject(new Error("google-audio-error"));
    };
    audio.play().catch(reject);
  });
}

/**
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void }} opts
 */
async function speakGoogle(text, opts) {
  const chunks = splitForGoogle(text);
  if (!chunks.length) return false;

  googleSpeaking = true;
  opts.onStart?.();

  try {
    for (const chunk of chunks) {
      if (googleStopping) break;
      await playGoogleChunk(chunk);
    }
    if (!googleStopping) opts.onEnd?.();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "google-error";
    console.warn("MorTweet TTS:", reason);
    opts.onError?.(reason);
  } finally {
    googleSpeaking = false;
  }

  return true;
}

/**
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void }} [opts]
 * @returns {boolean}
 */
export function speakText(text, opts = {}) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  stopSpeech();

  if (getTtsProvider() === "google") {
    void speakGoogle(trimmed, opts);
    return true;
  }

  return speakBrowser(trimmed, opts);
}

export function ttsProviderLabel() {
  return getTtsProvider() === "google" ? "Google voice" : "Browser voice";
}