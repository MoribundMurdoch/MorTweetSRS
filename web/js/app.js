import {
  loadCollection,
  saveCollection,
  setAfterSave,
  addPost,
  removePost,
  updatePostCover,
  syncCollectionFromBulk,
  studyQueue,
  stats,
  recordReview,
  exportJson,
  parseDeckJson,
  mergeCollections,
  postStatus,
  resetCollectionProgress,
  startNewDeck,
  clearDeck,
  renameDeck,
} from "./store.js";
import { scheduleReview, previewInterval, GRADES } from "./srs.js";
import { renderTweet } from "./twitter.js";
import { postCover, coverLabel, coverSpeechText, renderCover, readImageFile } from "./cover.js";
import { createCoverForm } from "./cover-form.js";
import {
  ttsSupported,
  autoSpeakEnabled,
  setAutoSpeakEnabled,
  stopSpeech,
  speakText,
  isSpeaking,
  primeTts,
  markTtsUserGesture,
  getTtsProvider,
  setTtsProvider,
  ttsProviderLabel,
  bootstrapTtsProvider,
} from "./tts.js";
import {
  getCoverMedia,
  playCoverMedia,
  stopCoverMedia,
  isCoverMediaPlaying,
  preferCoverAudioEnabled,
  setPreferCoverAudio,
  setYoutubeHost,
} from "./cover-audio.js";
import { parseDeckFile } from "./import-deck.js";
import {
  DECK_LIBRARY_REPO_URL,
  fetchDeckCatalog,
  fetchDeckText,
} from "./deck-library.js";
import {
  isDesktopShell,
  fetchLocalLibrary,
  pickLocalFolder,
  clearLocalFolder,
  readLocalDeck,
  writeLocalDeck,
  suggestLocalFilename,
  getLinkedFile,
  setLinkedFile,
} from "./local-library.js";

/** @type {ReturnType<typeof loadCollection>} */
let collection = loadCollection();
let queue = [];
let queueIndex = 0;
const OVERLAY_LAYOUT_MQ = "(max-width: 1024px)";
let leftOpen = true;
let rightOpen = true;
let bulkDirty = false;
let cardRevealed = false;
let editingPostId = null;
/** @type {'all' | 'due' | 'new' | 'later'} */
let cardsFilter = "all";
/** @type {ReturnType<typeof setTimeout> | null} */
let statusMessageTimer = null;
/** @type {boolean} */
let desktopShell = false;
/** @type {import('./local-library.js').LocalLibraryState | null} */
let localLibraryState = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let folderSyncTimer = null;

const addCoverForm = createCoverForm(
  {
    textField: document.getElementById("cover-text-field"),
    imageField: document.getElementById("cover-image-field"),
    textInput: document.getElementById("cover-text-input"),
    audioUrl: document.getElementById("cover-audio-url"),
    imageUrl: document.getElementById("cover-image-url"),
    imageFile: document.getElementById("cover-image-file"),
    fileName: document.getElementById("cover-file-name"),
    preview: document.getElementById("cover-preview"),
  },
  '.add-cover-tab[data-cover-form="add"]',
);

const editCoverForm = createCoverForm(
  {
    textField: document.getElementById("edit-cover-text-field"),
    imageField: document.getElementById("edit-cover-image-field"),
    textInput: document.getElementById("edit-cover-text-input"),
    audioUrl: document.getElementById("edit-cover-audio-url"),
    imageUrl: document.getElementById("edit-cover-image-url"),
    imageFile: document.getElementById("edit-cover-image-file"),
    fileName: document.getElementById("edit-cover-file-name"),
    preview: document.getElementById("edit-cover-preview"),
  },
  '.edit-cover-tab[data-cover-form="edit"]',
);

const els = {
  dueCount: document.getElementById("stat-due"),
  newCount: document.getElementById("stat-new"),
  doneCount: document.getElementById("stat-done"),
  collectionCount: document.getElementById("collection-count"),
  cardStack: document.getElementById("card-stack"),
  flipCard: document.getElementById("flip-card"),
  coverPanel: document.getElementById("cover-panel"),
  coverContent: document.getElementById("cover-content"),
  coverYoutubeHost: document.getElementById("cover-youtube-host"),
  preferCoverAudio: document.getElementById("prefer-cover-audio"),
  revealBtn: document.getElementById("reveal-btn"),
  tweetPanel: document.getElementById("tweet-panel"),
  tweetFrame: document.getElementById("tweet-frame"),
  tweetMetaInfo: document.getElementById("tweet-meta-info"),
  cardDeleteBtn: document.getElementById("card-delete-btn"),
  sessionBar: document.getElementById("session-bar"),
  sessionCount: document.getElementById("session-count"),
  sessionFill: document.getElementById("session-fill"),
  gradeBar: document.getElementById("grade-bar"),
  gradeButtons: document.getElementById("grade-buttons"),
  emptyState: document.getElementById("empty-state"),
  completionState: document.getElementById("completion-state"),
  postList: document.getElementById("post-list"),
  urlInput: document.getElementById("url-input"),
  coverTextInput: document.getElementById("cover-text-input"),
  coverImageUrl: document.getElementById("cover-image-url"),
  coverImageFile: document.getElementById("cover-image-file"),
  coverFileName: document.getElementById("cover-file-name"),
  coverPreview: document.getElementById("cover-preview"),
  editCoverSection: document.getElementById("edit-cover-section"),
  editCoverUrl: document.getElementById("edit-cover-url"),
  saveCoverBtn: document.getElementById("save-cover-btn"),
  cancelCoverBtn: document.getElementById("cancel-cover-btn"),
  addBtn: document.getElementById("add-btn"),
  bulkInput: document.getElementById("bulk-input"),
  bulkBtn: document.getElementById("bulk-btn"),
  statsPanel: document.getElementById("stats-panel"),
  reviewLog: document.getElementById("review-log"),
  leftPanel: document.getElementById("left-panel"),
  rightPanel: document.getElementById("right-panel"),
  toggleLeft: document.getElementById("toggle-left"),
  toggleRight: document.getElementById("toggle-right"),
  ttsProvider: document.getElementById("tts-provider"),
  ttsBtn: document.getElementById("tts-btn"),
  coverSpeakBtn: document.getElementById("cover-speak-btn"),
  themeBtn: document.getElementById("theme-btn"),
  exportBtn: document.getElementById("export-btn"),
  importBtn: document.getElementById("import-btn"),
  importFile: document.getElementById("import-file"),
  importMergeFile: document.getElementById("import-merge-file"),
  studyAgainBtn: document.getElementById("study-again-btn"),
  deckNameLabel: document.getElementById("deck-name-label"),
  deckLibraryList: document.getElementById("deck-library-list"),
  menuBar: document.getElementById("app-menu-bar"),
  menuBarTitle: document.getElementById("menu-bar-title"),
  statusDeckName: document.getElementById("status-deck-name"),
  statusCardCount: document.getElementById("status-card-count"),
  statusDue: document.getElementById("status-due"),
  statusSession: document.getElementById("status-session"),
  statusTheme: document.getElementById("status-theme"),
  statusMessage: document.getElementById("status-message"),
  menuCheckLeft: document.getElementById("menu-check-left"),
  menuCheckRight: document.getElementById("menu-check-right"),
};

function setStatusMessage(text, ms = 4500) {
  if (!els.statusMessage) return;
  if (statusMessageTimer) {
    clearTimeout(statusMessageTimer);
    statusMessageTimer = null;
  }
  if (!text) {
    els.statusMessage.textContent = "";
    els.statusMessage.classList.add("hidden");
    return;
  }
  els.statusMessage.textContent = text;
  els.statusMessage.classList.remove("hidden");
  statusMessageTimer = setTimeout(() => {
    els.statusMessage?.classList.add("hidden");
    statusMessageTimer = null;
  }, ms);
}

function closeMenus() {
  els.menuBar?.classList.remove("menu-armed");
  els.menuBar?.querySelectorAll(".mor-menu-item.is-open").forEach((el) => {
    el.classList.remove("is-open");
  });
}

