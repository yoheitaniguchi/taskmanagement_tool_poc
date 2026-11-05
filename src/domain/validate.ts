// 読み込むデータ（書き出した JSON、localStorage の値）の検証（CLAUDE.md 5.3・8.2、docs/design.md 4.6、docs/security/checklist.md C・D）。
// unknown を受け取り、型と値を確かめながら、検証した項目だけで新しいオブジェクトを組み立て直す
// （パースした値をそのまま状態に使ったり、スプレッドで丸ごと写したりしない）。
// 1つでも問題があれば、理由の一覧を返して何も取り込まない。これは整合性の検証であり、意図的な改ざんは検知できない
import { FISCAL_YEAR_MAX, FISCAL_YEAR_MIN, isFiscalYear, isIsoDateTime, isQuarter, isValidDate } from "./fiscal";
import { isThemeId, type ThemeId } from "./themes";
import { charCount, hasForbiddenControl, hasNewline, isBlank } from "./text";
import { isValidDeviceName } from "./transfer";
import {
  SCHEMA_VERSION,
  type Action,
  type AnnualGoal,
  type AppState,
  type ExportFile,
  type InboxItem,
  type Placement,
  type Project,
  type QuarterSheet,
  type ReferenceItem,
  type SomedayItem,
  type WaitingFor,
} from "./types";

/** 上限（docs/design.md 4.7。D10）。ドメインの関数も、これを超える結果を作らない */
export const LIMITS = {
  /** プロジェクトの名称・連絡待ちの相手 */
  nameLength: 100,
  /** 内容（収集箱・アクション・連絡待ち・いつか・多分）・資料の件名 */
  textLength: 500,
  /** メモ・目的とする成果・年次目標・やらないこと */
  longTextLength: 2_000,
  /** 資料の本文 */
  bodyLength: 10_000,
  /** 置き場ごと（収集箱・アクション・連絡待ち・プロジェクト・いつか・多分・資料）の件数 */
  itemsPerList: 10_000,
  /** 年次目標の件数（100年度 × 7テーマ） */
  annualGoals: (FISCAL_YEAR_MAX - FISCAL_YEAR_MIN + 1) * 7,
  /** 1つの四半期シートの重点テーマの数（CLAUDE.md 5.3） */
  focusThemes: 3,
  /** 四半期シートの件数（100年度 × 4四半期） */
  quarterSheets: (FISCAL_YEAR_MAX - FISCAL_YEAR_MIN + 1) * 4,
  /** 状態全体を JSON にしたときの文字数 */
  stateChars: 6_000_000,
  /** 読み込む JSON ファイルの大きさ（バイト）。上限いっぱいの状態がすべて日本語（1文字3バイト）でも収まる */
  importBytes: 32 * 1024 * 1024,
  /** 入れ子の深さ（外枠 → 状態 → 一覧 → 要素 → 置く四半期 で 5） */
  maxDepth: 10,
  /** 利用者に返す理由の件数 */
  maxErrors: 20,
} as const;

export type ValidationResult = { ok: true; state: AppState } | { ok: false; errors: string[] };
export type ExportValidationResult = { ok: true; file: ExportFile } | { ok: false; errors: string[] };

const APP_NAME = "taskmanagement_tool_poc";
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Rec = Record<string, unknown>;

function isPlainRecord(v: unknown): v is Rec {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** 日時を時刻として比べる値（文字列の大小で比べない） */
const timeOf = (iso: string) => Date.parse(iso);

/** 危険なキーと深すぎる入れ子を、どの階層にあっても、ほかの検証より先に見つける */
export function findForbiddenKeys(value: unknown, path = "$", depth = 0, found: string[] = []): string[] {
  if (found.length >= LIMITS.maxErrors) return found;
  if (depth > LIMITS.maxDepth) {
    found.push(`${path}：入れ子が深すぎます`);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => findForbiddenKeys(v, `${path}[${i}]`, depth + 1, found));
  } else if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        found.push(`${path}：使えない項目名「${key}」があります`);
        continue;
      }
      findForbiddenKeys((value as Rec)[key], `${path}.${shorten(key)}`, depth + 1, found);
    }
  }
  return found;
}

