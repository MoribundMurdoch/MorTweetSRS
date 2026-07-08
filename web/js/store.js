import { normalizeCover } from "./cover.js";
import { newSrsState, isDue } from "./srs.js";

/** @typedef {'new' | 'learning' | 'review'} CardState */

/**
 * @typedef {Object} SrsState
 * @property {CardState} state
 * @property {number} learningStep
 * @property {number} ease
 * @property {number} intervalDays
 * @property {number} reps
 * @property {number} lapses
 * @property {string} due ISO timestamp
 */

/**
 * @typedef {'text' | 'image'} CoverType
 * @typedef {Object} Cover
 * @property {CoverType} type
 * @property {string} content
 * @property {string} [audioUrl]
 */

/**
 * @typedef {Object} TweetPost
 * @property {string} id
 * @property {string} url
 * @property {Cover | null} [cover]
 * @property {string} [note] legacy — migrated to cover on load
 * @property {string} addedAt
 * @property {SrsState} srs
 */

/**
 * @typedef {Object} ReviewEvent
 * @property {string} postId
 * @property {number} grade
 * @property {string} at
 */

/**
 * @typedef {Object} Collection
 * @property {string} name
 * @property {TweetPost[]} posts
 * @property {ReviewEvent[]} reviews
 */

const STORAGE_KEY = "mor_tweet_srs_v1";

/** @returns {Collection} */
export function emptyCollection() {
  return { name: "My Tweets", posts: [], reviews: [] };
}

/** @param {TweetPost} post */
function normalizePost(post) {
  if (post.cover) {
    return { ...post, cover: normalizeCover(post.cover) };
  }
  if (post.note?.trim()) {
    return { ...post, cover: { type: "text", content: post.note.trim() }, note: undefined };
  }
  return { ...post, cover: null };
}

/** @returns {Collection} */
export function loadCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCollection();
    const data = JSON.parse(raw);
    return {
      name: data.name ?? "My Tweets",
      posts: Array.isArray(data.posts) ? data.posts.map(normalizePost) : [],
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
    };
  } catch {
    return emptyCollection();
  }
}

/** @param {Collection} collection */
export function saveCollection(collection) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
}

/** @param {string} url */
export function normalizeTweetUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host !== "twitter.com" && host !== "x.com" && host !== "mobile.twitter.com") {
      return null;
    }
    const match = parsed.pathname.match(/\/(?:[^/]+)\/status\/(\d+)/);
    if (!match) return null;
    return `https://x.com/i/status/${match[1]}`;
  } catch {
    return null;
  }
}

/** @param {string} url */
export function tweetIdFromUrl(url) {
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : crypto.randomUUID();
}

/**
 * @param {Collection} collection
 * @param {string} rawUrl
 * @param {Cover | null} [cover]
 */
export function addPost(collection, rawUrl, cover = null) {
  const url = normalizeTweetUrl(rawUrl);
  if (!url) return { ok: false, error: "Paste a valid X post URL." };

  if (collection.posts.some((p) => p.url === url)) {
    return { ok: false, error: "That post is already in your deck." };
  }

  const post = {
    id: tweetIdFromUrl(url),
    url,
    cover: cover ?? null,
    addedAt: new Date().toISOString(),
    srs: newSrsState(),
  };

  collection.posts.push(post);
  saveCollection(collection);
  return { ok: true, post };
}

/**
 * @param {Collection} collection
 * @param {string} postId
 * @param {Cover | null} cover
 */
export function updatePostCover(collection, postId, cover) {
  const post = collection.posts.find((p) => p.id === postId);
  if (!post) return { ok: false, error: "Post not found." };
  post.cover = cover;
  saveCollection(collection);
  return { ok: true, post };
}

/**
 * @param {Collection} collection
 * @param {string} postId
 */
export function removePost(collection, postId) {
  collection.posts = collection.posts.filter((p) => p.id !== postId);
  collection.reviews = collection.reviews.filter((r) => r.postId !== postId);
  saveCollection(collection);
}

/** Reset SRS progress for every post; keeps URLs, covers, and the collection name. */
export function resetCollectionProgress(collection) {
  const now = new Date();
  for (const post of collection.posts) {
    post.srs = newSrsState(now);
  }
  collection.reviews = [];
  saveCollection(collection);
}

/** @param {string} text */
export function urlsFromBulkText(text) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * Sync collection to match the bulk textarea: remove missing URLs, add new ones.
 * @param {Collection} collection
 * @param {string} text
 * @returns {{ added: number, removed: number, invalid: number }}
 */
