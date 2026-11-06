const INVALID_LABEL = '入力不備';
const REQUEST_LABEL = 'データ追加・修正';
const STALE_DAYS = 14;

const { separateJanCode, productPath, validateProduct } = require('./product.cjs');

function parseForm(body = '') {
  const fields = new Map();
  for (const match of body.replace(/\r\n/g, '\n').matchAll(/^### (.+)\n+([\s\S]*?)(?=^### |$(?![\s\S]))/gm)) {
    if (fields.has(match[1])) throw new Error(`「${match[1]}」が重複しています。`);
    fields.set(match[1], match[2].trim());
  }
  return fields;
}

function validate(body) {
  const errors = [];
  let fields;
  try { fields = parseForm(body); } catch (error) { return { errors: [error.message] }; }
  const get = label => fields.get(label) || '';
  const jan = get('JANコード (バーコードの数字)');
  const split = separateJanCode(jan);
  if (!split) errors.push('JANコード: チェックディジットが正しいEAN-13（13桁の半角数字）を入力してください。');
  const name = get('商品名');
  if (!name || name === '_No response_' || name.includes('\n')) errors.push('商品名: 1行で入力してください。');
  const seconds = get('調理時間（秒）');
  if (!/^\d+$/.test(seconds) || Number(seconds) > 900) errors.push('調理時間: 0〜900 の整数を秒単位で入力してください。');
  const drain = get('湯切り');
  if (!['必要', '不要'].includes(drain)) errors.push('湯切り: 必要・不要のいずれかを選択してください。');
  const official = get('公式URL');
  try {
    const url = new URL(official);
    if (!['https:', 'http:'].includes(url.protocol) || /\s/.test(official)) throw new Error();
  } catch { errors.push('公式URL: http または https のURLを入力してください。'); }
  const type = get('リクエストの種類');
  if (!['追加', '修正'].includes(type)) errors.push('リクエストの種類: 追加・修正のいずれかを選択してください。');
  if (errors.length) return { errors };
  const data = { jan, name, has_drain: drain === '必要', wait_seconds: Number(seconds), links: { official } };
  return { errors: validateProduct(data), type, path: productPath(jan), data };
}

async function run({ github, context }) {
  const repo = context.repo;
  const api = github.rest;
  const labeled = issue => issue.labels.some(label => label.name === REQUEST_LABEL);
  const comment = (issue_number, body) => api.issues.createComment({ ...repo, issue_number, body });
  async function check(issue) {
    const result = validate(issue.body);
    const hasLabel = issue.labels.some(label => label.name === INVALID_LABEL);
    if (result.errors.length) {
      if (!hasLabel) {
        try { await api.issues.createLabel({ ...repo, name: INVALID_LABEL, color: 'd93f0b' }); }
        catch (error) { if (error.status !== 422) throw error; }
        await api.issues.addLabels({ ...repo, issue_number: issue.number, labels: [INVALID_LABEL] });
      }
      const body = `<!-- data-request-validation -->\n入力内容を修正してください。\n\n${result.errors.map(error => `- ${error}`).join('\n')}\n\n「${INVALID_LABEL}」ラベルの付与から${STALE_DAYS}日以内に修正されない場合、not planned で閉じます。`;
      const comments = await github.paginate(api.issues.listComments, { ...repo, issue_number: issue.number, per_page: 100 });
      const previous = comments.find(item => item.user.type === 'Bot' && item.body.startsWith('<!-- data-request-validation -->'));
      if (previous) {
        if (previous.body !== body) await api.issues.updateComment({ ...repo, comment_id: previous.id, body });
      } else await comment(issue.number, body);
    } else if (hasLabel) {
      await api.issues.removeLabel({ ...repo, issue_number: issue.number, name: INVALID_LABEL });
      await comment(issue.number, '入力内容の不備が解消されました。管理者は `/create` でPRを作成できます。');
    }
    return result;
  }
  if (['schedule', 'workflow_dispatch'].includes(context.eventName)) {
    const issues = await github.paginate(api.issues.listForRepo, { ...repo, state: 'open', labels: INVALID_LABEL, per_page: 100 });
    for (const item of issues) {
      if (item.pull_request || !labeled(item)) continue;
      const issue = (await api.issues.get({ ...repo, issue_number: item.number })).data;
      if (issue.state !== 'open' || !(await check(issue)).errors.length) continue;
      const events = await github.paginate(api.issues.listEvents, { ...repo, issue_number: issue.number, per_page: 100 });
      const last = events.filter(event => ['labeled', 'unlabeled'].includes(event.event) && event.label?.name === INVALID_LABEL).at(-1);
      if (last?.event !== 'labeled' || Date.now() - Date.parse(last.created_at) < STALE_DAYS * 86400000) continue;
      await api.issues.update({ ...repo, issue_number: issue.number, state: 'closed', state_reason: 'not_planned' });
      await comment(issue.number, `入力不備が解消されないまま${STALE_DAYS}日経過したため、not planned で閉じました。`);
    }
    return;
  }
  const issue = (await api.issues.get({ ...repo, issue_number: context.payload.issue.number })).data;
  if (issue.pull_request || issue.state !== 'open' || !labeled(issue)) return;
  if (context.eventName !== 'issue_comment') { await check(issue); return; }
  if (context.payload.comment.body.trim() !== '/create') return;
  const permission = await api.repos.getCollaboratorPermissionLevel({ ...repo, username: context.payload.comment.user.login });
  if (permission.data.permission !== 'admin') return;
  const result = await check(issue);
  if (result.errors.length) return;
  const branch = `data-request/issue-${issue.number}`;
  const existing = await api.pulls.list({ ...repo, state: 'all', head: `${repo.owner}:${branch}` });
  if (existing.data.length) { await comment(issue.number, `このIssueのPRは作成済みです: ${existing.data[0].html_url}`); return; }
  const base = (await api.repos.get(repo)).data.default_branch;
  const baseRef = (await api.git.getRef({ ...repo, ref: `heads/${base}` })).data;
  let current;
  try { current = (await api.repos.getContent({ ...repo, path: result.path, ref: baseRef.object.sha })).data; }
  catch (error) { if (error.status !== 404) throw error; }
  if ((result.type === '追加') === Boolean(current)) {
    await comment(issue.number, result.type === '追加' ? '同じパスのデータが存在します。種類を「修正」に変更してください。' : '修正対象のデータが存在しません。JANコードまたは種類を確認してください。');
    return;
  }
  const content = `${JSON.stringify(result.data, null, 2)}\n`;
  if (current && Buffer.from(current.content, 'base64').toString() === content) { await comment(issue.number, '既存のJSONと同じ内容です。変更はありません。'); return; }
  const commit = (await api.git.getCommit({ ...repo, commit_sha: baseRef.object.sha })).data;
  const tree = (await api.git.createTree({ ...repo, base_tree: commit.tree.sha, tree: [{ path: result.path, mode: '100644', type: 'blob', content }] })).data;
  const created = (await api.git.createCommit({ ...repo, message: `Update product data from #${issue.number}`, tree: tree.sha, parents: [baseRef.object.sha] })).data;
  try { await api.git.createRef({ ...repo, ref: `refs/heads/${branch}`, sha: created.sha }); }
  catch (error) {
    if (error.status !== 422) throw error;
    // 前回のPR作成だけが失敗した場合、同じコミットなら再試行できる。
    const ref = (await api.git.getRef({ ...repo, ref: `heads/${branch}` })).data;
    const previous = (await api.git.getCommit({ ...repo, commit_sha: ref.object.sha })).data;
    if (previous.tree.sha !== tree.sha || previous.parents[0]?.sha !== baseRef.object.sha) {
      throw new Error(`Branch ${branch} already exists; inspect it before retrying.`);
    }
  }
  const pr = await api.pulls.create({ ...repo, head: branch, base, title: `データ${result.type}: ${result.data.jan}`, body: `Closes #${issue.number}\n\nIssue Formsの入力からJSONを生成しました（補足・参考情報は含めません）。` });
  await comment(issue.number, `PRを作成しました: ${pr.data.html_url}`);
}
module.exports = { run, validate, separateJanCode, STALE_DAYS };