/** エラーの文言に入れる項目名は短く切る（とても長い項目名で文言が膨らまないように） */
function shorten(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

interface TextSpec {
  label: string;
  max: number;
  required: boolean;
  multiline: boolean;
}

const T = {
  text: { label: "内容", max: LIMITS.textLength, required: true, multiline: false },
  title: { label: "件名", max: LIMITS.textLength, required: true, multiline: false },
  name: { label: "名称", max: LIMITS.nameLength, required: true, multiline: false },
  party: { label: "相手", max: LIMITS.nameLength, required: true, multiline: false },
  outcome: { label: "目的とする成果", max: LIMITS.longTextLength, required: true, multiline: true },
  note: { label: "メモ", max: LIMITS.longTextLength, required: false, multiline: true },
  body: { label: "本文", max: LIMITS.bodyLength, required: false, multiline: true },
  goal: { label: "到達状態", max: LIMITS.longTextLength, required: true, multiline: true },
  wontDo: { label: "やらないこと", max: LIMITS.longTextLength, required: false, multiline: true },
} satisfies Record<string, TextSpec>;

/** 項目を1つずつ読み、問題があれば errors に日本語で積む */
class Reader {
  readonly errors: string[] = [];

  fail(path: string, message: string): void {
    this.errors.push(`${path}：${message}`);
  }

  /** 決まった項目だけを持つオブジェクトか（知らない項目・欠けた項目を拒否する） */
  record(v: unknown, path: string, keys: readonly string[]): Rec | null {
    if (!isPlainRecord(v)) {
      this.fail(path, "形が正しくありません");
      return null;
    }
    const allowed = new Set(keys);
    for (const k of Object.keys(v)) if (!allowed.has(k)) this.fail(path, `知らない項目「${shorten(k)}」があります`);
    let complete = true;
    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) {
        this.fail(path, `項目「${k}」がありません`);
        complete = false;
      }
    }
    return complete ? v : null;
  }

  list<T>(v: unknown, path: string, max: number, item: (x: unknown, p: string) => T | null): T[] {
    if (!Array.isArray(v)) {
      this.fail(path, "一覧ではありません");
      return [];
    }
    if (v.length > max) {
      this.fail(path, `件数が多すぎます（${v.length}件。上限は${max}件）`);
      return [];
    }
    const out: T[] = [];
    v.forEach((x, i) => {
      const r = item(x, `${path}の${i + 1}件目`);
      if (r !== null) out.push(r);
    });
    return out;
  }

  text(rec: Rec, key: string, path: string, spec: TextSpec): string {
    const v = rec[key];
    if (typeof v !== "string") {
      this.fail(path, `${spec.label}が文字列ではありません`);
      return "";
    }
    if (spec.required && isBlank(v)) this.fail(path, `${spec.label}が空です`);
    const n = charCount(v);
    if (n > spec.max) this.fail(path, `${spec.label}が長すぎます（${n}字。上限は${spec.max}字）`);
    if (!spec.multiline && hasNewline(v)) this.fail(path, `${spec.label}に改行があります`);
    if (hasForbiddenControl(v)) this.fail(path, `${spec.label}に使えない制御文字があります`);
    return v;
  }

  id(rec: Rec, path: string): string {
    const v = rec.id;
    if (typeof v !== "string" || !UUID_RE.test(v)) {
      this.fail(path, "id の形が正しくありません");
      return "";
    }
    return v;
  }

  /** id で参照する値（null を許す） */
  refId(rec: Rec, key: string, path: string, label: string): string | null {
    const v = rec[key];
    if (v === null) return null;
    if (typeof v !== "string" || !UUID_RE.test(v)) {
      this.fail(path, `${label}の形が正しくありません`);
      return null;
    }
    return v;
  }

  dateTime(rec: Rec, key: string, path: string, label: string): string {
    const v = rec[key];
    if (!isIsoDateTime(v)) {
      this.fail(path, `${label}が日時（UTC の ISO 8601）ではありません`);
      return "";
    }
    return v;
  }

  dateTimeOrNull(rec: Rec, key: string, path: string, label: string): string | null {
    return rec[key] === null ? null : this.dateTime(rec, key, path, label);
  }

  /** a ≦ b（どちらかが読めなかったときは、そちらのエラーだけにする） */
  order(path: string, a: string | null, aLabel: string, b: string | null, bLabel: string): void {
    if (!a || !b) return;
    if (timeOf(a) > timeOf(b)) this.fail(path, `${aLabel}が${bLabel}より後になっています`);
  }

  date(rec: Rec, key: string, path: string, label: string): string {
    const v = rec[key];
    if (typeof v !== "string" || !isValidDate(v)) {
      this.fail(path, `${label}が日付（YYYY-MM-DD）ではありません`);
      return "";
    }
    return v;
  }

  theme(rec: Rec, key: string, path: string): ThemeId | null {
    const v = rec[key];
    if (!isThemeId(v)) {
      this.fail(path, "テーマが正しくありません");
      return null;
    }
    return v;
  }

  oneOf<V extends string>(rec: Rec, key: string, path: string, label: string, values: readonly V[]): V | null {
    const v = rec[key];
    if (typeof v !== "string" || !(values as readonly string[]).includes(v)) {
      this.fail(path, `${label}が正しくありません`);
      return null;
    }
    return v as V;
  }

  fiscalYear(rec: Rec, key: string, path: string): number | null {
    const v = rec[key];
    if (!isFiscalYear(v)) {
      this.fail(path, `年度が正しくありません（${FISCAL_YEAR_MIN}〜${FISCAL_YEAR_MAX}年度の整数）`);
      return null;
    }
    return v;
  }

  quarter(rec: Rec, key: string, path: string): Placement["quarter"] | null {
    const v = rec[key];
    if (!isQuarter(v)) {
      this.fail(path, "四半期が正しくありません（1〜4）");
      return null;
    }
    return v;
  }
}

