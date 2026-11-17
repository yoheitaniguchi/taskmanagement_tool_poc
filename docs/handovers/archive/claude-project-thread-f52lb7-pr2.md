# 引き継ぎ：プログラムの最適化 — PR 2 セキュリティ（S-1〜3）

- **最終更新日時：** 2026-11-17 14:10（日本時間）
- **最終担当 AI：** Claude Code（実装の担当）
- **対象ブランチ：** `claude/project-thread-f52lb7`
- **関連 Issue / PR：** Issue #45、この PR（PR 2）。計画の PR #46 はマージ済みで、その引き継ぎ文書は `docs/handovers/archive/claude-project-thread-f52lb7-pr1.md` に移した（AGENTS.md 6章）
- **計画：** `docs/plans/code-optimization.md` の S-1・S-2・S-3（2026-11-17 承認。9章の4項目はすべて推奨案）

Claude Code が実装したので、**レビューは別の AI が行います**（AGENTS.md 2章）。画面の見た目と操作は変えていません（枠の中で開いたときだけ、画面の代わりに1行の文言を出す）。

## 1. 現在のステータス

- [x] S-1：eslint 10.14.0 → 10.15.0、typescript-eslint 8.72.2 → 8.73.0（開発用の依存だけ。PR #44 のマージ後の main から上げた）。`npm audit` と `npm audit --omit=dev` が 0件
- [x] S-2：枠（iframe）の中で開かれたら、保存データを読む前に止め、画面を出さない（`src/frameGuard.ts`・`src/main.tsx`）。テスト3件（枠の外・枠の中・確かめると例外）。Chromium で、直接開くとふだんどおり、枠の中では文言だけでボタンが0個になることを確かめた
- [x] S-3：ESLint で `Reflect` と、`window` などへの変数・式をキーにした参照を禁じた。止まる例8件・止まらない例3件（限界の記録）・配列の添字などは使えることのテストを足した
- [x] 文書：`docs/security/checklist.md` の前提（SEC-003 を解消、残りの2つの手口）、`docs/design.md` 6.1（SEC-009）・6.3（枠の中）・変更の記録、`vite.config.ts` のコメント
- [x] 型チェック・lint・テスト（367件。うち `@security` 121件）・ビルド・`scripts/check-dist.sh` が通る
- [ ] **別の AI によるレビュー**（下の4章の観点）
- [ ] 洋平さんが PR プレビューで、ふだんどおり開けて操作できることを確かめてマージする
- [ ] 次：PR 3（技術負債と品質：T-1・Q-1・Q-2。手元で作り終えている）→ PR 4（点検と効果の記録）

## 2. 設計上の決定事項・前提

- **S-2 の判定**は `window.top !== window.self`。確かめると例外になるときは「枠の中」として扱う（安全な側）。テーマを当てる（保存データを読む）より前に判定する。文言は `textContent` で入れ、HTML として挿入しない
- **S-2 で防げないもの**（計画 3章、承認済み）：同じオリジンの姉妹アプリからの枠（もともと保存データを直接読めるので、受け入れ済みのリスクの範囲）、ポップアップを使う「ダブルクリック」型のだまし
- **S-3 の限界**：別名にしてからの参照（`const w = window; w[k]`）、`window.window[k]`、`Object.getOwnPropertyDescriptor` は止まらない。テストに「止まらない例」として書き、止まるようになったら上へ移すようにした。SEC-009 は「小さくした」と記録する（解消ではない）
- `Reflect` は `no-restricted-globals` に入れたので、`const R = Reflect` のような別名も止まる。`persistence.ts` の上書きの設定にも入れた

## 3. 主な変更ファイル

- `package.json`・`package-lock.json`：S-1
- `src/frameGuard.ts`（新規）・`src/frameGuard.test.ts`（新規）・`src/main.tsx`：S-2
- `eslint.config.js`・`security/eslint-rules.security.test.ts`：S-3
- `docs/security/checklist.md`・`docs/design.md`・`vite.config.ts`（コメント）：記録
- `docs/handovers/`：この文書と、PR 1 の引き継ぎ文書の archive

## 4. 次の担当 AI への申し送り・注意点

- **レビューの観点**
  - S-2：判定が描画と保存データの読み込みより前にあるか。枠の中で押せるものが残らないか。例外のときに安全な側へ倒れるか
  - S-3：新しい禁止が、今のコード（`src/`・`security/`・テスト）を誤って止めていないか（`npm run lint` が0件）。限界の記述（設計 6.1、テストの「止まらない例」）が正しいか
  - S-1：`npm audit` が 0件か。lint・テスト・ビルドの結果が変わっていないか
  - 文書：SEC-002・003・009 の扱いが、計画 9章の承認と合っているか
- **変えてはいけないもの**：画面の見た目・文言・操作、スキーマ v1、`validateState`。CI の構成
- **このブランチの事情**：このセッションが push できるのは `claude/project-thread-f52lb7` だけなので、PR 1〜4 は同じブランチ名を順に使う。force-push はせず、前の PR のマージ後に main を取り込んで進める
