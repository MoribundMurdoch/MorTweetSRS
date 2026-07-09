import { parseDeckJson } from "./store.js";

/**
 * Read + parse a deck file without writing localStorage.
 * @param {File} file
 * @returns {Promise<{ ok: true, collection: import('./store.js').Collection, count: number } | { ok: false, error: string }>}
 */
export async function parseDeckFile(file) {
  const text = await readFileText(file);
  const result = parseDeckJson(text);
  if (!result.ok) return result;
  return { ok: true, collection: result.collection, count: result.collection.posts.length };
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileText(file) {
  if (typeof file.text === "function") {
    return file.text().catch(() => readWithFileReader(file));
  }
  return readWithFileReader(file);
}

/** @param {File} file */
function readWithFileReader(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read file as text."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsText(file);
  });
}