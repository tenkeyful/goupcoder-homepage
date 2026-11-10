const SITE_ORIGIN = "https://test.upcoder.xyz";
const SESSION_PATH_PREFIX = "/'index.php/";
const HOME_URL = `${SITE_ORIGIN}/`;

const URL_HISTORY_KEY = "recentUpcoderSessionUrls";
const STARTUP_CANDIDATES_KEY = "upcoderStartupCandidates";
const STARTUP_ALARM = "scan-restored-upcoder-tabs";

const MAX_URL_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SAVED_URLS = 100;
const STARTUP_SCAN_DELAY_MS = 12_000;

const newlyCreatedTabIds = new Set();

function isSessionUrl(value) {
    try {
        const url = new URL(value);

        return (
            url.origin === SITE_ORIGIN &&
            url.pathname.startsWith(SESSION_PATH_PREFIX)
        );
    } catch {
        return false;
    }
}

async function rememberSessionUrl(value) {
    if (!isSessionUrl(value)) return;

    const now = Date.now();
    const stored = await browser.storage.local.get(URL_HISTORY_KEY);
    const history = stored[URL_HISTORY_KEY] || {};

    history[value] = now;

    const recentEntries = Object.entries(history)
        .filter(
            ([, timestamp]) =>
                Number.isFinite(timestamp) &&
                now - timestamp <= MAX_URL_AGE_MS
        )
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_SAVED_URLS);

    await browser.storage.local.set({
        [URL_HISTORY_KEY]: Object.fromEntries(recentEntries)
    });
}

async function redirectKnownSessionTab(tabId, value) {
    if (!isSessionUrl(value)) return;

    const stored = await browser.storage.local.get(URL_HISTORY_KEY);
    const history = stored[URL_HISTORY_KEY] || {};
    const timestamp = history[value];

    if (
        !Number.isFinite(timestamp) ||
        Date.now() - timestamp > MAX_URL_AGE_MS
    ) {
        return;
    }

    // Do not redirect if the tab has already navigated somewhere else.
    const tab = await browser.tabs.get(tabId);

    if (tab.url !== value && tab.pendingUrl !== value) return;

    await browser.tabs.update(tabId, {
        url: HOME_URL,
        loadReplace: true
    });
}

// A restored tab can already have its URL, or it can start as about:blank.
browser.tabs.onCreated.addListener((tab) => {
    if (tab.id === undefined) return;

    const initialUrl = tab.pendingUrl || tab.url;

    if (!initialUrl || initialUrl === "about:blank") {
        newlyCreatedTabIds.add(tab.id);
        return;
    }

    if (isSessionUrl(initialUrl)) {
        void redirectKnownSessionTab(tab.id, initialUrl).catch((error) => {
            console.error("goUPCoder:", error);
        });
    }
});

// Capture URL changes and detect the final URL of newly created/restored tabs.
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const currentUrl = changeInfo.url || tab.pendingUrl || tab.url;

    if (currentUrl && newlyCreatedTabIds.has(tabId)) {
        if (isSessionUrl(currentUrl)) {
            newlyCreatedTabIds.delete(tabId);

            void redirectKnownSessionTab(tabId, currentUrl).catch((error) => {
                console.error("goUPCoder:", error);
            });
        } else if (changeInfo.url && currentUrl !== "about:blank") {
            newlyCreatedTabIds.delete(tabId);
        }
    }

    if (currentUrl) {
        void rememberSessionUrl(currentUrl).catch((error) => {
            console.error("goUPCoder:", error);
        });
    }
});

browser.tabs.onRemoved.addListener((tabId) => {
    newlyCreatedTabIds.delete(tabId);
});

// Seed URL history when the extension is installed or updated.
browser.runtime.onInstalled.addListener(async () => {
    try {
        const tabs = await browser.tabs.query({
            url: `${SITE_ORIGIN}/*`
        });

        await Promise.all(
            tabs.map((tab) => rememberSessionUrl(tab.url))
        );
    } catch (error) {
        console.error("goUPCoder:", error);
    }
});

// Snapshot previously recorded URLs when the browser starts.
browser.runtime.onStartup.addListener(async () => {
    try {
        const now = Date.now();

        const stored = await browser.storage.local.get(URL_HISTORY_KEY);
        const history = stored[URL_HISTORY_KEY] || {};

        const candidates = Object.entries(history)
            .filter(
                ([, timestamp]) =>
                    Number.isFinite(timestamp) &&
                    now - timestamp <= MAX_URL_AGE_MS
            )
            .map(([url]) => url);

        await browser.storage.local.set({
            [STARTUP_CANDIDATES_KEY]: candidates
        });

        await browser.alarms.create(STARTUP_ALARM, {
            when: now + STARTUP_SCAN_DELAY_MS
        });
    } catch (error) {
        console.error("goUPCoder:", error);
    }
});

// Redirect only exact previously recorded session URLs after startup.
browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== STARTUP_ALARM) return;

    try {
        const stored = await browser.storage.local.get(
            STARTUP_CANDIDATES_KEY
        );

        const candidates = new Set(
            stored[STARTUP_CANDIDATES_KEY] || []
        );

        const tabs = await browser.tabs.query({
            url: `${SITE_ORIGIN}${SESSION_PATH_PREFIX}*`
        });

        for (const tab of tabs) {
            if (
                tab.id !== undefined &&
                tab.url &&
                candidates.has(tab.url)
            ) {
                await browser.tabs.update(tab.id, {
                    url: HOME_URL,
                    loadReplace: true
                });
            }
        }
    } catch (error) {
        console.error("goUPCoder:", error);
    } finally {
        await browser.storage.local.remove(
            STARTUP_CANDIDATES_KEY
        );

        await browser.alarms.clear(STARTUP_ALARM);
    }
});