// ---- 要素ごとの読み方 ----

const BASE_KEYS = ["id", "createdAt", "updatedAt"] as const;
const PLACED_KEYS = [...BASE_KEYS, "capturedAt", "movedAt"] as const;

interface BaseFields {
  id: string;
  createdAt: string;
  updatedAt: string;
}

function readBase(r: Reader, rec: Rec, path: string): BaseFields {
  const id = r.id(rec, path);
  const createdAt = r.dateTime(rec, "createdAt", path, "作成日時");
  const updatedAt = r.dateTime(rec, "updatedAt", path, "更新日時");
  r.order(path, createdAt, "作成日時", updatedAt, "更新日時");
  return { id, createdAt, updatedAt };
}

/** 置き場の要素に共通（収集日時 ≦ 作成日時、作成日時 ≦ 移動日時 ≦ 更新日時） */
function readPlaced(r: Reader, rec: Rec, path: string) {
  const base = readBase(r, rec, path);
  const capturedAt = r.dateTimeOrNull(rec, "capturedAt", path, "収集日時");
  const movedAt = r.dateTimeOrNull(rec, "movedAt", path, "移動日時");
  r.order(path, capturedAt, "収集日時", base.createdAt, "作成日時");
  r.order(path, base.createdAt, "作成日時", movedAt, "移動日時");
  r.order(path, movedAt, "移動日時", base.updatedAt, "更新日時");
  return { ...base, capturedAt, movedAt };
}

/** 状態と完了日時の整合（完了のものだけが完了日時を持つ。作成日時 ≦ 完了日時 ≦ 更新日時） */
function readCompletion(r: Reader, rec: Rec, path: string, done: boolean | null, base: BaseFields): string | null {
  const completedAt = r.dateTimeOrNull(rec, "completedAt", path, "完了日時");
  if (done === null) return completedAt;
  if (done && completedAt === null && rec.completedAt === null) r.fail(path, "完了なのに完了日時がありません");
  if (!done && rec.completedAt !== null) r.fail(path, "未完了なのに完了日時があります");
  r.order(path, base.createdAt, "作成日時", completedAt, "完了日時");
  r.order(path, completedAt, "完了日時", base.updatedAt, "更新日時");
  return done ? completedAt : null;
}

function readInboxItem(r: Reader, v: unknown, path: string): InboxItem | null {
  const rec = r.record(v, path, [...BASE_KEYS, "text", "capturedAt"]);
  if (!rec) return null;
  const base = readBase(r, rec, path);
  const text = r.text(rec, "text", path, T.text);
  const capturedAt = r.dateTime(rec, "capturedAt", path, "収集日時");
  if (capturedAt && base.createdAt && timeOf(capturedAt) !== timeOf(base.createdAt)) r.fail(path, "収集日時が作成日時と違います");
  return { id: base.id, createdAt: base.createdAt, updatedAt: base.updatedAt, text, capturedAt };
}

