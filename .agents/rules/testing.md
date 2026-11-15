---
trigger: glob
globs: "**/*.{test,spec}.{ts,tsx}"
---
# テスト規約（.agents/rules/testing.md に配置）

※ Gemini のスリム版テンプレートの例をもとに、このリポジトリの実態に合わせて調整した案。

- テストフレームワークは Vitest を使う
- 実装の内部状態ではなく、利用者から見える振る舞い（表示、操作の結果）をテストする
- DOM 要素の取得は getByRole / getByLabelText / getByText を優先し、getByTestId は最終手段とする
- このアプリは外部 API 通信を持たない。テストでもネットワーク通信を発生させない
- ドメインロジック（src/domain/）のテストを厚くし、画面のテストは主要な操作の確認に絞る
