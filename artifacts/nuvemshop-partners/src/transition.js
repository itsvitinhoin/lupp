(function () {
  "use strict";

  if (window.__LUUP_NUVEMSHOP_TRANSITION_LOADED__) return;
  window.__LUUP_NUVEMSHOP_TRANSITION_LOADED__ = true;

  var fallbackRequested = false;
  var sdkFrameSelector =
    'iframe[src*="playluup.com.br/nuvemshop-widget-frame.html"],iframe[id*="luup-nuvemshop"]';

  function hasNubeSdkWidget() {
    try {
      return Boolean(document.querySelector(sdkFrameSelector));
    } catch (_) {
      return false;
    }
  }

  function hasClassicWidget() {
    return Boolean(
      window.__LUUP_NUVEMSHOP_SCRIPT_LOADED__ ||
        document.querySelector(
          'script[data-lupp-nuvemshop-transition],script[data-lupp-nuvemshop-widget]',
        ),
    );
  }

  function startFallback() {
    if (fallbackRequested || hasNubeSdkWidget() || hasClassicWidget()) return;
    fallbackRequested = true;

    var script = document.createElement("script");
    script.async = true;
    script.src =
      "https://www.playluup.com.br/nuvemshop-script.js" +
      "?lupp_load_strategy=balanced&lupp_auto_load_delay=0";
    script.setAttribute("data-lupp-nuvemshop-transition", "true");
    (document.head || document.body || document.documentElement).appendChild(
      script,
    );
  }

  // NubeSDK renders its iframe synchronously when it is enabled for the store.
  // Real stores that have not entered the controlled SDK rollout receive the
  // classic loader after this grace period instead.
  window.setTimeout(startFallback, 1600);
})();
