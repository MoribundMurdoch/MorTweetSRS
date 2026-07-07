const AUTO_KEY = "mor_tweet_srs_tts_auto";
const PROVIDER_KEY = "mor_tweet_srs_tts_provider";
const PROVIDER_BOOT_KEY = "mor_tweet_srs_tts_provider_boot";

/** @typedef {'auto' | 'online' | 'local'} TtsProvider */

/** @type {SpeechSynthesisUtterance | null} */
let activeUtterance = null;

/** @type {HTMLAudioElement | null} */
let activeAudio = null;

/** @type {boolean} */
let onlineSpeaking = false;

/** @type {boolean} */
let onlineStopping = false;

/** @type {Promise<SpeechSynthesisVoice[]> | null} */
let voicesPromise = null;

/** Chromium blocks speechSynthesis until the user interacts with the page. */
let userGesturePrimed = false;

export function markTtsUserGesture() {
  userGesturePrimed = true;
}

/** @returns {boolean} */
export function hasTtsUserGesture() {
  return userGesturePrimed;
}

/** @returns {TtsProvider} */
export function getTtsProvider() {
  const saved = localStorage.getItem(PROVIDER_KEY);
  if (saved === "local" || saved === "browser") return "local";
  if (saved === "online" || saved === "google") return "online";
  if (saved === "auto") return "auto";
  return "auto";
}

/** @param {TtsProvider} provider */
export function setTtsProvider(provider) {
  localStorage.setItem(PROVIDER_KEY, provider);
}

/** @param {SpeechSynthesisVoice} voice */
function isPiperVoice(voice) {
  const name = voice.name.toLowerCase();
  return name.includes("piper") || name.includes("en_us-amy") || name.includes("en_us-ryan");
}

/**
 * @param {SpeechSynthesisVoice[]} voices
 * @returns {boolean}
 */
export function hasPiperVoice(voices) {
  return voices.some(isPiperVoice);
}

/**
 * @param {SpeechSynthesisVoice[]} voices
 * @returns {SpeechSynthesisVoice | undefined}
 */
export function pickVoice(voices) {
  if (!voices.length) return undefined;

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const piperAvailable = hasPiperVoice(voices);
  const pool = english.length ? english : voices;
  const nonEspeak = piperAvailable ? pool.filter((v) => !v.name.toLowerCase().includes("espeak")) : pool;

  return (
    nonEspeak.find(isPiperVoice) ??
    pool.find(isPiperVoice) ??
    nonEspeak.find((v) => v.default) ??
    pool.find((v) => v.default) ??
    nonEspeak.find((v) => v.lang === "en-US" && v.localService) ??
    pool.find((v) => v.lang === "en-US" && v.localService) ??
    nonEspeak.find((v) => v.lang === "en-US") ??
    pool.find((v) => v.lang === "en-US") ??
    nonEspeak[0] ??
    pool[0]
  );
}

/** Prefer local Piper/speech-dispatcher when the browser exposes it. */
export async function bootstrapTtsProvider() {
  if (localStorage.getItem(PROVIDER_BOOT_KEY)) return;
  const voices = await ensureVoices();
  if (hasPiperVoice(voices)) {
    const saved = localStorage.getItem(PROVIDER_KEY);
    if (!saved || saved === "google" || saved === "online") {
      setTtsProvider("local");
    }
  }
  localStorage.setItem(PROVIDER_BOOT_KEY, "1");
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

function onlineTtsAvailable() {
  return typeof Audio !== "undefined" && typeof navigator !== "undefined" && navigator.onLine !== false;
}

/** @returns {boolean} */
export function ttsSupported() {
  return onlineTtsAvailable() || browserTtsAvailable();
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
  onlineStopping = true;
  onlineSpeaking = false;

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }

  const api = speechApi();
  if (api && (api.speaking || api.pending)) api.cancel();
  activeUtterance = null;

  window.setTimeout(() => {
    onlineStopping = false;
    if (api?.paused) api.resume();
  }, 0);
}

/** @returns {boolean} */
export function isSpeaking() {
  if (onlineSpeaking) return true;
  const api = speechApi();
  return Boolean(api && (api.speaking || api.pending));
}

/**
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void }} opts
 * @returns {Promise<boolean>}
 */
