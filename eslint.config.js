import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// アプリが外部と通信しないこと・入力を HTML として挿入しないこと・保存の入口を1か所にすることを、構文の制限で守る
// （CLAUDE.md 8.2・8.3、docs/security/checklist.md B・C・E。プラグインを足さずに済むよう、ESLint の標準のルールで書く）

// 保存の API。src/domain/persistence.ts だけに許す（CLAUDE.md 8.2）。
// storage は navigator.storage（保存の保護。IMP-07）。cookie・cookieStore・caches は、同じオリジンで共有される保存（使っていないが、使わないことをコードで守る。CLAUDE.md 12.6）。
// storageBuckets（独自の保護・indexedDB・caches を持つ）と openDatabase（WebSQL）も、同じ理由で禁じる。
// プロパティの名前だけで禁じるので、window.navigator.storage や const { storage } = navigator も止まる。
// 名前で決まらない参照のうち、よくある形も禁じる（SEC-009）：Reflect（Reflect.get(navigator, "storage") など）と、
// window・navigator などへの変数・式をキーにした参照（window["local" + "Storage"]、navigator[k] など）。下の DYNAMIC_ACCESS。
// それでも、別名にしてからの参照（const w = window; w[k]）、Object.getOwnPropertyDescriptor、window.window[k] などは止まらない。
// わざと避けないと書かない形なので、残りはレビューで守る（docs/design.md 6.1）
const STORAGE_APIS = ["localStorage", "sessionStorage", "indexedDB", "storage", "storageBuckets", "openDatabase", "cookie", "cookieStore", "caches"];
// 外部への通信の API（CSP の connect-src 'none' と二重に止める）
const NETWORK_APIS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"];

const restrictedGlobals = (names) =>
  names.map((name) => ({ name, message: `${name} は使わない（docs/security/checklist.md B・E）` }));
const restrictedProperties = (names) =>
  names.map((property) => ({ property, message: `${property} は使わない（docs/security/checklist.md B・C・E）` }));

// どのオブジェクトの上でも禁じるプロパティ（window.localStorage、el.innerHTML、navigator.sendBeacon など）
const HTML_SINKS = ["innerHTML", "outerHTML", "insertAdjacentHTML"];
// Reflect はプロパティとしても禁じる（window.Reflect・globalThis.Reflect。SEC-010）
const OTHER_PROPS = ["sendBeacon", "Reflect", ...NETWORK_APIS];

// Reflect は使わない（プロパティの名前を文字列で渡して、上の禁止をすり抜けられるため。SEC-009）
const REFLECT = [{ name: "Reflect", message: "Reflect は使わない（保存・通信の禁止をすり抜けられるため。SEC-009）" }];

// ブラウザの大もとのオブジェクトへの、変数・式をキーにした参照（文字のキー window["x"] は no-restricted-properties が見る。SEC-009）。
// 型の変換で包んだ形（(window as X)[k]、window![k]、2重の as）と、1段下の参照（window.navigator[k]）も見る（SEC-010）
const GLOBAL_OBJECTS = ["window", "self", "globalThis", "navigator", "document", "top", "parent", "frames"];
const GLOBAL_NAME = `/^(${GLOBAL_OBJECTS.join("|")})$/`;
const noDynamicGlobalAccess = {
  selector: `MemberExpression[computed=true][property.type!='Literal']:matches([object.name=${GLOBAL_NAME}], [object.expression.name=${GLOBAL_NAME}], [object.expression.expression.name=${GLOBAL_NAME}], [object.object.name=${GLOBAL_NAME}])`,
  message: "window・navigator・document などに、変数や式をキーにした参照（window[k]）をしない（保存・通信の禁止をすり抜けられるため。SEC-009）",
};

const noDangerousHtml = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: "dangerouslySetInnerHTML は使わない（入力値はテキストとして表示する。docs/security/checklist.md C）",
};

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "test-results"],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
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
      "no-restricted-globals": ["error", ...restrictedGlobals([...STORAGE_APIS, ...NETWORK_APIS]), ...REFLECT],
      "no-restricted-properties": ["error", ...restrictedProperties([...STORAGE_APIS, ...HTML_SINKS, ...OTHER_PROPS])],
      "no-restricted-syntax": ["error", noDangerousHtml, noDynamicGlobalAccess],
    },
  },
  {
    // 保存の入口。Storage API はここでだけ使ってよい（通信と HTML の挿入は、ここでも禁じたまま）
    files: ["src/domain/persistence.ts"],
    rules: {
      "no-restricted-globals": ["error", ...restrictedGlobals(NETWORK_APIS), ...REFLECT],
      "no-restricted-properties": ["error", ...restrictedProperties([...HTML_SINKS, ...OTHER_PROPS])],
    },
  },
  {
    // 設定ファイルとテストは Node.js で動く
    files: ["*.{ts,js,mjs,cjs}", "scripts/**/*.{ts,js,mjs,cjs}", "security/**/*.ts", "src/**/*.test.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
);