function refreshChrome() {
  const s = stats(collection);
  const name = collection.name?.trim() || "Your deck";
  const dueTotal = s.due + s.new;

  if (els.menuBarTitle) els.menuBarTitle.textContent = name;
  if (els.statusDeckName) els.statusDeckName.textContent = name;
  if (els.statusCardCount) {
    els.statusCardCount.textContent = `${s.total} card${s.total === 1 ? "" : "s"}`;
  }
  if (els.statusDue) {
    els.statusDue.textContent = `${dueTotal} due`;
  }
  if (els.statusSession) {
    if (!queue.length) {
      els.statusSession.textContent = s.total ? "caught up" : "empty";
    } else {
      els.statusSession.textContent = `${queueIndex + 1} / ${queue.length}`;
    }
  }
  if (els.statusTheme) {
    const light = document.documentElement.dataset.theme === "light";
    els.statusTheme.textContent = light ? "light" : "dark";
  }
  if (els.menuCheckLeft) els.menuCheckLeft.textContent = leftOpen ? "✓" : "";
  if (els.menuCheckRight) els.menuCheckRight.textContent = rightOpen ? "✓" : "";
}

function currentPost() {
  return queue[queueIndex] ?? null;
}

function gradeMeta(grade) {
  return GRADES.find((g) => g.grade === grade) ?? { label: String(grade), className: "" };
}

function refreshStats() {
  const s = stats(collection);
  els.dueCount.textContent = String(s.due + s.new);
  els.newCount.textContent = String(s.new);
  els.doneCount.textContent = String(s.reviewedToday);
  if (els.collectionCount) els.collectionCount.textContent = String(s.total);
  if (els.deckNameLabel) {
    els.deckNameLabel.textContent = collection.name?.trim() || "Your deck";
    els.deckNameLabel.title = collection.name?.trim() || "Your deck";
  }
  refreshChrome();

  document.getElementById("deck-panel-body")?.classList.toggle("deck-loaded", s.total > 0);

  els.statsPanel.innerHTML = `
    <div class="stat-card wide"><div class="stat-label">Total cards</div><div class="stat-value">${s.total}</div></div>
    <div class="stat-card accent"><div class="stat-label">Due</div><div class="stat-value">${s.due}</div></div>
    <div class="stat-card new"><div class="stat-label">New</div><div class="stat-value">${s.new}</div></div>
    <div class="stat-card"><div class="stat-label">Later</div><div class="stat-value">${s.later}</div></div>
    <div class="stat-card good"><div class="stat-label">Today</div><div class="stat-value">${s.reviewedToday}</div></div>
  `;

  const recent = collection.reviews.slice(-8).reverse();
  els.reviewLog.innerHTML = recent.length
    ? `<ul class="review-log">${recent
        .map((r) => {
          const post = collection.posts.find((p) => p.id === r.postId);
          const g = gradeMeta(r.grade);
          const short = post?.url.replace(/^https:\/\/x\.com\/i\/status\//, "…/") ?? r.postId;
          return `<li><span class="grade-tag ${g.className}">${g.label}</span><span class="review-url" title="${post?.url ?? ""}">${short}</span></li>`;
        })
        .join("")}</ul>`
    : '<p class="review-empty">No reviews yet.</p>';
}

function updateSessionBar() {
  const total = queue.length;
  const current = total ? queueIndex + 1 : 0;
  const pct = total ? Math.round((current / total) * 100) : 0;

  if (els.sessionCount) els.sessionCount.textContent = `${current} / ${total}`;
  if (els.sessionFill) els.sessionFill.style.width = `${pct}%`;
}

function syncBulkTextarea() {
  if (bulkDirty) return;
  els.bulkInput.value = collection.posts.map((p) => p.url).join("\n");
}

function deckFilename() {
  const slug =
    collection.name
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "deck";
  return `${slug}.json`;
}

function confirmReplaceDeck(deckName, incomingCount) {
  const current = collection.posts.length;
  if (current === 0) return true;
  const incomingLabel =
    typeof incomingCount === "number"
      ? `${incomingCount} card${incomingCount === 1 ? "" : "s"}`
      : "this deck";
  return confirm(
    `Replace your current deck with "${deckName}" (${incomingLabel})?\n\n` +
      `Your current deck (${current} card${current === 1 ? "" : "s"}) will be wiped from this device. ` +
      "Use Download first if you want a backup.\n\n" +
      "Tip: File → Load deck (merge) adds cards without wiping.",
  );
}

function confirmMergeDeck(deckName, incomingCount) {
  const current = collection.posts.length;
  const incomingLabel =
    typeof incomingCount === "number"
      ? `${incomingCount} card${incomingCount === 1 ? "" : "s"}`
      : "cards";
  if (current === 0) {
    return confirm(
      `Load "${deckName}" (${incomingLabel}) into your empty deck?\n\n` +
        "Cards and study progress from the file will be kept.",
    );
  }
  return confirm(
    `Merge "${deckName}" (${incomingLabel}) into your current deck?\n\n` +
      `Adds only cards you don't already have. Your existing ${current} card${current === 1 ? "" : "s"} and study progress stay put.`,
  );
}

/**
 * @param {import('./store.js').Collection} nextCollection
 * @param {string} deckName
 * @param {{ linkedFile?: string | null }} [opts]
 */
function applyLoadedDeck(nextCollection, deckName, opts = {}) {
  collection = nextCollection;
  if ("linkedFile" in opts) {
    setLinkedFile(opts.linkedFile ?? null);
  } else {
    setLinkedFile(null);
  }
  saveCollection(collection);
  bulkDirty = false;
  editingPostId = null;
  closeEditCover();
  if (isOverlayLayout()) setPanel("left", false);
  startSession();
  refreshLocalLibraryChrome();
  const n = collection.posts.length;
  const link = getLinkedFile();
  setStatusMessage(
    n
      ? `Loaded "${deckName}" — ${n} card${n === 1 ? "" : "s"} ready${link ? ` · ${link}` : ""}.`
      : `Loaded empty deck "${deckName}"${link ? ` · ${link}` : ""}.`,
  );
}

function applyMergedDeck(incoming, deckName) {
  const before = collection.posts.length;
  const { added, skipped } = mergeCollections(collection, incoming);
  bulkDirty = false;
  editingPostId = null;
  closeEditCover();
  startSession();
  if (added === 0 && skipped > 0) {
    setStatusMessage(`Merge "${deckName}" — already had all ${skipped} card${skipped === 1 ? "" : "s"}.`);
  } else if (added === 0) {
    setStatusMessage(`Merge "${deckName}" — no cards to add.`);
  } else {
    const parts = [`Merged "${deckName}" — added ${added}`];
    if (skipped) parts.push(`skipped ${skipped} already in deck`);
    parts.push(`now ${before + added} total`);
    setStatusMessage(parts.join(", ") + ".");
  }
}

function scheduleFolderSync() {
  if (!desktopShell || !getLinkedFile() || !localLibraryState?.folder) return;
  if (folderSyncTimer) clearTimeout(folderSyncTimer);
  folderSyncTimer = setTimeout(() => {
    folderSyncTimer = null;
    void syncLinkedDeckToFolder({ quiet: true });
  }, 400);
}

/**
 * @param {{ quiet?: boolean, file?: string }} [opts]
 */
async function syncLinkedDeckToFolder(opts = {}) {
  if (!desktopShell || !localLibraryState?.folder) return false;
  const file = opts.file || getLinkedFile();
  if (!file) return false;
  try {
    await writeLocalDeck(file, exportJson(collection));
    setLinkedFile(file);
    if (!opts.quiet) setStatusMessage(`Saved to folder · ${file}`);
    await refreshLocalLibrary({ quiet: true });
    return true;
  } catch (e) {
    if (!opts.quiet) {
      alert(e instanceof Error ? e.message : "Could not save to folder.");
    }
    return false;
  }
}

