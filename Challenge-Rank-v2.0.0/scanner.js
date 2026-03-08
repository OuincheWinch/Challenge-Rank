// Challenge Rank Extension — Scanner Module
// Shared state, score detection, card scanning, data fetching, localStorage cache

console.log("Challenge Rank: Scanner Module Loaded");

// ============================================================
// SHARED STATE (used by all modules)
// ============================================================

let isOverlayOpen = false;
let observer = null;
let currentChallengeId = null;
let hasAutoActivatedJudge = false;
let challengeMetadata = null; // { status, winners[], endsAt, completionSummary, themeElements, theme }
let cooldownUsernames = new Set();

const rankedItemsMap = new Map();
const judgeDataMap = new Map();
let fetchStatus = 'idle';
let fetchDiagnostic = '';

// ============================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================

function crToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('cr-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'cr-toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `cr-toast cr-toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('cr-toast-show'));
    setTimeout(() => {
        toast.classList.remove('cr-toast-show');
        toast.addEventListener('transitionend', () => toast.remove());
        // Fallback removal if transitionend doesn't fire
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
    }, duration);
}

// ============================================================
// LOCALSTORAGE CACHE — judge data with TTL
// ============================================================

const CR_CACHE_PREFIX = 'cr-judge-cache-';
const CR_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function saveCacheForChallenge(challengeId) {
    if (judgeDataMap.size === 0) return;
    try {
        const data = { ts: Date.now(), items: Object.fromEntries(judgeDataMap) };
        localStorage.setItem(CR_CACHE_PREFIX + challengeId, JSON.stringify(data));
    } catch (e) { /* quota exceeded — silent fail */ }
}

function loadCacheForChallenge(challengeId) {
    try {
        const raw = localStorage.getItem(CR_CACHE_PREFIX + challengeId);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (Date.now() - data.ts > CR_CACHE_TTL) {
            localStorage.removeItem(CR_CACHE_PREFIX + challengeId);
            return false;
        }
        for (const [id, item] of Object.entries(data.items)) {
            if (!judgeDataMap.has(id)) judgeDataMap.set(id, item);
        }
        console.log(`CR: Loaded ${Object.keys(data.items).length} cached items for challenge #${challengeId}`);
        return true;
    } catch (e) { return false; }
}

function clearExpiredCaches() {
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key?.startsWith(CR_CACHE_PREFIX)) continue;
            try {
                const data = JSON.parse(localStorage.getItem(key));
                if (Date.now() - data.ts > CR_CACHE_TTL) localStorage.removeItem(key);
            } catch (e) { localStorage.removeItem(key); }
        }
    } catch (e) { /* silent */ }
}

// ============================================================
// FETCH judge data — bulk API + React state extraction
// ============================================================

async function fetchJudgeData(challengeId) {
    if (fetchStatus === 'fetching') return;
    fetchStatus = 'fetching';
    fetchDiagnostic = '';

    // Try cache first
    const hadCache = loadCacheForChallenge(challengeId);
    if (hadCache) fetchDiagnostic += `Cache: loaded\n`;

    // 1) Bulk API for usernames/stats
    try {
        const bulkRes = await chrome.runtime.sendMessage({ action: 'fetchJudgeData', challengeId });
        if (bulkRes?.success) {
            const items = bulkRes.data || [];
            for (const item of items) {
                if (!judgeDataMap.has(item.id)) judgeDataMap.set(item.id, item);
            }
            fetchDiagnostic += `Bulk: ${items.length} items\n`;
        } else {
            crToast('Failed to fetch judge data from API', 'error');
            fetchDiagnostic += `Bulk failed\n`;
        }
    } catch (e) {
        crToast(`API error: ${e.message}`, 'error');
        fetchDiagnostic += `Bulk error: ${e.message}\n`;
    }

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
    } catch (e) {
        crToast(`React extraction failed: ${e.message}`, 'warning');
        fetchDiagnostic += `React exception: ${e.message}\n`;
    }

    fetchStatus = 'done';
    console.log('CR DIAGNOSTIC:\n' + fetchDiagnostic);

    // Save to cache
    saveCacheForChallenge(challengeId);

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
// SCORE DETECTION — with robust fallback
// ============================================================

function findScoreOnCard(card) {
    // Strategy 1: SVG star icon detection (original)
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

    // Strategy 2: aria-label fallback
    const ariaEls = card.querySelectorAll('[aria-label]');
    for (const el of ariaEls) {
        const label = el.getAttribute('aria-label');
        const match = label?.match(/(?:score|rating|judge)[:\s]*(\d+(?:\.\d+)?)/i);
        if (match) {
            const val = parseFloat(match[1]);
            if (val >= 0 && val <= 10.0) return val;
        }
    }

    // Strategy 3: data-* attribute fallback
    const dataEls = card.querySelectorAll('[data-score], [data-rating], [data-judge-score]');
    for (const el of dataEls) {
        const val = parseFloat(el.dataset.score || el.dataset.rating || el.dataset.judgeScore);
        if (!isNaN(val) && val >= 0 && val <= 10.0) return val;
    }

    // Strategy 4: title attribute on score elements
    const titleEls = card.querySelectorAll('[title]');
    for (const el of titleEls) {
        const match = el.title.match(/(?:score|rating)[:\s]*(\d+(?:\.\d+)?)/i);
        if (match) {
            const val = parseFloat(match[1]);
            if (val >= 0 && val <= 10.0) return val;
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

let maxRankedItems = 20;
try {
    const savedLimit = localStorage.getItem('cr-max-items');
    if (savedLimit) maxRankedItems = parseInt(savedLimit, 10) || 20;
} catch (e) { }

function getTop20() { return Array.from(rankedItemsMap.values()).sort((a, b) => b.score - a.score).slice(0, maxRankedItems); }

// Ex-aequo dense ranking: same score = same rank, next distinct score = rank+1
function getRankedTop20() {
    const sorted = Array.from(rankedItemsMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, maxRankedItems);
    let rank = 1;
    sorted.forEach((item, i) => {
        if (i === 0) { item.rank = rank; }
        else if (item.score < sorted[i - 1].score) { rank++; item.rank = rank; }
        else { item.rank = rank; }
    });
    return sorted;
}
