import React from 'react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Heart, MessageCircle, Share2, Bookmark, ArrowLeft, ShoppingBag, Star, Truck, ShieldCheck, X, Play, Volume2, VolumeX } from 'lucide-react';
import { mockVideos } from '@/data/mock';
import { Link, useRoute } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { videosService } from '@/services/videos.service';
import { analyticsService } from '@/services/analytics.service';
import { isSupabaseConfigured } from '@/lib/env';
import { useQuery } from '@tanstack/react-query';

function getPrimaryProduct(video: any) {
  return video.video_products?.find((item: any) => item.is_primary)?.products ?? video.video_products?.[0]?.products ?? null;
}

function formatPrice(value?: number | null) {
  if (!value) return null;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function getProductView(video: any, fallbackUrl: string) {
  const product = getPrimaryProduct(video);
  const price = product?.price ? Number(product.price) : null;
  return {
    id: product?.id ?? video.productId ?? null,
    name: product?.name ?? video.productName ?? 'Produto do vídeo',
    description: product?.description ?? 'Produto conectado ao vídeo para compra dentro da experiência Lupp.',
    price: formatPrice(product?.price) ?? 'R$ 189,90',
    paymentTerms: price ? `ou 6x de ${formatPrice(price / 6)} sem juros` : 'Parcele na plataforma conectada',
    imageUrl: product?.image_url ?? null,
    productUrl: product?.product_url || fallbackUrl,
    platform: product?.platform ?? null,
  };
}

export default function PreviewFeed() {
  const { toast } = useToast();
  const [, params] = useRoute('/s/:storeSlug/feed');
  const storeSlug = params?.storeSlug;
  const [likedMap, setLikedMap] = React.useState<Record<string, boolean>>({});
  const isEmbedded = new URLSearchParams(window.location.search).get('embed') === '1';

  const feedQuery = useQuery({
    queryKey: ['public-feed', storeSlug],
    queryFn: () => videosService.listPublicFeedVideosByStoreSlug(storeSlug!),
    enabled: isSupabaseConfigured && Boolean(storeSlug),
  });

  const store = feedQuery.data?.store;
  const realVideos = feedQuery.data?.videos ?? [];
  const videos = storeSlug && realVideos.length ? realVideos : mockVideos.filter((video) => video.productName);
  const [selectedProduct, setSelectedProduct] = React.useState<{ video: any; product: ReturnType<typeof getProductView> } | null>(null);
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);
  const [pausedMap, setPausedMap] = React.useState<Record<string, boolean>>({});
  const [isMuted, setIsMuted] = React.useState(false);
  const [soundUnlocked, setSoundUnlocked] = React.useState(true);
  const [controlsVisible, setControlsVisible] = React.useState(true);
  const [speedVideoId, setSpeedVideoId] = React.useState<string | null>(null);
  const videoRefs = React.useRef(new Map<string, HTMLVideoElement>());
  const sectionRefs = React.useRef(new Map<string, HTMLElement>());
  const tapTimerRef = React.useRef<number | null>(null);
  const tapCountRef = React.useRef(0);
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressActiveRef = React.useRef(false);
  const controlsTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!store?.id || !isSupabaseConfigured) return;
    void analyticsService.trackEvent({ store_id: store.id, event_type: 'feed_open' }).catch(() => {});
  }, [store?.id]);

  const track = (eventType: 'video_view' | 'product_click' | 'add_to_cart_click' | 'share_click' | 'like_click', video: any, productId?: string | null) => {
    if (!store?.id || !isSupabaseConfigured) return;
    void analyticsService
      .trackEvent({
        store_id: store.id,
        video_id: video.id,
        product_id: productId ?? null,
        event_type: eventType,
        metadata: { source: 'vertical_feed' },
      })
      .catch(() => {});
  };

  const handleLike = (video: any) => {
    setLikedMap((current) => ({ ...current, [video.id]: !current[video.id] }));
    track('like_click', video, getPrimaryProduct(video)?.id ?? video.productId ?? null);
  };

  const likeVideo = (video: any) => {
    setLikedMap((current) => {
      if (current[video.id]) return current;
      track('like_click', video, getPrimaryProduct(video)?.id ?? video.productId ?? null);
      return { ...current, [video.id]: true };
    });
  };

  const handleShare = async (video: any) => {
    const url = `${window.location.origin}${window.location.pathname}?v=${video.id}`;
    await navigator.clipboard.writeText(url);
    track('share_click', video, getPrimaryProduct(video)?.id ?? video.productId ?? null);
    toast({ title: 'Link copiado', description: 'O link desse vídeo foi copiado.' });
  };

  const openProductPage = (video: any, product: ReturnType<typeof getProductView>) => {
    track('add_to_cart_click', video, product.id);
    window.open(product.productUrl, '_blank', 'noopener,noreferrer');
  };

  const setVideoRef = (id: string) => (element: HTMLVideoElement | null) => {
    if (element) videoRefs.current.set(id, element);
    else videoRefs.current.delete(id);
  };

  const setSectionRef = (id: string) => (element: HTMLElement | null) => {
    if (element) sectionRefs.current.set(id, element);
    else sectionRefs.current.delete(id);
  };

  const showControls = (keepVisible = false) => {
    setControlsVisible(true);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = null;

    if (!keepVisible) {
      controlsTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 2200);
    }
  };

  const toggleMute = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setSoundUnlocked(true);
    setIsMuted((current) => !current);
    showControls();
  };

  const togglePlay = (video: any, event?: React.MouseEvent) => {
    event?.stopPropagation();
    setSoundUnlocked(true);
    setPausedMap((current) => {
      const nextPaused = !current[video.id];
      showControls(nextPaused);
      return { ...current, [video.id]: nextPaused };
    });
  };

  const clearGestureTimers = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    longPressTimerRef.current = null;
    tapTimerRef.current = null;
  };

  const resetSpeed = (video: any) => {
    const element = videoRefs.current.get(video.id);
    if (element) element.playbackRate = 1;
    setSpeedVideoId(null);
    longPressActiveRef.current = false;
  };

  const handleMediaPointerDown = (video: any) => {
    setSoundUnlocked(true);
    showControls(pausedMap[video.id]);
    longPressActiveRef.current = false;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      const element = videoRefs.current.get(video.id);
      if (element) element.playbackRate = 2;
      longPressActiveRef.current = true;
      setSpeedVideoId(video.id);
    }, 420);
  };

  const handleMediaPointerUp = (video: any) => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;

    if (longPressActiveRef.current) {
      resetSpeed(video);
      return;
    }

    tapCountRef.current += 1;
    if (tapCountRef.current === 1) {
      tapTimerRef.current = window.setTimeout(() => {
        tapCountRef.current = 0;
        togglePlay(video);
      }, 230);
      return;
    }

    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = null;
    tapCountRef.current = 0;
    likeVideo(video);
  };

  React.useEffect(() => {
    if (!videos.length) return;
    if (!activeVideoId || !videos.some((video: any) => video.id === activeVideoId)) {
      setActiveVideoId(videos[0].id);
    }
  }, [activeVideoId, videos]);

  React.useEffect(() => {
    if (!videos.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        const id = visible?.target.getAttribute('data-video-id');
        if (id) setActiveVideoId(id);
      },
      { threshold: [0.65, 0.8, 0.95] },
    );

    sectionRefs.current.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [videos]);

  React.useEffect(() => {
    videoRefs.current.forEach((element, id) => {
      const isActive = id === activeVideoId && !selectedProduct;
      element.muted = isMuted || !soundUnlocked;
      element.playbackRate = speedVideoId === id ? 2 : 1;

      if (!isActive || pausedMap[id]) {
        element.pause();
        return;
      }

      void element.play().catch(() => {
        element.muted = true;
        setIsMuted(true);
        void element.play().catch(() => {});
      });
    });
  }, [activeVideoId, isMuted, pausedMap, selectedProduct, soundUnlocked, speedVideoId]);

  React.useEffect(() => {
    return () => clearGestureTimers();
  }, []);

  React.useEffect(() => {
    showControls(Boolean(activeVideoId && pausedMap[activeVideoId]));
    return () => {
      if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    };
  }, [activeVideoId]);

  return (
    <div className="h-[100dvh] w-full bg-black overflow-hidden flex justify-center text-white">
      <div className="relative flex h-full w-full max-w-[420px] flex-col bg-slate-950">
        <div className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4">
          {isEmbedded ? (
            <div className="w-10" />
          ) : (
            <Button variant="ghost" size="icon" asChild className="text-white hover:bg-white/20">
              <Link href="/app/feed"><ArrowLeft className="h-6 w-6" /></Link>
            </Button>
          )}
          <div className="max-w-[240px] truncate text-lg font-bold">
            {store?.name ?? 'Lupp Preview'}
          </div>
          <div className="w-10" />
        </div>

        {feedQuery.isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-white/70">
            Carregando feed...
          </div>
        )}

        {!feedQuery.isLoading && !videos.length && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white/70">
            <ShoppingBag className="h-8 w-8" />
            <p>Nenhum vídeo ativo no feed ainda.</p>
          </div>
        )}

        <div className="h-full w-full snap-y snap-mandatory overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {videos.map((video: any, index: number) => {
            const fallbackProductUrl = storeSlug
              ? `${window.location.origin}/test-store/${storeSlug}/produto-demo`
              : `${window.location.origin}/test-store/bella-moda/produto-demo`;
            const product = getProductView(video, fallbackProductUrl);
            const likes = likedMap[video.id] ? (video.likes ?? 0) + 1 : (video.likes ?? 0);
            const hasRealVideo = Boolean(video.video_url);
            const isActiveVideo = activeVideoId === video.id || (!activeVideoId && index === 0);
            const showVideoControls = isActiveVideo && (controlsVisible || pausedMap[video.id]);

            return (
              <section
                key={video.id}
                ref={setSectionRef(video.id)}
                data-video-id={video.id}
                data-active={isActiveVideo ? 'true' : 'false'}
                className="relative h-full w-full snap-start bg-black"
              >
                {hasRealVideo ? (
                  <video
                    ref={setVideoRef(video.id)}
                    src={video.video_url}
                    poster={video.thumbnail_url ?? undefined}
                    className="absolute inset-0 h-full w-full object-cover"
                    muted={isMuted || !soundUnlocked}
                    playsInline
                    loop
                    autoPlay
                    preload="metadata"
                    onPlay={() => track('video_view', video, product?.id ?? null)}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-slate-900 to-black opacity-90" />
                )}

                <div
                  className="absolute inset-0 z-10"
                  onPointerDown={() => handleMediaPointerDown(video)}
                  onPointerUp={() => handleMediaPointerUp(video)}
                  onPointerCancel={() => resetSpeed(video)}
                  onPointerLeave={() => {
                    if (longPressActiveRef.current) resetSpeed(video);
                  }}
                />

                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                  {showVideoControls && pausedMap[video.id] && (
                    <button
                      type="button"
                      className="pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full bg-black/35 text-white opacity-100 shadow-2xl backdrop-blur-md transition-opacity"
                      onClick={(event) => togglePlay(video, event)}
                      aria-label="Reproduzir vídeo"
                    >
                      <Play className="ml-1 h-10 w-10 fill-white" />
                    </button>
                  )}
                  {showVideoControls && (
                    <button
                      type="button"
                      className="pointer-events-auto absolute top-[38%] flex h-11 w-11 -translate-y-20 items-center justify-center rounded-full bg-black/35 text-white shadow-xl backdrop-blur-md transition-opacity"
                      onClick={toggleMute}
                      aria-label={isMuted ? 'Ligar som' : 'Mutar vídeo'}
                    >
                      {isMuted || !soundUnlocked ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </button>
                  )}
                  {speedVideoId === video.id && (
                    <div className="absolute top-24 rounded-full bg-white px-4 py-2 text-sm font-black text-black shadow-xl">
                      2x
                    </div>
                  )}
                </div>

                <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black via-black/60 to-transparent p-4 pt-32">
                  <div className="mb-4 pr-16">
                    <h3 className="mb-1 text-lg font-medium text-white">{video.title}</h3>
                    <p className="line-clamp-2 text-sm text-white/80">
                      {video.description || 'Veja os detalhes dessa peça e compre sem sair da experiência.'}
                    </p>
                  </div>

                  {product.name && (
                    <div className="mb-2 overflow-hidden rounded-md border border-white/18 bg-white/26 text-white shadow-2xl shadow-black/25 backdrop-blur-xl">
                      <button
                        className="flex w-full items-center gap-2 p-2 text-left"
                        onClick={() => {
                          track('product_click', video, product.id);
                          setSelectedProduct({ video, product });
                        }}
                      >
                        <div
                          className="h-[70px] w-[70px] shrink-0 rounded-sm bg-white/20 bg-cover bg-center ring-1 ring-white/25"
                          style={{ backgroundImage: product.imageUrl ? `url(${product.imageUrl})` : undefined }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-[13px] font-medium uppercase leading-tight text-white">{product.name}</p>
                          <p className="mt-1 text-[15px] font-semibold text-white">{product.price}</p>
                          <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-white/75">{product.paymentTerms}</p>
                          <p className="mt-1 line-clamp-1 text-[10px] font-medium text-white/55">
                            {product.platform ?? store?.platform ?? 'e-commerce'} · compra segura
                          </p>
                        </div>
                        <span className="rounded-full border border-white/25 bg-white/16 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md">
                          Detalhes
                        </span>
                      </button>
                      <div className="grid grid-cols-[1fr_1.05fr] gap-2 border-t border-white/10 p-2 pt-2">
                        <Button
                          variant="outline"
                          className="h-9 border-white/18 bg-white/14 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/22 hover:text-white"
                          onClick={() => {
                            track('product_click', video, product.id);
                            setSelectedProduct({ video, product });
                          }}
                        >
                          Ver detalhes
                        </Button>
                        <Button
                          className="h-9 bg-white/92 text-xs font-bold text-slate-950 hover:bg-white"
                          onClick={() => openProductPage(video, product)}
                        >
                          Comprar agora
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="absolute bottom-32 right-2 z-40 flex flex-col items-center gap-6">
                  <button className="flex flex-col items-center gap-1" onClick={() => handleLike(video)}>
                    <div className="rounded-full bg-black/20 p-3 backdrop-blur-md">
                      <Heart className="h-7 w-7 transition-all" fill={likedMap[video.id] ? '#FF4D6D' : 'transparent'} stroke={likedMap[video.id] ? '#FF4D6D' : 'white'} />
                    </div>
                    <span className="text-xs font-bold text-white shadow-sm">{likes}</span>
                  </button>
                  <button className="flex flex-col items-center gap-1 text-white">
                    <div className="rounded-full bg-black/20 p-3 backdrop-blur-md">
                      <MessageCircle className="h-7 w-7" />
                    </div>
                    <span className="text-xs font-bold">{video.comments ?? 0}</span>
                  </button>
                  <button className="flex flex-col items-center gap-1 text-white">
                    <div className="rounded-full bg-black/20 p-3 backdrop-blur-md">
                      <Bookmark className="h-7 w-7" />
                    </div>
                  </button>
                  <button className="flex flex-col items-center gap-1 text-white" onClick={() => void handleShare(video)}>
                    <div className="rounded-full bg-black/20 p-3 backdrop-blur-md">
                      <Share2 className="h-7 w-7" />
                    </div>
                    <span className="text-xs font-bold">Share</span>
                  </button>
                </div>
              </section>
            );
          })}
        </div>

        <Drawer open={Boolean(selectedProduct)} onOpenChange={(open) => !open && setSelectedProduct(null)}>
          <DrawerContent className="mx-auto max-w-[420px] border-white/10 bg-white text-slate-950">
            {selectedProduct && (
              <>
                <DrawerHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <DrawerTitle className="text-base">Produto do vídeo</DrawerTitle>
                    <button className="rounded-full p-1 text-slate-500 hover:bg-slate-100" onClick={() => setSelectedProduct(null)}>
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </DrawerHeader>
                <div className="max-h-[66dvh] overflow-y-auto px-4 pb-4">
                  <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
                    <div
                      className="aspect-square rounded-sm bg-slate-100 bg-cover bg-center"
                      style={{ backgroundImage: selectedProduct.product.imageUrl ? `url(${selectedProduct.product.imageUrl})` : undefined }}
                    />
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 text-sm font-bold leading-tight">{selectedProduct.product.name}</h2>
                      <p className="mt-2 text-2xl font-black text-[#fe2c55]">{selectedProduct.product.price}</p>
                      <div className="mt-2 flex items-center gap-1 text-xs text-amber-500">
                        {Array.from({ length: 5 }).map((_, index) => <Star key={index} className="h-3.5 w-3.5 fill-current" />)}
                        <span className="ml-1 text-slate-500">4.9 · teste</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-sm bg-slate-50 p-3">
                      <Truck className="mb-1 h-4 w-4 text-[#fe2c55]" />
                      Entrega e checkout pela plataforma conectada.
                    </div>
                    <div className="rounded-sm bg-slate-50 p-3">
                      <ShieldCheck className="mb-1 h-4 w-4 text-[#fe2c55]" />
                      Eventos rastreados pela Lupp.
                    </div>
                  </div>

                  <div className="mt-4 rounded-sm bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Descrição</p>
                    <p className="mt-2 text-sm text-slate-700">{selectedProduct.product.description}</p>
                  </div>
                </div>
                <DrawerFooter className="border-t border-slate-100 bg-white">
                  <Button
                    className="h-12 bg-[#fe2c55] text-base font-black text-white hover:bg-[#e6294e]"
                    onClick={() => openProductPage(selectedProduct.video, selectedProduct.product)}
                  >
                    Comprar agora
                  </Button>
                  <Button variant="outline" className="h-11 border-slate-200" onClick={() => setSelectedProduct(null)}>
                    Continuar vendo
                  </Button>
                </DrawerFooter>
              </>
            )}
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}
