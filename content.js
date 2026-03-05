// Challenge Rank Extension - Content Script
// Uses chrome.scripting via background to access React state for judge scores

console.log("Challenge Rank: React State Mode Loaded");

let isOverlayOpen = false;
let observer = null;
let currentChallengeId = null;
let hasAutoActivatedJudge = false;

const rankedItemsMap = new Map();
const judgeDataMap = new Map();
let fetchStatus = 'idle';
let fetchDiagnostic = '';

// ============================================================
// FETCH judge data — bulk API + React state extraction
// ============================================================

async function fetchJudgeData(challengeId) {
    if (fetchStatus === 'fetching') return;
    fetchStatus = 'fetching';
    fetchDiagnostic = '';

    // 1) Bulk API for usernames/stats
    try {
        const bulkRes = await chrome.runtime.sendMessage({ action: 'fetchJudgeData', challengeId });
        if (bulkRes?.success) {
            const items = bulkRes.data || [];
            for (const item of items) {
                if (!judgeDataMap.has(item.id)) judgeDataMap.set(item.id, item);
            }
            fetchDiagnostic += `Bulk: ${items.length} items\n`;
        }
    } catch (e) { fetchDiagnostic += `Bulk error: ${e.message}\n`; }

    // 2) React state extraction (walks fiber tree in MAIN world)
    try {
        const reactRes = await chrome.runtime.sendMessage({ action: 'extractReactData', imageId: '0' });
        if (reactRes?.success) {
            const d = reactRes.data;
            fetchDiagnostic += `React: ${d.debug}\n`;
            if (d.found && d.allJudgeData) {
                fetchDiagnostic += `Found ${d.allJudgeData.length} items with judgeScore!\n`;
                for (const item of d.allJudgeData) {
                    const id = String(item.id);
                    const existing = judgeDataMap.get(id) || {};
                    judgeDataMap.set(id, {
                        ...existing,
                        id,
                        judgeScore: item.judgeScore,
                        reason: item.reason,
                        username: item.username || existing.username
                    });
                }
            }
        } else {
            fetchDiagnostic += `React error: ${reactRes?.error}\n`;
        }
    } catch (e) { fetchDiagnostic += `React exception: ${e.message}\n`; }

    fetchStatus = 'done';
    console.log('CR DIAGNOSTIC:\n' + fetchDiagnostic);

    // Update ranked items
    for (const [href, item] of rankedItemsMap.entries()) {
        const jd = judgeDataMap.get(item.id);
        if (jd) item.judgeData = jd;
    }
    if (isOverlayOpen) refreshPopups();
}

function refreshPopups() {
    getTop20().forEach(item => {
        if (!item.judgeData) { const jd = judgeDataMap.get(item.id); if (jd) item.judgeData = jd; }
        const popup = document.querySelector(`#cr-popup-${item.id}`);
        if (popup) fillPopupContent(popup, item);
    });
}

// ============================================================
// SCORE DETECTION
// ============================================================

function findScoreOnCard(card) {
    const svgs = Array.from(card.querySelectorAll('svg'));
    for (const svg of svgs) {
        const html = svg.outerHTML.toLowerCase();
        if (!(html.includes('star') || html.includes('m12 2l3.09') || html.includes('m12 .587') || (html.includes('polygon') && html.includes('fill')))) continue;
        let container = svg.parentElement;
        for (let i = 0; i < 4 && container; i++) {
            const val = parseFloat(container.innerText.trim());
            if (!isNaN(val) && val >= 0 && val <= 10.0) return val;
            container = container.parentElement;
        }
    }
    return -1;
}

function scanForNewCards() {
    const links = Array.from(document.querySelectorAll('a[href*="/images/"]'));
    let newFound = 0;
    for (const link of links) {
        const href = link.href;
        if (!href.match(/\/images\/\d+/) || rankedItemsMap.has(href)) continue;
        let card = null, el = link;
        for (let d = 0; d < 8 && el; d++) { el = el.parentElement; if (!el || el.tagName === 'BODY') break; if (el.querySelector('img') && el.querySelector('svg')) { card = el; break; } }
        if (!card) continue;
        const score = findScoreOnCard(card);
        if (score < 0) continue;
        const img = card.querySelector('img');
        if (!img?.src) continue;
        const itemId = href.match(/\/images\/(\d+)/)[1];
        rankedItemsMap.set(href, { score, imgSrc: img.src, href, id: itemId, judgeData: judgeDataMap.get(itemId) || null });
        newFound++;
    }
    if (newFound > 0) console.log(`CR: ${newFound} new. Total: ${rankedItemsMap.size}`);
    return newFound > 0;
}

