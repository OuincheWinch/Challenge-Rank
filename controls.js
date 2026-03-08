// Challenge Rank Extension — Controls Module
// Floating button, filter automation, lifecycle, throttled MutationObserver

// ============================================================
// FILTER AUTOMATION
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

// ============================================================
// FLOATING BUTTON (draggable)
// ============================================================

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

// ============================================================
// CHALLENGE CHANGE DETECTION
// ============================================================

function checkChallengeChange() {
    const m = window.location.href.match(/\/challenges\/(\d+)/);
    const newId = m ? m[1] : null;
    if (newId) {
        if (currentChallengeId && newId !== currentChallengeId) {
            rankedItemsMap.clear(); judgeDataMap.clear(); fetchStatus = 'idle'; fetchDiagnostic = '';
            hasAutoActivatedJudge = false; challengeMetadata = null;
            if (isOverlayOpen) updateOverlayContent();
        }
        currentChallengeId = newId;
        // Fetch challenge metadata if not yet loaded
        if (!challengeMetadata) {
            chrome.runtime.sendMessage({ action: 'fetchChallengeMetadata', challengeId: newId }).then(res => {
                if (res?.success) {
                    challengeMetadata = res.data;
                    console.log(`CR: Challenge #${newId} status=${challengeMetadata.status}, winners=${challengeMetadata.winners?.length || 0}`);
                    if (isOverlayOpen) updateOverlayContent();
                } else {
                    crToast('Could not load challenge info', 'warning');
                }
            }).catch(e => {
                console.log('CR: metadata fetch error:', e);
                crToast('Failed to detect challenge status', 'error');
            });
            // Fetch cooldowns
            chrome.runtime.sendMessage({ action: 'fetchCooldownData' }).then(res => {
                if (res?.success && res.data) {
                    cooldownUsernames = new Set(res.data);
                    if (isOverlayOpen) updateOverlayContent();
                }
            }).catch(e => {
                console.log('CR: cooldown fetch error:', e);
            });
        }
        if (!hasAutoActivatedJudge) { hasAutoActivatedJudge = true; setTimeout(() => toggleJudgeReviewedFilter(true), 1000); }
    } else { hasAutoActivatedJudge = false; }
}

// ============================================================
// THROTTLED MUTATION OBSERVER
// ============================================================

let _crMutationPending = false;
let _crMutationTimer = null;
const CR_MUTATION_DEBOUNCE = 500; // ms

function handleMutations() {
    if (_crMutationPending) return;
    _crMutationPending = true;

    const run = () => {
        _crMutationPending = false;
        checkChallengeChange();
        if (!window.location.href.includes('/challenges/')) return;
        if (scanForNewCards() && isOverlayOpen) {
            if (window._crUT) clearTimeout(window._crUT);
            window._crUT = setTimeout(updateOverlayContent, 1000);
        }
    };

    // Use requestIdleCallback when available for lower CPU impact
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: CR_MUTATION_DEBOUNCE });
    } else {
        if (_crMutationTimer) clearTimeout(_crMutationTimer);
        _crMutationTimer = setTimeout(run, CR_MUTATION_DEBOUNCE);
    }
}

// ============================================================
// INIT + LIFECYCLE
// ============================================================

function init() {
    checkChallengeChange(); injectControls(); createOverlay();
    clearExpiredCaches();

    if (observer) observer.disconnect();
    observer = new MutationObserver(mutations => {
        if (mutations.some(m => m.addedNodes.length > 0)) {
            handleMutations();
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
