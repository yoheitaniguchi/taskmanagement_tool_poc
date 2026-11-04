import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// アプリが外部と通信しないこと・入力を HTML として挿入しないこと・保存の入口を1か所にすることを、構文の制限で守る
// （CLAUDE.md 8.2・8.3、docs/security/checklist.md B・C・E。プラグインを足さずに済むよう、ESLint の標準のルールで書く）

// 保存の API。src/domain/persistence.ts だけに許す（CLAUDE.md 8.2）
const STORAGE_APIS = ["localStorage", "sessionStorage", "indexedDB"];
// 外部への通信の API（CSP の connect-src 'none' と二重に止める）
const NETWORK_APIS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"];

const restrictedGlobals = (names) =>
  names.map((name) => ({ name, message: `${name} は使わない（docs/security/checklist.md B・E）` }));
const restrictedProperties = (names) =>
  names.map((property) => ({ property, message: `${property} は使わない（docs/security/checklist.md B・C・E）` }));

// どのオブジェクトの上でも禁じるプロパティ（window.localStorage、el.innerHTML、navigator.sendBeacon など）
const HTML_SINKS = ["innerHTML", "outerHTML", "insertAdjacentHTML"];
const OTHER_PROPS = ["sendBeacon", ...NETWORK_APIS];

const noDangerousHtml = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: "dangerouslySetInnerHTML は使わない（入力値はテキストとして表示する。docs/security/checklist.md C）",
};

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "test-results"],
  },
  {
    files: ["**/*.{ts,tsx,js}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      // アプリのコードはブラウザで動くので、Node.js の変数（process など）は使えない
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // 未使用の変数は tsconfig の noUnusedLocals / noUnusedParameters で検出する
      "@typescript-eslint/no-unused-vars": "off",
      // 読み込むファイルの検証は unknown と型ガードで行い、any で検証をすり抜けない（docs/security/checklist.md C）
      "@typescript-eslint/no-explicit-any": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-globals": ["error", ...restrictedGlobals([...STORAGE_APIS, ...NETWORK_APIS])],
      "no-restricted-properties": ["error", ...restrictedProperties([...STORAGE_APIS, ...HTML_SINKS, ...OTHER_PROPS])],
      "no-restricted-syntax": ["error", noDangerousHtml],
    },
  },
  {
    // 保存の入口。Storage API はここでだけ使ってよい（通信と HTML の挿入は、ここでも禁じたまま）
    files: ["src/domain/persistence.ts"],
    rules: {
      "no-restricted-globals": ["error", ...restrictedGlobals(NETWORK_APIS)],
      "no-restricted-properties": ["error", ...restrictedProperties([...HTML_SINKS, ...OTHER_PROPS])],
    },
  },
  {
    // 設定ファイルとテストは Node.js で動く
    files: ["*.{ts,js}", "scripts/**/*.{ts,js}", "security/**/*.ts", "src/**/*.test.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
);
