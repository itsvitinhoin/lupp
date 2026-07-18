// Lupp widget – lazy HLS/video attachment. hls.js itself is only fetched
// from the CDN when a rendered <video> actually needs MSE playback.
import type { HlsStatic } from "./types";
import { debugLog } from "./utils";

let hlsScriptPromise: Promise<HlsStatic | undefined> | null = null;

function isHlsUrl(value: string | null): boolean {
  return /\.m3u8(?:$|\?)/i.test(String(value || ""));
}

function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return Boolean(video && video.canPlayType("application/vnd.apple.mpegurl"));
}

function loadHlsScript(): Promise<HlsStatic | undefined> {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsScriptPromise) return hlsScriptPromise;
  hlsScriptPromise = new Promise(function (resolve, reject) {
    const hlsScript = document.createElement("script");
    hlsScript.async = true;
    hlsScript.src = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";
    hlsScript.onload = function () {
      resolve(window.Hls);
    };
    hlsScript.onerror = function () {
      reject(new Error("hls_load_failed"));
    };
    document.head.appendChild(hlsScript);
  });
  return hlsScriptPromise;
}

function attachVideoSource(video: HTMLVideoElement): void {
  if (!video || video.getAttribute("data-lupp-video-loaded") === "true") return;
  const src = video.getAttribute("data-lupp-video-src");
  if (!src) return;
  video.setAttribute("data-lupp-video-loaded", "true");

  if (!isHlsUrl(src) || canPlayNativeHls(video)) {
    video.src = src;
    if (video.autoplay) video.play().catch(function () {});
    return;
  }

  loadHlsScript()
    .then(function (Hls) {
      if (!Hls || !Hls.isSupported()) return;
      const previewQuality =
        video.getAttribute("data-lupp-video-quality") === "preview";
      const hls = new Hls({
        capLevelToPlayerSize: true,
        enableWorker: true,
        maxBufferLength: previewQuality ? 6 : 30,
        maxMaxBufferLength: previewQuality ? 10 : 60,
        startLevel: previewQuality ? 0 : -1,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      if (previewQuality && Hls.Events && Hls.Events.MANIFEST_PARSED) {
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          try {
            hls.currentLevel = 0;
            hls.nextLevel = 0;
          } catch (_) {}
        });
      }
      (video as HTMLVideoElement & { __luppHls?: unknown }).__luppHls = hls;
      if (video.autoplay) video.play().catch(function () {});
    })
    .catch(function (error: unknown) {
      debugLog("hls: attach failed", src, error);
    });
}

export function prepareLazyVideos(root: ParentNode): void {
  const videos = Array.prototype.slice.call(
    root.querySelectorAll("video[data-lupp-video-src]"),
  ) as HTMLVideoElement[];
  if (!videos.length) return;

  if (!("IntersectionObserver" in window)) {
    videos.forEach(attachVideoSource);
    return;
  }

  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) {
          attachVideoSource(video);
          observer.unobserve(video);
        } else if (video.pause) {
          video.pause();
        }
      });
    },
    { rootMargin: "260px 0px", threshold: 0.05 },
  );

  videos.forEach(function (video) {
    observer.observe(video);
  });
}
