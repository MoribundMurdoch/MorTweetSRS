let widgetsReady = false;
let widgetsPromise = null;

function loadWidgetsScript() {
  if (widgetsPromise) return widgetsPromise;

  widgetsPromise = new Promise((resolve, reject) => {
    if (window.twttr?.widgets) {
      widgetsReady = true;
      resolve(window.twttr);
      return;
    }

    const existing = document.querySelector('script[src*="platform.twitter.com/widgets.js"]');
    if (existing) {
      existing.addEventListener("load", () => {
        widgetsReady = true;
        resolve(window.twttr);
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.charset = "utf-8";
    script.onload = () => {
      widgetsReady = true;
      resolve(window.twttr);
    };
    script.onerror = () => reject(new Error("Failed to load Twitter widgets"));
    document.head.appendChild(script);
  });

  return widgetsPromise;
}

let tweetResizeObserver = null;

/** @param {HTMLElement} container */
function updateTweetScrollState(container) {
  const overflows = container.scrollHeight > container.clientHeight + 2;
  container.classList.toggle("is-scrollable", overflows);
}

/** @param {HTMLElement} container */
function watchTweetSize(container) {
  if (tweetResizeObserver) tweetResizeObserver.disconnect();

  updateTweetScrollState(container);
  tweetResizeObserver = new ResizeObserver(() => updateTweetScrollState(container));
  tweetResizeObserver.observe(container);

  const embed = container.querySelector("iframe, blockquote");
  if (embed) tweetResizeObserver.observe(embed);
}

/**
 * @param {HTMLElement} container
 * @param {string} url
 */
export async function renderTweet(container, url) {
  container.classList.remove("is-scrollable");
  container.classList.add("loading");
  container.innerHTML = "<span>Loading post…</span>";

  try {
    await loadWidgetsScript();
    container.classList.remove("loading");
    container.innerHTML = "";

    const blockquote = document.createElement("blockquote");
    blockquote.className = "twitter-tweet";
    blockquote.setAttribute("data-dnt", "true");
    blockquote.setAttribute("data-theme", document.documentElement.dataset.theme === "light" ? "light" : "dark");

    const link = document.createElement("a");
    link.href = url;
    blockquote.appendChild(link);
    container.appendChild(blockquote);

    if (window.twttr?.widgets) {
      await window.twttr.widgets.load(container);
    }

    watchTweetSize(container);
    requestAnimationFrame(() => updateTweetScrollState(container));
    setTimeout(() => updateTweetScrollState(container), 400);
    setTimeout(() => updateTweetScrollState(container), 1200);
  } catch {
    container.classList.remove("loading");
    container.innerHTML = `
      <p>Could not embed this post. Twitter's widget script may be blocked.</p>
      <p><a href="${url}" target="_blank" rel="noopener">Open post on X →</a></p>
    `;
    updateTweetScrollState(container);
  }
}