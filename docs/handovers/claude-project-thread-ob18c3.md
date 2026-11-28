# 引き継ぎ：方向性メモ（2026-11-15）をリポジトリに残す

- **最終更新日時：** 2026-11-28 22:20（日本時間）
- **最終担当 AI：** Claude Code（文書の担当）
- **対象ブランチ：** `claude/project-thread-ob18c3`
- **関連 Issue / PR：** Issue #60（この PR で閉じる）、この PR。#51 の引き継ぎ文書は `docs/handovers/archive/claude-project-thread-f52lb7-issue50.md` に移した（AGENTS.md 6章）

## 1. 現在のステータス

- [x] `docs/direction-2026-11-15.md` を足した（内容は Issue #56 の 2026-11-28 のムーのコメントのとおり）
- [x] #51 の引き継ぎ文書を archive へ移した
- [ ] 発注者のレビューとマージ（12/27 より前）

## 2. 設計上の決定事項・前提

- 方向性メモは「現時点の方向性で、確定ではない」と明記し、AGENTS.md 9章の「仕様の正」には入れない（フェーズ1の仕様を変えないため）
- 置き場所は `docs/` の直下（企画書・振り返りと同じ層。AI 向けのルールではないため `docs/ai/` には置かない）
- 関係する Issue（#56・#57）と変更要求（CR-007・CR-010）との関係を表で添えた。#56・#57 の扱いは、2026-11-28 に発注者が承認した Issue #53〜#59 の検討の確認事項（Q9・Q12）による

## 3. 主な変更ファイル

- `docs/direction-2026-11-15.md`：新規（方向性メモ）
- `docs/handovers/claude-project-thread-f52lb7.md` → `docs/handovers/archive/claude-project-thread-f52lb7-issue50.md`：移動のみ（中身は変えていない）
- `docs/handovers/claude-project-thread-ob18c3.md`：この文書

## 4. 次の担当 AI への申し送り・注意点

- この PR がマージされたら、この引き継ぎ文書を次の作業の PR で `docs/handovers/archive/` へ移す
- アプリのコード・依存・CI は変えていない
- AGENTS.md v0.2 の試し運転（PR 13〜15）の振り返りは、まだ記録されていない（`docs/ai/詳細ルール.md` 6章）
