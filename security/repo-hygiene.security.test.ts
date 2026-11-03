// リポジトリの設定に関するセキュリティテスト（CLAUDE.md 8.3・8.4、docs/security/checklist.md A・B・F）。
// リポジトリと GitHub Pages は公開されているため、実データの混入と CI の権限の広がりを機械的に検査する
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTION_CSP } from "../vite.config";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

// git check-ignore --no-index：.gitignore の規則だけで判定する（終了コード0＝除外、1＝除外されない）
function isIgnored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "--no-index", "-q", path], { cwd: root, stdio: "ignore" });
    return true;
  } catch (e) {
    if ((e as { status?: number }).status === 1) return false;
    throw e;
  }
}

describe("[@security] 実データの混入防止（A）", () => {
  it("[@security] .gitignore がアプリの書き出しファイルと .env を除外し、.env.example だけは残す", () => {
    const lines = read(".gitignore").split("\n").map((l) => l.trim());
    expect(lines).toContain("tmpoc-*");
    expect(lines).toContain(".env*");
    expect(lines).toContain("!.env.example");
  });

  // アプリが書き出すファイル名（docs/design.md 6.2）を、どこに置いても除外する
  for (const p of ["tmpoc-PC-20261103-2015.json", "docs/tmpoc-スマホ-20261103-2015.json", "src/domain/tmpoc-backup-20261103-2015.json", ".env", ".env.local"]) {
    it(`[@security] ${p} は .gitignore で除外される`, () => {
      expect(isIgnored(p)).toBe(true);
    });
  }

  it("[@security] .env.example は除外されない（値を入れない見本だけはコミットする）", () => {
    expect(isIgnored(".env.example")).toBe(false);
  });

  it("[@security] 決められた置き場以外に JSON・CSV・TSV がコミットされていない", () => {
    // 設定ファイルと、テスト用の架空データの置き場（src/**/__fixtures__/）だけを許す
    const allowedConfigs = new Set(["package.json", "package-lock.json", "tsconfig.json"]);
    const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const offending = tracked.filter(
      (f) =>
        /\.(json|csv|tsv)$/i.test(f) &&
        !allowedConfigs.has(f) &&
        !/^src\/(.+\/)?__fixtures__\//.test(f) &&
        !/^\.claude\/settings(\.local)?\.json$/.test(f),
    );
    expect(offending).toEqual([]);
  });
});

describe("[@security] 外部通信の禁止（B）", () => {
  it("[@security] 本番ビルドの CSP が外部への通信とプラグインを禁止している", () => {
    expect(PRODUCTION_CSP).toContain("default-src 'self'");
    expect(PRODUCTION_CSP).toContain("connect-src 'none'");
    expect(PRODUCTION_CSP).toContain("object-src 'none'");
    expect(PRODUCTION_CSP).toContain("base-uri 'self'");
    expect(PRODUCTION_CSP).toContain("form-action 'none'");
  });

  it("[@security] index.html が外部のスクリプト・スタイルを読み込んでいない", () => {
    expect(read("index.html")).not.toMatch(/(src|href)="(https?:)?\/\//);
  });

  it("[@security] 開発サーバーを外部に公開しない（server.host を localhost に固定）", () => {
    expect(read("vite.config.ts")).toMatch(/server:\s*\{\s*host:\s*"localhost"\s*\}/);
  });
});

describe("[@security] CI の権限（F）", () => {
  const dir = join(root, ".github", "workflows");
  // ワークフロー × ジョブ → 認める書き込み権限（これ以外のジョブ・範囲は認めない）
  const WRITE_SCOPES: Record<string, Record<string, string[]>> = {
    "ci.yml": { deploy: ["contents"] },
    "pr-preview.yml": { preview: ["contents", "pull-requests"] },
  };
  const workflows = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

  it("[@security] 本番の配信と PR プレビューのワークフローがある", () => {
    expect(workflows.sort()).toEqual(["ci.yml", "pr-preview.yml"]);
  });

  for (const file of workflows) {
    const text = readFileSync(join(dir, file), "utf8");

    it(`[@security] ${file}：トップレベルの権限が contents: read だけ`, () => {
      expect(text).toMatch(/^permissions:\n {2}contents: read\n(?! )/m);
    });

    it(`[@security] ${file}：pull_request_target を使っていない`, () => {
      expect(text).not.toMatch(/pull_request_target/);
    });

    it(`[@security] ${file}：Action をコミット sha で固定している`, () => {
      const uses = [...text.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
      const unpinned = uses.filter((u) => !/@[0-9a-f]{40}$/.test(u));
      expect(unpinned).toEqual([]);
    });

    // コメントを除いた本文（コメントに書いた文字列で検査を満たせないようにする）
    const code = text
      .split("\n")
      .map((l) => l.replace(/(^|\s)#.*$/, ""))
      .join("\n");
    const jobsPart = code.split(/^jobs:\n/m)[1] ?? "";
    const jobs = jobsPart.split(/^ {2}(?=[a-z][\w-]*:\n)/m).filter(Boolean);

    it(`[@security] ${file}：checkout はすべて persist-credentials: false`, () => {
      const checkouts = code.match(/uses:\s*actions\/checkout@/g)?.length ?? 0;
      const noCredentials = code.match(/^\s+persist-credentials:\s*false\s*$/gm)?.length ?? 0;
      expect(noCredentials).toBe(checkouts);
    });

    it(`[@security] ${file}：書き込み権限は決めた配信のジョブに、決めた範囲だけ。そのジョブはコマンドを実行しない`, () => {
      // 配信のジョブはビルド済みの成果物を受け取って配信するだけにし、依存パッケージのスクリプトや PR のコードに書き込みの権限を渡さない
      for (const job of jobs) {
        const name = job.split(":")[0];
        const writes = [...job.matchAll(/^\s+([a-z-]+):\s*write\s*$/gm)].map((m) => m[1]).sort();
        expect(writes, `${name} ジョブの書き込み権限`).toEqual(WRITE_SCOPES[file]?.[name] ?? []);
        if (writes.length > 0) {
          expect(job, `${name} ジョブが書き込み権限を持ったままコマンドを実行している`).not.toMatch(/^\s+(-\s+)?run:/m);
        }
      }
    });

    if (file === "pr-preview.yml") {
      it(`[@security] ${file}：どのジョブも、このリポジトリのブランチからの PR だけを対象にし、Dependabot の PR を除く`, () => {
        for (const job of jobs) {
          expect(job).toContain("github.event.pull_request.head.repo.full_name == github.repository");
          expect(job).toContain("github.event.pull_request.user.login != 'dependabot[bot]'");
        }
      });
    }
  }
});
