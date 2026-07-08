export const DECK_LIBRARY_INDEX_URL =
  "https://raw.githubusercontent.com/MoribundMurdoch/MorTweetSRS-Decks/main/index.json";

export const DECK_LIBRARY_REPO_URL = "https://github.com/MoribundMurdoch/MorTweetSRS-Decks";

/**
 * @param {string} file
 * @param {string} [indexUrl]
 */
export function deckFileUrl(file, indexUrl = DECK_LIBRARY_INDEX_URL) {
  const base = indexUrl.replace(/index\.json(?:\?.*)?$/, "");
  return `${base}${file.replace(/^\//, "")}`;
}

/**
 * @param {string} [indexUrl]
 * @returns {Promise<Array<{ id: string, name: string, description?: string, file: string, posts?: number, tags?: string[] }>>}
 */
export async function fetchDeckCatalog(indexUrl = DECK_LIBRARY_INDEX_URL) {
  const res = await fetch(indexUrl, { cache: "no-cache" });
  if (!res.ok) throw new Error("Could not reach the deck library.");
  const data = await res.json();
  if (!Array.isArray(data.decks)) throw new Error("Deck library list is invalid.");
  return data.decks.filter((deck) => deck?.id && deck?.name && deck?.file);
}

/**
 * @param {string} file
 * @param {string} [indexUrl]
 */
export async function fetchDeckText(file, indexUrl = DECK_LIBRARY_INDEX_URL) {
  const res = await fetch(deckFileUrl(file, indexUrl), { cache: "no-cache" });
  if (!res.ok) throw new Error("Could not download that deck.");
  return res.text();
}