// データの型（スキーマ v1。CLAUDE.md 5.1、docs/design.md 4.2）。
// 名前は英語、画面の表示は日本語。日時は UTC の ISO 8601（toISOString() の形）、依頼日だけ YYYY-MM-DD。
// このファイルの形を変えたら、検証（validate.ts）と、架空の v1 データの回帰テスト（__fixtures__）も合わせて直す
import type { ThemeId } from "./themes";

export type { ThemeId };

/** 状態の形式の版。JSON・localStorage の読み込みで、これより新しい版は拒否する（CLAUDE.md 8.2） */
export const SCHEMA_VERSION = 1;

export type Quarter = 1 | 2 | 3 | 4;

/** 置く四半期（年度は 2000〜2099。fiscal.ts） */
export interface Placement {
  fiscalYear: number;
  quarter: Quarter;
}

/** すべての要素（テーマを除く）に共通 */
export interface Base {
  /** UUID v4。すべての種類を通じて一意で、置き場の間を移しても変わらない */
  id: string;
  /** 作成日時 */
  createdAt: string;
  /** 更新日時（作成時は作成日時と同じ） */
  updatedAt: string;
}

/** 置き場の要素に共通（明確化で作られたもの・移したもの） */
export interface Placed extends Base {
  /** 収集日時。明確化で作られたら元の項目から引き継ぐ。画面から直接足したものは null */
  capturedAt: string | null;
  /** 最後に置き場の間を移した日時。移したことが無ければ null */
  movedAt: string | null;
}

/** 収集箱の項目 */
export interface InboxItem extends Base {
  /** 内容（500字） */
  text: string;
  /** 収集日時（＝作成日時） */
  capturedAt: string;
}

/** アクション（未着手のものが「次のアクション」） */
export interface Action extends Placed {
  /** 内容（500字） */
  text: string;
  /** null なら単独のアクション */
  projectId: string | null;
  /** 単独のアクションだけが任意で持つ。プロジェクトに属するなら必ず null */
  themeId: ThemeId | null;
  status: "todo" | "done";
  /** 完了のときだけ持つ */
  completedAt: string | null;
  /** メモ（2,000字。空でよい） */
  note: string;
}

/** 連絡待ち */
export interface WaitingFor extends Placed {
  /** 内容（500字） */
  text: string;
  /** 相手（100字、必須） */
  party: string;
  /** 依頼日 YYYY-MM-DD（必須） */
  requestedOn: string;
  projectId: string | null;
  status: "waiting" | "done";
  completedAt: string | null;
  note: string;
}

/** プロジェクト */
export interface Project extends Placed {
  /** 名称（100字、必須） */
  name: string;
  /** 目的とする成果（2,000字、必須） */
  outcome: string;
  themeId: ThemeId;
  /** 置く四半期（0か1つ）。四半期に置いたプロジェクトが、その四半期の主要プロジェクト（CLAUDE.md 5.1） */
  placement: Placement | null;
  status: "active" | "done";
  completedAt: string | null;
  note: string;
}

/** いつか・多分 */
export interface SomedayItem extends Placed {
  /** 内容（500字） */
  text: string;
  note: string;
}

/** 資料 */
export interface ReferenceItem extends Placed {
  /** 件名（500字、必須） */
  title: string;
  /** 本文（10,000字。空でよい） */
  body: string;
}

/** 年次目標（年度 × テーマで1件まで） */
export interface AnnualGoal extends Base {
  fiscalYear: number;
  themeId: ThemeId;
  /** 到達状態（2,000字、必須。空にしたら年次目標そのものを消す） */
  text: string;
}

/** 四半期シート（年度 × 四半期で1件まで） */
export interface QuarterSheet extends Base {
  fiscalYear: number;
  quarter: Quarter;
  /** 重点テーマ（0〜3、重複なし。選んだ順） */
  focusThemeIds: ThemeId[];
  /** やらないこと（2,000字。空でよい） */
  wontDo: string;
}

/** 状態全体（localStorage に保存し、JSON に書き出すもの）。端末名・書き出しの日時はブラウザの設定で、ここには入れない（8.5） */
export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION;
  /** 先頭がいちばん古い */
  inbox: InboxItem[];
  actions: Action[];
  waitingFors: WaitingFor[];
  projects: Project[];
  someday: SomedayItem[];
  references: ReferenceItem[];
  annualGoals: AnnualGoal[];
  quarterSheets: QuarterSheet[];
}

/** 書き出す JSON の外枠（docs/design.md 6.2） */
export interface ExportFile {
  app: "taskmanagement_tool_poc";
  exportedAt: string;
  deviceName: string;
  state: AppState;
}

export function emptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    inbox: [],
    actions: [],
    waitingFors: [],
    projects: [],
    someday: [],
    references: [],
    annualGoals: [],
    quarterSheets: [],
  };
}
