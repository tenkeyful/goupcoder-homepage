(() => {
	let clicked = false;

	function clickContinue() {
		if (clicked) return;

		// mũi tên cam ghi "BẤM VÀO ĐÂY ĐỂ TIẾP TỤC"
		const img = document.querySelector('img[src="https://test.upcoder.xyz/public/img/Continue.png"]');
		if (!img) return;

		clicked = true;
		console.log("goUPCoder: Orange arrow detected. Clicking immediately.");

		img.click();
		observer.disconnect();
	}

	const observer = new MutationObserver(() => {
		clickContinue();
	});

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ["src"],
	});

	// check immediately when script executes
	clickContinue();
})();
