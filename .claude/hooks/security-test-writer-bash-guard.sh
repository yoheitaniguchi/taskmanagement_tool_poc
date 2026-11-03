#!/usr/bin/env bash
# security-test-writer サブエージェント専用のPreToolUseフック（Bash用）。
# 追加したテストが実際に動く（脆弱性があれば失敗する）ことをこのサブエージェント自身が確認できるよう、
# テスト実行・型チェック・lintのコマンドだけを許可する。security-reviewer用フックと同様、
# 連結演算子・コマンド置換・リダイレクトは無条件で拒否する。
# 技術スタックはCLAUDE.md 8.1（React・Vite・TypeScript・Vitest）を前提にしている。
set -euo pipefail

# jq が無いと set -e で 127 終了になり、PreToolUse はブロックせずに通してしまう（fail-open）。無ければ拒否する
command -v jq >/dev/null 2>&1 || { echo "フックの実行に jq が必要です（jq が無いためコマンドを拒否しました）" >&2; exit 2; }

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

if printf '%s' "$COMMAND" | grep -qE '(&&|\|\||;|\||`|\$\(|>|<)' || [[ "$COMMAND" == *$'\n'* ]]; then
  echo "security-test-writer: 複数コマンドの連結・リダイレクトは許可されていません: ${COMMAND}" >&2
  exit 2
fi

# tscは出力を書き出さない --noEmit 付きのときだけ許可する
if printf '%s' "$COMMAND" | grep -qE '^npx --no-install tsc' && ! printf '%s' "$COMMAND" | grep -qE -- '--noEmit'; then
  echo "security-test-writer: npx --no-install tsc は --noEmit 付きでのみ許可されています: ${COMMAND}" >&2
  exit 2
fi

# npx は --no-install 付きに限る（未インストールのとき、npmから同名の別パッケージを取ってきて実行するのを防ぐ）
ALLOW_PATTERNS=(
  '^npm test( .*)?$'
  '^npm run test:security( .*)?$'
  '^npm run lint( .*)?$'
  '^npx --no-install vitest run( .*)?$'
  '^npx --no-install tsc( .*)?$'
)

for pattern in "${ALLOW_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qE "$pattern"; then
    exit 0
  fi
done

echo "security-test-writer: テスト実行・型チェック・lint以外のコマンドは許可されていません。拒否したコマンド: ${COMMAND}" >&2
exit 2
