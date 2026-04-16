// Challenge Rank Extension — Overlay Module
// Main overlay UI: header, podium, grid, top 20 cards

// ============================================================
// OVERLAY CREATION
// ============================================================

function createOverlay() {
    if (document.getElementById('civitai-ranker-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'civitai-ranker-overlay';
    const header = document.createElement('div');
    header.className = 'cr-header';
    const title = document.createElement('h2');
    title.id = 'cr-header-title';
    title.textContent = 'Top Ranked Images';
    header.appendChild(title);

    // Progress Indicator
    const progress = document.createElement('div');
    progress.id = 'cr-scan-progress';
    progress.className = 'cr-scan-progress';
    progress.textContent = '(Scanned: 0)';
    header.appendChild(progress);

    // Stats indicators
    const statsBar = document.createElement('div');
    statsBar.className = 'cr-header-stats';
    statsBar.id = 'cr-header-stats';
    const tensStat = document.createElement('div');
    tensStat.className = 'cr-stat cr-stat-tens';
    tensStat.id = 'cr-stat-tens';
    tensStat.innerHTML = '🔟 <span>0</span> perfect';
    tensStat.title = '0 images scored 10/10';
    statsBar.appendChild(tensStat);
    const userStat = document.createElement('div');
    userStat.className = 'cr-stat cr-stat-user';
    userStat.id = 'cr-stat-user';
    userStat.innerHTML = '👤 <span>—</span>';
    userStat.title = 'Your rated images';
    statsBar.appendChild(userStat);
    const cdStat = document.createElement('div');
    cdStat.className = 'cr-stat cr-stat-cd';
    cdStat.id = 'cr-stat-cd';
    cdStat.innerHTML = '⏳ <span>—</span>';
    cdStat.title = 'Cooldown status';
    statsBar.appendChild(cdStat);
    header.appendChild(statsBar);

    // Controls container
    const controls = document.createElement('div');
    controls.className = 'cr-header-controls';

    const label = document.createElement('span');
    label.textContent = 'Show Top:';
    label.className = 'cr-control-label';
    controls.appendChild(label);

    const select = document.createElement('select');
    select.id = 'cr-max-items-select';
    select.className = 'cr-max-select';
    [10, 20, 50, 100].forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        if (val === maxRankedItems) opt.selected = true;
        select.appendChild(opt);
    });
    select.addEventListener('change', (e) => {
        maxRankedItems = parseInt(e.target.value, 10);
        localStorage.setItem('cr-max-items', maxRankedItems);
        updateOverlayContent();
    });
    controls.appendChild(select);
    header.appendChild(controls);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cr-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', toggleOverlay);
    header.appendChild(closeBtn);
    overlay.appendChild(header);
    // Theme hints container (hidden by default)
    const themeHintsSection = document.createElement('div');
    themeHintsSection.id = 'cr-theme-hints-section';
    themeHintsSection.style.display = 'none';
    overlay.appendChild(themeHintsSection);

    // Podium container (hidden by default, shown for completed challenges)
    const podiumSection = document.createElement('div');
    podiumSection.id = 'cr-podium-section';
    podiumSection.className = 'cr-podium-section';
    podiumSection.style.display = 'none';
    overlay.appendChild(podiumSection);

    const grid = document.createElement('div');
    grid.className = 'cr-grid';
    overlay.appendChild(grid);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) toggleOverlay(); });
    document.body.appendChild(overlay);
}

// ============================================================
// HELPER
// ============================================================

function buildImageUrl(imageUuid) {
    return `https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/${imageUuid}/width=450`;
}

// ============================================================
// DYNAMIC HEADER
// ============================================================

