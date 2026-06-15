import React from 'react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Heart, MessageCircle, Share2, Bookmark, ArrowLeft, ShoppingBag, Star, Truck, ShieldCheck, X } from 'lucide-react';
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
  return {
    id: product?.id ?? video.productId ?? null,
    name: product?.name ?? video.productName ?? 'Produto do vídeo',
    description: product?.description ?? 'Produto conectado ao vídeo para compra dentro da experiência Lupp.',
    price: formatPrice(product?.price) ?? 'R$ 189,90',
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

            return (
              <section key={video.id} className="relative h-full w-full snap-start bg-black">
                {hasRealVideo ? (
                  <video
                    src={video.video_url}
                    poster={video.thumbnail_url ?? undefined}
                    className="absolute inset-0 h-full w-full object-cover"
                    muted
                    playsInline
                    loop
                    autoPlay={index === 0}
                    preload="metadata"
                    onPlay={() => track('video_view', video, product?.id ?? null)}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-slate-900 to-black opacity-90" />
                )}

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 pt-32">
                  <div className="mb-4 pr-16">
                    <h3 className="mb-1 text-lg font-medium text-white">{video.title}</h3>
                    <p className="line-clamp-2 text-sm text-white/80">
                      {video.description || 'Veja os detalhes dessa peça e compre sem sair da experiência.'}
                    </p>
                  </div>

                  {product.name && (
                    <div className="mb-2 rounded-md border border-white/15 bg-white text-slate-950 shadow-2xl">
                      <button
                        className="flex w-full items-center gap-2 p-2 text-left"
                        onClick={() => {
                          track('product_click', video, product.id);
                          setSelectedProduct({ video, product });
                        }}
                      >
                        <div
                          className="h-14 w-14 shrink-0 rounded-sm bg-slate-100 bg-cover bg-center"
                          style={{ backgroundImage: product.imageUrl ? `url(${product.imageUrl})` : undefined }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-[13px] font-semibold">{product.name}</p>
                          <div className="mt-1 flex items-end gap-1">
                            <span className="text-[17px] font-black text-[#fe2c55]">{product.price}</span>
                            <span className="pb-0.5 text-[11px] text-slate-500">Oferta do vídeo</span>
                          </div>
                        </div>
                        <span className="rounded-sm bg-[#fe2c55] px-3 py-2 text-xs font-bold text-white">
                          Ver
                        </span>
                      </button>
                      <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5 text-[11px] text-slate-500">
                        <span>Frete e compra pela plataforma</span>
                        <span>{product.platform ?? store?.platform ?? 'e-commerce'}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_1.05fr] gap-2 p-2 pt-0">
                        <Button
                          variant="outline"
                          className="h-10 border-slate-200 bg-white text-xs font-bold text-slate-950 hover:bg-slate-50"
                          onClick={() => {
                            track('product_click', video, product.id);
                            setSelectedProduct({ video, product });
                          }}
                        >
                          Ver detalhes
                        </Button>
                        <Button
                          className="h-10 bg-[#fe2c55] text-xs font-black text-white hover:bg-[#e6294e]"
                          onClick={() => openProductPage(video, product)}
                        >
                          Comprar agora
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="absolute bottom-32 right-2 flex flex-col items-center gap-6">
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
