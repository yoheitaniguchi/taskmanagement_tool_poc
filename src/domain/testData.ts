// テスト用の架空のデータ（実データを使わない。CLAUDE.md 8.3）
import fixture from "./__fixtures__/export-v1.json";
import { emptyState, type AppState } from "./types";
import { LIMITS, stateSize, validateState } from "./validate";

/** 架空の v1 データ（すべての種類を含む）を、検証を通した形で返す */
export function sampleState(): AppState {
  const r = validateState(structuredClone(fixture.state));
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.state;
}

/** JSON にしたときに、ちょうど状態全体の上限（600万字）になる状態。本文はすべて日本語 */
export function fullState(): AppState {
  const reference = (i: number, bodyLength: number) => ({
    id: `00000000-0000-4000-8000-${String(100000 + i).padStart(12, "0")}`,
    createdAt: "2026-11-04T00:00:00.000Z",
    updatedAt: "2026-11-04T00:00:00.000Z",
    capturedAt: null,
    movedAt: null,
    title: `テスト用の資料${i}`,
    body: "あ".repeat(bodyLength),
  });
  const state = emptyState();
  let size = stateSize(state);
  for (let i = 0; size < LIMITS.stateChars; i++) {
    const overhead = JSON.stringify(reference(i, 0)).length + (state.references.length > 0 ? 1 : 0);
    const bodyLength = Math.min(LIMITS.bodyLength, LIMITS.stateChars - size - overhead);
    if (bodyLength < 0) break;
    state.references.push(reference(i, bodyLength));
    size += overhead + bodyLength;
  }
  return state;
}
