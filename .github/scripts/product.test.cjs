const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isEan13, productPath, validateProduct } = require('./product.cjs');
const { validateFile, run } = require('./validate-pr.cjs');
const product = require('../../data/490/210528/491.json');
const path = productPath(product.jan);

test('EAN-13 checks digits, length, type and check digit, including overseas prefixes', () => {
  for (const code of ['4902105284919', '4901990378765', '4006381333931', '0123456789012']) assert.ok(isEan13(code), code);
  for (const code of ['4902105284918', '12345678', '49021052849190', '4902105284919\n', '４９０２１０５２８４９１９', 4902105284919, null]) assert.equal(isEan13(code), false);
});
test('existing JSON and path are valid', () => {
  for (const fixture of ['../../data/490/210528/491.json', '../../data/490/199037/876.json']) assert.deepEqual(validateProduct(require(fixture)), []);
  assert.deepEqual(validateFile(path, JSON.stringify(product)), []);
});
test('JSON reports missing fields, types, limits, URLs and unknown fields', () => {
  for (const value of [null, [], {}, { ...product, name: ' ' }, { ...product, has_drain: 'false' }, { ...product, wait_seconds: -1 }, { ...product, wait_seconds: 901 }, { ...product, wait_seconds: 1.5 }, { ...product, links: { official: 'javascript:alert(1)' } }, { ...product, links: {} }, { ...product, links: { ...product.links, extra: true } }, { ...product, reference: 'extra' }, { ...product, jan: '4902105284918' }]) {
    assert.ok(validateProduct(value).length, JSON.stringify(value));
  }
});
test('invalid JSON and mismatched file path fail', () => {
  assert.match(validateFile(path, '{broken')[0], /JSON/);
  assert.match(validateFile('data/wrong.json', JSON.stringify(product))[0], /保存先/);
});
test('PR validation reads only changed JSON at the exact head SHA and reports failures', async () => {
  const annotations = [], fetched = [];
  let failed = false;
  const core = { error: (message, location) => annotations.push({ message, location }), setFailed: () => { failed = true; }, summary: { addHeading() {}, addRaw() {}, addDetails() {}, async write() {} } };
  const files = [{ filename: path, status: 'modified' }, { filename: 'data/bad.json', status: 'added' }, { filename: 'data/deleted.json', status: 'removed' }, { filename: 'README.md', status: 'modified' }];
  await run({ core, context: { repo: { owner: 'base', repo: 'db' }, payload: { pull_request: { number: 1, changed_files: 4, head: { sha: 'fixed-sha', repo: { owner: { login: 'fork' }, name: 'db' } } } } }, github: {
    paginate: async () => files,
    rest: { pulls: { listFiles() {} }, repos: { getContent: async args => {
      fetched.push(args);
      return { data: { type: 'file', encoding: 'base64', content: Buffer.from(args.path === path ? JSON.stringify(product) : '{}').toString('base64') } };
    } } }
  } });
  assert.equal(fetched.length, 2);
  assert.ok(fetched.every(args => args.ref === 'fixed-sha' && args.owner === 'fork'));
  assert.ok(annotations.every(item => item.location.file === 'data/bad.json'));
  assert.ok(annotations.length);
  assert.ok(failed);
});
