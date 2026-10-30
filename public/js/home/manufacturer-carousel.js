(() => {
	const mfrs = [
		{ name: 'GO Setups', src: '/assets/manufacturers/go-setups.webp' },
		{ name: 'HYMO', src: '/assets/manufacturers/hymo-setups.webp' },
		{ name: 'beAlien', src: '/assets/manufacturers/bealien.webp' },
	];
	let mIdx = 0,
		mTimer = null;
	const mImg = document.getElementById('manufacturerImage');
	const renderMfr = (i) => {
		if (!mImg) return;
		mIdx = (i + mfrs.length) % mfrs.length;
		const item = mfrs[mIdx];
		mImg.style.opacity = '0';
		setTimeout(() => {
			mImg.src = item.src;
			mImg.alt = item.name;
			mImg.style.opacity = '1';
		}, 140);
	};
	const restartMfr = () => {
		if (mTimer) clearInterval(mTimer);
		mTimer = setInterval(() => renderMfr(mIdx + 1), 5000);
	};
	document.getElementById('manufacturerPrev')?.addEventListener('click', () => {
		renderMfr(mIdx - 1);
		restartMfr();
	});
	document.getElementById('manufacturerNext')?.addEventListener('click', () => {
		renderMfr(mIdx + 1);
		restartMfr();
	});
	renderMfr(0);
	restartMfr();
})();
