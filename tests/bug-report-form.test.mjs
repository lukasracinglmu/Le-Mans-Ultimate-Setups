import assert from 'node:assert/strict';
import test from 'node:test';
import { createReportId, isAllowedImage } from '../public/js/bug-report/form.js';

test('report IDs match the format the server accepts', () => {
	const id = createReportId();
	// Same pattern as submitBugReport in src/bug-reports.js.
	assert.match(id, /^[a-f0-9]{25}$/);
	assert.notEqual(createReportId(), id);
});

test('images are limited to PNG, JPG and WebP up to 5 MiB', () => {
	const limit = 5 * 1024 * 1024;
	assert.equal(isAllowedImage({ type: 'image/png', size: limit }), true);
	assert.equal(isAllowedImage({ type: 'image/jpeg', size: 1 }), true);
	assert.equal(isAllowedImage({ type: 'image/webp', size: 1 }), true);
	assert.equal(isAllowedImage({ type: 'image/png', size: limit + 1 }), false);
	assert.equal(isAllowedImage({ type: 'image/gif', size: 1 }), false);
});
