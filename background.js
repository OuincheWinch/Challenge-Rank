// Background Service Worker — uses chrome.scripting to access page React state

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchJudgeData') {
        fetchJudgeData(request.challengeId)
            .then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (request.action === 'fetchChallengeMetadata') {
        fetchChallengeMetadata(request.challengeId)
            .then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (request.action === 'fetchCooldownData') {
        fetchCooldownData()
            .then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (request.action === 'fetchCurrentUser') {
        fetchCurrentUser(request.origin || 'https://civitai.com')
            .then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (request.action === 'extractReactData') {
        extractReactData(sender.tab.id, request.imageId)
            .then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

async function fetchJudgeData(challengeId) {
    const allItems = [];
    let cursor = undefined;
    for (let page = 0; page < 10; page++) {
        const input = { json: { challengeId: parseInt(challengeId), period: "AllTime", sort: "Newest", limit: 100, browsingLevel: 31 } };
        if (cursor) input.json.cursor = cursor;
        const url = `https://civitai.com/api/trpc/image.getInfinite?input=${encodeURIComponent(JSON.stringify(input))}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) break;
        const json = await res.json();
        const result = json?.result?.data?.json;
        if (!result?.items) break;
        for (const item of result.items) {
            allItems.push({ id: String(item.id), judgeScore: item.judgeScore || null, reason: item.reason || null, username: item.user?.username || null, stats: item.stats || null });
        }
        cursor = result.nextCursor;
        if (!cursor || result.items.length < 100) break;
    }
    return allItems;
}

async function fetchChallengeMetadata(challengeId) {
    const input = { json: { id: parseInt(challengeId) } };
    const url = `https://civitai.com/api/trpc/challenge.getById?input=${encodeURIComponent(JSON.stringify(input))}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json?.result?.data?.json;
    if (!data) throw new Error('No challenge data found');
    return {
        status: data.status || 'Unknown',
        winners: (data.winners || []).map(w => ({
            place: w.place,
            username: w.username,
            userId: w.userId,
            imageId: w.imageId,
            imageUrl: w.imageUrl,
            reason: w.reason,
            judgeScore: w.judgeScore,
            buzzAwarded: w.buzzAwarded,
            pointsAwarded: w.pointsAwarded,
            profilePicture: w.profilePicture
        })),
        endsAt: data.endsAt,
        completionSummary: data.completionSummary,
        themeElements: data.themeElements || [],
        theme: data.theme || null
    };
}

async function fetchCooldownData() {
    const url = 'https://www.ouinche.com/dailychallenge/challenges.json';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const cooldowns = json.cooldowns || [];
    return cooldowns.map(c => ({
        username: c.username,
        freeOn: c.freeOn || null,
        challengeTitle: c.challengeTitle || null
    }));
}

async function fetchCurrentUser(origin) {
    const url = `${origin}/api/auth/session`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return { username: json?.user?.username || json?.user?.name || null };
}

async function extractReactData(tabId, imageId) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (targetImageId) => {
            const output = { found: false, judgeScore: null, reason: null, username: null, allJudgeData: [], debug: '' };

            try {
                // Find React fiber key on ANY element
                let fiberKey = null;
                const candidates = [
                    document.getElementById('__next'),
                    document.querySelector('[id^="radix-"]'),
                    document.querySelector('main'),
                    document.body.firstElementChild,
                    document.body
                ];

                // Also try card-like elements
                const imgLinks = document.querySelectorAll('a[href*="/images/"]');
                if (imgLinks.length > 0) candidates.push(imgLinks[0]);

                for (const el of candidates) {
                    if (!el) continue;
                    const key = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
                    if (key) {
                        fiberKey = key;
                        output.debug += `Fiber found on: ${el.tagName}#${el.id || ''} key=${key.substring(0, 25)}\n`;
                        break;
                    }
                }

                // If not found on standard elements, brute force first 30 DOM elements
                if (!fiberKey) {
                    const allEls = document.querySelectorAll('*');
                    for (let i = 0; i < Math.min(allEls.length, 50); i++) {
                        const key = Object.keys(allEls[i]).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
                        if (key) {
                            fiberKey = key;
                            output.debug += `Fiber found on element[${i}]: ${allEls[i].tagName}#${allEls[i].id || ''}.${allEls[i].className?.toString().substring(0, 30) || ''}\n`;
                            break;
                        }
                    }
                }

                if (!fiberKey) {
                    // Check if it uses a different prefix
                    const body = document.body;
                    const allKeys = Object.keys(body);
                    const reactKeys = allKeys.filter(k => k.startsWith('__react') || k.startsWith('_react'));
                    output.debug += `No fiber. body keys with react: [${reactKeys.join(', ')}]\n`;

                    // Try first 5 elements
                    for (let i = 0; i < Math.min(5, document.body.children.length); i++) {
                        const el = document.body.children[i];
                        const keys = Object.keys(el).filter(k => k.includes('react') || k.includes('fiber') || k.includes('__'));
                        if (keys.length > 0) output.debug += `body.child[${i}] keys: [${keys.join(', ')}]\n`;
                    }
                    return output;
                }

                // Walk fiber tree from the found element
                const startEl = candidates.find(el => el && el[fiberKey]) || document.querySelector('*');
                let fiber = startEl[fiberKey];

                // Walk UP to root first
                while (fiber.return) fiber = fiber.return;

                // Now walk DOWN through entire tree
                const queue = [fiber];
                let visited = 0;

                while (queue.length > 0 && visited < 10000) {
                    const node = queue.shift();
                    if (!node) continue;
                    visited++;

                    // Check memoizedProps for judge data
                    const props = node.memoizedProps;
                    if (props && typeof props === 'object') {
                        // Direct judgeScore prop
                        if (props.judgeScore && typeof props.judgeScore === 'object' && props.judgeScore.theme !== undefined) {
                            output.allJudgeData.push({
                                id: String(props.id || props.imageId || ''),
                                judgeScore: props.judgeScore,
                                reason: props.reason || null,
                                username: null
                            });
                        }
                        // Check nested data
                        if (props.data && typeof props.data === 'object' && props.data.judgeScore) {
                            output.allJudgeData.push({
                                id: String(props.data.id || ''),
                                judgeScore: props.data.judgeScore,
                                reason: props.data.reason || null,
                                username: props.data.user?.username || null
                            });
                        }
                        // Check children-as-function pattern
                        if (props.image && typeof props.image === 'object' && props.image.judgeScore) {
                            output.allJudgeData.push({
                                id: String(props.image.id || ''),
                                judgeScore: props.image.judgeScore,
                                reason: props.image.reason || null,
                                username: props.image.user?.username || null
                            });
                        }
                    }

                    // Check memoizedState linked list
                    let state = node.memoizedState;
                    let sd = 0;
                    while (state && sd < 30) {
                        const ms = state.memoizedState;
                        if (ms && typeof ms === 'object') {
                            // React Query cache: data.pages[].items[]
                            const pages = ms.data?.pages || ms.pages;
                            if (pages && Array.isArray(pages)) {
                                for (const page of pages) {
                                    const items = page?.items || page;
                                    if (Array.isArray(items)) {
                                        for (const item of items) {
                                            if (item?.judgeScore && typeof item.judgeScore === 'object') {
                                                output.allJudgeData.push({
                                                    id: String(item.id),
                                                    judgeScore: item.judgeScore,
                                                    reason: item.reason || null,
                                                    username: item.user?.username || null
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                            // Direct judgeScore in state
                            if (ms.judgeScore && typeof ms.judgeScore === 'object') {
                                output.allJudgeData.push({
                                    id: String(ms.id || ''),
                                    judgeScore: ms.judgeScore,
                                    reason: ms.reason || null,
                                    username: ms.user?.username || null
                                });
                            }
                        }
                        state = state.next;
                        sd++;
                    }

                    if (node.child) queue.push(node.child);
                    if (node.sibling) queue.push(node.sibling);
                }

                output.debug += `Walked ${visited} nodes, found ${output.allJudgeData.length} items\n`;

                if (output.allJudgeData.length > 0) {
                    output.found = true;
                    const match = output.allJudgeData.find(d => String(d.id) === String(targetImageId));
                    if (match) {
                        output.judgeScore = match.judgeScore;
                        output.reason = match.reason;
                        output.username = match.username;
                    } else {
                        // Use first one for debugging
                        output.judgeScore = output.allJudgeData[0].judgeScore;
                        output.reason = output.allJudgeData[0].reason;
                    }
                }
            } catch (e) {
                output.debug += `Error: ${e.message}\n`;
            }
            return output;
        },
        args: [imageId]
    });

    return results[0]?.result || { found: false, debug: 'No result' };
}
