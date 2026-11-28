# 引き継ぎ：CI の開発依存の脆弱性の検査を、見つかったら失敗にする

- **最終更新日時：** 2026-11-17 17:40（日本時間）
- **最終担当 AI：** Claude Code（実装の担当）
- **対象ブランチ：** `claude/project-thread-f52lb7`
- **関連 Issue / PR：** Issue #50（この PR で閉じる）。プログラムの最適化 PR 4（#49）の引き継ぎ文書は `docs/handovers/archive/claude-project-thread-f52lb7-pr4.md` に移した（AGENTS.md 6章）
- **決定：** 2026-11-17 発注者が、セキュリティレビュー⑤（`docs/security/reports/review-20261117-1528.md`）の提案を推奨案のとおり「失敗にする」で採用し、別の PR で出すよう指示した（CI の変更なので AGENTS.md 7章の承認にあたる）

Claude Code が実装したので、**レビューは別の AI が行います**（AGENTS.md 2章）。アプリのコード・画面・依存は変えていません。

## 1. 現在のステータス

- [x] `.github/workflows/ci.yml` の dependency-audit：開発依存を含む検査を `npm audit || true`（表示だけ）から `npm audit`（1件でもあれば失敗）にした
- [x] `docs/security/checklist.md` の F：失敗にしたこと、脆弱性が見つかったときの扱い（直った版が無いときの受け入れの手順）、配信が止まることへの注意を書いた
- [x] `README.md` の CI の説明に、失敗にしたことを書いた
- [x] 手元で `npm audit`（0件、終了コード0）と `npm audit --omit=dev --audit-level=high`（0件）、型チェック・lint・テスト・ビルドが通る
- [ ] **別の AI によるレビュー**（下の4章の観点）
- [ ] 洋平さんがマージする（画面の変更は無いので、プレビューの確認は不要）

## 2. 設計上の決定事項・前提

- 失敗にする基準は「1件でも」（`--audit-level` を付けない。low も含む）。今は0件なので、この PR の CI は成功する
- dependency-audit は CI の必須チェックで、配信（deploy）の条件でもある。開発用の依存に脆弱性が新しく公表されると、直すまで PR のマージも配信も止まる。直った版がまだ無いときは、発注者の判断でリスクを受け入れて記録し、その行を一時的に表示だけに戻す PR を出す（SEC-002 の前例。手順はチェックリスト F）
- 本番依存の検査（`npm audit --omit=dev --audit-level=high`）は変えていない
- `ci.yml` の中身を確かめるテストは足していない（受け入れの手順で一時的に戻すことがあるため）

## 3. 主な変更ファイル

- `.github/workflows/ci.yml`
- `docs/security/checklist.md`
- `README.md`

## 4. 次の担当 AI への申し送り・注意点

- **レビューの観点**
  - `ci.yml` の変更が dependency-audit の1行だけで、権限・トリガー・ほかのジョブが変わっていないこと
  - チェックリスト F の受け入れの手順が、AGENTS.md（新しい CI は承認が要る）と矛盾しないこと
- **変えてはいけないもの**：アプリのコード・画面、スキーマ v1、`validateState`、依存
- **このブランチの事情**：同じブランチ名を PR ごとに順に使っている。この引き継ぎ文書は、次の作業の PR で `docs/handovers/archive/` へ移す