function getTop20() { return Array.from(rankedItemsMap.values()).sort((a, b) => b.score - a.score).slice(0, 20); }

// ============================================================
// POPUP
// ============================================================

function fillPopupContent(popup, item) {
    let html = '';
    const jd = item.judgeData;
    const username = jd?.username;
    if (username) html += `<div class="cr-popup-username-top">👤 <strong>${username}</strong></div>`;

    if (jd?.judgeScore && typeof jd.judgeScore === 'object') {
        html += `<div class="cr-popup-judge-name">Scores</div>`;
        const js = jd.judgeScore;
        const entries = [];
        if (js.theme !== undefined) entries.push({ label: 'Theme', value: js.theme, weight: '50%' });
        if (js.wittiness !== undefined) entries.push({ label: 'Wittiness', value: js.wittiness, weight: '15%' });
        if (js.humor !== undefined) entries.push({ label: 'Humor', value: js.humor, weight: '15%' });
        if (js.aesthetic !== undefined) entries.push({ label: 'Aesthetic', value: js.aesthetic, weight: '20%' });
        for (const [key, val] of Object.entries(js)) {
            if (typeof val === 'number' && !['theme', 'wittiness', 'humor', 'aesthetic'].includes(key)) {
                entries.push({ label: key.charAt(0).toUpperCase() + key.slice(1), value: val, weight: '' });
            }
        }
        for (const e of entries) {
            const pct = (e.value / 10) * 100;
            const color = pct >= 80 ? '#51cf66' : pct >= 60 ? '#ffd43b' : pct >= 40 ? '#ff922b' : '#ff6b6b';
            html += `<div class="cr-popup-score-row"><span class="cr-popup-score-label">${e.label}${e.weight ? ' (' + e.weight + ')' : ''}</span><span class="cr-popup-score-value">${e.value}/10</span></div>`;
            html += `<div class="cr-popup-bar-bg"><div class="cr-popup-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
        }
        html += `<div class="cr-popup-weighted">Weighted Score <strong>${item.score}/10</strong></div>`;
        if (jd.reason) {
            html += `<div class="cr-popup-comment-title">Comment</div>`;
            html += `<div class="cr-popup-comment-text">${jd.reason}</div>`;
        }
    } else {
        html += `<div class="cr-popup-score-main">⭐ Score: <strong>${item.score}</strong></div>`;
        if (fetchStatus !== 'done') {
            html += `<div class="cr-popup-loading">Loading judge details…</div>`;
        } else {
            html += `<div class="cr-popup-loading">Judge breakdown not available for this image.</div>`;
        }
    }
    popup.innerHTML = html;
}

// ============================================================
// OVERLAY
// ============================================================

function createOverlay() {
    if (document.getElementById('civitai-ranker-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'civitai-ranker-overlay';
    const header = document.createElement('div');
    header.className = 'cr-header';
    const title = document.createElement('h2');
    title.textContent = 'Top 20 Ranked Images';
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cr-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', toggleOverlay);
    header.appendChild(closeBtn);
    overlay.appendChild(header);
    const grid = document.createElement('div');
    grid.className = 'cr-grid';
    overlay.appendChild(grid);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) toggleOverlay(); });
    document.body.appendChild(overlay);
}

function updateOverlayContent() {
    scanForNewCards();
    const list = getTop20();
    const grid = document.querySelector('#civitai-ranker-overlay .cr-grid');
    if (!grid) return;
    grid.innerHTML = '';
    if (list.length === 0) { grid.innerHTML = '<div class="cr-empty-msg">No ranked images found. Scroll down, then reopen.</div>'; return; }

    if (fetchStatus === 'idle' && currentChallengeId) fetchJudgeData(currentChallengeId);

    list.forEach((item, index) => {
        if (!item.judgeData) { const jd = judgeDataMap.get(item.id); if (jd) item.judgeData = jd; }
        const card = document.createElement('div');
        card.className = 'cr-card';
        card.addEventListener('click', () => window.open(item.href, '_blank'));

        const scoreBadge = document.createElement('div');
        scoreBadge.className = 'cr-card-score';
        scoreBadge.textContent = item.score;
        scoreBadge.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); toggleDetailsPopup(card, item); });
        card.appendChild(scoreBadge);

        const rankBadge = document.createElement('div');
        rankBadge.className = 'cr-card-rank';
        rankBadge.textContent = `#${index + 1}`;
        card.appendChild(rankBadge);

        const img = document.createElement('img');
        img.className = 'cr-card-img';
        img.src = item.imgSrc;
        img.loading = 'lazy';
        card.appendChild(img);

        // Author name bar
        const authorBar = document.createElement('div');
        authorBar.className = 'cr-card-author';
        authorBar.textContent = item.judgeData?.username || '…';
        card.appendChild(authorBar);

        const popup = document.createElement('div');
        popup.className = 'cr-details-popup';
        popup.id = `cr-popup-${item.id}`;
        popup.addEventListener('click', (e) => e.stopPropagation());
        fillPopupContent(popup, item);
        card.appendChild(popup);
        grid.appendChild(card);
    });

    setTimeout(() => { if (isOverlayOpen) refreshPopups(); }, 4000);
}

