import React from "react";

type LazyVideoPlayerProps = Omit<
  React.VideoHTMLAttributes<HTMLVideoElement>,
  "src"
> & {
  active?: boolean;
  hlsStartQuality?: "auto" | "high";
  src?: string | null;
};

function isHlsUrl(src?: string | null) {
  return Boolean(src && /\.m3u8(?:$|\?)/i.test(src));
}

function canPlayNativeHls(video: HTMLVideoElement) {
  return video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

function preferredHighStartLevel(levels: Array<{ height?: number }>) {
  if (!levels.length) return -1;
  const sortedLevels = levels
    .map((level, index) => ({
      height: Number(level.height || 0),
      index,
    }))
    .sort((left, right) => left.height - right.height);
  const upToFullHd = sortedLevels.filter((level) => level.height <= 1080);
  return (upToFullHd.at(-1) ?? sortedLevels.at(-1))?.index ?? -1;
}

export const LazyVideoPlayer = React.forwardRef<
  HTMLVideoElement,
  LazyVideoPlayerProps
>(function LazyVideoPlayer(
  {
    active = true,
    autoPlay = true,
    hlsStartQuality = "auto",
    muted = true,
    preload = "metadata",
    src,
    ...props
  },
  forwardedRef,
) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [isNearViewport, setIsNearViewport] = React.useState(false);
  const setRefs = React.useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef.current = element;
      if (typeof forwardedRef === "function") {
        forwardedRef(element);
      } else if (forwardedRef) {
        forwardedRef.current = element;
      }
    },
    [forwardedRef],
  );

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting);
        if (!entry.isIntersecting) video.pause();
      },
      { rootMargin: "360px 0px", threshold: 0.08 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !active || !isNearViewport) return;

    const mediaSrc = src;
    let hls: any = null;
    let cancelled = false;
    const shouldPreferHighStart = hlsStartQuality === "high";

    async function playVideo() {
      if (!autoPlay || cancelled) return;
      const currentVideo = videoRef.current;
      if (!currentVideo) return;
      await currentVideo.play().catch(() => null);
    }

    async function attachSource() {
      if (!video) return;
      if (!isHlsUrl(mediaSrc) || canPlayNativeHls(video)) {
        if (video.src !== mediaSrc) video.src = mediaSrc;
        await playVideo();
      } else {
        const { default: Hls } = await import("hls.js");
        if (cancelled || !Hls.isSupported()) return;
        hls = new Hls({
          autoStartLoad: !shouldPreferHighStart,
          abrEwmaDefaultEstimate:
            shouldPreferHighStart ? 8_000_000 : undefined,
          capLevelToPlayerSize: !shouldPreferHighStart,
          enableWorker: true,
          startLevel: -1,
          lowLatencyMode: false,
        });
        if (shouldPreferHighStart) {
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            const level = preferredHighStartLevel(hls.levels || []);
            if (level >= 0) {
              hls.startLevel = level;
              hls.nextLevel = level;
              hls.loadLevel = level;
            }
            hls.startLoad(0);
            void playVideo();
          });
          const restoreAutoQuality = () => {
            hls.nextLevel = -1;
            hls.loadLevel = -1;
            hls.off(Hls.Events.FRAG_LOADED, restoreAutoQuality);
          };
          hls.on(Hls.Events.FRAG_LOADED, restoreAutoQuality);
        } else {
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            void playVideo();
          });
        }
        hls.loadSource(mediaSrc);
        hls.attachMedia(video);
      }
    }

    void attachSource();

    return () => {
      cancelled = true;
      hls?.destroy();
      video.pause();
    };
  }, [active, autoPlay, hlsStartQuality, isNearViewport, src]);

  return (
    <video
      {...props}
      ref={setRefs}
      autoPlay={autoPlay}
      muted={muted}
      playsInline
      preload={preload}
    />
  );
});
