# taskmanagemet_tool_poc

自分専用のタスク管理ツールのPoC。GTDの流れ（収集 → 明確化 → 整理）と、年 → 四半期のロードマップを、1つのデータでつなぐ。
開発の指示と方針は [CLAUDE.md](CLAUDE.md) を参照。

- バックエンドを持たない1ページのアプリ（React + TypeScript + Vite）を予定している（初期構築は節目2。CLAUDE.md 10章）
- データは利用者のブラウザ（localStorage）と、書き出したJSONファイルにだけ置く。**実データをこのリポジトリにコミットしない**
- 書き出したJSONは、**このリポジトリのフォルダの外**に保存する（`.gitignore`でも `tmpoc-*` を除外しているが、念のため）

## 文書

| ファイル | 内容 |
| --- | --- |
| `CLAUDE.md` | 開発指示書（目的、ゴールの状態、範囲、データモデル、明確化の流れ、画面、技術方針、節目） |
| `.claude/agents/` | レビュー用のサブエージェント（CLAUDE.md 13章） |
| `.claude/commands/security-review.md` | `/security-review`（セキュリティレビュー → 回帰テスト → レポート） |
| `docs/change-requests.md` | 範囲外の案・計画の変更の記録（CLAUDE.md 11.2） |
| `docs/security/checklist.md` | セキュリティレビューの観点の正本 |
| `docs/templates/` | 節目の資料・振り返りのテンプレート |
| `docs/reviews/` | 節目のレビュー資料と、CLAUDE.md のレビューの記録 |
