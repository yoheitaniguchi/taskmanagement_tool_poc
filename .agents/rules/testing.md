---
trigger: glob
globs: "**/*.{test,spec}.{ts,tsx}"
---
# テスト規約（.agents/rules/testing.md に配置）

※ Gemini のスリム版テンプレートの例をもとに、このリポジトリの実態に合わせて調整した案。

- テストフレームワークは Vitest を使う
- 実装の内部状態ではなく、利用者から見える振る舞い（表示、操作の結果）をテストする
- 今は画面のテスト（.test.tsx）も Testing Library も無い。画面のテストを足すときは、Testing Library を足す理由を示して洋平さんの承認を得る（AGENTS.md 7章）。足した後は、DOM 要素の取得に getByRole / getByLabelText / getByText を優先し、getByTestId は最終手段とする
- セキュリティのテストは、名前に @security を含める（npm run test:security で選べるように）
- このアプリは外部 API 通信を持たない。テストでもネットワーク通信を発生させない
- ドメインロジック（src/domain/）のテストを厚くし、画面のテストは主要な操作の確認に絞る
