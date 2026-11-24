# FGC Open Scorebars — Tekken 8 Broadcast Edition

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20Zero%20Dependencies-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![OBS Ready](https://img.shields.io/badge/OBS%20Studio-1920x1080%20Browser%20Source-302E31?logo=obsstudio&logoColor=white)](https://obsproject.com/)
[![Start.gg & Challonge](https://img.shields.io/badge/Tournaments-Start.gg%20%2B%20Challonge-7C3AED)](#tournament-integration-startgg--challonge)

A **100% free, open-source, zero-dependency** broadcast scorebar overlay and live control cockpit crafted for **Tekken 8** and Fighting Game Community (FGC) tournaments.

Built on pure HTML/CSS/JS and a lightweight native Node.js HTTP/SSE server — **no cloud accounts, no subscriptions, no Electron bloat, and no `npm install` required**.

---

## Key Highlights

- **32 Broadcast Scorebar Designs** calibrated around the Tekken 8 `1920×1080` in-game HUD — led by **`★ Tekken 8 Native HUD`** (matching Tekken 8's chrome-beveled healthbar frame, molten gold-orange energy, smoked glass, and UE5 italic typography), plus TWT Blade, Crown, Split-Wing, Stepped Arch, character-inspired themes, and classic FGC styles (2XKO, SF6, GGST, EVO, MvC, Tekken 3).
- **2-Column Real-Time Workspace** with a **Pinned Live Preview** (`📌 Pin Top`) rendered over real Tekken 8 gameplay (or Transparent / Chroma + HUD Alignment Guides) and a collapsible **`Scorebar Designs`** sidebar with instant search and independent scroll. Automatically folds into a tab on narrow screens and **OBS Custom Browser Docks** (`<= 1320px`).
- **Adaptive Colors & Surfaces Studio** with 5 surface modes (**Gradient**, **Solid**, **Frosted Glass** with Blur & Edge sliders, **Metallic**, and **Theme BG**), **38 mode-specific 1-click palettes**, a live preview swatch, and automatic high-contrast score typography.
- **114 Offline Vector Flags (`flags.js`)** across 4 categories (**World FGC**, **Europe & Regions**, **US States**, **Spain Autonomous Communities**) with dual slots (**Country + State/Region**), visual search picker, and 6 integrated broadcast flag styles (`TWT Integrated Blade`, `Fade Blend`, `Blade + ISO Tag`, `Dual Split Block`, `Recessed Bezel`, `Classic Compact`).
- **OBS Native Scene-Entry Transitions** hooking `obsSourceActiveChanged`, `obsSourceVisibleChanged`, and `visibilitychange`:
  - 8 entry animations (`Split Wings`, `Broadcast Cascade`, `Tekken 8 Slash`, `Slide from Top`, `Broadcast Slam`, `Horizontal Wipe`, `Cyber Glitch`, `Smooth Fade`).
  - **OBS Stinger Sync Delay** (`0–2000 ms`) with quick presets (`0ms`, `250ms`, `500ms`, `850ms`).
  - Precision **Animation Duration** (`0.15s–2.50s`) and **Score Pop Duration** (`0.20s–1.50s`) sliders.
  - Staggered choreography (`Center → Wings`), metallic landing sheen, and live OBS replay (`Alt+E`).
- **Customizable Match Point Indicator**: 5 layouts (default **Side Fin Beside Score** engineered to stay inside the `1920×1080` frame and above Tekken 8 round orbs), 5 color modes, and customizable badge text.
- **Full-Screen VS / "Up Next" Match Splash (`vs.html`)** with **6 Broadcast Layouts** (`Arcade Pop Split`, `Tekken 8 Clash`, `TWT Broadcast`, `Player Spotlight`, `Cyber Manga Neon`, `Liquid Frosted Glass`):
  - **Multi-Game Character Asset Manager (`assets.mjs`):** Browse and cache transparent character renders for **Tekken 8, Street Fighter 6, Guilty Gear -STRIVE-, 2XKO, Fatal Fury: CotW, Granblue Fantasy Versus: Rising, DNF Duel, DBFZ, UNI2, UMvC3, MK1, SSBU** — plus **240+ fighting games** via the open community `StreamHelperAssets` catalog. Auto-downloads on demand or pre-caches entire game packs locally in `data/assets/` for 100% offline tournaments.
  - **Player Profile Photos (Dual Modes):** Automatically pulls Start.gg profile avatars or accepts local photo uploads, displaying them either as a crisp nameplate medallion alongside the character render (`Badge + Char` / `Auto Fallback`) or front-and-center in a framed portrait spotlight (`Photo Spotlight`).
  - **Live Match, Auto "Up Next" Queue, or Custom VS** modes, Tournament Logo upload, OBS native scene-entry animations, P1/P2 flip/zoom/offset framing, and **1-click 1920×1080 PNG export** for X/Twitter/Discord.
- **Native Start.gg (GraphQL v4) & Challonge (API v1) Integration**:
  - Automatic Stream Queue & set loading in 1 click, complexity-safe pagination, entrant roster import with automatic country/region flag detection, side-swap-aware result reporting, live score sync (Challonge), **Local Match History & H2H** (JSON & CSV export), and a 100% offline **Demo Tournament** mode.
- **LAN Mobile/Tablet Control + OBS Dock**: Share the local Wi-Fi URL from the panel so a co-producer or phone can update scores in real time via Server-Sent Events (SSE).

---

## Quick Start

### Requirements
- **Node.js 18+** (recommended Node.js 20 / 22 / 24 LTS). **Zero npm packages required.**

### Windows (1-Click Launch)
1. Double-click **`Start_Scorebar.bat`**.
   - If Node.js is not installed on the PC, the launcher automatically offers to run **`Install_NodeJS.bat`** (uses `winget` with an automatic direct MSI fallback from `nodejs.org`).
   - You can also run **`Install_NodeJS.bat`** directly beforehand on any fresh tournament PC.
2. Your browser opens the Control Panel at `http://localhost:8787/panel.html`.
3. Keep the terminal window open during your broadcast.

### macOS / Linux / Terminal
```bash
node server.mjs
```
- **Scorebar Overlay URL (OBS Browser Source):** `http://localhost:8787/`
- **VS Match Splash URL (OBS Browser Source):** `http://localhost:8787/vs.html`
- **Control Panel URL:** `http://localhost:8787/panel.html`

> You can customize the port with `PORT=9090 node server.mjs`.

---

## OBS Studio Setup

### 1. Add the Overlay (`Browser Source`)
1. In OBS Studio, add a **Browser** source.
2. Set **URL** to `http://localhost:8787/`.
3. Set **Width** to `1920` and **Height** to `1080`.
4. Leave **Custom CSS** empty.
5. **Recommended for zero-flicker automatic scene transitions:**
   - Uncheck *"Refresh browser when scene becomes active"*.
   - Set **Page permissions** to *"Read access to OBS status information"*.
   - In the Control Panel under **Style Studio → FX & Transitions**, adjust **Entry Delay (OBS Stinger Sync)** to match your scene stinger duration.

### 2. Optional: Dock the Control Panel Inside OBS
1. In OBS Studio, go to **Docks → Custom Browser Docks…**
2. Name it `FGC Scorebar` and set the URL to `http://localhost:8787/panel.html`.
3. The panel automatically detects narrow dock widths (`<= 1320px`) and moves the Designs gallery into a clean tab.

---

## Tournament Integration (Start.gg & Challonge)

All API tokens are stored **exclusively on your local machine** inside `data/integrations.json` (excluded from Git via `.gitignore`) and are masked in the UI so they never leak on stream.

### Start.gg
1. Generate a free Personal Access Token at [start.gg/admin/profile/developer](https://start.gg/admin/profile/developer).
2. Open the **Tournaments** tab, paste your tournament or event URL/slug and token, and click **Connect**.
3. Load sets from the **Stream Queue** or **Active / Open** tabs in 1 click, import all entrants + auto-detected flags into your local player roster, and report final scores directly back to the bracket (automatically accounting for P1/P2 side swaps).

### Challonge
1. Copy your free API key from [challonge.com/settings/developer](https://challonge.com/settings/developer).
2. Paste your tournament URL (supports `challonge.com/slug` and `subdomain.challonge.com/slug`) and API key, then click **Connect**.
3. Supports both **Live Score Sync** (updates in-progress score without closing the match) and **Report Result**.

### Offline Demo Mode
Select **Demo Tournament (No Token) → Connect** to test Stream Queue, 1-click set loading, flags, Match History, and Head-to-Head completely offline.

---

## Keyboard Shortcuts

Available whenever the Control Panel window or OBS Dock has focus:

| Shortcut | Action |
| :--- | :--- |
| `Alt + 1` / `Alt + Shift + 1` | `+1` / `-1` Point for Player 1 |
| `Alt + 2` / `Alt + Shift + 2` | `+1` / `-1` Point for Player 2 |
| `Alt + S` | Swap Sides (`P1 ⇄ P2`, auto-adjusts active bracket reporting) |
| `Alt + R` | Reset Score to `0 - 0` |
| `Alt + H` | Smoothly Show / Hide Overlay |
| `Alt + E` | Replay Live Scene Entry Transition in OBS |

---

## Project Structure

| File | Purpose |
| :--- | :--- |
| [`index.html`](index.html) | `1920×1080` OBS Browser Source scorebar overlay (32 themes, adaptive surfaces, Match Point, OBS native transitions, SSE + BroadcastChannel client). |
| [`vs.html`](vs.html) | `1920×1080` OBS Browser Source VS / Up Next Match Splash overlay (6 layouts, character renders, player avatars, H2H, tournament logo, 1920×1080 PNG exporter). |
| [`panel.html`](panel.html) | 2-column Broadcast Control Panel with pinned live preview, Style Studio, VS Splash Studio, Multi-Game Asset Manager, Designs sidebar, Flag Picker, Tournament sync, and H2H History. |
| [`server.mjs`](server.mjs) | Zero-dependency Node.js HTTP & Server-Sent Events (SSE) server with local JSON persistence and secure media/asset caching in `data/`. |
| [`assets.mjs`](assets.mjs) | Multi-game character render & local cache manager powered by `StreamHelperAssets` (on-demand caching, 1-click full pack downloads, custom PNG/avatar/logo uploads). |
| [`tournaments.mjs`](tournaments.mjs) | Native Start.gg GraphQL v4 client (with profile avatars), Challonge REST API v1 client, country/region flag resolver, and offline Demo generator. |
| [`flags.js`](flags.js) | 114 offline vector SVG flags with bilingual search aliases (World FGC, Europe & Regions, US States, Spain Regions). |
| [`Start_Scorebar.bat`](Start_Scorebar.bat) | 1-click Windows launcher with Node.js 18+ check and auto-install prompt. |
| [`Install_NodeJS.bat`](Install_NodeJS.bat) | Standalone Windows Node.js LTS installer (`winget` + official `nodejs.org` MSI fallback). |
| [`assets/t8-gameplay-ref.jpg`](assets/t8-gameplay-ref.jpg) | Reference Tekken 8 gameplay backdrop used exclusively in the Control Panel Live Preview. |

> Runtime state, saved players, custom presets, match history, and API tokens are stored in `data/` (created automatically at runtime and ignored by Git).

---

## Local HTTP / SSE API

Because everything runs over clean local JSON endpoints, you can integrate Stream Deck, Bitfocus Companion, or custom tournament scripts directly:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/state` | `GET` / `POST` | Read or patch live overlay state (broadcasts immediately via SSE). |
| `/api/events` | `GET` (SSE) | Real-time state stream consumed by OBS overlays and remote panels. |
| `/api/info` | `GET` | Server port, connected overlay count, and detected LAN IP URLs. |
| `/api/players` | `GET` / `POST` | Read, upsert, or delete local saved players. |
| `/api/presets` | `GET` / `POST` | Read, save, or delete custom Style Studio presets. |
| `/api/history` | `GET` / `POST` | Read, record, delete, or clear local Match History & H2H records. |
| `/api/integrations` | `GET` | Masked Start.gg / Challonge connection metadata (never exposes full tokens). |
| `/api/tournament/connect` | `POST` | Connect to Start.gg, Challonge, or Demo and fetch Stream Queue + sets. |
| `/api/tournament/sets` | `POST` | Fetch sets for a specific event ID. |
| `/api/tournament/import-players` | `POST` | Import tournament entrants and auto-mapped flags into local players DB. |
| `/api/tournament/report` | `POST` | Report final match score (or live Challonge progress) back to the bracket. |
| `/api/assets/games` | `GET` | List featured fighting games (or `?all=1` for all 240+ games) and local cache counts. |
| `/api/assets/roster` | `GET` | Return character roster, eyesight framing metadata, and local cache status for `?game=&pack=`. |
| `/api/assets/render` | `GET` | Serve cached character PNG for `?game=&pack=&char=` (auto-downloads & caches on demand). |
| `/api/assets/download-pack` | `POST` | Pre-download an entire game/pack character render set for 100% offline use. |
| `/api/assets/download-status` | `GET` | Poll live pack download progress (`done`, `total`, `currentChar`). |
| `/api/upload` | `POST` | Upload local Player Profile Photo, Tournament Logo, or Custom Character PNG into `data/`. |

---

## License

Released under the [MIT License](LICENSE). Free for personal streams, local weeklies, community majors, and custom forks.
