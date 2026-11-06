const { productPath, validateProduct } = require('./product.cjs');

function validateFile(path, content) {
  let data;
  try { data = JSON.parse(content); }
  catch (error) { return [`JSONを解析できません: ${error.message}`]; }
  const errors = validateProduct(data);
  if (errors.length === 0 && path !== productPath(data.jan)) {
    errors.push(`JANコードと保存先が一致しません。正しいパス: ${productPath(data.jan)}`);
  }
  return errors;
}

async function run({ github, context, core }) {
  const pr = context.payload.pull_request;
  const files = await github.paginate(github.rest.pulls.listFiles, {
    ...context.repo, pull_number: pr.number, per_page: 100,
  });
  // GitHubのlistFiles上限を超えたPRを部分的に検証して成功扱いにしない。
  if (pr.changed_files > files.length) throw new Error('変更ファイル一覧をすべて取得できません。PRを分割してください。');
  const results = [];
  for (const file of files) {
    if (file.status === 'removed' || !file.filename.startsWith('data/') || !file.filename.endsWith('.json')) continue;
    // PRのheadを実行・checkoutせず、固定したコミットからデータのみ取得。
    const response = await github.rest.repos.getContent({
      owner: pr.head.repo.owner.login, repo: pr.head.repo.name,
      ref: pr.head.sha, path: file.filename,
    });
    const blob = response.data;
    if (blob.type !== 'file' || blob.encoding !== 'base64') throw new Error(`${file.filename}: 通常のJSONファイルとして取得できません。`);
    const errors = validateFile(file.filename, Buffer.from(blob.content, 'base64').toString('utf8'));
    for (const message of errors) core.error(message, { file: file.filename });
    results.push({ path: file.filename, errors });
  }
  const invalid = results.filter(result => result.errors.length);
  core.summary.addHeading('商品データの検証');
  core.summary.addRaw(`${results.length} ファイルを検証、${invalid.length} ファイルに不備があります。\n`);
  for (const result of invalid) {
    core.summary.addDetails(result.path, result.errors.map(error => error.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)).join('<br>'));
  }
  await core.summary.write();
  if (invalid.length) core.setFailed('商品JSONに不備があります。ファイルごとのエラーを修正してください。');
}
module.exports = { run, validateFile };
