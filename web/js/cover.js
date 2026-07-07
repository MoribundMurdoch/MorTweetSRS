/** @typedef {'text' | 'image'} CoverType */

/**
 * @typedef {Object} Cover
 * @property {CoverType} type
 * @property {string} content
 */

/** @param {unknown} cover */
export function normalizeCover(cover) {
  if (!cover || typeof cover !== "object") return null;
  const c = /** @type {Cover} */ (cover);
  if (c.type !== "text" && c.type !== "image") return null;
  if (!c.content || typeof c.content !== "string" || !c.content.trim()) return null;
  return { type: c.type, content: c.content.trim() };
}

/** @param {import('./store.js').TweetPost} post */
export function postCover(post) {
  if (post.cover) return normalizeCover(post.cover);
  if (post.note?.trim()) return { type: "text", content: post.note.trim() };
  return null;
}

/** @param {Cover | null} cover */
export function coverLabel(cover) {
  if (!cover) return "";
  return cover.type === "image" ? "image cover" : "text cover";
}

/**
 * @param {string} type
 * @param {string} text
 * @param {string} imageUrl
 * @param {string} imageData
 * @returns {Cover | null}
 */
export function coverFromInputs(type, text, imageUrl, imageData) {
  if (type === "text") {
    const content = text.trim();
    return content ? { type: "text", content } : null;
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
    const p = document.createElement("p");
    p.className = "cover-text";
    p.textContent = cover.content;
    container.appendChild(p);
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