function updateOverlayHeader() {
    const title = document.getElementById('cr-header-title');
    if (!title) return;
    const status = challengeMetadata?.status;
    if (status === 'Completed') {
        title.innerHTML = '<span class="cr-status-badge cr-status-finished">🏁 Finished</span> Top Ranked';
    } else if (status === 'Active' || status === 'In Progress') {
        title.innerHTML = '<span class="cr-status-badge cr-status-live">🟢 LIVE</span> Top Ranked';
    } else if (status === 'Upcoming' || status === 'Pending' || status === 'Scheduled') {
        title.innerHTML = '<span class="cr-status-badge cr-status-upcoming">📅 Upcoming</span> Top Ranked';
    } else if (status) {
        title.innerHTML = `<span class="cr-status-badge cr-status-other">⏳ ${status}</span> Top Ranked`;
    } else {
        title.innerHTML = 'Top Ranked';
    }
    const progress = document.getElementById('cr-scan-progress');
    if (progress) progress.textContent = `(Scanned: ${rankedItemsMap.size})`;

    // Update stats indicators
    const tensEl = document.getElementById('cr-stat-tens');
    if (tensEl) {
        const count = countPerfectTens();
        tensEl.innerHTML = `🔟 <span>${count}</span> perfect`;
        tensEl.title = `${count} image${count !== 1 ? 's' : ''} scored 10/10`;
    }
    const userEl = document.getElementById('cr-stat-user');
    if (userEl) {
        const stats = getUserStats();
        if (stats) {
            let html = `👤 <span>${stats.count}</span> rated`;
            if (stats.scores.length > 0) {
                const show = stats.scores.slice(0, 5);
                html += ` · ${show.join(', ')}`;
                if (stats.scores.length > 5) html += ` <span class="cr-stat-more">+${stats.scores.length - 5}</span>`;
            }
            userEl.innerHTML = html;
            userEl.title = `${currentLoggedInUser}: ${stats.count} image${stats.count !== 1 ? 's' : ''} rated`;
        } else {
            userEl.innerHTML = '👤 <span>—</span>';
            userEl.title = 'Login to see your stats';
        }
    }

    // Update cooldown indicator
    const cdEl = document.getElementById('cr-stat-cd');
    if (cdEl) {
        if (currentLoggedInUser && cooldownDataMap.size > 0) {
            const cd = cooldownDataMap.get(currentLoggedInUser);
            if (cd && cd.freeOn) {
                const now = new Date();
                const free = new Date(cd.freeOn + 'T00:00:00');
                const diffMs = free - now;
                if (diffMs > 0) {
                    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                    cdEl.innerHTML = `🔴 <span>${days}d</span> cooldown`;
                    cdEl.title = `On cooldown until ${cd.freeOn} (won "${cd.challengeTitle || '?'}")`;
                    cdEl.className = 'cr-stat cr-stat-cd cr-stat-cd-active';
                } else {
                    cdEl.innerHTML = '✅ <span>Clear</span>';
                    cdEl.title = 'No active cooldown';
                    cdEl.className = 'cr-stat cr-stat-cd cr-stat-cd-clear';
                }
            } else {
                cdEl.innerHTML = '✅ <span>Clear</span>';
                cdEl.title = 'No active cooldown';
                cdEl.className = 'cr-stat cr-stat-cd cr-stat-cd-clear';
            }
        } else if (currentLoggedInUser) {
            cdEl.innerHTML = '✅ <span>Clear</span>';
            cdEl.title = 'No active cooldown';
            cdEl.className = 'cr-stat cr-stat-cd cr-stat-cd-clear';
        } else {
            cdEl.innerHTML = '⏳ <span>—</span>';
            cdEl.title = 'Login to see cooldown status';
            cdEl.className = 'cr-stat cr-stat-cd';
        }
    }
}

// ============================================================
// PODIUM (completed challenges only)
// ============================================================

