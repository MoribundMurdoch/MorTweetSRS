const PREFER_KEY = "mor_tweet_srs_prefer_cover_audio";

/** @typedef {{ type: 'audio', url: string } | { type: 'youtube', url: string, videoId: string }} CoverMedia */

/** @type {HTMLAudioElement | null} */
let activeAudio = null;

/** @type {HTMLIFrameElement | null} */
let activeYoutubeFrame = null;

/** @type {boolean} */
let mediaPlaying = false;

/** @type {HTMLElement | null} */
let youtubeHost = null;

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)(\?|#|$)/i;

/** @returns {boolean} */
export function preferCoverAudioEnabled() {
  return localStorage.getItem(PREFER_KEY) !== "false";
}

/** @param {boolean} on */
export function setPreferCoverAudio(on) {
  localStorage.setItem(PREFER_KEY, on ? "true" : "false");
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isAudioUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:audio/")) return true;
  try {
    const parsed = new URL(trimmed);
    return AUDIO_EXT.test(parsed.pathname);
  } catch {
    return AUDIO_EXT.test(trimmed);
  }
}

/**
 * @param {string} url
 * @returns {string | null}
 */
export function youtubeVideoId(url) {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtu.be") {
      return parsed.pathname.slice(1).split("/")[0] || null;
    }

    if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
        return parts[1] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isYoutubeUrl(url) {
  return youtubeVideoId(url) !== null;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function urlsInText(text) {
  return text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
}

/**
 * @param {string} text
 * @returns {CoverMedia | null}
 */
export function parseCoverMedia(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates = trimmed.match(/^https?:\/\/\S+$/i) ? [trimmed] : urlsInText(trimmed);

  let youtube = null;
  for (const raw of candidates) {
    const url = raw.replace(/[),.!?;:]+$/, "");
    if (isAudioUrl(url)) return { type: "audio", url };
    const videoId = youtubeVideoId(url);
    if (videoId && !youtube) youtube = { type: "youtube", url, videoId };
  }

  return youtube;
}

/** @param {HTMLElement | null} host */
export function setYoutubeHost(host) {
  youtubeHost = host;
}

export function stopCoverMedia() {
  mediaPlaying = false;

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }

  if (activeYoutubeFrame) {
    activeYoutubeFrame.remove();
    activeYoutubeFrame = null;
  }

  if (youtubeHost) youtubeHost.innerHTML = "";
}

/** @returns {boolean} */
export function isCoverMediaPlaying() {
  if (activeAudio && !activeAudio.paused) return true;
  if (activeYoutubeFrame) return mediaPlaying;
  return mediaPlaying;
}

/**
 * @param {string} url
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void }} opts
 * @returns {Promise<boolean>}
 */
function playAudioUrl(url, opts) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    activeAudio = audio;
    mediaPlaying = true;
    opts.onStart?.();

    const finish = (ok, reason) => {
      if (activeAudio === audio) activeAudio = null;
      mediaPlaying = false;
      if (ok) {
        opts.onEnd?.();
        resolve(true);
      } else {
        opts.onError?.(reason ?? "audio-error");
        resolve(false);
      }
    };

    audio.onended = () => finish(true);
    audio.onerror = () => finish(false, "audio-error");
    audio.play().catch(() => finish(false, "audio-playback-blocked"));
  });
}

/**
 * @param {string} videoId
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void }} opts
 * @returns {Promise<boolean>}
 */
function playYoutube(videoId, opts) {
  if (!youtubeHost) {
    opts.onError?.("youtube-host-missing");
    return Promise.resolve(false);
  }

  stopCoverMedia();

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.className = "cover-youtube-frame";
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0`;
    iframe.title = "YouTube audio";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;

    activeYoutubeFrame = iframe;
    mediaPlaying = true;
    opts.onStart?.();

    let settled = false;
    const done = (ok, reason) => {
      if (settled) return;
      settled = true;
      if (!ok) opts.onError?.(reason ?? "youtube-error");
      resolve(ok);
    };

    iframe.onload = () => {
      mediaPlaying = true;
      done(true);
    };

    iframe.onerror = () => {
      mediaPlaying = false;
      done(false, "youtube-error");
    };

    youtubeHost.innerHTML = "";
    youtubeHost.appendChild(iframe);
  });
}

/**
 * @param {CoverMedia} media
 * @param {{ onEnd?: () => void, onError?: (reason: string) => void, onStart?: () => void }} [opts]
 * @returns {Promise<boolean>}
 */
export function playCoverMedia(media, opts = {}) {
  stopCoverMedia();
  if (media.type === "audio") return playAudioUrl(media.url, opts);
  return playYoutube(media.videoId, opts);
}