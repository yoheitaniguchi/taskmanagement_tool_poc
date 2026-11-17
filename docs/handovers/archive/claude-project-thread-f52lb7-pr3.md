# 引き継ぎ：プログラムの最適化 — PR 3 技術負債と品質（T-1・Q-1・Q-2）

- **最終更新日時：** 2026-11-17 15:25（日本時間）
- **最終担当 AI：** Claude Code（実装の担当）
- **対象ブランチ：** `claude/project-thread-f52lb7`
- **関連 Issue / PR：** Issue #45、この PR（PR 3）。PR 2（#47）の引き継ぎ文書は `docs/handovers/archive/claude-project-thread-f52lb7-pr2.md` に移した（AGENTS.md 6章）
- **計画：** `docs/plans/code-optimization.md` の T-1・Q-1・Q-2（2026-11-17 承認）

Claude Code が実装したので、**レビューは別の AI が行います**（AGENTS.md 2章）。画面の見た目・文言・操作は変えていません。

## 1. 現在のステータス

- [x] T-1：「操作の種類 → ドメインの関数と『元に戻す』の文言」の対応を `src/domain/reducer.ts` の `operate` 1か所にまとめた。reducer と `src/App.tsx` の失敗の理由の両方が使う。`App.tsx` は 404行 → 331行
- [x] Q-1：反映の判定を `commitAction`（`reducer.ts`）に切り出し、`src/state/usePersistedState.ts` を `useReducer` から `useState` に替えた。操作1回で reducer を1回だけ呼ぶ。別のタブの変更を知ったら、その場で読み取り専用にする
- [x] Q-2：`tsconfig.json` に `noImplicitReturns`・`noImplicitOverride`。違反の2か所（`ErrorBoundary.tsx`）に `override`
- [x] テストを足した：`operate` の5件（成功の反映、失敗の理由、検証に通らない結果は反映しない、読めない時刻・知らない操作、四半期の移動の文言）、`commitAction` の5件（ふだん、読み取り専用、受け付けられない、変更ありに数えない操作、元に戻す）
- [x] 型チェック・lint・テスト（377件）・ビルドが通る。Chromium（本番ビルド）で、収集・1件ずつの明確化・元に戻す・別のタブの変更での読み取り専用が今までどおり動き、コンソールのエラーが0件であることを確かめた
- [ ] **別の AI によるレビュー**（下の4章の観点）
- [ ] 洋平さんが PR プレビューで確かめてマージする
- [ ] 次：PR 4（`/security-review`、効果の前後の比較の記録、説明資料）

## 2. 設計上の決定事項・前提

- **`operate` は検証しない**。結果をそのまま状態にしない。状態全体の検証（`validateState`）は今までどおり reducer の `applyResult` と、保存の前（`saveToStorage`）に残した
- 読み込み・消去・元に戻す・表示の切替は `operate` に入れない（型 `Operation` で除く）。種類を足したら `operate` の `never` で型のエラーになる
- 変更前の状態から作る文言（四半期の移動、プロジェクトの完了の件数）と、年次目標を消したかの判定（前後の件数）は、移す前と同じ
- `App.tsx` の `run` は、反映できなかったときに `operate` で理由を得る。文言（「このタブでは入れられません」「振り分けられません」「変更できません」）と、変えるものが無かったときに理由を出さないことは今と同じ（収集・明確化・一括振り分けは成功すれば必ず状態が変わるので、まとめても振る舞いは変わらない）
- `usePersistedState`：`rootRef` が最新の状態を持ち、`replaceRoot` で ref と画面の状態を同時に置き換える。消去の手順（状態を作る → `skipNextSave` → 置き換える）の順番は変えていない。StrictMode の reducer の2回呼びによる純粋さの点検は無くなるが、reducer は単体テストで純粋さを保っている

## 3. 主な変更ファイル

- `src/domain/reducer.ts`：`operate`・`Operation`・`Outcome`・`commitAction`
- `src/domain/reducer.test.ts`：上のテスト
- `src/App.tsx`：操作は `run({ ... })` の1行ずつに
- `src/state/usePersistedState.ts`：`useState` と `commitAction`
- `tsconfig.json`・`src/components/ErrorBoundary.tsx`：Q-2
- `docs/design.md`：4.5 の表（`reducer.ts`）、6.3、変更の記録

## 4. 次の担当 AI への申し送り・注意点

- **レビューの観点**
  - T-1：`operate` の各 case が、元の reducer の case と同じ関数・引数・文言か（`git diff origin/main -- src/domain/reducer.ts`）。`App.tsx` の各操作が、元と同じ操作の値を作っているか（とくに `placeProject` の2か所、`createProject` の id、明確化の id 2つ）
  - Q-1：読み取り専用のタブで反映されないこと、読み込み・消去・別のタブの検知で「元に戻す」と自動保存が今と同じに動くこと
  - 検証の迂回が無いこと：`operate` の結果が状態になる経路は `applyResult` だけか
- **変えてはいけないもの**：画面の見た目・文言・操作、スキーマ v1、`validateState`。依存・CI
- **このブランチの事情**：PR 1〜4 は同じブランチ名を順に使う。force-push はせず、前の PR のマージ後に main を取り込んで進める
