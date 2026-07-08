import {
  loadCollection,
  saveCollection,
  addPost,
  removePost,
  updatePostCover,
  syncCollectionFromBulk,
  studyQueue,
  stats,
  recordReview,
  exportJson,
  importJson,
  postStatus,
  resetCollectionProgress,
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
  studyAgainBtn: document.getElementById("study-again-btn"),
};

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

  els.statsPanel.innerHTML = `
    <div class="stat-card wide"><div class="stat-label">Total posts</div><div class="stat-value">${s.total}</div></div>
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

function renderPostList() {
  const active = currentPost();
  els.postList.innerHTML = collection.posts
    .map((post) => {
      const status = postStatus(post);
      const cover = postCover(post);
      const dueLabel =
        status === "new"
          ? "new"
          : status === "due"
            ? "due now"
            : `due ${new Date(post.srs.due).toLocaleDateString()}`;
      const isEditing = editingPostId === post.id;
      return `
        <li class="post-item ${active?.id === post.id ? "active" : ""} ${isEditing ? "editing" : ""}" data-id="${post.id}">
          <span class="status-dot ${status}"></span>
          <div class="info">
            <div class="url" title="${post.url}">${post.url}</div>
            <div class="due-label">${dueLabel}${cover ? `<span class="post-cover-tag">${coverLabel(cover)}</span>` : ""}</div>
          </div>
          <div class="post-actions">
            <button class="post-edit-btn" type="button" title="Edit cover" aria-label="Edit cover" data-edit="${post.id}">✎</button>
            <button class="post-remove-btn" type="button" title="Remove post" aria-label="Remove post" data-remove="${post.id}">×</button>
          </div>
        </li>
      `;
    })
    .join("");

  els.postList.querySelectorAll(".post-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".post-remove-btn") || e.target.closest(".post-edit-btn")) return;
      const id = item.dataset.id;
      const idx = queue.findIndex((p) => p.id === id);
      if (idx >= 0) {
        queueIndex = idx;
        showCurrentCard();
        if (isOverlayLayout()) setPanel("left", false);
      }
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
      if (editingPostId === btn.dataset.remove) closeEditCover();
      deletePost(btn.dataset.remove);
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
      ? "Reveal the post before rating"
      : "How well did you recall this?";
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
    ${cover ? ` · <span class="post-cover-tag">${coverLabel(cover)}</span>` : ""}
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
      alert("No valid URLs in the list. Check your links and try again.");
      syncBulkTextarea();
      return;
    }
    startSession();
  });

  els.toggleLeft.addEventListener("click", () => setPanel("left", !leftOpen));
  els.toggleRight.addEventListener("click", () => setPanel("right", !rightOpen));

  document.getElementById("panel-backdrop")?.addEventListener("click", () => {
    if (!isOverlayLayout()) return;
    setPanel("left", false);
    setPanel("right", false);
  });

  els.themeBtn.addEventListener("click", () => {
    const isLight = document.documentElement.dataset.theme === "light";
    document.documentElement.dataset.theme = isLight ? "dark" : "light";
    localStorage.setItem("mor_tweet_srs_theme", isLight ? "dark" : "light");
    if (cardRevealed && currentPost()) {
      renderTweet(els.tweetFrame, currentPost().url);
    }
  });

  els.exportBtn.addEventListener("click", () => {
    const blob = new Blob([exportJson(collection)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mor-tweet-srs-collection.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  async function handleImportFile(file) {
    if (!file) return;

    if (
      collection.posts.length > 0 &&
      !confirm(`Import "${file.name}"? This replaces your current collection (${collection.posts.length} posts).`)
    ) {
      return;
    }

    let result;
    try {
      result = await parseDeckFile(file);
    } catch {
      alert("Could not read the file.");
      return;
    }

    if (!result.ok) {
      alert(result.error);
      return;
    }

    collection = result.collection;
    bulkDirty = false;
    editingPostId = null;
    closeEditCover();
    startSession();
    alert(`Imported ${result.count} post${result.count === 1 ? "" : "s"} from ${file.name}.`);
  }

  const onImportInput = async () => {
    const file = els.importFile?.files?.[0];
    if (!file) return;
    await handleImportFile(file);
    if (els.importFile) els.importFile.value = "";
  };

  els.importFile?.addEventListener("change", onImportInput);

  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (!data || data.type !== "mortweet-import" || typeof data.json !== "string") return;
    const result = importJson(data.json);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    collection = result.collection;
    bulkDirty = false;
    editingPostId = null;
    closeEditCover();
    startSession();
    alert(`Imported ${result.collection.posts.length} posts.`);
  });

  els.studyAgainBtn.addEventListener("click", startSession);

  els.cardDeleteBtn.addEventListener("click", () => {
    const post = currentPost();
    if (!post) return;
    if (!confirm("Remove this post from your collection?")) return;
    deletePost(post.id);
  });

  document.getElementById("reset-progress")?.addEventListener("click", () => {
    const count = collection.posts.length;
    if (!count) return;
    if (
      !confirm(
        `Reset study progress for all ${count} post${count === 1 ? "" : "s"}?\n\n` +
          "SRS schedules and review history will be cleared. Your posts and covers are kept.",
      )
    ) {
      return;
    }
    resetCollectionProgress(collection);
    startSession();
  });

  document.getElementById("clear-collection")?.addEventListener("click", () => {
    if (!confirm("Remove all posts and review history?")) return;
    collection = { name: collection.name, posts: [], reviews: [] };
    saveCollection(collection);
    bulkDirty = false;
    els.bulkInput.value = "";
    startSession();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
bindEvents();
initResponsiveLayout();
void bootstrapTtsProvider().then(() => {
  syncTtsControls(null);
  startSession();
});