function readAction(r: Reader, v: unknown, path: string): Action | null {
  const rec = r.record(v, path, [...PLACED_KEYS, "text", "projectId", "themeId", "status", "completedAt", "note"]);
  if (!rec) return null;
  const p = readPlaced(r, rec, path);
  const text = r.text(rec, "text", path, T.text);
  const projectId = r.refId(rec, "projectId", path, "属するプロジェクト");
  const themeId = rec.themeId === null ? null : r.theme(rec, "themeId", path);
  if (rec.projectId !== null && rec.themeId !== null) r.fail(path, "プロジェクトに属するアクションがテーマを持っています");
  const status = r.oneOf(rec, "status", path, "状態", ["todo", "done"] as const);
  const completedAt = readCompletion(r, rec, path, status === null ? null : status === "done", p);
  const note = r.text(rec, "note", path, T.note);
  return { ...pickPlaced(p), text, projectId, themeId, status: status ?? "todo", completedAt, note };
}

function readWaitingFor(r: Reader, v: unknown, path: string): WaitingFor | null {
  const rec = r.record(v, path, [...PLACED_KEYS, "text", "party", "requestedOn", "projectId", "status", "completedAt", "note"]);
  if (!rec) return null;
  const p = readPlaced(r, rec, path);
  const text = r.text(rec, "text", path, T.text);
  const party = r.text(rec, "party", path, T.party);
  const requestedOn = r.date(rec, "requestedOn", path, "依頼日");
  const projectId = r.refId(rec, "projectId", path, "属するプロジェクト");
  const status = r.oneOf(rec, "status", path, "状態", ["waiting", "done"] as const);
  const completedAt = readCompletion(r, rec, path, status === null ? null : status === "done", p);
  const note = r.text(rec, "note", path, T.note);
  return { ...pickPlaced(p), text, party, requestedOn, projectId, status: status ?? "waiting", completedAt, note };
}

function readPlacement(r: Reader, v: unknown, path: string): Placement | null {
  if (v === null) return null;
  const rec = r.record(v, `${path}の置く四半期`, ["fiscalYear", "quarter"]);
  if (!rec) return null;
  const fiscalYear = r.fiscalYear(rec, "fiscalYear", `${path}の置く四半期`);
  const quarter = r.quarter(rec, "quarter", `${path}の置く四半期`);
  return fiscalYear === null || quarter === null ? null : { fiscalYear, quarter };
}

function readProject(r: Reader, v: unknown, path: string): Project | null {
  const rec = r.record(v, path, [...PLACED_KEYS, "name", "outcome", "themeId", "placement", "status", "completedAt", "note"]);
  if (!rec) return null;
  const p = readPlaced(r, rec, path);
  const name = r.text(rec, "name", path, T.name);
  const outcome = r.text(rec, "outcome", path, T.outcome);
  const themeId = r.theme(rec, "themeId", path);
  const placement = readPlacement(r, rec.placement, path);
  const status = r.oneOf(rec, "status", path, "状態", ["active", "done"] as const);
  const completedAt = readCompletion(r, rec, path, status === null ? null : status === "done", p);
  const note = r.text(rec, "note", path, T.note);
  return { ...pickPlaced(p), name, outcome, themeId: themeId ?? "other", placement, status: status ?? "active", completedAt, note };
}

function readSomeday(r: Reader, v: unknown, path: string): SomedayItem | null {
  const rec = r.record(v, path, [...PLACED_KEYS, "text", "note"]);
  if (!rec) return null;
  const p = readPlaced(r, rec, path);
  return { ...pickPlaced(p), text: r.text(rec, "text", path, T.text), note: r.text(rec, "note", path, T.note) };
}

function readReference(r: Reader, v: unknown, path: string): ReferenceItem | null {
  const rec = r.record(v, path, [...PLACED_KEYS, "title", "body"]);
  if (!rec) return null;
  const p = readPlaced(r, rec, path);
  return { ...pickPlaced(p), title: r.text(rec, "title", path, T.title), body: r.text(rec, "body", path, T.body) };
}

function readAnnualGoal(r: Reader, v: unknown, path: string): AnnualGoal | null {
  const rec = r.record(v, path, [...BASE_KEYS, "fiscalYear", "themeId", "text"]);
  if (!rec) return null;
  const base = readBase(r, rec, path);
  const fiscalYear = r.fiscalYear(rec, "fiscalYear", path);
  const themeId = r.theme(rec, "themeId", path);
  const text = r.text(rec, "text", path, T.goal);
  return { ...base, fiscalYear: fiscalYear ?? FISCAL_YEAR_MIN, themeId: themeId ?? "other", text };
}

