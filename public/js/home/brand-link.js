// The brand in the header links to the home page.
export function initBrandLink() {
	const brand = document.querySelector('header .brand');
	if (!brand) return;
	brand.style.cursor = 'pointer';
	brand.setAttribute('role', 'link');
	brand.setAttribute('tabindex', '0');
	brand.setAttribute('aria-label', 'Zur Startseite');
	const go = () => {
		location.href = '/';
	};
	brand.addEventListener('click', (e) => {
		if (e.target.closest('a,button') && e.target.closest('a,button') !== brand) return;
		go();
	});
	brand.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			go();
		}
	});
}
