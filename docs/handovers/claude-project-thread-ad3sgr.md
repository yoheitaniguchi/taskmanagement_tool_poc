# 引き継ぎ：PR 13 データを守る（保存の保護、読み込みの確認で書き出しと置き換えを2段に）

- **最終更新日時：** 2026-11-15 22:10（日本時間）
- **最終担当 AI：** Claude Code（実装担当）
- **対象ブランチ：** `claude/project-thread-ad3sgr`
- **関連 Issue / PR：** Issue は作成予定。前の PR #32 は、新しい進め方（AGENTS.md 3章）でやり直すために洋平さんが閉じた（2026-11-15）
- **計画：** `docs/plans/improvements-after-retrospective.md` の 2.4（IMP-07）・2.5（IMP-08）。改善提案 `docs/reviews/improvement-review-2026-11-09.md` の 6.2・6.3

この PR は、詳細ルール 6章の試し運転の1本目です。実装は Claude Code が済ませたので、**レビューは別の AI が行います**（AGENTS.md 2章「作った人は、確かめない」）。

## 1. 現在のステータス

- [x] IMP-07：起動時に保存の保護（`navigator.storage.persist()`）を1回求め、⋯ メニューに状態を出す
- [x] IMP-08：JSON の読み込みの確認で、変更があるときは書き出しと置き換えを2段にする
- [x] ESLint で `navigator.storage`・`cookie`・`cookieStore`・`caches`・`storageBuckets`・`openDatabase` を `persistence.ts` の外で禁じる
- [x] 文書：`docs/design.md`（3.1・4.5・6.1・6.2・8章・変更履歴）、`docs/weekly-review.md`（2.1・2.2・5章）
- [x] 型チェック・lint・テスト（341件、`@security` を含む）・ビルドが通る（main f38701b の上で確認）
- [x] 実装担当の自己点検：Claude Code のサブエージェント（domain-reviewer・ux-reviewer・security-reviewer）の指摘を反映済み。ただし、これは「別の AI のレビュー」には数えない
- [ ] **別の AI によるレビュー**（下の4章の観点）
- [ ] **画面の確認**：PC と Android の Chrome で、⋯ メニューの「保存の保護」の表示と、読み込みの確認の2段の動き（Built-in browser・DevTools での確認を含む。Claude Code のクラウド環境では実機の確認ができない）
- [ ] 洋平さんがプレビューで操作して確かめ、マージする

## 2. 設計上の決定事項・前提

- **保存の保護の結果は画面の状態だけで持つ**。`AppState`・書き出す JSON・このブラウザの設定（`v1:device`）には入れない（スキーマ v1 と `validateState` を変えないため。AGENTS.md 7章）
- **`navigator.storage` に触るのは `persistence.ts` の `getStorageManager()` だけ**。`requestPersistence(manager)` は偽物を渡してテストする（`navigator` に触らない）
- **状態の判定**：`persisted()` や `persist` が無い・`persisted()` が失敗 →「このブラウザでは使えません」。`persisted()` が true →「あり」（`persist()` は呼ばない）。`persist()` が false か失敗 →「なし」（状態は読めたので、使えるが保護されていない）
- **読み込みの確認のボタンは純粋な関数 `importActions(changed, exportBlocked, exportedAt)` で決める**（`src/domain/transfer.ts`）
  - 変更があり書き出せる：［今のデータを書き出す］が主ボタン、［書き出さずに置き換える］は危険のボタン
  - 書き出した後：［今のデータを書き出す］は同じ位置に残す（主ボタンではなくなる）。ボタン名は［置き換える］になり、「ダウンロード完了」を確かめる案内を出す
  - 変更があるのに書き出せない（端末名が無い・読み取り専用）：理由を出し、［書き出さずに置き換える］の1つ
- **ダウンロードの保存が終わったかは、アプリから分からない**（`<a download>` を押すだけのため）。だから、書き出しと置き換えを1回の操作にせず、利用者が確かめてから置き換える2段にした（計画 7.1 の6で決定）
- **計画から変えたこと**（ux-reviewer・security-reviewer の指摘による。洋平さんの確認待ち）
  1. 書き出した後も書き出しのボタンを同じ位置に残す（計画は「［置き換える］の1つに変わる」。続けて押した指の位置に［置き換える］が来ないように）
  2. 変更があるのに書き出せないときのボタン名を［書き出さずに置き換える］にする（計画は［置き換える］）
  3. 保存の保護の表示を「あり／なし／このブラウザでは使えません」にし、`persist()` の失敗は「なし」にする（計画のテストの項は「どれも unsupported」）
  4. ESLint の禁止に `storageBuckets`・`openDatabase` を足し、`.jsx`・`.mjs`・`.cjs` も対象にする

## 3. 主な変更ファイル

- `src/domain/persistence.ts`：`getStorageManager`・`requestPersistence`（と `persistence.test.ts`）
- `src/domain/transfer.ts`：`importActions`（と `transfer.test.ts`）
- `src/components/ImportDialog.tsx`：読み込みの確認の2段
- `src/components/AppHeader.tsx`：⋯ メニューの「保存の保護」の表示
- `src/state/usePersistedState.ts`：起動時に1回 `requestPersistence` を呼ぶ
- `src/App.tsx`：書き出しの結果（日時とファイル名）を確認画面へ渡す
- `src/components/TransferWarning.tsx`：書き出したファイル名の表示と、読み込みの確認では書き出しのボタンを操作の行に置く切替（`exportInActions`）
- `src/components/ClearDialog.tsx`：書き出しの結果の形（日時とファイル名）に合わせた小さな変更
- `eslint.config.js`・`security/eslint-rules.security.test.ts`：保存の API の禁止と、その回帰テスト（`@security`）
- `docs/design.md`・`docs/weekly-review.md`：設計と手順書

## 4. 次の担当 AI への申し送り・注意点

- **レビューの観点**
  - 計画 2.4・2.5 と実装が合っているか。上の「計画から変えたこと」の4点が妥当か
  - `importActions` のすべての組み合わせ（変更あり・なし、書き出し前・後、端末名が無い、読み取り専用、読めなかった保存データがある）がテストにあるか
  - `requestPersistence` の失敗の扱い（`persisted()`・`persist()` の reject、関数が無い、`navigator.storage` が無い）
  - スマホでは `.modal__actions` の並びが逆になる。危険のボタン［書き出さずに置き換える］が、いちばん目立つ位置に来ていないか（幅360px）
  - `localStorage`・`navigator.storage` に触るのが `persistence.ts` だけになっているか（ESLint と回帰テスト）
- **変えてはいけないもの**：スキーマ v1、`validateState`（厳しくしない）、保存のキー。依存パッケージ・CI・外部との通信は足さない（AGENTS.md 7章）
- **保存データの消去の確認（`ClearDialog`）と、起動時に保存データを読めなかったとき（`UnreadableWarning`）の動きは変えていない**（計画 1.2）
- **確かめ方**：PR プレビューの ⋯ →「JSONを読み込む」で、架空のデータ `src/domain/__fixtures__/review-demo.json` を読み込む。少し変更してから、もう一度「JSONを読み込む」を開くと2段の確認が出る。プレビューに実データを入れない
- **Firefox**：開いたときに「データを保存する」の許可を尋ねられることがある（手順書 2.1 の5）
- **このブランチの事情**：Claude Code のこのセッションが push できるのは `claude/project-thread-ad3sgr` だけなので、PR 13〜15 は同じブランチ名を順に使う。PR 14・15 の実装も手元にあり、PR 13 のマージ後に同じ形で出す
