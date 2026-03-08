<p align="center">
  <img src="Flying_button.png" alt="Challenge Rank icon" width="64">
</p>

<h1 align="center">Challenge Rank V2.0</h1>

<p align="center">
  <strong>See who's actually winning.</strong><br>
  A Chrome extension that ranks Civitai challenge images by judge score — instantly.
</p>

<p align="center">
  <a href="https://github.com/OuincheWinch/Challenge-Rank/releases/latest">⬇️ Download v2.0.0</a>
</p>

---

## 🚀 What's New in V2.0

*   **Cooldown Highlighting**: Connects with <a href="https://www.ouinche.com/dailychallenge"> www.ouinche.com/dailychallenge </a>  to fetch the challenge cooldown list. Authors under a cooldown penalty are highlighted in bold **<span style="color:#ff6b6b">red</span>**, making it easy to identify them on the leaderboard for active challenges.
*   **Theme Scoring Hints**: Gain insights on how to rank higher! The overlay dynamically extracts and displays the precise **Categorical & Theme Elements** the judges evaluate your images against. Look for the "Scoring Hints" at the top of the leaderboard.
*   **Dynamic UI Enhancements**:
    *   "Live" vs "Finished" badges in the title header.
    *   A Podium section for top 3 winners of completed challenges.
    *   An option to choose how many top entries to display (Top 10 / 20 / 50 / 100).

## ✨ Core Features

| | Feature | Description |
|---|---|---|
| 🏆 | **Top N Overlay** | Persistent leaderboard of the highest-scored images, updated live as you scroll |
| 🤖 | **CivBot Details** | Click any score badge to see the full CivBot breakdown (sub-scores & comments) |
| 🎯 | **Auto-Filter** | Automatically activates "Judge Reviewed" so you only see scored entries |
| 💾 | **Browser Cache** | Remembers ranked images as you infinite-scroll and caches judge API data securely |
| 🔄 | **Auto-Reset** | Clears the list when you navigate to a different challenge |
| 🖱️ | **Draggable Button**| The floating 🏆 button can be moved anywhere on your screen setup |

## 📦 Install

1. **Download** the latest [release zip](https://github.com/OuincheWinch/Challenge-Rank/releases/latest)
2. **Unzip** the folder
3. Open `chrome://extensions/` → enable **Developer mode**
4. Click **Load unpacked** → select the `challenge-rank-extension` folder

## 🎮 Usage

1. Go to any [Civitai Challenge](https://civitai.com/challenges) page
2. Scroll to load images — the extension scans scores in the background
3. Click the **🏆 button** to open the Top leaderboard overlay
4. Click a **score badge** to expand CivBot details

## 📂 Extension Files

```
manifest.json    → Extension config (v2.0.0)
scanner.js       → Shared state, score detection, card scanning, caching mechanism
overlay.js       → Main overlay UI: header, hints, podium, grid, top cards
controls.js      → Floating button, filter automation, lifecycle, throttled observer
popup.js         → CivBot details popup panel logic
content.css      → Styles for overlay, badges, animations, cooldown alerts
background.js    → Service worker for Civitai API calls & cross-origin cooldown fetches
```

---

<sub>⚖️ **Disclaimer** — This is an UnOfficial, community-created extension. Not affiliated with or endorsed by Civitai. Civitai™ is a trademark of its respective owners.</sub>
