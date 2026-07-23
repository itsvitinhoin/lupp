// Lupp widget – re-checks Upzero customer/login state on signals that
// commonly follow a login/logout on the storefront (tab refocus, bfcache
// pageshow, cross-tab storage change, an account/login-looking click), and
// re-renders once the status actually changes.
import { normalizeText } from "../utils";
import { ctx, isUpzeroStore } from "../context";

let upzeroCustomerRefreshTimer: number | null = null;

function refreshUpzeroCustomerState(root: HTMLElement): void {
  if (!isUpzeroStore(ctx.sharedState.activeStore)) return;
  if (upzeroCustomerRefreshTimer) {
    window.clearTimeout(upzeroCustomerRefreshTimer);
  }
  upzeroCustomerRefreshTimer = window.setTimeout(() => {
    ctx
      .detectCustomerStatus(ctx.sharedState.activeStore, { forceRefresh: true })
      .then(() => ctx.renderForCurrentUrl(root))
      .catch(() => ctx.renderForCurrentUrl(root));
  }, 160);
}

export function watchUpzeroCustomerState(root: HTMLElement): void {
  const refresh = () => refreshUpzeroCustomerState(root);

  window.addEventListener("pageshow", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("storage", refresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  document.addEventListener(
    "click",
    (event) => {
      let target = event.target as HTMLElement | null;
      if (target && target.nodeType === 3) target = target.parentElement;
      const action = target && target.closest ? target.closest("a,button") : null;
      if (!action) return;
      const text = normalizeText(action.textContent || "");
      const href = typeof action.getAttribute === "function" ? String(action.getAttribute("href") || "") : "";
      if (
        text.indexOf("sair") > -1 ||
        text.indexOf("entrar") > -1 ||
        text.indexOf("login") > -1 ||
        /logout|login|entrar|minha-conta/i.test(href)
      ) {
        refresh();
      }
    },
    true,
  );
}
