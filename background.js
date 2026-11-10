const SITE_ORIGIN = "https://test.upcoder.xyz";
const TAB_URL_KEY = "goUPCoderLastUrl";

const restoredTabs = new Map();
const redirectingTabs = new Set();

function isUpcoderUrl(value) {
	try { return new URL(value).origin === SITE_ORIGIN;
	} catch {return false}
}

function isWebUrl(value) { // not UPCoder urls
	try { return new URL(value).protocol === "https:";
	} catch {return false}
}

// remember the last UPCoder url associated with this tab
async function rememberTabUrl(tabId, url) {
	try {
		if (isUpcoderUrl(url)) {
			await browser.sessions.setTabValue(tabId, TAB_URL_KEY, url);
		} else if (isWebUrl(url)) {
			await browser.sessions.removeTabValue(tabId, TAB_URL_KEY);
		}
	} catch (error) {console.error("goUPCoder:", error)}
}

async function redirectToHomepage(tabId) {
	if (redirectingTabs.has(tabId)) return;
	redirectingTabs.add(tabId);

	try {
		await browser.tabs.update(tabId, {
			url: `${SITE_ORIGIN}/`,
			loadReplace: true,
		});
	} catch (error) {console.error("goUPCoder:", error);
	} finally {redirectingTabs.delete(tabId)}
}

// detect tabs restored using Ctrl + Shift + T
browser.tabs.onCreated.addListener(async (tab) => {
	try {
		if (tab.id === undefined) return;

		const savedUrl = await browser.sessions.getTabValue(tab.id, TAB_URL_KEY);
		if (typeof savedUrl !== "string" || !isUpcoderUrl(savedUrl)) {return}

		restoredTabs.set(tab.id, savedUrl);

		const currentTab = await browser.tabs.get(tab.id);
		const currentUrl = currentTab.pendingUrl || currentTab.url || tab.pendingUrl || tab.url;

		if (isUpcoderUrl(currentUrl)) {
			restoredTabs.delete(tab.id);
			await redirectToHomepage(tab.id);
		} else if (isWebUrl(currentUrl)) {
			restoredTabs.delete(tab.id);
		}
	} catch (error) {console.error("goUPCoder:", error)}
});

// detect when a restored tab receives its actual url
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	const currentUrl = changeInfo.url || tab.pendingUrl || tab.url;
	if (!currentUrl) return;

	const savedUrl = restoredTabs.get(tabId);

	if (savedUrl) {
		if (isUpcoderUrl(currentUrl)) {
			restoredTabs.delete(tabId);
			void redirectToHomepage(tabId);
			return;
		} else if (isWebUrl(currentUrl)) {
			restoredTabs.delete(tabId);
		}
	}

	void rememberTabUrl(tabId, currentUrl);
});

browser.tabs.onRemoved.addListener((tabId) => {
	restoredTabs.delete(tabId);
	redirectingTabs.delete(tabId);
});

// check UPCoder tabs when the browser starts
browser.runtime.onStartup.addListener(async () => {
	try {
		const tabs = await browser.tabs.query({url: `${SITE_ORIGIN}/*`});

		for (const tab of tabs) {
			if (tab.id === undefined) continue;
			void redirectToHomepage(tab.id);
		}
	} catch (error) {console.error("goUPCoder:", error)}
});

// save the urls of UPCoder tabs already open when installed or updated
browser.runtime.onInstalled.addListener(async () => {
	try {
		const tabs = await browser.tabs.query({ url: `${SITE_ORIGIN}/*` });

		await Promise.all(
			tabs.map((tab) => {
				if (tab.id === undefined || !tab.url) return;
				return browser.sessions.setTabValue(tab.id, TAB_URL_KEY, tab.url);
			}),
		);
	} catch (error) {console.error("goUPCoder:", error)}
});