import { createAccessCheck, logout } from './access.js';
import { initActions } from './actions.js';
import { initBrandLink } from './brand-link.js';
import { initBulkUpload, syncBulkUploadAccess } from './bulk-upload.js';
import { initCarPage, openSetupFromQuery, showCar, showHome, syncCarFilter } from './car-page.js';
import { initCatalog, loadData, observeCategories, refreshVehicleCounts } from './catalog.js';
import { initDatabaseAccess } from './database-access.js';
import { initDelete, openDeleteModal } from './delete.js';
import { initHeaderActions } from './header-actions.js';
import { initLogo, initManufacturerCarousel, initResize, moveUpcomingPanel } from './layout.js';
import { initOwnerNavEditor } from '../shared/owner-nav-editor.js';
import { setSetupActions } from './setup-list.js';
import { loadTheme, toggleTheme } from './theme-button.js';
import { initUpload } from './upload.js';
import { initVersionEditor, openVersionEditor } from './version-editor.js';

// Module scripts run after the document is parsed. The steps keep the order of the
// former classic scripts.
setSetupActions({ edit: openVersionEditor, delete: openDeleteModal });
initUpload();
initBulkUpload();
initDelete();
initCatalog({ onSelectVehicle: showCar });
initCarPage();
loadTheme();
initBrandLink();
initHeaderActions();
initOwnerNavEditor();
initDatabaseAccess();
initActions({
	logout: () => logout(),
	'toggle-theme': () => toggleTheme(),
	'show-home': () => showHome(),
});
initLogo();
initManufacturerCarousel();
initVersionEditor();
moveUpcomingPanel();
initResize();
observeCategories();

const authorize = createAccessCheck({
	async onAuthorized() {
		await loadData();
		syncBulkUploadAccess();
		// The URL is the route: a plain home link must never restore a saved car.
		await openSetupFromQuery();
		syncCarFilter();
		initVersionEditor();
		setTimeout(refreshVehicleCounts, 0);
	},
});
authorize();
