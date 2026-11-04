# taskmanagement_tool_poc

自分専用のタスク管理ツールのPoC。GTDの流れ（収集 → 明確化 → 整理）と、年 → 四半期のロードマップを、1つのデータでつなぐ。
開発の指示と方針は [CLAUDE.md](CLAUDE.md) を参照。

- バックエンドを持たない1ページのアプリ（React + TypeScript + Vite）。`main` へのマージで GitHub Pages に配信し、PRごとのプレビューを `pr-preview/pr-<番号>/` に配信する（CLAUDE.md 8.3）
- データは利用者のブラウザ（localStorage）と、書き出したJSONファイルにだけ置く。**実データをこのリポジトリにコミットしない**
- 書き出したJSONは、**このリポジトリのフォルダの外**に保存する（`.gitignore`でも `tmpoc-*` を除外しているが、念のため）

## 開発

Node.js 22 を使う。

| コマンド | 内容 |
| --- | --- |
| `npm ci` | 依存パッケージを入れる（`package-lock.json` のとおり） |
| `npm run dev` | 開発サーバー（`localhost` だけで開く） |
| `npm test` | 単体テスト（タイムゾーンは `Asia/Tokyo` に固定） |
| `npm run test:security` | 名前に `@security` を含むテストだけ |
| `npm run lint` / `npm run typecheck` | lint・型チェック |
| `npm run build` | 本番ビルド（`dist/`。CSP を入れる） |

CI（`.github/workflows/ci.yml`）は、lint・型チェック・単体テスト・依存の脆弱性スキャン・gitleaks・ビルドと、ビルド成果物にデータファイルが無いことの検査を行う。

## 文書

| ファイル | 内容 |
| --- | --- |
| `docs/proposal.md` | 企画書（発注者が確定した版の写し。レビューの基準） |
| `CLAUDE.md` | 開発指示書（目的、ゴールの状態、範囲、データモデル、明確化の流れ、画面、技術方針、節目） |
| `.claude/agents/` | レビュー用のサブエージェント（CLAUDE.md 13章） |
| `.claude/commands/security-review.md` | `/security-review`（セキュリティレビュー → 回帰テスト → レポート） |
| `docs/change-requests.md` | 範囲外の案・計画の変更の記録（CLAUDE.md 11.2） |
| `docs/security/checklist.md` | セキュリティレビューの観点の正本 |
| `docs/templates/` | 節目の資料・振り返りのテンプレート |
| `docs/reviews/` | 節目のレビュー資料と、CLAUDE.md のレビューの記録 |
