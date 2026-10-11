# discord-mcp

Discord bot 経由で、Claude Code から Discord サーバー（guild）の設定を行うための MCP サーバー。
Discord REST API v10 を直接叩くので Gateway 接続（常駐 bot）は不要。

## セットアップ

1. **Bot を作る** — [Developer Portal](https://discord.com/developers/applications) → New Application → Bot → Reset Token でトークン取得
   - `list_members` を使うなら Bot ページで **Server Members Intent** を ON
2. **サーバーに招待** — OAuth2 → URL Generator で scope `bot`、権限は `Manage Server` / `Manage Channels` / `Manage Roles` / `View Channels`（全部任せるなら `Administrator`）
   - ⚠ bot は **自分の最上位ロールより下のロール** しか操作できない。サーバー設定 → ロールで bot のロールを上の方へ移動しておく
3. **ビルド & トークン設定**
   ```sh
   npm install
   npm run build
   cp .env.example .env   # DISCORD_BOT_TOKEN を記入
   ```
4. **Claude Code で使う** — このディレクトリで `claude` を起動すると `.mcp.json` の `discord` サーバーが読み込まれる（初回に承認）。
   他のディレクトリから使う場合:
   ```sh
   claude mcp add discord --scope user -- node /Users/serken/Documents/discord_mcp/dist/index.js
   ```
   （`.env` はサーバー自身がプロジェクトルートから読むので、トークンを `claude mcp add -e` で渡す必要はない）

## 環境変数

| 変数 | 説明 |
| --- | --- |
| `DISCORD_BOT_TOKEN` | 必須。Bot トークン |
| `DISCORD_ALLOWED_GUILD_IDS` | 操作を許可する guild ID（カンマ区切り）。空なら bot が入っている全サーバー |
| `DISCORD_READ_ONLY` | `true` で参照系ツールのみ登録 |
| `DISCORD_ALLOW_RAW_REQUESTS` | `true` で任意の REST エンドポイントを叩ける `discord_api_request` を有効化 |

## ツール

| 分類 | ツール |
| --- | --- |
| サーバー | `list_guilds`, `get_guild_snapshot`, `update_guild`, `list_permission_names` |
| チャンネル | `create_channel`, `update_channel`, `delete_channel`, `reorder_channels`, `set_permission_overwrite`, `delete_permission_overwrite` |
| ロール | `create_role`, `update_role`, `delete_role`, `reorder_roles` |
| メンバー | `list_members`, `search_members`, `add_member_role`, `remove_member_role` |
| 汎用 | `discord_api_request`（要 `DISCORD_ALLOW_RAW_REQUESTS=true`） |

- 権限は `["ViewChannel", "SendMessages"]` のように **名前で指定**（ビットフィールド変換はサーバー側で行う）
- `@everyone` ロールの ID は guild ID と同じ
- 書き込み系はすべて `reason` を受け取り、監査ログに記録される
- 削除系ツールには MCP の `destructiveHint` を付けている

## 使い方の例

```
> 「ゲーム部」カテゴリを作って、その中に #雑談 と VC「ボイス1」を作って。
  @everyone からは見えなくして「部員」ロールだけ見えるように
```

Claude はまず `get_guild_snapshot` で現状を把握してから変更を行う。

## 新しいツールを足す

`src/tools/*.ts` で `defineTool(ctx, name, { description, input, readOnly?, destructive?, handler })` を呼ぶだけ。
`readOnly: true` 以外は `DISCORD_READ_ONLY=true` のとき自動で登録されない。新しいファイルを作ったら `src/index.ts` で register 関数を呼ぶ。

## 開発

```sh
npm run dev        # tsx でビルドなし起動
npm run typecheck
npx @modelcontextprotocol/inspector node dist/index.js   # ブラウザでツールを試す
```
