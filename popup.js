// Challenge Rank Extension — Popup Module
// CivBot details popup panel

// ============================================================
// POPUP CONTENT
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
// TOGGLE DETAILS POPUP
// ============================================================

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
