(() => {
	const IMAGE_SELECTOR = 'img[src*="/public/img/Continue.png"]';

	let clicked = false;

	function clickContinue() {
		if (clicked) return;

		const img = document.querySelector(IMAGE_SELECTOR);

		if (!img) return;

		// Prevent duplicate clicks.
		clicked = true;

		console.log("goUPCoder: Continue image detected. Clicking immediately!");

		// Trigger the image's click handler immediately.
		img.click();

		// Stop watching after clicking.
		observer.disconnect();
	}

	// Watch for the image appearing in the page.
	const observer = new MutationObserver(() => {
		clickContinue();
	});

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ["src"],
	});

	// Also check immediately if the image already exists.
	clickContinue();
})();
