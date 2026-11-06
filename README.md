# ramen-db
Ramen Timer用のデータです。

通常はこれを直接使用する必要はありません。webフロントエンドをご利用ください: https://github.com/AmaseCocoa/ramen-timer

## CDN
データはgithack経由で利用できます。

```
https://rawcdn.githack.com/AmaseCocoa/ramen-db/[tag]/[path]
```

開発時はこのurlも使用できますが、production環境では使用しないでください。

```
https://raw.githack.com/AmaseCocoa/ramen-db/main/[path]
```

## 自動タグ
GitHub Actionsで毎時17分、または「Tag changes」の手動実行時に、デフォルトブランチの最新コミットを確認します。
最新コミットにタグがない場合のみ、UTC日時形式のタグ（例: `v20261106090000`）を作成します。初回もタグを作成します。

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