function toggleDetailsPopup(card, item) {
    const popup = card.querySelector('.cr-details-popup');
    if (!popup) return;
    const isActive = popup.classList.contains('active');
    document.querySelectorAll('.cr-details-popup.active').forEach(p => p.classList.remove('active'));
    if (!isActive) {
        if (!item.judgeData?.judgeScore) { const jd = judgeDataMap.get(item.id); if (jd) item.judgeData = jd; }
        fillPopupContent(popup, item);
        popup.classList.add('active');

        // Close popup when mouse leaves it
        popup.addEventListener('mouseleave', () => {
            popup.classList.remove('active');
        });

        // If no judgeScore yet, try extracting from React for this specific image
        if (!item.judgeData?.judgeScore) {
            chrome.runtime.sendMessage({ action: 'extractReactData', imageId: item.id }).then(res => {
                if (res?.success && res.data?.found) {
                    const d = res.data;
                    item.judgeData = { ...(item.judgeData || {}), judgeScore: d.judgeScore, reason: d.reason, username: d.username || item.judgeData?.username };
                    judgeDataMap.set(item.id, item.judgeData);
                    // Also cache all found items
                    if (d.allJudgeData) {
                        for (const jItem of d.allJudgeData) {
                            const id = String(jItem.id);
                            if (!judgeDataMap.get(id)?.judgeScore) {
                                judgeDataMap.set(id, { ...judgeDataMap.get(id), ...jItem, id });
                            }
                        }
                    }
                }
                fetchDiagnostic = `React extract for #${item.id}:\n${res?.data?.debug || res?.error || 'no data'}`;
                fillPopupContent(popup, item);
            }).catch(() => { });
        }
    }
}

function toggleOverlay() {
    let overlay = document.getElementById('civitai-ranker-overlay');
    if (!overlay) { createOverlay(); overlay = document.getElementById('civitai-ranker-overlay'); }
    isOverlayOpen = !isOverlayOpen;
    if (isOverlayOpen) { toggleJudgeReviewedFilter(true); updateOverlayContent(); overlay.classList.add('active'); }
    else { overlay.classList.remove('active'); document.querySelectorAll('.cr-details-popup.active').forEach(p => p.classList.remove('active')); }
}

// ============================================================
// FILTER / CONTROLS
// ============================================================

function toggleJudgeReviewedFilter(enable) {
    const btns = Array.from(document.querySelectorAll('button'));
    const filterBtn = btns.find(b => b.innerText.includes('Filters'));
    if (!filterBtn) return;
    filterBtn.click();
    setTimeout(() => {
        const items = Array.from(document.querySelectorAll('label, span, div'));
        const jOpt = items.find(i => i.innerText?.trim() === 'Judge Reviewed');
        if (jOpt) { const w = jOpt.closest('[data-checked]') || jOpt.closest('button'); if (enable && (!w || w.getAttribute('data-checked') !== 'true')) jOpt.click(); }
        document.body.click();
    }, 500);
}

