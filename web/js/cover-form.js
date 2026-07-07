import { coverFromInputs, splitCoverText } from "./cover.js";

/**
 * @typedef {Object} CoverFormHandles
 * @property {HTMLElement} textField
 * @property {HTMLElement} imageField
 * @property {HTMLTextAreaElement} textInput
 * @property {HTMLInputElement} [audioUrl]
 * @property {HTMLInputElement} imageUrl
 * @property {HTMLInputElement} imageFile
 * @property {HTMLElement} fileName
 * @property {HTMLElement} preview
 * @property {string} tabSelector
 */

/**
 * @param {CoverFormHandles} handles
 * @param {string} tabSelector
 */
export function createCoverForm(handles, tabSelector) {
  let type = "none";
  let imageData = "";

  function setType(next) {
    type = next;
    handles.textField.classList.toggle("hidden", next !== "text");
    handles.imageField.classList.toggle("hidden", next !== "image");
    document.querySelectorAll(tabSelector).forEach((tab) => {
      const active = tab.dataset.coverType === next;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function reset() {
    handles.textInput.value = "";
    if (handles.audioUrl) handles.audioUrl.value = "";
    handles.imageUrl.value = "";
    handles.imageFile.value = "";
    imageData = "";
    handles.fileName.textContent = "No file chosen";
    handles.preview.classList.add("hidden");
    handles.preview.innerHTML = "";
    setType("none");
  }

  /** @param {import('./cover.js').Cover | null} cover */
  function load(cover) {
    reset();
    if (!cover) {
      setType("none");
      return;
    }
    if (cover.type === "text") {
      setType("text");
      const { prompt, audioUrl } = splitCoverText(cover);
      handles.textInput.value = prompt;
      if (handles.audioUrl) handles.audioUrl.value = audioUrl;
      return;
    }
    setType("image");
    if (cover.content.startsWith("data:")) {
      imageData = cover.content;
      handles.fileName.textContent = "Saved image";
      handles.preview.classList.remove("hidden");
      handles.preview.innerHTML = `<img src="${cover.content}" alt="Cover preview" />`;
    } else {
      handles.imageUrl.value = cover.content;
      handles.fileName.textContent = "Using URL";
      handles.preview.classList.remove("hidden");
      handles.preview.innerHTML = `<img src="${cover.content}" alt="Cover preview" />`;
    }
  }

  function getCover() {
    return coverFromInputs(
      type,
      handles.textInput.value,
      handles.imageUrl.value,
      imageData,
      handles.audioUrl?.value ?? "",
    );
  }

  /** @param {string} dataUrl */
  function setImageData(dataUrl, label) {
    imageData = dataUrl;
    handles.imageUrl.value = "";
    handles.imageFile.value = "";
    handles.fileName.textContent = label;
    handles.preview.classList.remove("hidden");
    handles.preview.innerHTML = `<img src="${dataUrl}" alt="Cover preview" />`;
  }

  function clearImageData() {
    imageData = "";
  }

  function getImageData() {
    return imageData;
  }

  function getType() {
    return type;
  }

  /** @param {string} url */
  function previewImageUrl(url) {
    const trimmed = url.trim();
    if (!trimmed) {
      if (!imageData) {
        handles.preview.classList.add("hidden");
        handles.preview.innerHTML = "";
        handles.fileName.textContent = "No file chosen";
      }
      return;
    }
    imageData = "";
    handles.imageFile.value = "";
    handles.fileName.textContent = "Using URL";
    handles.preview.classList.remove("hidden");
    handles.preview.innerHTML = `<img src="${trimmed}" alt="Cover preview" />`;
  }

  return {
    setType,
    reset,
    load,
    getCover,
    setImageData,
    clearImageData,
    getImageData,
    getType,
    previewImageUrl,
  };
}