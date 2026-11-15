---
trigger: glob
globs: src/components/**/*.tsx
---
# React コンポーネント規約（.agents/rules/react-components.md に配置）

※ Gemini のスリム版テンプレートの例をもとに、このリポジトリの実態に合わせて調整した案。Tailwind 前提の記述は除いてある。

- コンポーネントは関数コンポーネントと Named Export を基本とする
- Props の型定義はコンポーネントの直上に置く
- ドメインロジックは src/domain/ の純粋関数に置き、コンポーネントに混ぜない
- 状態の更新は既存の useReducer の流儀に合わせる（新しい状態管理ライブラリを足さない）