function renderPodium() {
    const section = document.getElementById('cr-podium-section');
    if (!section) return;
    if (!challengeMetadata || challengeMetadata.status !== 'Completed' || !challengeMetadata.winners?.length) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    section.innerHTML = '';
    const podiumTitle = document.createElement('div');
    podiumTitle.className = 'cr-podium-title';
    podiumTitle.textContent = '🏆 Official Podium';
    section.appendChild(podiumTitle);
    const grid = document.createElement('div');
    grid.className = 'cr-podium-grid';
    const medals = ['🥇', '🥈', '🥉'];
    const placeColors = ['#ffd43b', '#adb5bd', '#cd7f32'];
    for (const winner of challengeMetadata.winners.sort((a, b) => a.place - b.place)) {
        const card = document.createElement('div');
        card.className = 'cr-podium-card';
        card.style.borderColor = placeColors[winner.place - 1] || '#373a40';
        card.addEventListener('click', () => window.open(`${window.location.origin}/images/${winner.imageId}`, '_blank'));
        // Medal badge
        const medal = document.createElement('div');
        medal.className = 'cr-podium-place';
        medal.textContent = medals[winner.place - 1] || `#${winner.place}`;
        card.appendChild(medal);
        // Image
        const img = document.createElement('img');
        img.className = 'cr-podium-img';
        img.src = buildImageUrl(winner.imageUrl);
        img.loading = 'lazy';
        card.appendChild(img);
        // Info block
        const info = document.createElement('div');
        info.className = 'cr-podium-info';
        const name = document.createElement('div');
        name.className = 'cr-podium-username';
        if (challengeMetadata?.status !== 'Completed' && cooldownUsernames.has(winner.username)) {
            name.classList.add('cr-podium-username-cooldown');
        }
        name.textContent = winner.username;
        info.appendChild(name);
        // Score details
        if (winner.judgeScore) {
            const scoreRow = document.createElement('div');
            scoreRow.className = 'cr-podium-scores';
            const js = winner.judgeScore;
            const weighted = ((js.theme || 0) * 0.5 + (js.wittiness || 0) * 0.15 + (js.humor || 0) * 0.15 + (js.aesthetic || 0) * 0.2).toFixed(1);
            scoreRow.innerHTML = `<span class="cr-podium-score-total">⭐ ${weighted}</span> <span class="cr-podium-score-detail">T:${js.theme} W:${js.wittiness} H:${js.humor} A:${js.aesthetic}</span>`;
            info.appendChild(scoreRow);
        }
        // Prizes
        const prizes = document.createElement('div');
        prizes.className = 'cr-podium-prizes';
        prizes.textContent = `💰 ${winner.buzzAwarded?.toLocaleString() || '?'} Buzz · ${winner.pointsAwarded || '?'} pts`;
        info.appendChild(prizes);
        // Reason (truncated)
        if (winner.reason) {
            const reason = document.createElement('div');
            reason.className = 'cr-podium-reason';
            const cleanReason = winner.reason.replace(/^\d+(?:st|nd|rd|th):\s*/i, '');
            reason.textContent = cleanReason.length > 120 ? cleanReason.substring(0, 120) + '…' : cleanReason;
            reason.title = cleanReason;
            info.appendChild(reason);
        }
        card.appendChild(info);
        grid.appendChild(card);
    }
    section.appendChild(grid);
    // Separator
    const sep = document.createElement('div');
    sep.className = 'cr-separator';
    sep.innerHTML = `<span>Top ${maxRankedItems} — Ranked by score</span>`;
    section.appendChild(sep);
}

