// Lupp widget – gates the first render on data-load-strategy: "immediate"
// runs synchronously, "delayed" waits ~2.2s, the default ("idle") waits for
// window.load then requestIdleCallback (falling back to setTimeout).
export function runAfterPageReady(loadStrategy: string, callback: () => void): void {
  let hasRun = false;
  function run() {
    if (hasRun) return;
    hasRun = true;
    callback();
  }

  if (loadStrategy === "immediate") {
    run();
    return;
  }

  const delay = loadStrategy === "delayed" ? 2200 : 0;
  function scheduleIdle() {
    window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(run, { timeout: 3000 });
        return;
      }
      setTimeout(run, 1);
    }, delay);
  }

  if (document.readyState === "complete") {
    scheduleIdle();
    return;
  }

  window.addEventListener("load", scheduleIdle, { once: true });
}
