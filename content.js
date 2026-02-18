// Challenge Rank Extension - Content Script (Overlay Mode)

console.log("Challenge Rank: Persistent Overlay Mode Loaded");

let isOverlayOpen = false;
let observer = null;
let controlsInterval = null;
let currentChallengeId = null;

// Persistent storage for ranked items: Map<href, item>
const rankedItemsMap = new Map();

// --- Helper Functions ---

// Robust score extraction
function getRankFromCard(card) {
    // Strategy: Look for the badge that contains the solid star icon
    // The star icon class is usually 'tabler-icon-star-filled' or inside a badge section
    const badges = Array.from(card.querySelectorAll('.mantine-Badge-root'));

    for (const badge of badges) {
        // Check for star icon specific to Civitai scoring
        // We look for the SVG or the wrapper.
        const hasStar = badge.querySelector('.tabler-icon-star-filled') ||
            badge.querySelector('svg') && badge.innerHTML.includes('star-filled');

        if (hasStar) {
            const label = badge.querySelector('.mantine-Badge-label');
            if (label) {
                const text = label.innerText.trim();
                const val = parseFloat(text);
                // Ensure it's a valid number (0-10)
                if (!isNaN(val) && val >= 0 && val <= 10.0) return val;
            }
        }
    }
    return -1;
}

// Find all cards robustly
function scanForNewCards() {
    const links = Array.from(document.querySelectorAll('a[href^="/images/"]'));
    let newFound = 0;

    links.forEach(link => {
        const href = link.href;
        if (rankedItemsMap.has(href)) return;

        let card = link.closest('.m_4081bf90') ||
            link.closest('.mantine-Paper-root') ||
            link.closest('div.relative.flex-1');

        if (!card) {
            let p = link.parentElement;
            while (p && p.tagName !== 'BODY') {
                if (p.tagName === 'DIV' && (p.className.includes('Card') || p.className.includes('Paper'))) {
                    card = p;
                    break;
                }
                if (p.children.length > 5) break;
                p = p.parentElement;
            }
        }

        if (card) {
            const score = getRankFromCard(card);
            if (score > -1) {
                const img = card.querySelector('img');
                if (img) {
                    rankedItemsMap.set(href, {
                        score: score,
                        imgSrc: img.src,
                        href: href,
                        id: href.split('/').pop()
                    });
                    newFound++;
                }
            }
        }
    });

    return newFound > 0;
}


// --- Main Logic: Generate Top 20 ---

function getTop20() {
    const candidates = Array.from(rankedItemsMap.values());
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 20);
}

// --- Overlay UI Management ---

