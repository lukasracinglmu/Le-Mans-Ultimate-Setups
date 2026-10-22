import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../production-worker.js';
import baseWorker from '../worker.js';
import { readSetupVersion, enrichSetupVersions } from '../setup-version.js';

function formWithVersion(value) {
  const form = new FormData();
  if (value !== undefined) form.set('version', value);
  return form;
}

test('upload versions are optional and still validate supplied values', () => {
  for (const value of [undefined, '', '   ']) {
    assert.deepEqual(readSetupVersion(formWithVersion(value)), { version: '' });
  }
  assert.deepEqual(readSetupVersion(formWithVersion('  v2.1  ')), { version: 'v2.1' });
  assert.deepEqual(readSetupVersion(formWithVersion('v'.repeat(40))), { version: 'v'.repeat(40) });
  for (const value of ['v'.repeat(41), 'v2\u0000x', 'v2\nx', new File(['v2'], 'version.txt')]) {
    assert.ok(readSetupVersion(formWithVersion(value)).error);
  }
});

test('separate uploads store their own versions, including an empty replacement', async () => {
  const originalFetch = baseWorker.fetch;
  const rows = new Map([['first.zip', 'old-version']]);
  const forwarded = [];
  const env = { ACCESS_DB: { prepare() {
    return { bind(...values) {
      return {
        async run() { rows.set(values[2], values[3]); },
        async all() { return { results: [...rows].map(([file_name, version]) => ({ file_name, version })) }; }
      };
    } };
  } } };
  baseWorker.fetch = async request => {
    const form = await request.formData();
    const name = form.get('files').name;
    forwarded.push({ name, category: form.get('category'), vehicle: form.get('vehicle'), version: form.get('version') });
    return Response.json({ success: true, uploaded: [{ name }] });
  };
  try {
    for (const [name, version] of [['first.zip', ''], ['second.zip', 'v2'], ['third.zip', 'v3']]) {
      const form = formWithVersion(version);
      form.set('category', 'Hypercar');form.set('vehicle', 'Test Car');
      form.set('files', new File(['PK\x03\x04'], name));
      const response = await worker.fetch(new Request('https://example.test/api/setups/upload', { method: 'POST', body: form }), env);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).uploaded[0].version, version);
      assert.equal(rows.get(name), version);
    }
    assert.deepEqual(forwarded.map(x => x.version), ['', 'v2', 'v3']);
    assert.ok(forwarded.every(x => x.category === 'Hypercar' && x.vehicle === 'Test Car'));
    const setups = await enrichSetupVersions([...rows.keys()].map(name => ({ name })), 'Hypercar', 'Test Car', env);
    assert.deepEqual(setups.map(x => x.version), [null, 'v2', 'v3']);
    const invalid = formWithVersion('v'.repeat(41));
    const response = await worker.fetch(new Request('https://example.test/api/setups/upload', { method: 'POST', body: invalid }), env);
    assert.equal(response.status, 400);
    assert.equal(forwarded.length, 3, 'invalid version must not reach ZIP storage');
  } finally {
    baseWorker.fetch = originalFetch;
  }
});
