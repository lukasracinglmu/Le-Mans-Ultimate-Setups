// State that several modules of the home page read and change.
export const state = {
	// Set by the access check, null until then and for visitors without login.
	currentUser: null,
	currentCar: { category: '', vehicle: '' },
	currentCarSetups: [],
	lastUploadJobs: [],
	activeMfr: '',
	activeCarSeries: '',
	trackSearchVal: '',
};
