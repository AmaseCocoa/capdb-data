const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, separateJanCode, run } = require('./data-request.cjs');
const body = `### リクエストの種類

追加

### 商品名

テスト麺

### JANコード (バーコードの数字)

4902105284919

### 調理時間（秒）

240

### 湯切り

不要

### 公式URL

https://example.com/product

### 補足・参考情報

JSONには含めない
`;
test('form generates existing data layout and excludes reference', () => {
  const result = validate(body);
  assert.deepEqual(result.errors, []);
  assert.equal(result.path, 'data/490/210528/491.json');
  assert.deepEqual(result.data, { jan: '4902105284919', name: 'テスト麺', wait_seconds: 240, has_drain: false, links: { official: 'https://example.com/product' } });
  assert.deepEqual(validate(body.replaceAll('\n', '\r\n')), result);
});
test('reports all invalid fields', () => assert.equal(validate('').errors.length, 6));
test('rejects malformed values and duplicated fields', () => {
  for (const [before, after] of [['240', 'NaN'], ['240', '901'], ['240', '1.5'], ['4902105284919', '../malicious'], ['https://example.com/product', 'javascript:alert(1)'], ['不要', 'unknown']]) {
    assert.ok(validate(body.replace(before, after)).errors.length);
  }
  assert.ok(validate(body + '\n### 商品名\n\n別の商品').errors.length);
});
test('JAN splitting follows test.ts at range boundaries', () => {
  for (const [prefix, length] of [['49010', 6], ['49204', 6], ['49205', 8], ['45700', 9], ['45710', 8], ['45959', 9]]) {
    const digits = prefix + '1234567';
    const sum = [...digits].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0);
    const jan = digits + ((10 - sum % 10) % 10);
    const parts = separateJanCode(jan);
    assert.equal(parts.company.length, length);
    assert.equal(parts.product.length, 9 - length);
  }
  assert.equal(separateJanCode('1234567890123'), null);
});
test('non-admin cannot create or validate via command', async () => {
  let permissions = 0;
  const issue = { number: 1, state: 'open', labels: [{ name: 'データ追加・修正' }], body };
  await run({ context: { repo: {}, eventName: 'issue_comment', payload: { issue, comment: { body: '/create', user: { login: 'writer' } } } }, github: { rest: {
    issues: { get: async () => ({ data: issue }) },
    repos: { getCollaboratorPermissionLevel: async () => { permissions++; return { data: { permission: 'write' } }; } }
  } } });
  assert.equal(permissions, 1);
});
test('admin creates JSON commit and PR', async () => {
  const issue = { number: 2, state: 'open', labels: [{ name: 'データ追加・修正' }], body };
  let written, pr;
  await run({ context: { repo: { owner: 'owner', repo: 'repo' }, eventName: 'issue_comment', payload: { issue, comment: { body: '/create', user: { login: 'admin' } } } }, github: { rest: {
    issues: { get: async () => ({ data: issue }), createComment: async () => {} },
    repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: 'admin' } }), get: async () => ({ data: { default_branch: 'main' } }), getContent: async () => { throw { status: 404 }; } },
    git: { getRef: async () => ({ data: { object: { sha: 'base' } } }), getCommit: async () => ({ data: { tree: { sha: 'tree' } } }), createTree: async args => { written = args.tree[0]; return { data: { sha: 'new-tree' } }; }, createCommit: async () => ({ data: { sha: 'new-commit' } }), createRef: async () => {} },
    pulls: { list: async () => ({ data: [] }), create: async args => { pr = args; return { data: { html_url: 'https://example.com/pr' } }; } }
  } } });
  assert.equal(written.path, 'data/490/210528/491.json');
  assert.deepEqual(JSON.parse(written.content), validate(body).data);
  assert.equal(pr.head, 'data-request/issue-2');
  assert.match(pr.body, /Closes #2/);
});
test('expiry uses latest label event rather than issue update time', async () => {
  for (const age of [13, 15]) {
    const issue = { number: 3, state: 'open', body: '', labels: [{ name: 'データ追加・修正' }, { name: '入力不備' }] };
    let closed = false;
    const listComments = () => {}, listEvents = () => {}, listForRepo = () => {};
    await run({ context: { repo: {}, eventName: 'schedule' }, github: {
      paginate: async method => method === listForRepo ? [issue] : method === listComments ? [] : [{ event: 'labeled', label: { name: '入力不備' }, created_at: new Date(Date.now() - age * 86400000).toISOString() }],
      rest: { issues: { listForRepo, listEvents, listComments, get: async () => ({ data: issue }), createComment: async () => {}, update: async args => { assert.equal(args.state_reason, 'not_planned'); closed = true; } } }
    } });
    assert.equal(closed, age === 15);
  }
});
