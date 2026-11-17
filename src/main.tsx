import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FRAMED_MESSAGE, isFramed } from "./frameGuard";
import "./index.css";
import { applyTheme, readThemePreference } from "./theme";

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root が見つかりません");
}

if (isFramed(window)) {
  // ほかのページの枠の中では、保存データを読む前に止め、押せるものを1つも出さない（SEC-003。src/frameGuard.ts）
  const message = document.createElement("p");
  message.textContent = FRAMED_MESSAGE;
  root.replaceChildren(message);
} else {
  // 最初の描画の前にテーマを当てて、ちらつきを防ぐ（CSP でインラインスクリプトを使えないため、ここで行う）
  applyTheme(readThemePreference());

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
