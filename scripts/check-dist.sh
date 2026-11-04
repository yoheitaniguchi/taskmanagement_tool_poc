#!/usr/bin/env sh
# ビルド成果物（dist）にデータファイルが無いことを確かめる（CLAUDE.md 8.3・8.4）。
# 本番の配信と PR プレビューの両方で、配信の前に実行する
set -eu
[ -d dist ] || { echo "dist がありません" >&2; exit 1; }
if find dist -type f \( -name '*.json' -o -name '*.csv' -o -name '*.tsv' -o -name 'tmpoc-*' \) | grep .; then
  echo "dist にデータファイルが含まれています" >&2
  exit 1
fi