function createOverlay() {
    if (document.getElementById('civitai-ranker-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'civitai-ranker-overlay';
    overlay.style.display = 'none';

    overlay.innerHTML = `
        <div class="cr-header">
            <h2>Top 20 Ranked Images (Persistent)</h2>
            <button class="cr-close-btn">&times;</button>
        </div>
        <div class="cr-grid">
            <!-- Items injected here -->
        </div>
    `;

    overlay.querySelector('.cr-close-btn').onclick = toggleOverlay;
    document.body.appendChild(overlay);

    overlay.onclick = (e) => {
        if (e.target === overlay) toggleOverlay();
    };
}

function updateOverlayContent() {
    scanForNewCards();

    const list = getTop20();
    const grid = document.querySelector('.cr-grid');
    if (!grid) return;

    if (list.length === 0) {
        grid.innerHTML = '<div style="padding:20px; text-align:center; color:#909296;">No ranked images found yet. Ensure "Judge Reviewed" filter is active and scroll down.</div>';
    } else {
        grid.innerHTML = list.map((item, index) => `
            <div class="cr-card" onclick="window.open('${item.href}', '_blank')">
                <div class="cr-card-score">${item.score}</div>
                <div class="cr-card-rank">#${index + 1}</div>
                <img class="cr-card-img" src="${item.imgSrc}" alt="Ranked #${index + 1}" loading="lazy">
            </div>
        `).join('');
    }
}

// --- Interaction Logic ---

function toggleOverlay() {
    let overlay = document.getElementById('civitai-ranker-overlay');
    if (!overlay) {
        createOverlay();
        overlay = document.getElementById('civitai-ranker-overlay');
    }

    isOverlayOpen = !isOverlayOpen;

    if (isOverlayOpen) {
        toggleJudgeReviewedFilter(true);
        updateOverlayContent();
        overlay.classList.add('active');
        overlay.style.display = 'flex';
    } else {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
    }
}

// --- Filter Automator ---

function toggleJudgeReviewedFilter(enable) {
    const buttons = Array.from(document.querySelectorAll('button'));
    const filterBtn = buttons.find(b => b.innerText.includes('Filters'));
    if (!filterBtn) return;

    filterBtn.click();
    setTimeout(() => {
        const items = Array.from(document.querySelectorAll('label, span, div'));
        const judgeOption = items.find(i => i.innerText && i.innerText.trim() === 'Judge Reviewed');

        if (judgeOption) {
            const wrapper = judgeOption.closest('.mantine-Chip-root') || judgeOption.closest('button');
            const isChecked = wrapper && (wrapper.getAttribute('data-checked') === 'true' || wrapper.classList.contains('mantine-Chip-checked'));

            if (enable && !isChecked) judgeOption.click();
        }
        document.body.click();
    }, 500);
}


function injectControls() {
    // Only show on /challenges/ URLs
    if (!window.location.href.includes('/challenges/')) {
        const existing = document.getElementById('civitai-ranker-controls');
        if (existing) existing.remove();
        return;
    }

    if (document.getElementById('civitai-ranker-controls')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'civitai-ranker-controls';

    const btn = document.createElement('button');
    btn.id = 'civitai-ranker-toggle';
    btn.innerText = "🏆";
    btn.title = "Show Top 20";

    // DRAG LOGIC
    let isDragging = false;
    const dragThreshold = 5;
    let startX, startY;

    // Load saved position
    const savedPos = localStorage.getItem('civitai-ranker-pos');
    if (savedPos) {
        try {
            const { left, top } = JSON.parse(savedPos);
            // Validate bounds
            const l = parseFloat(left);
            const t = parseFloat(top);
            const maxL = window.innerWidth - 50;
            const maxT = window.innerHeight - 50;

            if (l >= 0 && l < maxL && t >= 0 && t < maxT) {
                wrapper.style.left = left;
                wrapper.style.top = top;
                wrapper.style.bottom = 'auto';
                wrapper.style.right = 'auto';
            } else {
                console.log("Challenge Rank: Button off-screen, resetting position.");
                wrapper.style.bottom = '20px';
                wrapper.style.right = '20px';
                wrapper.style.left = 'auto';
                wrapper.style.top = 'auto';
            }
        } catch (e) { }
    }

    // Attach drag handlers to BUTTON
    btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        startX = e.clientX;
        startY = e.clientY;
        isDragging = false;

        const rect = wrapper.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        wrapper.style.transition = 'none';
        wrapper.style.bottom = 'auto';
        wrapper.style.right = 'auto';

        function onMouseMove(e) {
            if (!isDragging) {
                const dx = Math.abs(e.clientX - startX);
                const dy = Math.abs(e.clientY - startY);
                if (dx > dragThreshold || dy > dragThreshold) {
                    isDragging = true;
                    btn.style.cursor = 'grabbing';
                }
            }

            if (isDragging) {
                let newLeft = e.clientX - offsetX;
                let newTop = e.clientY - offsetY;

                const maxLeft = window.innerWidth - wrapper.offsetWidth;
                const maxTop = window.innerHeight - wrapper.offsetHeight;

                newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                newTop = Math.max(0, Math.min(newTop, maxTop));

                wrapper.style.left = newLeft + 'px';
                wrapper.style.top = newTop + 'px';
            }
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            btn.style.cursor = 'pointer';
            wrapper.style.transition = '';

            if (isDragging) {
                localStorage.setItem('civitai-ranker-pos', JSON.stringify({
                    left: wrapper.style.left,
                    top: wrapper.style.top
                }));
                setTimeout(() => isDragging = false, 50);
            }
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    btn.addEventListener('click', (e) => {
        if (!isDragging) toggleOverlay();
    });

    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);
}


// --- Challenge Detection ---

function getChallengeIdFromUrl() {
    const match = window.location.href.match(/\/challenges\/(\d+)/);
    return match ? match[1] : null;
}

function checkChallengeChange() {
    const newId = getChallengeIdFromUrl();
    if (newId) {
        if (currentChallengeId !== null && newId !== currentChallengeId) {
            console.log(`Challenge Rank: Challenge changed. Resetting list.`);
            rankedItemsMap.clear();
            if (isOverlayOpen) updateOverlayContent();
        }
        currentChallengeId = newId;
    }
}

function init() {
    checkChallengeChange();

    injectControls();
    createOverlay();

    if (observer) observer.disconnect();
    const target = document.querySelector('.scroll-area') || document.body;
    observer = new MutationObserver(mutations => {
        if (mutations.some(m => m.addedNodes.length > 0)) {
            checkChallengeChange();

            if (!window.location.href.includes('/challenges/')) return;

            const added = scanForNewCards();
            if (isOverlayOpen && added) {
                if (window._updateTimeout) clearTimeout(window._updateTimeout);
                window._updateTimeout = setTimeout(updateOverlayContent, 1000);
            }
        }
    });
    observer.observe(target, { childList: true, subtree: true });
}


// --- Boot ---

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Periodic check for SPA nav
setInterval(() => {
    checkChallengeChange();
    if (window.location.href.includes('/challenges/')) {
        if (!document.getElementById('civitai-ranker-controls')) init();
    } else {
        const existing = document.getElementById('civitai-ranker-controls');
        if (existing) existing.remove();
    }
}, 2000);