function readQuarterSheet(r: Reader, v: unknown, path: string): QuarterSheet | null {
  const rec = r.record(v, path, [...BASE_KEYS, "fiscalYear", "quarter", "focusThemeIds", "wontDo"]);
  if (!rec) return null;
  const base = readBase(r, rec, path);
  const fiscalYear = r.fiscalYear(rec, "fiscalYear", path);
  const quarter = r.quarter(rec, "quarter", path);
  const focusThemeIds: ThemeId[] = [];
  const raw = rec.focusThemeIds;
  if (!Array.isArray(raw)) {
    r.fail(path, "重点テーマが一覧ではありません");
  } else if (raw.length > LIMITS.focusThemes) {
    r.fail(path, `重点テーマが多すぎます（${raw.length}つ。上限は${LIMITS.focusThemes}つ）`);
  } else {
    for (const t of raw) {
      if (!isThemeId(t)) r.fail(path, "重点テーマに正しくないテーマがあります");
      else if (focusThemeIds.includes(t)) r.fail(path, "重点テーマが重複しています");
      else focusThemeIds.push(t);
    }
  }
  const wontDo = r.text(rec, "wontDo", path, T.wontDo);
  return { ...base, fiscalYear: fiscalYear ?? FISCAL_YEAR_MIN, quarter: quarter ?? 1, focusThemeIds, wontDo };
}

/** 置き場の要素の共通の項目だけを取り出す（読んだ値の写し。入力のオブジェクトは写さない） */
function pickPlaced(p: ReturnType<typeof readPlaced>) {
  return { id: p.id, createdAt: p.createdAt, updatedAt: p.updatedAt, capturedAt: p.capturedAt, movedAt: p.movedAt };
}

// ---- 状態全体 ----

const STATE_KEYS = [
  "schemaVersion",
  "inbox",
  "actions",
  "waitingFors",
  "projects",
  "someday",
  "references",
  "annualGoals",
  "quarterSheets",
] as const;

/** 状態の理由の一覧を、利用者に見せる件数に切りそろえる */
function limitErrors(errors: string[]): string[] {
  if (errors.length <= LIMITS.maxErrors) return errors;
  return [...errors.slice(0, LIMITS.maxErrors), `ほかに${errors.length - LIMITS.maxErrors}件の問題があります`];
}

/**
 * 状態全体（AppState）を検証する。localStorage の値も、書き出した JSON の中身も、これを通す（CLAUDE.md 8.2）。
 * 問題が1つでもあれば、一部も取り込まない
 */
export function validateState(value: unknown): ValidationResult {
  const forbidden = findForbiddenKeys(value);
  if (forbidden.length > 0) return { ok: false, errors: limitErrors(forbidden) };
  if (!isPlainRecord(value)) return { ok: false, errors: ["データの形が正しくありません"] };

  // 版は、ほかの項目より先に確かめる（新しい版は項目が違うので、項目ごとの理由を並べても役に立たない）
  const version = value.schemaVersion;
  if (typeof version === "number" && Number.isInteger(version) && version > SCHEMA_VERSION) {
    return { ok: false, errors: ["このアプリより新しい版のデータです。アプリを更新してから読み込んでください"] };
  }
  if (version !== SCHEMA_VERSION) return { ok: false, errors: ["データの形式の版が正しくありません"] };

  const r = new Reader();
  const rec = r.record(value, "データ全体", STATE_KEYS);
  if (!rec) return { ok: false, errors: limitErrors(r.errors) };

  const n = LIMITS.itemsPerList;
  const state: AppState = {
    schemaVersion: SCHEMA_VERSION,
    inbox: r.list(rec.inbox, "収集箱の項目", n, (x, p) => readInboxItem(r, x, p)),
    actions: r.list(rec.actions, "アクション", n, (x, p) => readAction(r, x, p)),
    waitingFors: r.list(rec.waitingFors, "連絡待ち", n, (x, p) => readWaitingFor(r, x, p)),
    projects: r.list(rec.projects, "プロジェクト", n, (x, p) => readProject(r, x, p)),
    someday: r.list(rec.someday, "いつか・多分", n, (x, p) => readSomeday(r, x, p)),
    references: r.list(rec.references, "資料", n, (x, p) => readReference(r, x, p)),
    annualGoals: r.list(rec.annualGoals, "年次目標", LIMITS.annualGoals, (x, p) => readAnnualGoal(r, x, p)),
    quarterSheets: r.list(rec.quarterSheets, "四半期シート", LIMITS.quarterSheets, (x, p) => readQuarterSheet(r, x, p)),
  };
  if (r.errors.length > 0) return { ok: false, errors: limitErrors(r.errors) };

  const errors = checkRelations(state);
  if (errors.length > 0) return { ok: false, errors: limitErrors(errors) };

  const size = stateSize(state);
  if (size > LIMITS.stateChars) {
    return { ok: false, errors: [`データ全体が大きすぎます（${size.toLocaleString("ja-JP")}字。上限は${LIMITS.stateChars.toLocaleString("ja-JP")}字）`] };
  }
  return { ok: true, state };
}

