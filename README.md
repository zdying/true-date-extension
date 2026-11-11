<p align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="TrueDate & Pre-AI Search Logo" />
</p>

<h1 align="center">TrueDate & Pre-AI Search</h1>

<p align="center">
  <strong>One-click Pre-2023 search filter & webpage true publication date inspector for Firefox and Chrome.</strong><br/>
  Catch old SEO articles pretending to be "Updated in 2026" and filter out post-ChatGPT content farms.
</p>

<p align="center">
  <a href="https://github.com/zdying/true-date-extension/releases"><img src="https://img.shields.io/badge/release-v0.1.0-10b981?style=flat-square" alt="Release v0.1.0" /></a>
  <img src="https://img.shields.io/badge/Firefox_Add--ons-In_Review_Queue-f59e0b?style=flat-square&logo=firefox-browser&logoColor=white" alt="Firefox Add-ons: In Review Queue" />
  <img src="https://img.shields.io/badge/Manifest-V3-3b82f6?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/telemetry-zero-10b981?style=flat-square" alt="Zero Telemetry" />
</p>

---

## Why TrueDate?

Modern search results are flooded with two things:
1. **Post-2022 AI-generated SEO slop** that buries genuine human writing.
2. **Timestamp spoofing ("date bumping")**: Old articles from 2018–2021 that automatically update their visible date (`Updated 2 days ago` or `[2026 Guide]`) without changing the actual content.

**TrueDate & Pre-AI Search** solves both in a lightweight, zero-dependency, zero-telemetry extension.

---

## Features

### 1. One-Click `Pre-2023` Search Filter
Adds a compact floating pill on **Google**, **DuckDuckGo**, and **Bing** search result pages:
- Toggle **`Pre-2023`** on or off with a single click.
- Customize the cutoff year (`2018` – `2025`) to fit your research needs.
- Uses native search engine date syntax (`before:YYYY-01-01` on Google, `df=1995-01-01..` on DuckDuckGo, and `ez5_` date range filters on Bing).

### 2. 4-Layer True Publication Date Inspector
When you open an article, TrueDate inspects the page locally and displays a non-intrusive badge in the top-right corner (`🟢 2021-04 · Unchanged` or `⚠️ 2019-06 → 2026-02 (7yr gap)`):

- **Layer 1 — Structured Metadata**: Compares `datePublished` vs `dateModified` across JSON-LD (`schema.org`), OpenGraph/`meta` tags (`article:published_time`), and `<time datetime>` elements.
- **Layer 2 — Static Asset & Image Path Forensics**: Scans `<img>` URLs for embedded upload timestamps (e.g., `/wp-content/uploads/2019/05/hero.jpg`) when a page claims to be brand new.
- **Layer 3 — HTTP Header Signal**: Reads `document.lastModified` as a secondary signal.
- **Layer 4 — On-Demand Wayback Machine CDX & Paragraph Diff**:
  - **Privacy-first (click-to-run only)**: Never sends your browsing history automatically.
  - Click **"Check Wayback Earliest Snapshot"** in the expanded card to query the Internet Archive CDX API for the earliest crawl date.
  - Click **"Compare with Earliest Snapshot"** to run a paragraph-level diff directly on the page—highlighting **Newly Added (green)** and **Modified (amber)** paragraphs and calculating the exact percentage of unchanged original text.

---

## Installation

> **Note:** Version `0.1.0` has been submitted to **Mozilla Firefox Add-ons (AMO)** and is currently in the review queue. Once approved, the direct one-click store link will be posted here. In the meantime, you can install from the [latest release (`true-date-extension.zip`)](https://github.com/zdying/true-date-extension/releases) in 30 seconds:

### Firefox (Developer / Nightly / Temporary Load)
1. Download [`true-date-extension.zip`](https://github.com/zdying/true-date-extension/releases) from the Releases page (or clone this repo).
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** and select `manifest.json` (or `true-date-extension.zip`).

### Chrome / Edge / Brave / Vivaldi
1. Download and unzip [`true-date-extension.zip`](https://github.com/zdying/true-date-extension/releases) (or clone this repo).
2. Open `chrome://extensions` and enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `true-date-extension` folder.

---

## Project Structure & Privacy

All code is plain, unminified, zero-dependency Vanilla ES Modules so anyone can audit it in 2 minutes:

```text
true-date-extension/
├── manifest.json          # Cross-browser MV3 manifest (Chrome + Firefox gecko)
├── background.js          # On-demand Wayback Machine CDX & snapshot fetcher
├── lib/
│   ├── dates.js           # Pure functions for L1/L2/L3 date extraction & judgment
│   ├── diff.js            # Paragraph-level snapshot comparison & similarity scoring
│   └── search-url.js      # Google / DuckDuckGo / Bing URL date filter builders
├── content/
│   ├── main.js            # Content script entry point
│   ├── page-badge.js      # Shadow DOM badge & expandable evidence card
│   └── search-ui.js       # Shadow DOM search engine Pre-YYYY pill
└── test/
    └── dates.test.js      # Node.js built-in test runner suite (`npm test`)
```

- **Zero Telemetry**: `"data_collection_permissions": { "required": ["none"] }`.
- **No Automatic External Requests**: Wayback Machine API (`web.archive.org`) is only contacted when you explicitly click the button inside the evidence card.

## Running Tests

Requires Node.js 18+ (zero external npm packages needed):

```bash
npm test
```

## License

GNU General Public License v3.0 (GPL-3.0)