function refreshLocalLibraryChrome() {
  const section = document.getElementById("local-library-section");
  section?.classList.toggle("hidden", !desktopShell);

  document.querySelectorAll("[data-desktop-only]").forEach((el) => {
    el.classList.toggle("hidden", !desktopShell);
  });

  const pathEl = document.getElementById("local-library-path");
  const linkedEl = document.getElementById("local-library-linked");
  if (pathEl) {
    pathEl.textContent = localLibraryState?.folder
      ? localLibraryState.folder
      : "No folder set";
    pathEl.title = localLibraryState?.folder || "Choose a folder to store deck JSON files";
  }
  if (linkedEl) {
    const linked = getLinkedFile();
    linkedEl.textContent = linked ? `Linked · ${linked}` : "Not linked to a file";
    linkedEl.classList.toggle("is-linked", Boolean(linked));
  }

  if (els.statusTheme) {
    /* keep existing theme text; linked file goes on status if needed */
  }
  const statusLink = document.getElementById("status-linked-file");
  if (statusLink) {
    const linked = getLinkedFile();
    statusLink.textContent = linked ? linked : "";
    statusLink.classList.toggle("hidden", !linked);
    statusLink.title = linked ? `Linked deck file in folder` : "";
  }
}

/**
 * @param {{ quiet?: boolean }} [opts]
 */
async function refreshLocalLibrary(opts = {}) {
  if (!desktopShell) return;
  try {
    localLibraryState = await fetchLocalLibrary();
    renderLocalLibrary();
    refreshLocalLibraryChrome();
    if (localLibraryState.error && !opts.quiet) {
      setStatusMessage(localLibraryState.error);
    }
  } catch {
    localLibraryState = { folder: null, decks: [], error: "Local library unavailable." };
    renderLocalLibrary();
    refreshLocalLibraryChrome();
  }
}

function renderLocalLibrary() {
  const list = document.getElementById("local-library-list");
  if (!list) return;

  if (!localLibraryState?.folder) {
    list.innerHTML = `<p class="deck-library-status">Choose a folder to keep your study decks as JSON files on disk.</p>`;
    return;
  }

  if (localLibraryState.error) {
    list.innerHTML = `<p class="deck-library-status deck-library-error">${escapeHtml(localLibraryState.error)}</p>`;
    return;
  }

  const decks = localLibraryState.decks || [];
  if (!decks.length) {
    list.innerHTML = `<p class="deck-library-status">Folder is empty. Save your current deck here to create the first file.</p>`;
    return;
  }

  const linked = getLinkedFile();
  list.innerHTML = `<ul class="deck-library-items local-deck-items">${decks
    .map((deck) => {
      const isLinked = linked === deck.file;
      const countLabel = `${deck.posts} card${deck.posts === 1 ? "" : "s"}`;
      return `
        <li class="deck-library-item ${isLinked ? "is-linked-deck" : ""}">
          <div class="deck-library-info">
            <div class="deck-library-name">${escapeHtml(deck.name)}${isLinked ? ' <span class="linked-pill">linked</span>' : ""}</div>
            <div class="deck-library-meta">${escapeHtml(countLabel)} · ${escapeHtml(deck.file)}</div>
          </div>
          <div class="deck-library-btns">
            <button type="button" class="mor-btn primary local-load-btn" data-mode="replace" data-file="${escapeHtml(deck.file)}" data-name="${escapeHtml(deck.name)}" data-posts="${deck.posts}" title="Replace your current deck with this file">Open</button>
            <button type="button" class="mor-btn local-load-btn" data-mode="merge" data-file="${escapeHtml(deck.file)}" data-name="${escapeHtml(deck.name)}" data-posts="${deck.posts}" title="Merge cards into your current deck">Merge</button>
          </div>
        </li>
      `;
    })
    .join("")}</ul>`;

  list.querySelectorAll(".local-load-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      void loadDeckFromLocalFile({
        file: btn.dataset.file,
        name: btn.dataset.name,
        posts: Number(btn.dataset.posts) || 0,
        mode: btn.dataset.mode === "merge" ? "merge" : "replace",
        button: btn,
      });
    });
  });
}

/**
 * @param {{ file?: string, name?: string, posts?: number, mode: 'replace'|'merge', button: HTMLButtonElement }} opts
 */
async function loadDeckFromLocalFile(opts) {
  const file = opts.file;
  if (!file) return;
  const deckName = opts.name || file.replace(/\.json$/i, "");
  if (opts.mode === "replace" && !confirmReplaceDeck(deckName, opts.posts)) return;
  if (opts.mode === "merge" && !confirmMergeDeck(deckName, opts.posts)) return;

  const original = opts.button.textContent;
  opts.button.disabled = true;
  opts.button.textContent = "Loading…";
  try {
    const json = await readLocalDeck(file);
    const result = parseDeckJson(json);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    const loadedName = result.collection.name?.trim() || deckName;
    if (opts.mode === "merge") {
      applyMergedDeck(result.collection, loadedName);
    } else {
      applyLoadedDeck(result.collection, loadedName, { linkedFile: file });
    }
  } catch (e) {
    alert(e instanceof Error ? e.message : "Could not open that deck.");
  } finally {
    opts.button.disabled = false;
    opts.button.textContent = original;
  }
}

