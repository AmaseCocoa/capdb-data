# ramen-db
Ramen Timer用のデータです。

通常はこれを直接使用する必要はありません。webフロントエンドをご利用ください: https://github.com/AmaseCocoa/ramen-timer

<!-- TODO
## API
試験的にAPIを公開しています。ぜひご利用ください。: `https://ramendb.amase.cc`

### MCP
なんと、このAPIは謎にMCPを実装しています。これで、あなたもLLMからカップラーメンの時間を簡単に取得できます！
-->

## License
### データ
(著作権の対象になるかは別として) ライセンスはCC0です。ご自由にご利用ください。

### API
APIはMITライセンスに基づいて自由に利用できます。

## データリクエストの自動処理

「カップ麺データの追加・修正」フォームのIssueは、作成・編集・再オープン時に検証します。
不正な項目をコメントで案内し、`入力不備` ラベルを付けます。修正が確認できるとラベルを外します。
ラベルを最後に付けてから14日経過しても不正なIssueは、毎日の処理で `not_planned` として閉じます。
日数は `.github/scripts/data-request.cjs` の `STALE_DAYS` で変更できます。

リポジトリの **admin権限を持つユーザー** が、開いている対象Issueに `/create` のみをコメントすると、
再検証してJSONを生成し、デフォルトブランチ宛てにPRを作成します。
補足・参考情報とリクエストの種類はJSONに含めません。時間は既存データと同じ `wait_seconds` です。
追加時はファイルが未登録、修正時は登録済みである必要があります。同じIssueからPRを重複作成しません。
PRマージ時は `Closes #番号` によりIssueを閉じます。

JANはEAN-13形式のみ受け付け、13桁の半角数字とチェックディジットを検証します。
45・49以外のEAN-13も受け付けます。保存先の分割は `test.ts` の規則を維持しています。
会社部分が9桁の範囲は商品部分が空になるため、`data/国/会社/.json` になります。
フォーム変更前のIssueは、新しい項目と見出しに合わせて本文を編集してください。

導入には、デフォルトブランチにワークフローを配置し、Settings → Actions → General → Workflow permissions の
[Allow GitHub Actions to create and approve pull requests](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
を有効にしてください。`データ追加・修正` ラベルも事前に作成してください。
`入力不備` ラベルは自動作成します。期限処理はActions画面から手動実行もできます。

### PRのJSON検証

手動・外部ツールから作成されたPRも、作成・更新・再オープン時に `Validate product JSON` で検証します。
追加・変更・移動先の `data/**/*.json` を対象に、JSON構文、`schema.json` の型・必須項目・範囲・未定義項目、
HTTP(S)の公式URL、EAN-13チェックディジット、JANに対応する保存先パスを確認します。
削除されたファイルは対象外です。不備はファイル別のエラー注釈と実行サマリーに表示され、チェックが失敗します。
PRにはIssue用の期限クローズ処理を適用しません。

forkのPRにも読み取り権限だけで対応します。検証処理とスキーマにはPRのbaseコミットを使い、
PRのheadコミットからJSONをAPIで読み取ります。PR側のコードは実行しません。
このワークフローをデフォルトブランチへマージしてから利用してください。
マージを必ず止めたい場合は、ブランチ保護の必須チェックにこのワークフローの `validate` ジョブを指定してください。

`GITHUB_TOKEN` で自動作成されたPRは通常 `pull_request` ワークフローを起動しませんが、
`/create` のJSON生成時にも同じ商品データ検証を適用します。

ローカルでの検証: `node --test .github/scripts/*.test.cjs`
