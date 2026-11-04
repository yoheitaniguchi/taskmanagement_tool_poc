import { configDefaults, defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// 本番ビルドだけに入れる Content-Security-Policy（CLAUDE.md 8.3、docs/security/checklist.md B）。
// connect-src 'none' で、アプリから外部への通信をブラウザ側でも禁止する。
// 開発サーバーは HMR のためにインラインスクリプトや WebSocket を使うので、開発時には入れない。
// frame-ancestors は meta では効かない（GitHub Pages はヘッダーを付けられない）ため入れない。受け入れるリスクとして記録する（PR の本文）
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

function productionCsp(): Plugin {
  return {
    name: "production-csp",
    apply: "build",
    // 文字列の置換ではなく Vite のタグ注入を使い、<head> の書き方に依らず必ず入るようにする
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: PRODUCTION_CSP },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

// GitHub Pages（プロジェクトサイト）は https://<owner>.github.io/<repo>/ 配下で配信されるため、
// build 成果物とその動作確認（vite preview）ではアセットパスの先頭にリポジトリ名を付ける。
// PR プレビューは /<repo>/pr-preview/pr-<番号>/ 配下に配信するので、CI が渡す BASE_PATH を優先する（.github/workflows/pr-preview.yml）
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react(), productionCsp()],
  base: process.env.BASE_PATH ?? (command === "build" || isPreview ? "/taskmanagement_tool_poc/" : "/"),
  // 開発サーバーを外部に公開しない（docs/security/checklist.md F）
  server: { host: "localhost" },
  preview: { host: "localhost" },
  test: {
    exclude: [...configDefaults.exclude],
    // 年度・四半期の境界を日本時間で確かめるため、テストのタイムゾーンを固定する（CI は UTC で動く。CLAUDE.md 5.2）
    env: { TZ: "Asia/Tokyo" },
  },
}));
