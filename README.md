# MorTweet SRS

Spaced repetition for a collection of Twitter/X post URLs. Review posts on an Anki-style schedule with optional **flip-card covers** (text or image) shown before you reveal the tweet.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Repository layout

| Path | What it is |
|------|------------|
| [`web/`](web/) | Static web app — host anywhere or open via a local server |
| [`desktop/`](desktop/) | Dioxus 0.7 desktop shell (wraps the same `web/` UI) |

Both targets share the same JavaScript app in `web/`. The desktop build copies `web/` into its assets at compile time.

## Web app

Twitter embeds need a real HTTP origin (not `file://`):

```bash
cd web
python -m http.server 8787
```

Open http://localhost:8787

You can also deploy `web/` to GitHub Pages, Netlify, or any static host.

### Features

- Add posts individually or in bulk
- Optional **cover** per post (text or image) — recall prompt before reveal
- Edit covers later via **✎** on any saved post
- **Again / Hard / Good / Easy** grading (`1`–`4`)
- `localStorage` persistence + JSON export/import

## Desktop app

Requires [Rust](https://rustup.rs/) and [Dioxus CLI](https://dioxuslabs.com/learn/0.7/getting_started):

```bash
cargo install dioxus-cli --locked
```

### Run in development

```bash
cd desktop
dx serve --platform desktop
```

### Release build

```bash
cd desktop
dx bundle --platform desktop
```

The bundled app is written under `desktop/target/dx/`.

## License

**MIT** — see [LICENSE](LICENSE). This is the most permissive license practical for this project:

- All app source here is original MIT-licensed code
- Runtime use of [Twitter/X embed widgets](https://developer.twitter.com/en/docs/twitter-for-websites) is subject to X's terms when you load posts
- [Google Fonts](https://fonts.google.com/) (DM Sans, Syne, IBM Plex Mono) are loaded from Google's CDN under the [SIL Open Font License](https://scripts.sil.org/OFL)

## Third-party services

- **X/Twitter** — post embeds via `platform.twitter.com/widgets.js`
- **Google Fonts** — web typography CDN

No npm dependencies; the web app is vanilla HTML/CSS/JS modules.