async function handlePickLocalFolder() {
  if (!desktopShell) return;
  try {
    setStatusMessage("Choose a deck folder…");
    localLibraryState = await pickLocalFolder();
    renderLocalLibrary();
    refreshLocalLibraryChrome();
    if (localLibraryState.folder) {
      setStatusMessage(`Deck folder · ${localLibraryState.folder}`);
      setPanel("left", true);
      document.getElementById("local-library-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setStatusMessage("No folder selected.");
    }
  } catch (e) {
    alert(e instanceof Error ? e.message : "Could not open folder picker.");
  }
}

async function handleClearLocalFolder() {
  if (!desktopShell) return;
  if (!localLibraryState?.folder) {
    setStatusMessage("No deck folder set.");
    return;
  }
  if (!confirm("Stop using this deck folder?\n\nFiles on disk are kept. Only the remembered path is cleared.")) {
    return;
  }
  try {
    localLibraryState = await clearLocalFolder();
    setLinkedFile(null);
    renderLocalLibrary();
    refreshLocalLibraryChrome();
    setStatusMessage("Deck folder cleared.");
  } catch (e) {
    alert(e instanceof Error ? e.message : "Could not clear folder.");
  }
}

async function handleSaveToFolder() {
  if (!desktopShell) {
    downloadDeck();
    return;
  }
  if (!localLibraryState?.folder) {
    const pick = confirm("No deck folder set yet.\n\nChoose a folder to save your decks as JSON files?");
    if (!pick) return;
    await handlePickLocalFolder();
    if (!localLibraryState?.folder) return;
  }

  let file = getLinkedFile();
  if (!file) {
    const suggested = await suggestLocalFilename(collection.name || "deck");
    const entered = prompt("File name in deck folder:", suggested);
    if (entered === null) return;
    file = entered.trim();
    if (!file.toLowerCase().endsWith(".json")) file = `${file}.json`;
  }

  const ok = await syncLinkedDeckToFolder({ file, quiet: false });
  if (ok) refreshLocalLibraryChrome();
}

function openLocalLibrary() {
  setPanel("left", true);
  document.getElementById("local-library-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openDeckLibrary() {
  setPanel("left", true);
  document.getElementById("deck-library-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openNewDeckSection() {
  setPanel("left", true);
  const nameInput = document.getElementById("new-deck-name");
  if (nameInput && !nameInput.value.trim() && collection.name) {
    nameInput.value = collection.name === "My Tweets" ? "" : collection.name;
  }
  document.getElementById("new-deck-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  nameInput?.focus();
}

function handleStartNewDeck(opts = {}) {
  const nameInput = document.getElementById("new-deck-name");
  let name = nameInput?.value?.trim() || "My deck";
  if (opts.promptName) {
    const entered = prompt("Name for the new deck:", name === "My Tweets" ? "My deck" : name);
    if (entered === null) return;
    name = entered.trim() || "My deck";
  }
  const count = collection.posts.length;

  if (count > 0) {
    if (
      !confirm(
        `Start a new deck called "${name}"?\n\n` +
          `Your current deck (${count} card${count === 1 ? "" : "s"}) will be cleared from this device. ` +
          "Download it first if you want to keep a copy.",
      )
    ) {
      return;
    }
  }

  startNewDeck(collection, name);
  setLinkedFile(null);
  if (nameInput) nameInput.value = name;
  bulkDirty = false;
  els.bulkInput.value = "";
  editingPostId = null;
  closeEditCover();
  startSession();
  setPanel("left", true);
  els.urlInput?.focus();
  refreshLocalLibraryChrome();
  setStatusMessage(`Started new deck "${name}".`);
}

function handleClearDeck() {
  const count = collection.posts.length;
  if (!count) {
    setStatusMessage("Deck is already empty.");
    return;
  }
  if (
    !confirm(
      `Clear all ${count} card${count === 1 ? "" : "s"} from "${collection.name?.trim() || "Your deck"}"?\n\n` +
        "This removes cards and review history from this device. Download first if you want a copy.",
    )
  ) {
    return;
  }
  clearDeck(collection);
  bulkDirty = false;
  els.bulkInput.value = "";
  editingPostId = null;
  closeEditCover();
  startSession();
  setStatusMessage("Deck cleared.");
  // Keep linked file so empty deck can still save to the same path.
}

function handleRenameDeck() {
  const current = collection.name?.trim() || "My deck";
  const entered = prompt("Deck name:", current);
  if (entered === null) return;
  renameDeck(collection, entered);
  refreshStats();
  setStatusMessage(`Renamed deck to "${collection.name}".`);
}

function handleResetProgress() {
  const count = collection.posts.length;
  if (!count) {
    setStatusMessage("No cards to reset.");
    return;
  }
  if (
    !confirm(
      `Reset study progress for all ${count} card${count === 1 ? "" : "s"}?\n\n` +
        "Schedules and review history will be cleared. Your cards and recall covers are kept.",
    )
  ) {
    return;
  }
  resetCollectionProgress(collection);
  startSession();
  setStatusMessage("Study progress reset.");
}

function toggleTheme() {
  const isLight = document.documentElement.dataset.theme === "light";
  document.documentElement.dataset.theme = isLight ? "dark" : "light";
  localStorage.setItem("mor_tweet_srs_theme", isLight ? "dark" : "light");
  refreshChrome();
  if (cardRevealed && currentPost()) {
    renderTweet(els.tweetFrame, currentPost().url);
  }
}

function showShortcutsHelp() {
  alert(
    "Keyboard shortcuts\n\n" +
      "Study\n" +
      "  Space / Enter — reveal post\n" +
      "  1–4 — grade card\n" +
      "  R — refresh due cards\n\n" +
      "Deck\n" +
      "  Ctrl+N — new deck\n" +
      "  Ctrl+O — open deck file (replace)\n" +
      "  Ctrl+Shift+O — merge deck file\n" +
      "  Ctrl+S — download .json backup\n" +
      (desktopShell ? "  Ctrl+Shift+S — save to deck folder\n" : "") +
      "\nYour deck auto-saves in this app.\n" +
      "Menu bar: File · Deck · View · Help",
  );
}

function showAbout() {
  alert(
    "MorTweet SRS\n\n" +
      "Spaced repetition for saved X posts.\n\n" +
      "Saving: auto-saves in this app.\n" +
      (desktopShell
        ? "Desktop: File → Choose deck folder… stores JSON decks on disk.\nLinked decks dual-write to that folder.\n"
        : "Backup: File → Download backup (.json).\n") +
      "Open / Merge: load deck files without losing work (merge keeps yours).\n\n" +
      "Online library: github.com/MoribundMurdoch/MorTweetSRS-Decks",
  );
}

function focusAddCard() {
  setPanel("left", true);
  document.getElementById("add-card-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  els.urlInput?.focus();
}

/**
 * @param {string} action
 */
function runMenuAction(action) {
  closeMenus();
  switch (action) {
    case "new-deck":
      handleStartNewDeck({ promptName: true });
      break;
    case "clear-deck":
      handleClearDeck();
      break;
    case "load-replace":
      els.importFile?.click();
      break;
    case "load-merge":
      els.importMergeFile?.click();
      break;
    case "open-library":
      openDeckLibrary();
      break;
    case "open-local-library":
      openLocalLibrary();
      break;
    case "pick-deck-folder":
      void handlePickLocalFolder();
      break;
    case "clear-deck-folder":
      void handleClearLocalFolder();
      break;
    case "save-to-folder":
      void handleSaveToFolder();
      break;
    case "download":
      downloadDeck();
      break;
    case "rename-deck":
      handleRenameDeck();
      break;
    case "reset-progress":
      handleResetProgress();
      break;
    case "study-again":
      startSession();
      setStatusMessage("Due cards refreshed.");
      break;
    case "focus-add":
      focusAddCard();
      break;
    case "toggle-left":
      setPanel("left", !leftOpen);
      refreshChrome();
      break;
    case "toggle-right":
      setPanel("right", !rightOpen);
      refreshChrome();
      break;
    case "toggle-theme":
      toggleTheme();
      break;
    case "shortcuts":
      showShortcutsHelp();
      break;
    case "github-library":
      window.open(DECK_LIBRARY_REPO_URL, "_blank", "noopener,noreferrer");
      break;
    case "about":
      showAbout();
      break;
    default:
      break;
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDeckLibrary(decks) {
  if (!els.deckLibraryList) return;

  if (!decks.length) {
    els.deckLibraryList.innerHTML =
      `<p class="deck-library-status">No decks in the library yet. <a href="${DECK_LIBRARY_REPO_URL}" target="_blank" rel="noopener noreferrer">Browse on GitHub</a>.</p>`;
    return;
  }

  els.deckLibraryList.innerHTML = `<ul class="deck-library-items">${decks
    .map((deck) => {
      const countLabel = deck.posts ? `${deck.posts} card${deck.posts === 1 ? "" : "s"}` : "Deck";
      const tags = Array.isArray(deck.tags) && deck.tags.length ? deck.tags.join(", ") : "";
      const meta = tags ? `${countLabel} · ${tags}` : countLabel;
      return `
        <li class="deck-library-item">
          <div class="deck-library-info">
            <div class="deck-library-name">${escapeHtml(deck.name)}</div>
            <div class="deck-library-meta">${escapeHtml(meta)}</div>
            ${deck.description ? `<p class="deck-library-desc">${escapeHtml(deck.description)}</p>` : ""}
          </div>
          <div class="deck-library-btns">
            <button
              type="button"
              class="mor-btn primary deck-load-btn"
              data-mode="replace"
              data-deck-id="${escapeHtml(deck.id)}"
              data-deck-file="${escapeHtml(deck.file)}"
              data-deck-name="${escapeHtml(deck.name)}"
              data-deck-posts="${deck.posts ?? ""}"
              title="Wipe your current deck and load this one"
            >Load</button>
            <button
              type="button"
              class="mor-btn deck-merge-btn"
              data-mode="merge"
              data-deck-id="${escapeHtml(deck.id)}"
              data-deck-file="${escapeHtml(deck.file)}"
              data-deck-name="${escapeHtml(deck.name)}"
              data-deck-posts="${deck.posts ?? ""}"
              title="Add these cards to your current deck (keep yours)"
            >Merge</button>
          </div>
        </li>
      `;
    })
    .join("")}</ul>`;

  els.deckLibraryList.querySelectorAll(".deck-load-btn, .deck-merge-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      void loadDeckFromLibrary(
        {
          id: btn.dataset.deckId,
          name: btn.dataset.deckName,
          file: btn.dataset.deckFile,
          posts: Number(btn.dataset.deckPosts) || undefined,
        },
        btn,
        btn.dataset.mode === "merge" ? "merge" : "replace",
      );
    });
  });
}

function renderDeckLibraryError(message) {
  if (!els.deckLibraryList) return;
  els.deckLibraryList.innerHTML = `
    <p class="deck-library-status deck-library-error">${message}</p>
    <div class="mor-btn-row">
      <button type="button" class="mor-btn" id="deck-library-retry">Try again</button>
      <a class="mor-btn ghost" href="${DECK_LIBRARY_REPO_URL}" target="_blank" rel="noopener noreferrer">Open on GitHub</a>
    </div>
  `;
  document.getElementById("deck-library-retry")?.addEventListener("click", () => {
    void initDeckLibrary();
  });
}

/**
 * @param {{ id?: string, name?: string, file: string, posts?: number }} deck
 * @param {HTMLButtonElement} button
 * @param {'replace' | 'merge'} [mode]
 */
async function loadDeckFromLibrary(deck, button, mode = "replace") {
  const deckName = deck.name || "Deck";
  const knownCount = typeof deck.posts === "number" ? deck.posts : undefined;
  // Confirm once: before download when catalog has a size, otherwise after parse.
  if (knownCount !== undefined) {
    if (mode === "replace" && !confirmReplaceDeck(deckName, knownCount)) return;
    if (mode === "merge" && !confirmMergeDeck(deckName, knownCount)) return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Loading…";

  try {
    const json = await fetchDeckText(deck.file);
    const result = parseDeckJson(json);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    const loadedName = result.collection.name?.trim() || deckName;
    if (knownCount === undefined) {
      if (mode === "replace" && !confirmReplaceDeck(loadedName, result.collection.posts.length)) return;
      if (mode === "merge" && !confirmMergeDeck(loadedName, result.collection.posts.length)) return;
    }
    if (mode === "merge") {
      applyMergedDeck(result.collection, loadedName);
    } else {
      applyLoadedDeck(result.collection, loadedName, { linkedFile: null });
    }
  } catch {
    alert("Could not load that deck. Check your connection and try again.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function downloadDeck() {
  // Ensure latest in-memory deck is persisted before export.
  saveCollection(collection);
  // Desktop: if linked to a folder file, keep disk copy fresh too.
  void syncLinkedDeckToFolder({ quiet: true });
  const name = deckFilename();
  const blob = new Blob([exportJson(collection)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  const n = collection.posts.length;
  setStatusMessage(
    n
      ? `Downloaded ${name} (${n} card${n === 1 ? "" : "s"}) · also auto-saves here.`
      : `Downloaded ${name} (empty deck) · also auto-saves here.`,
  );
}

async function initDeckLibrary() {
  if (!els.deckLibraryList) return;
  els.deckLibraryList.innerHTML = `<p class="deck-library-status">Loading decks…</p>`;

  try {
    const decks = await fetchDeckCatalog();
    renderDeckLibrary(decks);
  } catch {
    renderDeckLibraryError("Could not load the deck library.");
  }
}

function deletePost(postId) {
  removePost(collection, postId);
  bulkDirty = false;
  queue = studyQueue(collection);
  if (queueIndex >= queue.length) queueIndex = 0;
  syncBulkTextarea();
  showCurrentCard();
}

function openEditCover(postId) {
  const post = collection.posts.find((p) => p.id === postId);
  if (!post) return;

  editingPostId = postId;
  els.editCoverSection?.classList.remove("hidden");
  if (els.editCoverUrl) els.editCoverUrl.textContent = post.url;
  editCoverForm.load(postCover(post));
  renderPostList();
  els.editCoverSection?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeEditCover() {
  editingPostId = null;
  els.editCoverSection?.classList.add("hidden");
  editCoverForm.reset();
  renderPostList();
}

function saveEditCover() {
  if (!editingPostId) return;
  const result = updatePostCover(collection, editingPostId, editCoverForm.getCover());
  if (!result.ok) {
    alert(result.error);
    return;
  }
  const editedId = editingPostId;
  closeEditCover();
  renderPostList();
  if (currentPost()?.id === editedId) {
    showCurrentCard();
  }
}

/** @param {string} text @param {number} max */
function truncateText(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** @param {import('./store.js').TweetPost} post */
function postStatusId(post) {
  const m = post.url.match(/status\/(\d+)/);
  return m ? m[1] : post.id;
}

/**
 * Primary label for a deck card: cover prompt when present, else short post id.
 * @param {import('./store.js').TweetPost} post
 */
function postListTitle(post) {
  const cover = postCover(post);
  if (cover?.type === "text" && cover.content.trim()) {
    return truncateText(cover.content, 72);
  }
  if (cover?.type === "image") return "Image cover";
  return `Post · ${postStatusId(post)}`;
}

/** @param {import('./store.js').TweetPost} post @param {'new'|'due'|'ok'} status */
function postDueMeta(post, status) {
  if (status === "new") return "Not studied yet";
  if (status === "due") return "Due now";
  try {
    return `Due ${new Date(post.srs.due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  } catch {
    return "Scheduled";
  }
}

/** @param {'new'|'due'|'ok'} status */
function statusBadge(status) {
  if (status === "new") return { className: "new", label: "New" };
  if (status === "due") return { className: "due", label: "Due" };
  return { className: "ok", label: "Later" };
}

/**
 * Study a card from the list — even if it's not in today's due queue.
 * @param {string} postId
 */
function focusCard(postId) {
  const post = collection.posts.find((p) => p.id === postId);
  if (!post) return;

  let idx = queue.findIndex((p) => p.id === postId);
  if (idx < 0) {
    // Pull later/scheduled cards into the session so the list is always clickable.
    queue = [post, ...queue.filter((p) => p.id !== postId)];
    idx = 0;
  }
  queueIndex = idx;
  showCurrentCard();
  if (isOverlayLayout()) setPanel("left", false);
}

function renderPostList() {
  if (!els.postList) return;

  const active = currentPost();
  const countEl = document.getElementById("cards-in-deck-count");
  const emptyEl = document.getElementById("cards-empty");
  const total = collection.posts.length;

  if (countEl) countEl.textContent = String(total);

  const filtered = collection.posts.filter((post) => {
    if (cardsFilter === "all") return true;
    const status = postStatus(post);
    if (cardsFilter === "due") return status === "due";
    if (cardsFilter === "new") return status === "new";
    if (cardsFilter === "later") return status === "ok";
    return true;
  });

  // Keep relative order: due/new first when viewing All feels more useful? Keep collection order (add order) for predictability.
  const sorted = [...filtered].sort((a, b) => {
    const rank = (p) => {
      const s = postStatus(p);
      if (s === "due") return 0;
      if (s === "new") return 1;
      return 2;
    };
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
  });

  document.querySelectorAll("#cards-filter .cards-filter-btn").forEach((btn) => {
    const on = btn.dataset.filter === cardsFilter;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  if (!total) {
    els.postList.innerHTML = "";
    emptyEl?.classList.remove("hidden");
    if (emptyEl) emptyEl.textContent = "No cards yet. Add a post URL above or open a deck file.";
    syncBulkTextarea();
    return;
  }

  if (!sorted.length) {
    els.postList.innerHTML = "";
    emptyEl?.classList.remove("hidden");
    if (emptyEl) {
      emptyEl.textContent =
        cardsFilter === "due"
          ? "Nothing due right now."
          : cardsFilter === "new"
            ? "No new cards."
            : cardsFilter === "later"
              ? "No scheduled cards yet."
              : "No cards match this filter.";
    }
    syncBulkTextarea();
    return;
  }

  emptyEl?.classList.add("hidden");

  els.postList.innerHTML = sorted
    .map((post) => {
      const status = postStatus(post);
      const cover = postCover(post);
      const badge = statusBadge(status);
      const isEditing = editingPostId === post.id;
      const isActive = active?.id === post.id;
      const title = postListTitle(post);
      const meta = postDueMeta(post, status);
      const statusId = postStatusId(post);
      const coverTag = cover
        ? `<span class="post-cover-tag">${escapeHtml(coverLabel(cover))}</span>`
        : `<span class="post-cover-tag muted">no cover</span>`;

      let media = "";
      if (cover?.type === "image" && cover.content) {
        media = `<div class="post-thumb" aria-hidden="true"><img src="${escapeHtml(cover.content)}" alt="" loading="lazy" /></div>`;
      } else if (cover?.type === "text") {
        media = `<div class="post-thumb text-thumb" aria-hidden="true">Aa</div>`;
      } else {
        media = `<div class="post-thumb bare-thumb" aria-hidden="true">◎</div>`;
      }

      return `
        <li
          class="post-item status-${badge.className} ${isActive ? "active" : ""} ${isEditing ? "editing" : ""}"
          data-id="${escapeHtml(post.id)}"
          title="Study this card"
        >
          ${media}
          <div class="info">
            <div class="post-title">${escapeHtml(title)}</div>
            <div class="post-meta">
              <span class="post-badge ${badge.className}">${badge.label}</span>
              <span class="post-due">${escapeHtml(meta)}</span>
              ${coverTag}
              <span class="post-id" title="${escapeHtml(post.url)}">#${escapeHtml(statusId)}</span>
            </div>
          </div>
          <div class="post-actions">
            <button class="post-edit-btn" type="button" title="Edit cover" aria-label="Edit cover" data-edit="${escapeHtml(post.id)}">✎</button>
            <button class="post-remove-btn" type="button" title="Remove card" aria-label="Remove card" data-remove="${escapeHtml(post.id)}">×</button>
          </div>
        </li>
      `;
    })
    .join("");

  els.postList.querySelectorAll(".post-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".post-remove-btn") || e.target.closest(".post-edit-btn")) return;
      const id = item.dataset.id;
      if (id) focusCard(id);
    });
  });

  els.postList.querySelectorAll(".post-edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditCover(btn.dataset.edit);
    });
  });

  els.postList.querySelectorAll(".post-remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.remove;
      if (!id) return;
      if (!confirm("Remove this card from your deck?")) return;
      if (editingPostId === id) closeEditCover();
      deletePost(id);
    });
  });

  syncBulkTextarea();
}

function renderGradeButtons() {
  const post = currentPost();
  const cover = post ? postCover(post) : null;
  const needsReveal = cover && !cardRevealed;
  const disabled = !post || needsReveal;

  els.gradeBar.classList.toggle("hidden", !post);
  if (els.gradeBar.querySelector(".grade-prompt")) {
    els.gradeBar.querySelector(".grade-prompt").textContent = needsReveal
      ? "Reveal the post before you rate it"
      : "How well did you remember it?";
  }

  els.gradeButtons.innerHTML = GRADES.map((g) => {
    const interval = post && !needsReveal ? previewInterval(post.srs, g.grade) : "—";
    return `
      <button class="grade-btn ${g.className}" data-grade="${g.grade}" ${disabled ? "disabled" : ""}>
        <span class="label">${g.label}</span>
        <span class="interval">${interval}</span>
        <span class="key">${g.key}</span>
      </button>
    `;
  }).join("");

  els.gradeButtons.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const grade = Number(btn.dataset.grade);
      submitGrade(grade);
    });
  });
}

function isCoverPlaybackActive() {
  return isSpeaking() || isCoverMediaPlaying();
}

function stopCoverPlayback() {
  stopSpeech();
  stopCoverMedia();
}

function syncTtsControls(cover) {
  const supported = ttsSupported();
  if (els.ttsProvider) {
    els.ttsProvider.value = getTtsProvider();
  }
  if (els.preferCoverAudio) {
    els.preferCoverAudio.checked = preferCoverAudioEnabled();
  }
  if (els.ttsBtn) {
    els.ttsBtn.classList.toggle("active", supported && autoSpeakEnabled());
    void ttsProviderLabel().then((label) => {
      if (!els.ttsBtn) return;
      els.ttsBtn.title = supported
        ? autoSpeakEnabled()
          ? `Auto-play covers (on) · ${label}`
          : `Auto-play covers (off) · ${label}`
        : "Text-to-speech unavailable in this browser";
    });
  }

  const textCover = cover?.type === "text";
  const media = textCover && preferCoverAudioEnabled() ? getCoverMedia(cover) : null;
  const canPlay = textCover && (media || (supported && Boolean(coverSpeechText(cover))));

  els.coverSpeakBtn?.classList.toggle("hidden", !textCover);
  els.coverSpeakBtn?.classList.toggle("is-speaking", isCoverPlaybackActive());
  if (els.coverSpeakBtn) {
    const playing = isCoverPlaybackActive();
    const label = els.coverSpeakBtn.querySelector(".cover-speak-label");
    if (label) {
      if (playing) label.textContent = "Stop";
      else if (media?.type === "youtube") label.textContent = "Play YouTube";
      else if (media?.type === "audio") label.textContent = "Play audio";
      else label.textContent = "Read aloud";
    }
    els.coverSpeakBtn.disabled = !canPlay;
    els.coverSpeakBtn.title = !canPlay
      ? "Add a text cover to play audio"
      : playing
        ? "Stop playback"
        : media
          ? "Play the linked audio from this cover"
          : "Read cover text aloud";
  }
}

function ttsUnavailableAlert() {
  alert(
    "Text-to-speech is not available here.\n\n" +
      "Use the web app over http://localhost and pick Voice → Auto or Online.\n" +
      "For offline speech on Arch, install speech-dispatcher + espeak-ng.",
  );
}

function ttsErrorAlert(reason) {
  const provider = getTtsProvider();
  if (provider === "online") {
    alert(
      `Online speech failed (${reason}).\n\n` +
        "Check your internet connection, or switch Voice → Local for offline espeak.",
    );
    return;
  }
  if (provider === "auto") {
    alert(
      `Speech failed (${reason}).\n\n` +
        "Auto mode tries Piper/local first, then online. Check internet, or pick Voice → Online.\n" +
        "For Piper on Arch: systemctl --user enable --now speech-dispatcher.socket && spd-say hello",
    );
    return;
  }
  alert(
    `Local speech failed (${reason}).\n\n` +
      "For Piper on Arch, run the app with:\n" +
      "  python serve.py\n" +
      "not plain http.server — that enables spd-say TTS.\n\n" +
      "Also check:\n" +
      "  systemctl --user enable --now speech-dispatcher.socket\n" +
      "  spd-say hello",
  );
}

function playCover(cover, opts = {}) {
  if (cover?.type !== "text") return;

  const userInitiated = opts.userInitiated ?? false;

  const media = preferCoverAudioEnabled() ? getCoverMedia(cover) : null;
  if (media) {
    void playCoverMedia(media, {
      onEnd: () => syncTtsControls(postCover(currentPost())),
      onError: (reason) => {
        if (userInitiated) {
          alert(
            media.type === "youtube"
              ? `Could not play YouTube audio (${reason}). Check the link or your connection.`
              : `Could not play audio link (${reason}). Check the URL is a direct .mp3/.wav file.`,
          );
        }
        syncTtsControls(cover);
      },
    });
    syncTtsControls(cover);
    return;
  }

  if (!ttsSupported()) {
    if (userInitiated) ttsUnavailableAlert();
    return;
  }
  primeTts();
  const speech = coverSpeechText(cover);
  if (!speech) {
    if (userInitiated) {
      alert("No recall prompt to read. Add text or use the audio link field.");
    }
    return;
  }

  speakText(speech, {
    userInitiated,
    onEnd: () => syncTtsControls(postCover(currentPost())),
    onError: (reason) => {
      if (reason !== "interrupted" && userInitiated) ttsErrorAlert(reason);
      syncTtsControls(cover);
    },
  });
  syncTtsControls(cover);
}

function maybeAutoSpeakCover(cover) {
  if (cover?.type !== "text" || !autoSpeakEnabled()) return;
  playCover(cover, { userInitiated: false });
}

function replayCardAnimation() {
  if (!els.cardStack) return;
  els.cardStack.style.animation = "none";
  void els.cardStack.offsetWidth;
  els.cardStack.style.animation = "";
}

async function revealPost() {
  const post = currentPost();
  if (!post || cardRevealed) return;

  stopCoverPlayback();
  cardRevealed = true;
  els.flipCard?.classList.add("is-revealed");
  els.coverPanel?.classList.add("hidden");
  els.tweetPanel?.classList.remove("is-hidden");

  await renderTweet(els.tweetFrame, post.url);
  renderGradeButtons();
}

async function showCurrentCard() {
  stopCoverPlayback();
  cardRevealed = false;
  els.flipCard?.classList.remove("is-revealed");
  els.tweetFrame.innerHTML = "";

  refreshStats();
  renderPostList();
  updateSessionBar();

  const post = currentPost();

  if (!post) {
    els.cardStack?.classList.add("hidden");
    els.sessionBar?.classList.add("hidden");
    els.gradeBar.classList.add("hidden");
    renderGradeButtons();

    if (collection.posts.length === 0) {
      els.emptyState.classList.remove("hidden");
      els.completionState.classList.add("hidden");
    } else {
      els.emptyState.classList.add("hidden");
      els.completionState.classList.remove("hidden");
    }
    return;
  }

  els.emptyState.classList.add("hidden");
  els.completionState.classList.add("hidden");
  els.cardStack?.classList.remove("hidden");
  els.sessionBar?.classList.remove("hidden");
  replayCardAnimation();

  const cover = postCover(post);

  els.tweetMetaInfo.innerHTML = `
    <span class="card-position">Card ${queueIndex + 1} of ${queue.length}</span>
    · <a href="${post.url}" target="_blank" rel="noopener">Open on X</a>
    ${cover ? ` · <span class="post-cover-tag">${escapeHtml(coverLabel(cover))}</span>` : ""}
  `;

  if (cover) {
    els.coverPanel?.classList.remove("hidden");
    els.tweetPanel?.classList.add("is-hidden");
    renderCover(els.coverContent, cover);
    syncTtsControls(cover);
    maybeAutoSpeakCover(cover);
    renderGradeButtons();
    return;
  }

  syncTtsControls(null);
  els.coverPanel?.classList.add("hidden");
  els.tweetPanel?.classList.remove("is-hidden");
  cardRevealed = true;
  els.flipCard?.classList.add("is-revealed");
  await renderTweet(els.tweetFrame, post.url);
  renderGradeButtons();
}

function submitGrade(grade) {
  const post = currentPost();
  if (!post) return;
  if (postCover(post) && !cardRevealed) return;

  const now = new Date();
  const nextSrs = scheduleReview(post.srs, grade, now);
  recordReview(collection, post.id, grade, nextSrs);

  queue = studyQueue(collection, now);
  if (queueIndex >= queue.length) {
    queueIndex = 0;
  }

  showCurrentCard();
}

function startSession() {
  queue = studyQueue(collection);
  queueIndex = 0;
  showCurrentCard();
}

function isOverlayLayout() {
  return window.matchMedia(OVERLAY_LAYOUT_MQ).matches;
}

function syncPanelBackdrop() {
  const backdrop = document.getElementById("panel-backdrop");
  const overlay = isOverlayLayout();
  const anyOpen = overlay && (leftOpen || rightOpen);
  document.body.classList.toggle("panel-open", anyOpen);
  if (!backdrop) return;
  backdrop.classList.toggle("hidden", !anyOpen);
  backdrop.classList.toggle("visible", anyOpen);
  backdrop.setAttribute("aria-hidden", anyOpen ? "false" : "true");
}

function syncMobileNav() {
  const nav = document.getElementById("mobile-bottom-nav");
  if (!nav || !isOverlayLayout()) return;
  nav.querySelector('[data-panel="left"]')?.classList.toggle("active", leftOpen);
  nav.querySelector('[data-panel="right"]')?.classList.toggle("active", rightOpen);
}

function setPanel(side, open, opts = {}) {
  if (isOverlayLayout() && open && !opts.skipExclusion) {
    if (side === "left" && rightOpen) setPanel("right", false, { skipExclusion: true });
    if (side === "right" && leftOpen) setPanel("left", false, { skipExclusion: true });
  }

  if (side === "left") {
    leftOpen = open;
    els.leftPanel.classList.toggle("collapsed", !open);
    els.toggleLeft.classList.toggle("active", open);
  } else {
    rightOpen = open;
    els.rightPanel.classList.toggle("collapsed", !open);
    els.toggleRight.classList.toggle("active", open);
  }

  syncPanelBackdrop();
  syncMobileNav();
  refreshChrome();
}

function initResponsiveLayout() {
  const mq = window.matchMedia(OVERLAY_LAYOUT_MQ);
  const apply = () => {
    if (mq.matches) {
      setPanel("left", false, { skipExclusion: true });
      setPanel("right", false, { skipExclusion: true });
    } else {
      setPanel("left", true, { skipExclusion: true });
      setPanel("right", true, { skipExclusion: true });
    }
  };
  mq.addEventListener("change", apply);
  apply();
}

function bindCoverFormTabs(form, selector) {
  document.querySelectorAll(selector).forEach((tab) => {
    tab.addEventListener("click", () => form.setType(tab.dataset.coverType ?? "none"));
  });
}

function bindCoverImageUpload(form, fileInput, urlInput) {
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const result = await readImageFile(file);
    if (!result.ok) {
      alert(result.error);
      fileInput.value = "";
      return;
    }
    form.setImageData(result.dataUrl, file.name);
  });

  urlInput?.addEventListener("input", () => form.previewImageUrl(urlInput.value));
}

function bindEvents() {
  document.addEventListener(
    "pointerdown",
    () => {
      primeTts();
      markTtsUserGesture();
    },
    { passive: true },
  );

  bindCoverFormTabs(addCoverForm, '.add-cover-tab[data-cover-form="add"]');
  bindCoverFormTabs(editCoverForm, '.edit-cover-tab[data-cover-form="edit"]');

  bindCoverImageUpload(addCoverForm, els.coverImageFile, els.coverImageUrl);
  bindCoverImageUpload(
    editCoverForm,
    document.getElementById("edit-cover-image-file"),
    document.getElementById("edit-cover-image-url"),
  );

  els.saveCoverBtn?.addEventListener("click", saveEditCover);
  els.cancelCoverBtn?.addEventListener("click", closeEditCover);

  els.addBtn.addEventListener("click", () => {
    const result = addPost(collection, els.urlInput.value, addCoverForm.getCover());
    if (!result.ok) {
      alert(result.error);
      return;
    }
    els.urlInput.value = "";
    addCoverForm.reset();
    bulkDirty = false;
    startSession();
  });

  els.urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.addBtn.click();
  });

  els.revealBtn?.addEventListener("click", revealPost);

  els.coverSpeakBtn?.addEventListener("click", () => {
    const cover = postCover(currentPost());
    if (cover?.type !== "text") return;
    if (isCoverPlaybackActive()) {
      stopCoverPlayback();
      syncTtsControls(cover);
    } else {
      playCover(cover, { userInitiated: true });
    }
  });

  els.preferCoverAudio?.addEventListener("change", () => {
    setPreferCoverAudio(els.preferCoverAudio.checked);
    syncTtsControls(postCover(currentPost()));
  });

  els.ttsProvider?.addEventListener("change", () => {
    setTtsProvider(/** @type {'auto' | 'online' | 'local'} */ (els.ttsProvider.value));
    stopCoverPlayback();
    syncTtsControls(postCover(currentPost()));
  });

  els.ttsBtn?.addEventListener("click", () => {
    if (!ttsSupported()) {
      ttsUnavailableAlert();
      return;
    }
    setAutoSpeakEnabled(!autoSpeakEnabled());
    syncTtsControls(postCover(currentPost()));
    const cover = postCover(currentPost());
    if (autoSpeakEnabled() && cover?.type === "text" && !cardRevealed) {
      playCover(cover, { userInitiated: true });
    } else {
      stopCoverPlayback();
    }
  });

  els.bulkInput.addEventListener("input", () => {
    bulkDirty = true;
  });

  els.bulkBtn.addEventListener("click", () => {
    const result = syncCollectionFromBulk(collection, els.bulkInput.value);
    bulkDirty = false;
    if (result.added === 0 && result.removed === 0 && result.invalid > 0) {
      alert("No valid X post URLs found. Check your links and try again.");
      syncBulkTextarea();
      return;
    }
    startSession();
  });

  els.toggleLeft.addEventListener("click", () => setPanel("left", !leftOpen));
  els.toggleRight.addEventListener("click", () => setPanel("right", !rightOpen));

  document.getElementById("mobile-nav-collection")?.addEventListener("click", () => {
    setPanel("left", !leftOpen);
  });

  document.getElementById("mobile-nav-stats")?.addEventListener("click", () => {
    setPanel("right", !rightOpen);
  });

  document.getElementById("mobile-nav-import")?.addEventListener("click", () => {
    els.importFile?.click();
  });

  document.getElementById("open-library-btn")?.addEventListener("click", openDeckLibrary);
  document.getElementById("mobile-nav-library")?.addEventListener("click", openDeckLibrary);
  document.getElementById("empty-library-btn")?.addEventListener("click", openDeckLibrary);
  document.getElementById("empty-load-file-btn")?.addEventListener("click", () => els.importFile?.click());
  document.getElementById("empty-new-deck-btn")?.addEventListener("click", openNewDeckSection);
  document.getElementById("new-deck-btn")?.addEventListener("click", handleStartNewDeck);

  document.getElementById("new-deck-name")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleStartNewDeck();
  });

  document.getElementById("panel-backdrop")?.addEventListener("click", () => {
    if (!isOverlayLayout()) return;
    setPanel("left", false);
    setPanel("right", false);
  });

  els.themeBtn.addEventListener("click", toggleTheme);

  els.exportBtn.addEventListener("click", downloadDeck);
  document.getElementById("share-deck-btn")?.addEventListener("click", downloadDeck);

  /**
   * @param {File | undefined | null} file
   * @param {'replace' | 'merge'} [mode]
   */
  async function handleImportFile(file, mode = "replace") {
    if (!file) return;

    let result;
    try {
      result = await parseDeckFile(file);
    } catch {
      alert("Could not read that file. Pick a .json deck export from this app.");
      return;
    }

    if (!result.ok) {
      alert(result.error);
      return;
    }

    const deckName = result.collection.name?.trim() || file.name.replace(/\.json$/i, "") || "Imported";
    if (mode === "merge") {
      if (!confirmMergeDeck(deckName, result.count)) return;
      applyMergedDeck(result.collection, deckName);
      return;
    }
    if (!confirmReplaceDeck(deckName, result.count)) return;
    applyLoadedDeck(result.collection, deckName, { linkedFile: null });
  }

  els.importFile?.addEventListener("change", async () => {
    const file = els.importFile?.files?.[0];
    if (!file) return;
    await handleImportFile(file, "replace");
    if (els.importFile) els.importFile.value = "";
  });

  els.importMergeFile?.addEventListener("change", async () => {
    const file = els.importMergeFile?.files?.[0];
    if (!file) return;
    await handleImportFile(file, "merge");
    if (els.importMergeFile) els.importMergeFile.value = "";
  });

  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (!data || data.type !== "mortweet-import" || typeof data.json !== "string") return;
    const result = parseDeckJson(data.json);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    const deckName = result.collection.name?.trim() || "Deck";
    const mode = data.merge === true ? "merge" : "replace";
    const count = result.collection.posts.length;
    if (mode === "merge") {
      if (!confirmMergeDeck(deckName, count)) return;
      applyMergedDeck(result.collection, deckName);
      return;
    }
    if (!confirmReplaceDeck(deckName, count)) return;
    applyLoadedDeck(result.collection, deckName, { linkedFile: null });
  });

  els.studyAgainBtn.addEventListener("click", startSession);

  els.cardDeleteBtn.addEventListener("click", () => {
    const post = currentPost();
    if (!post) return;
    if (!confirm("Remove this card from your deck?")) return;
    deletePost(post.id);
  });

  document.getElementById("reset-progress")?.addEventListener("click", handleResetProgress);

  document.getElementById("cards-filter")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!(btn instanceof HTMLElement) || !btn.dataset.filter) return;
    const next = btn.dataset.filter;
    if (next !== "all" && next !== "due" && next !== "new" && next !== "later") return;
    cardsFilter = next;
    renderPostList();
  });

  document.getElementById("pick-folder-btn")?.addEventListener("click", () => {
    void handlePickLocalFolder();
  });
  document.getElementById("save-folder-btn")?.addEventListener("click", () => {
    void handleSaveToFolder();
  });
  document.getElementById("refresh-folder-btn")?.addEventListener("click", () => {
    void refreshLocalLibrary();
  });
  document.getElementById("clear-folder-btn")?.addEventListener("click", () => {
    void handleClearLocalFolder();
  });

  els.menuBar?.addEventListener("click", (e) => {
    const actionBtn = e.target.closest("[data-action]");
    if (actionBtn instanceof HTMLElement && actionBtn.dataset.action) {
      e.preventDefault();
      e.stopPropagation();
      runMenuAction(actionBtn.dataset.action);
      return;
    }

    const topItem = e.target.closest(".mor-menu-bar > .mor-menu-item");
    if (!(topItem instanceof HTMLElement) || !els.menuBar?.contains(topItem)) return;
    if (e.target.closest(".mor-menu-dropdown")) return;

    e.preventDefault();
    const wasOpen = topItem.classList.contains("is-open");
    closeMenus();
    if (!wasOpen) {
      topItem.classList.add("is-open");
      els.menuBar.classList.add("menu-armed");
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (!(e.target instanceof Node)) return;
    if (els.menuBar?.contains(e.target)) return;
    closeMenus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });

  els.statusMessage?.addEventListener("click", () => setStatusMessage(""));
  document.getElementById("status-deck")?.addEventListener("click", () => {
    setPanel("left", true);
  });

  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        runMenuAction("new-deck");
        return;
      }
      if (key === "o") {
        e.preventDefault();
        runMenuAction(e.shiftKey ? "load-merge" : "load-replace");
        return;
      }
      if (key === "s") {
        e.preventDefault();
        if (e.shiftKey && desktopShell) runMenuAction("save-to-folder");
        else runMenuAction("download");
        return;
      }
    }

    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
      return;
    }

    if (e.key === "r" || e.key === "R") {
      if (!mod) {
        e.preventDefault();
        runMenuAction("study-again");
        return;
      }
    }

    const post = currentPost();
    if (!post) return;

    if ((e.key === " " || e.key === "Enter") && postCover(post) && !cardRevealed) {
      e.preventDefault();
      revealPost();
      return;
    }

    if (!cardRevealed && postCover(post)) return;

    const grade = Number(e.key);
    if (grade >= 1 && grade <= 4) {
      e.preventDefault();
      submitGrade(grade);
    }
  });
}

function initTheme() {
  const saved = localStorage.getItem("mor_tweet_srs_theme");
  if (saved === "light") {
    document.documentElement.dataset.theme = "light";
  }
}

setYoutubeHost(els.coverYoutubeHost);
addCoverForm.reset();
initTheme();
setAfterSave(() => scheduleFolderSync());
bindEvents();
initResponsiveLayout();
void bootstrapTtsProvider().then(() => {
  syncTtsControls(null);
  startSession();
});
void initDeckLibrary();
void (async () => {
  desktopShell = await isDesktopShell();
  refreshLocalLibraryChrome();
  if (desktopShell) {
    document.body.classList.add("is-desktop-shell");
    const hint = document.getElementById("backup-hint");
    if (hint) {
      hint.textContent =
        "Auto-saves here. With a deck folder set, linked decks also write JSON to disk. Download for a one-off backup.";
    }
    await refreshLocalLibrary({ quiet: true });
  }
})();