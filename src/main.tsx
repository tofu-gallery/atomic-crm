import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// After a new deploy, the service worker may replace its pre-cache while
// the page still holds old chunk references. A reload picks up the new
// HTML + new SW cache. A sessionStorage guard prevents infinite loops.
// See https://vite.dev/guide/build.html#load-error-handling
window.addEventListener("vite:preloadError", () => {
  const key = "chunk-reload";
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }
});

// Tofu: the sign-in emails Tofu writes link to <app>/auth/confirm?token_hash=…&type=…. The hosting serves
// public/auth/confirm/index.html there, which hands the link to the #/auth-confirm page; once the service worker
// is installed it may answer that address with this page instead, so the same hand-off happens here.
if (/\/auth\/confirm\/?$/.test(window.location.pathname)) {
  window.location.replace(
    window.location.pathname.replace(/auth\/confirm\/?$/, "") +
      "#/auth-confirm" +
      window.location.search,
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
