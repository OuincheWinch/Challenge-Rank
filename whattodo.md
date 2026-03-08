# Challenge Rank — Improvement Ideas

## 🔴 High Priority

- [ ] **Configurable Top N** — Slider or dropdown to choose Top 10 / 20 / 50 / 100
- [ ] **Export results** — CSV/JSON export (username, score, sub-scores, image link)
- [ ] **Scan progress indicator** — Show "47 images scanned" + progress bar in overlay header

## 🟡 UX / UI

- [ ] **Search & filter in overlay** — Find a user or filter by score range (e.g. 7.0–10.0)
- [ ] **Sort by sub-category** — Sort by Theme, Wittiness, Humor, or Aesthetic instead of global score
- [ ] **Hover preview** — Enlarged image lightbox on card hover without leaving overlay
- [ ] **Keyboard shortcuts** — `Esc` close, arrows navigate, `Enter` open image
- [ ] **Rank badges on main page** — Inject `#1`, `#2`… directly on Civitai cards while scrolling

## 🟢 Technical / Quality

- [x] **Robust score detection** — Fallback using `aria-label` or `data-*` attributes if SVG detection fails
- [ ] **Visible error handling** — Toast notifications in overlay on API or React extraction failure
- [x] **Module refactoring** — Split `content.js` into `scanner.js`, `overlay.js`, `popup.js`, `controls.js`
- [x] **LocalStorage cache** — Cache `judgeDataMap` with TTL to avoid re-fetching same challenge
- [x] **Throttle MutationObserver** — Use `requestIdleCallback` or smarter debounce to reduce CPU
- [ ] **Firefox support** — Manifest v2 alternative for broader user base
- [x] **Cooldown Highlighting** — Fetch from `ouinche.com` and color current challenge abusers in RED in overlay
- [x] **Theme Elements Hints** — Display `themeElements` at the top of the overlay for scoring hints

## 💡 Wow Features

- [ ] **Radar chart** — Spider/radar chart (Canvas/SVG) for sub-scores at a glance
- [ ] **Side-by-side comparison** — Select 2 images and compare scores visually
- [ ] **Challenge history** — Store past challenge results in `chrome.storage` for later review
- [ ] **"My Rank" mode** — Detect logged-in user and highlight their images in the leaderboard
