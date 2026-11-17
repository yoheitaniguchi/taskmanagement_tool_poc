# 引き継ぎ：プログラムの最適化（技術負債・セキュリティ・品質）— PR 1 計画

- **最終更新日時：** 2026-11-17 11:30（日本時間）
- **最終担当 AI：** Claude Code（計画の担当）
- **対象ブランチ：** `claude/project-thread-f52lb7`
- **関連 Issue / PR：** Issue #45、この PR（計画）。前の作業（PR #43）の引き継ぎ文書は `docs/handovers/archive/claude-project-thread-ad3sgr-pr16.md` に移した（2026-11-16 洋平さんの決定。AGENTS.md 6章）
- **計画：** `docs/plans/code-optimization.md`

文書だけの PR です（アプリのコードは変えていません）。計画は Claude Code が書いたので、**レビューは別の AI が行います**（AGENTS.md 2章）。

## 1. 現在のステータス

- [x] 現状の調査：型チェック・lint・テスト（352件）・ビルドは合格。`npm audit` は moderate 9件（SEC-002）。数値は計画 2章
- [x] 計画 `docs/plans/code-optimization.md` を書いた。`security-reviewer`・`domain-reviewer` の計画レビュー（自己点検）を反映した
- [x] PR #43 の引き継ぎ文書を archive へ移した
- [ ] **別の AI による計画のレビュー**（下の4章の観点）
- [x] 洋平さんが計画 9章に答えた（2026-11-17、4項目すべて推奨案。PR #44 はマージ済み）
- [ ] 洋平さんがマージする
- [ ] PR 2（セキュリティ：S-1〜3）→ PR 3（技術負債と品質：T-1・Q-1・Q-2）→ PR 4（点検と効果の記録）

## 2. 設計上の決定事項・前提

- 画面の見た目と操作、スキーマ v1、`validateState` の厳しさは変えない。新しい依存・CI は足さない（AGENTS.md 7章）
- 速さの測定は、架空のデータで reducer 1回の時間を測った（計画 2章の表）。PR 4 で同じ測り方で測り直す
- S-1 は、eslint 10.15.0・typescript-eslint 8.73.0 に上げると `npm audit` が0件になることを手元で確かめた（確かめた後に元に戻した）

## 3. 主な変更ファイル

- `docs/plans/code-optimization.md`（新規）：作業計画
- `docs/handovers/`：この文書と、PR #43 の引き継ぎ文書の archive

## 4. 次の担当 AI への申し送り・注意点

- **レビューの観点**
  - 2章の数値（検査の結果、測定）が正しいか。手元で `npm run typecheck`・`npm run lint`・`npm test`・`npm run build`・`npm audit` を実行して確かめられる
  - 3章の各項目の「期待できる効果」が言い過ぎていないか。特に S-2・S-3 で SEC-003・SEC-009 を「解消」と言える条件（計画に書いた限界）
  - 4章の見送りの理由が妥当か。範囲外の機能（CR-001〜012）が混ざっていないか
- **変えてはいけないもの**：アプリのコード（この PR は文書だけ）、スキーマ v1、`validateState`
- **このブランチの事情**：このセッションが push できるのは `claude/project-thread-f52lb7` だけなので、PR 1〜4 は同じブランチ名を順に使う。force-push はせず、前の PR のマージ後に main を取り込んで進める