async function speakBrowser(text, opts) {
  const api = speechApi();
  if (!api || !utteranceClass()) {
    opts.onError?.("local-unavailable");
    return false;
  }

  const voices = await ensureVoices();
  if (api.speaking || api.pending) api.cancel();
  primeTts();

  return new Promise((resolve) => {
    let started = false;
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const markStarted = () => {
      started = true;
      opts.onStart?.();
    };

    const startUtterance = () => {
      if (started || settled || api.speaking || api.pending) return;

      const Utterance = utteranceClass();
      if (!Utterance) return;

      if (api.paused) api.resume();

      const utterance = new Utterance(text);
      activeUtterance = utterance;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voice = pickVoice(voices.length ? voices : api.getVoices());
      if (voice) utterance.voice = voice;

      utterance.onstart = markStarted;
      utterance.onend = () => {
        if (activeUtterance === utterance) activeUtterance = null;
        opts.onEnd?.();
        done(true);
      };
      utterance.onerror = (event) => {
        const reason = event.error ?? "speech-error";
        if (activeUtterance === utterance) activeUtterance = null;
        if (reason !== "interrupted") {
          console.warn("MorTweet TTS:", reason);
          opts.onError?.(reason);
        }
        done(false);
      };

      api.speak(utterance);
    };

    startUtterance();
    window.setTimeout(startUtterance, 300);
    window.setTimeout(startUtterance, 800);

    window.setTimeout(() => {
      if (!started && !settled) {
        opts.onError?.("local-timeout");
        done(false);
      }
    }, 6000);
  });
}

/** @param {string} text */
function onlineTtsUrl(text) {
  const q = encodeURIComponent(text.slice(0, 200));
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${q}&tl=en`;
}

/** @param {string} text */
function splitForOnline(text) {
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
function playOnlineChunk(chunk) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(onlineTtsUrl(chunk));
    activeAudio = audio;
    audio.onended = () => {
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };
    audio.onerror = () => {
      if (activeAudio === audio) activeAudio = null;
      reject(new Error("online-audio-error"));
    };
    audio.play().catch(reject);
  });
}

/**
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void }} opts
 * @returns {Promise<boolean>}
 */
async function speakOnline(text, opts) {
  const chunks = splitForOnline(text);
  if (!chunks.length) return false;

  onlineSpeaking = true;
  opts.onStart?.();

  try {
    for (const chunk of chunks) {
      if (onlineStopping) break;
      await playOnlineChunk(chunk);
    }
    if (!onlineStopping) opts.onEnd?.();
    return !onlineStopping;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "online-error";
    console.warn("MorTweet TTS:", reason);
    opts.onError?.(reason);
    return false;
  } finally {
    onlineSpeaking = false;
  }
}

/**
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void, userInitiated?: boolean }} opts
 */
async function speakLocal(text, opts) {
  const userInitiated = opts.userInitiated ?? false;
  const canUseBrowser = browserTtsAvailable() && (userInitiated || userGesturePrimed);

  if (canUseBrowser) {
    const ok = await speakBrowser(text, {
      onStart: opts.onStart,
      onEnd: opts.onEnd,
      onError: () => {},
    });
    if (ok) return;
  }

  if (onlineTtsAvailable()) {
    const ok = await speakOnline(text, {
      onStart: opts.onStart,
      onEnd: opts.onEnd,
      onError: () => {},
    });
    if (ok) return;
  }

  if (userInitiated) opts.onError?.(canUseBrowser ? "local-failed" : "local-no-gesture");
}

/**
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void, userInitiated?: boolean }} opts
 */
async function speakAuto(text, opts) {
  const userInitiated = opts.userInitiated ?? false;
  const voices = await ensureVoices();
  const preferLocal = hasPiperVoice(voices);
  const canUseBrowser = browserTtsAvailable() && (userInitiated || userGesturePrimed);

  if (preferLocal && canUseBrowser) {
    const ok = await speakBrowser(text, {
      onStart: opts.onStart,
      onEnd: opts.onEnd,
      onError: () => {},
    });
    if (ok) return;
  }

  if (onlineTtsAvailable()) {
    const ok = await speakOnline(text, {
      onStart: opts.onStart,
      onEnd: opts.onEnd,
      onError: () => {},
    });
    if (ok) return;
  }

  if (canUseBrowser) {
    const ok = await speakBrowser(text, {
      onStart: opts.onStart,
      onEnd: opts.onEnd,
      onError: () => {},
    });
    if (ok) return;
  }

  if (userInitiated) opts.onError?.("no-engine");
}

/**
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void, userInitiated?: boolean }} [opts]
 * @returns {boolean}
 */
export function speakText(text, opts = {}) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  stopSpeech();

  const mode = getTtsProvider();
  if (mode === "online") {
    void speakOnline(trimmed, opts);
    return true;
  }
  if (mode === "local") {
    void speakLocal(trimmed, opts);
    return true;
  }

  void speakAuto(trimmed, opts);
  return true;
}

export async function ttsProviderLabel() {
  const mode = getTtsProvider();
  if (mode === "online") return "Online voice";

  const voices = await ensureVoices();
  const piper = pickVoice(voices);
  if (piper && isPiperVoice(piper)) {
    return mode === "local" ? "Piper (local)" : "Auto · Piper";
  }
  if (mode === "local") return "Local voice";
  return "Auto voice";
}