function renderCooldownReminder() {
    // Only show reminder for active challenges
    if (challengeMetadata?.status === 'Completed') return;

    let section = document.getElementById('cr-cooldown-reminder');
    if (!section) {
        section = document.createElement('div');
        section.id = 'cr-cooldown-reminder';
        section.className = 'cr-cooldown-reminder';

        // Insert it right after the header (or theme hints)
        const hints = document.getElementById('cr-theme-hints-section');
        if (hints && hints.nextSibling) {
            hints.parentNode.insertBefore(section, hints.nextSibling);
        } else {
            const header = document.querySelector('.cr-header');
            if (header && header.nextSibling) {
                header.parentNode.insertBefore(section, header.nextSibling);
            }
        }
    }

    // Check if any visible item on the board is actually in cooldown
    const visibleUsernames = Array.from(rankedItemsMap.values()).map(i => i.judgeData?.username).filter(Boolean);
    const hasVisibleCooldown = visibleUsernames.some(u => cooldownUsernames.has(u));

    if (hasVisibleCooldown) {
        section.style.display = 'block';
        section.innerHTML = `⚠️ <span style="color:#ff6b6b; font-weight:bold;">Red usernames</span> indicates authors who are currently under cooldown.`;
    } else {
        section.style.display = 'none';
    }
}

function renderThemeHints() {
    const section = document.getElementById('cr-theme-hints-section');
    if (!section) return;

    if (!challengeMetadata?.themeElements || challengeMetadata.themeElements.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'flex';
    section.className = 'cr-theme-hints';
    section.innerHTML = '';

    const label = document.createElement('div');
    label.className = 'cr-theme-hints-label';
    label.textContent = '🎨 Scoring Hints:';
    section.appendChild(label);

    challengeMetadata.themeElements.forEach(hint => {
        const pill = document.createElement('div');
        pill.className = 'cr-theme-hint-pill';
        pill.textContent = hint;
        section.appendChild(pill);
    });
}

// ============================================================
// UPDATE OVERLAY CONTENT
// ============================================================

function updateOverlayContent() {
    scanForNewCards();
    const isCompleted = challengeMetadata?.status === 'Completed';
    const list = isCompleted ? getRankedTop20() : getTop20();
    const grid = document.querySelector('#civitai-ranker-overlay .cr-grid');
    if (!grid) return;
    grid.innerHTML = '';
    updateOverlayHeader();
    renderThemeHints();
    renderCooldownReminder();
    renderPodium();
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
        // Use ex-aequo rank for completed challenges, sequential index for active
        const displayRank = isCompleted ? item.rank : (index + 1);
        rankBadge.textContent = `#${displayRank}`;
        card.appendChild(rankBadge);

        const img = document.createElement('img');
        img.className = 'cr-card-img';
        img.src = item.imgSrc;
        img.loading = 'lazy';
        card.appendChild(img);

        // Author name bar
        const authorBar = document.createElement('div');
        authorBar.className = 'cr-card-author';
        const uName = item.judgeData?.username;
        authorBar.textContent = uName || '…';
        if (uName && challengeMetadata?.status !== 'Completed' && cooldownUsernames.has(uName)) {
            authorBar.classList.add('cr-card-author-cooldown');
        }
        card.appendChild(authorBar);

        const popup = document.createElement('div');
        popup.className = 'cr-details-popup';
        popup.id = `cr-popup-${item.id}`;
        popup.addEventListener('click', (e) => e.stopPropagation());
        fillPopupContent(popup, item);
        card.appendChild(popup);
        grid.appendChild(card);
    });

    // Multiple refresh waves to catch async-loaded names
    setTimeout(() => { if (isOverlayOpen) refreshPopups(); }, 1500);
    setTimeout(() => { if (isOverlayOpen) refreshPopups(); }, 4000);
    setTimeout(() => { if (isOverlayOpen) refreshPopups(); }, 10000);
}

// ============================================================
// TOGGLE OVERLAY
// ============================================================

function toggleOverlay() {
    let overlay = document.getElementById('civitai-ranker-overlay');
    if (!overlay) { createOverlay(); overlay = document.getElementById('civitai-ranker-overlay'); }
    isOverlayOpen = !isOverlayOpen;
    if (isOverlayOpen) { toggleJudgeReviewedFilter(true); updateOverlayContent(); overlay.classList.add('active'); }
    else { overlay.classList.remove('active'); document.querySelectorAll('.cr-details-popup.active').forEach(p => p.classList.remove('active')); }
}
