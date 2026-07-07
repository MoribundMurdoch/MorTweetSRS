import { getCoverMedia, parseCoverMedia } from "./cover-audio.js";

/** @typedef {'text' | 'image'} CoverType */

/**
 * @typedef {Object} Cover
 * @property {CoverType} type
 * @property {string} content
 * @property {string} [audioUrl]
 */

/** @param {unknown} cover */
export function normalizeCover(cover) {
  if (!cover || typeof cover !== "object") return null;
  const c = /** @type {Cover} */ (cover);
  if (c.type !== "text" && c.type !== "image") return null;

  if (c.type === "image") {
    if (!c.content || typeof c.content !== "string" || !c.content.trim()) return null;
    return { type: "image", content: c.content.trim() };
  }

  const content = typeof c.content === "string" ? c.content.trim() : "";
  const audioUrl = typeof c.audioUrl === "string" ? c.audioUrl.trim() : "";
  if (!content && !audioUrl) return null;

  /** @type {Cover} */
  const normalized = { type: "text", content };
  if (audioUrl) normalized.audioUrl = audioUrl;
  return normalized;
}

/** @param {import('./store.js').TweetPost | null | undefined} post */
export function postCover(post) {
  if (!post) return null;
  if (post.cover) return normalizeCover(post.cover);
  if (post.note?.trim()) return { type: "text", content: post.note.trim() };
  return null;
}

/** @param {Cover | null} cover */
export function coverLabel(cover) {
  if (!cover) return "";
  if (cover.type === "image") return "image cover";
  const media = getCoverMedia(cover);
  if (media?.type === "audio") return "audio cover";
  if (media?.type === "youtube") return "youtube cover";
  return "text cover";
}

/** @param {Cover} cover */
export function splitCoverText(cover) {
  if (cover.type !== "text") return { prompt: "", audioUrl: "" };
  if (cover.audioUrl?.trim()) {
    return { prompt: cover.content.trim(), audioUrl: cover.audioUrl.trim() };
  }

  const media = parseCoverMedia(cover.content);
  if (!media) return { prompt: cover.content, audioUrl: "" };

  const prompt = cover.content
    .replace(media.url, "")
    .replace(/\s+/g, " ")
    .trim();
  return { prompt, audioUrl: media.url };
}

/** @param {Cover | null | undefined} cover */
export function coverSpeechText(cover) {
  if (!cover || cover.type !== "text") return "";
  return cover.content.trim();
}

/**
 * @param {string} type
 * @param {string} text
 * @param {string} imageUrl
 * @param {string} imageData
 * @param {string} [audioUrl]
 * @returns {Cover | null}
 */
export function coverFromInputs(type, text, imageUrl, imageData, audioUrl = "") {
  if (type === "text") {
    const content = text.trim();
    const linked = audioUrl.trim();
    if (!content && !linked) return null;

    /** @type {Cover} */
    const cover = { type: "text", content };
    if (linked) cover.audioUrl = linked;
    return cover;
  }
  if (type === "image") {
    const content = imageData || imageUrl.trim();
    return content ? { type: "image", content } : null;
  }
  return null;
}

/**
 * @param {HTMLElement} container
 * @param {Cover} cover
 */
export function renderCover(container, cover) {
  container.innerHTML = "";
  if (cover.type === "text") {
    const prompt = cover.content.trim();
    if (prompt) {
      const p = document.createElement("p");
      p.className = "cover-text";
      p.textContent = prompt;
      container.appendChild(p);
    }

    const media = getCoverMedia(cover);
    if (media) {
      const tag = document.createElement("span");
      tag.className = "cover-media-tag";
      tag.textContent = media.type === "youtube" ? "YouTube audio" : "Linked audio";
      container.appendChild(tag);
    } else if (!prompt) {
      const p = document.createElement("p");
      p.className = "cover-text cover-text-muted";
      p.textContent = "Audio cover";
      container.appendChild(p);
    }
    return;
  }

  const img = document.createElement("img");
  img.className = "cover-image";
  img.src = cover.content;
  img.alt = "Cover image";
  img.loading = "eager";
  img.onerror = () => {
    container.innerHTML = `<p class="cover-error">Could not load cover image. <a href="${cover.content}" target="_blank" rel="noopener">Open image</a></p>`;
  };
  container.appendChild(img);
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * @param {File} file
 * @returns {Promise<{ ok: true, dataUrl: string } | { ok: false, error: string }>}
 */
export function readImageFile(file) {
  if (!file.type.startsWith("image/")) {
    return Promise.resolve({ ok: false, error: "Choose an image file." });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.resolve({ ok: false, error: "Image must be under 2 MB." });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve({ ok: true, dataUrl: reader.result });
      } else {
        resolve({ ok: false, error: "Could not read image." });
      }
    };
    reader.onerror = () => resolve({ ok: false, error: "Could not read image." });
    reader.readAsDataURL(file);
  });
}