/**
 * 状態全体の大きさ（JSON にしたときの文字数。UTF-16 の単位）。上限（LIMITS.stateChars）と比べるのは、この関数だけにする
 * （ドメインの関数と読み込みで数え方が違うと、保存できたのに次の起動で読めない状態ができるため。docs/design.md 4.6）
 */
export function stateSize(state: AppState): number {
  return JSON.stringify(state).length;
}

/** 要素をまたぐルール（id の一意、参照、完了したプロジェクトの子、年次目標・四半期シートの一意） */
function checkRelations(state: AppState): string[] {
  const errors: string[] = [];

  // id はすべての種類を通じて一意（置き場の間を移しても変わらないため。5.1）
  const seen = new Map<string, string>();
  const lists: [string, { id: string }[]][] = [
    ["収集箱の項目", state.inbox],
    ["アクション", state.actions],
    ["連絡待ち", state.waitingFors],
    ["プロジェクト", state.projects],
    ["いつか・多分", state.someday],
    ["資料", state.references],
    ["年次目標", state.annualGoals],
    ["四半期シート", state.quarterSheets],
  ];
  for (const [label, items] of lists) {
    items.forEach((item, i) => {
      const path = `${label}の${i + 1}件目`;
      const first = seen.get(item.id);
      if (first) errors.push(`${path}：id が${first}と重複しています`);
      else seen.set(item.id, path);
    });
  }

  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const checkChild = (label: string, items: (Action | WaitingFor)[], openStatus: string) => {
    items.forEach((item, i) => {
      if (item.projectId === null) return;
      const path = `${label}の${i + 1}件目`;
      const project = projects.get(item.projectId);
      if (!project) errors.push(`${path}：属するプロジェクトが見つかりません`);
      else if (project.status === "done" && item.status === openStatus) {
        errors.push(`${path}：完了したプロジェクトに、未完了のまま属しています`);
      }
    });
  };
  checkChild("アクション", state.actions, "todo");
  checkChild("連絡待ち", state.waitingFors, "waiting");

  const goalKeys = new Set<string>();
  state.annualGoals.forEach((g, i) => {
    const key = `${g.fiscalYear}:${g.themeId}`;
    if (goalKeys.has(key)) errors.push(`年次目標の${i + 1}件目：同じ年度・テーマの年次目標がほかにもあります`);
    goalKeys.add(key);
  });
  const sheetKeys = new Set<string>();
  state.quarterSheets.forEach((s, i) => {
    const key = `${s.fiscalYear}:${s.quarter}`;
    if (sheetKeys.has(key)) errors.push(`四半期シートの${i + 1}件目：同じ年度・四半期の四半期シートがほかにもあります`);
    sheetKeys.add(key);
  });
  return errors;
}

/**
 * 書き出した JSON の外枠を検証する（docs/design.md 4.6・6.2）。外枠の無い生の状態は受け付けない
 * （既存PoC のファイルなど、別のアプリのファイルを誤って読まないため）
 */
export function validateExport(value: unknown): ExportValidationResult {
  const forbidden = findForbiddenKeys(value);
  if (forbidden.length > 0) return { ok: false, errors: limitErrors(forbidden) };
  if (!isPlainRecord(value) || value.app !== APP_NAME) {
    return { ok: false, errors: ["このアプリが書き出したファイルではありません"] };
  }
  const r = new Reader();
  const rec = r.record(value, "ファイル", ["app", "exportedAt", "deviceName", "state"]);
  if (!rec) return { ok: false, errors: limitErrors(r.errors) };
  const exportedAt = r.dateTime(rec, "exportedAt", "ファイル", "書き出した日時");
  const deviceName = rec.deviceName;
  if (!isValidDeviceName(deviceName)) {
    r.fail("ファイル", "書き出した端末の名前が正しくありません");
    return { ok: false, errors: limitErrors(r.errors) };
  }
  if (r.errors.length > 0) return { ok: false, errors: limitErrors(r.errors) };

  const result = validateState(rec.state);
  if (!result.ok) return result;
  return { ok: true, file: { app: APP_NAME, exportedAt, deviceName, state: result.state } };
}