export function syncCollectionFromBulk(collection, text) {
  const lines = urlsFromBulkText(text);
  const urls = [];
  const seen = new Set();
  let invalid = 0;

  for (const line of lines) {
    const url = normalizeTweetUrl(line);
    if (!url) {
      invalid += 1;
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  const urlSet = new Set(urls);
  const before = collection.posts.length;
  collection.posts = collection.posts.filter((p) => urlSet.has(p.url));
  const removed = before - collection.posts.length;

  let added = 0;
  for (const url of urls) {
    if (collection.posts.some((p) => p.url === url)) continue;
    collection.posts.push({
      id: tweetIdFromUrl(url),
      url,
      cover: null,
      addedAt: new Date().toISOString(),
      srs: newSrsState(),
    });
    added += 1;
  }

  const postIds = new Set(collection.posts.map((p) => p.id));
  collection.reviews = collection.reviews.filter((r) => postIds.has(r.postId));
  saveCollection(collection);
  return { added, removed, invalid };
}

/**
 * @param {TweetPost} post
 * @param {Date} [now]
 */
export function postStatus(post, now = new Date()) {
  if (post.srs.state === "new") return "new";
  if (isDue(post.srs, now)) return "due";
  return "ok";
}

/**
 * @param {Collection} collection
 * @param {Date} [now]
 */
export function studyQueue(collection, now = new Date()) {
  const due = [];
  const fresh = [];

  for (const post of collection.posts) {
    if (post.srs.state === "new") {
      fresh.push(post);
    } else if (isDue(post.srs, now)) {
      due.push(post);
    }
  }

  due.sort((a, b) => new Date(a.srs.due) - new Date(b.srs.due));
  fresh.sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));

  return [...due, ...fresh];
}

/**
 * @param {Collection} collection
 * @param {Date} [now]
 */
export function stats(collection, now = new Date()) {
  let due = 0;
  let fresh = 0;
  let later = 0;

  for (const post of collection.posts) {
    const status = postStatus(post, now);
    if (status === "new") fresh += 1;
    else if (status === "due") due += 1;
    else later += 1;
  }

  return {
    total: collection.posts.length,
    due,
    new: fresh,
    later,
    reviewedToday: collection.reviews.filter((r) => {
      const d = new Date(r.at);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }).length,
  };
}

/**
 * @param {Collection} collection
 * @param {string} postId
 * @param {import('./srs.js').Grade} grade
 * @param {import('./srs.js').SrsState} nextSrs
 */
export function recordReview(collection, postId, grade, nextSrs) {
  const post = collection.posts.find((p) => p.id === postId);
  if (!post) return;

  post.srs = nextSrs;
  collection.reviews.push({
    postId,
    grade,
    at: new Date().toISOString(),
  });

  if (collection.reviews.length > 500) {
    collection.reviews = collection.reviews.slice(-500);
  }

  saveCollection(collection);
}

/** @param {Collection} collection */
export function exportJson(collection) {
  return JSON.stringify(collection, null, 2);
}

/**
 * @param {unknown} raw
 * @returns {TweetPost | null}
 */
function normalizeImportedPost(raw) {
  if (!raw || typeof raw !== "object") return null;
  const p = /** @type {TweetPost} */ (raw);
  const url = typeof p.url === "string" ? normalizeTweetUrl(p.url) ?? p.url.trim() : null;
  if (!url) return null;

  const srs = p.srs && typeof p.srs === "object" ? p.srs : newSrsState();
  const base = {
    id: typeof p.id === "string" && p.id ? p.id : tweetIdFromUrl(url),
    url,
    addedAt: typeof p.addedAt === "string" ? p.addedAt : new Date().toISOString(),
    srs: {
      state: srs.state === "learning" || srs.state === "review" ? srs.state : srs.state === "new" ? "new" : "new",
      learningStep: Number.isFinite(srs.learningStep) ? srs.learningStep : 0,
      ease: Number.isFinite(srs.ease) ? srs.ease : 2.5,
      intervalDays: Number.isFinite(srs.intervalDays) ? srs.intervalDays : 0,
      reps: Number.isFinite(srs.reps) ? srs.reps : 0,
      lapses: Number.isFinite(srs.lapses) ? srs.lapses : 0,
      due: typeof srs.due === "string" ? srs.due : new Date().toISOString(),
    },
  };

  return normalizePost({ ...p, ...base });
}

/**
 * @param {string} json
 * @returns {{ ok: true, collection: Collection } | { ok: false, error: string }}
 */
export function importJson(json) {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== "object") {
      return { ok: false, error: "This file is not a valid deck." };
    }
    if (!Array.isArray(data.posts)) {
      return { ok: false, error: "This deck file is missing its cards." };
    }

    const posts = data.posts.map(normalizeImportedPost).filter(Boolean);
    if (!posts.length && data.posts.length > 0) {
      return { ok: false, error: "No valid cards found — each entry needs an X post URL." };
    }

    const collection = {
      name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Imported",
      posts,
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
    };
    saveCollection(collection);
    return { ok: true, collection };
  } catch {
    return { ok: false, error: "Could not read this deck file." };
  }
}