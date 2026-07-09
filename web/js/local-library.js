/**
 * Desktop local deck folder (native path via mortweet:// API).
 * No-ops gracefully in plain browser / when the shell is unavailable.
 */

const LINKED_FILE_KEY = "mor_tweet_srs_linked_file";

/** @returns {string} */
function apiBase() {
  // Page is mortweet://app/index.html → relative api/ hits mortweet://app/api/...
  return "api";
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function api(path, init = {}) {
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  return res;
}

/** @type {boolean | null} */
let desktopCached = null;

/** @returns {Promise<boolean>} */
export async function isDesktopShell() {
  if (desktopCached !== null) return desktopCached;
  try {
    const res = await api("/capabilities");
    if (!res.ok) {
      desktopCached = false;
      return false;
    }
    const data = await res.json();
    desktopCached = Boolean(data?.desktop && data?.localLibrary);
    return desktopCached;
  } catch {
    desktopCached = false;
    return false;
  }
}

/**
 * @typedef {{ file: string, name: string, posts: number, mtime?: number }} LocalDeckEntry
 * @typedef {{ folder: string | null, decks: LocalDeckEntry[], error?: string | null }} LocalLibraryState
 */

/** @returns {Promise<LocalLibraryState>} */
export async function fetchLocalLibrary() {
  const res = await api("/local-library");
  if (!res.ok) throw new Error("Could not load local library.");
  return res.json();
}

/** @returns {Promise<LocalLibraryState>} */
export async function pickLocalFolder() {
  const res = await api("/local-library/pick", { method: "POST" });
  if (!res.ok) throw new Error("Could not open folder picker.");
  return res.json();
}

/** @returns {Promise<LocalLibraryState>} */
export async function clearLocalFolder() {
  const res = await api("/local-library/clear", { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Could not clear folder.");
  }
  return res.json();
}

/**
 * @param {string} file
 * @returns {Promise<string>}
 */
export async function readLocalDeck(file) {
  const res = await api(`/local-library/read?file=${encodeURIComponent(file)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Could not read deck file.");
  }
  return res.text();
}

/**
 * @param {string} file
 * @param {string} json
 * @returns {Promise<LocalDeckEntry>}
 */
export async function writeLocalDeck(file, json) {
  const res = await api("/local-library/write", {
    method: "POST",
    body: JSON.stringify({ file, json }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Could not write deck file.");
  }
  return res.json();
}

/**
 * @param {string} name
 * @returns {Promise<string>}
 */
export async function suggestLocalFilename(name) {
  const res = await api("/local-library/suggest-name", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return "deck.json";
  const data = await res.json();
  return typeof data.file === "string" ? data.file : "deck.json";
}

/** @returns {string | null} */
export function getLinkedFile() {
  try {
    const v = localStorage.getItem(LINKED_FILE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** @param {string | null} file */
export function setLinkedFile(file) {
  try {
    if (!file) localStorage.removeItem(LINKED_FILE_KEY);
    else localStorage.setItem(LINKED_FILE_KEY, file);
  } catch {
    /* ignore */
  }
}