function injectControls() {
    if (!window.location.href.includes('/challenges/')) { const e = document.getElementById('civitai-ranker-controls'); if (e) e.remove(); return; }
    if (document.getElementById('civitai-ranker-controls')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'civitai-ranker-controls';
    const btn = document.createElement('button');
    btn.id = 'civitai-ranker-toggle';
    btn.innerText = "🏆";
    btn.title = "Show Top 20";
    let isDragging = false, threshold = 5, sX, sY;
    const savedPos = localStorage.getItem('civitai-ranker-pos');
    if (savedPos) { try { const { left, top } = JSON.parse(savedPos); if (parseFloat(left) >= 0 && parseFloat(left) < window.innerWidth - 50 && parseFloat(top) >= 0 && parseFloat(top) < window.innerHeight - 50) { wrapper.style.left = left; wrapper.style.top = top; wrapper.style.bottom = 'auto'; wrapper.style.right = 'auto'; } } catch (e) { } }
    btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); sX = e.clientX; sY = e.clientY; isDragging = false;
        const r = wrapper.getBoundingClientRect(), oX = e.clientX - r.left, oY = e.clientY - r.top;
        wrapper.style.transition = 'none'; wrapper.style.bottom = 'auto'; wrapper.style.right = 'auto';
        const mm = (e) => { if (!isDragging && (Math.abs(e.clientX - sX) > threshold || Math.abs(e.clientY - sY) > threshold)) { isDragging = true; btn.style.cursor = 'grabbing'; } if (isDragging) { wrapper.style.left = Math.max(0, Math.min(e.clientX - oX, window.innerWidth - wrapper.offsetWidth)) + 'px'; wrapper.style.top = Math.max(0, Math.min(e.clientY - oY, window.innerHeight - wrapper.offsetHeight)) + 'px'; } };
        const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); btn.style.cursor = 'pointer'; wrapper.style.transition = ''; if (isDragging) { localStorage.setItem('civitai-ranker-pos', JSON.stringify({ left: wrapper.style.left, top: wrapper.style.top })); setTimeout(() => isDragging = false, 50); } };
        document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
    });
    btn.addEventListener('click', () => { if (!isDragging) toggleOverlay(); });
    wrapper.appendChild(btn); document.body.appendChild(wrapper);
}

function checkChallengeChange() {
    const m = window.location.href.match(/\/challenges\/(\d+)/);
    const newId = m ? m[1] : null;
    if (newId) {
        if (currentChallengeId && newId !== currentChallengeId) { rankedItemsMap.clear(); judgeDataMap.clear(); fetchStatus = 'idle'; fetchDiagnostic = ''; hasAutoActivatedJudge = false; if (isOverlayOpen) updateOverlayContent(); }
        currentChallengeId = newId;
        if (!hasAutoActivatedJudge) { hasAutoActivatedJudge = true; setTimeout(() => toggleJudgeReviewedFilter(true), 1000); }
    } else { hasAutoActivatedJudge = false; }
}

function init() {
    checkChallengeChange(); injectControls(); createOverlay();
    if (observer) observer.disconnect();
    observer = new MutationObserver(mutations => {
        if (mutations.some(m => m.addedNodes.length > 0)) {
            checkChallengeChange();
            if (!window.location.href.includes('/challenges/')) return;
            if (scanForNewCards() && isOverlayOpen) { if (window._crUT) clearTimeout(window._crUT); window._crUT = setTimeout(updateOverlayContent, 1000); }
        }
    });
    observer.observe(document.querySelector('.scroll-area') || document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
setInterval(() => {
    checkChallengeChange();
    if (window.location.href.includes('/challenges/')) { if (!document.getElementById('civitai-ranker-controls')) init(); }
    else { const e = document.getElementById('civitai-ranker-controls'); if (e) e.remove(); }
}, 2000);
