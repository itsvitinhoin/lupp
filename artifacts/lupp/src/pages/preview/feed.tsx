import React from 'react';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Share2, Bookmark, ArrowLeft, ShoppingBag } from 'lucide-react';
import { mockVideos } from '@/data/mock';
import { Link, useRoute } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { LuppLogo } from '@/components/shared/LuppLogo';
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

export default function PreviewFeed() {
  const { toast } = useToast();
  const [, params] = useRoute('/s/:storeSlug/feed');
  const storeSlug = params?.storeSlug;
  const [likedMap, setLikedMap] = React.useState<Record<string, boolean>>({});

  const feedQuery = useQuery({
    queryKey: ['public-feed', storeSlug],
    queryFn: () => videosService.listPublicFeedVideosByStoreSlug(storeSlug!),
    enabled: isSupabaseConfigured && Boolean(storeSlug),
  });

  const store = feedQuery.data?.store;
  const realVideos = feedQuery.data?.videos ?? [];
  const videos = storeSlug && realVideos.length ? realVideos : mockVideos.filter((video) => video.productName);

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

  return (
    <div className="h-[100dvh] w-full bg-black overflow-hidden flex justify-center text-white">
      <div className="relative flex h-full w-full max-w-[420px] flex-col bg-slate-950">
        <div className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4">
          <Button variant="ghost" size="icon" asChild className="text-white hover:bg-white/20">
            <Link href="/app/feed"><ArrowLeft className="h-6 w-6" /></Link>
          </Button>
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
            const product = getPrimaryProduct(video);
            const mockProductName = video.productName;
            const productName = product?.name ?? mockProductName;
            const productPrice = formatPrice(product?.price) ?? 'R$ 189,90';
            const productUrl = product?.product_url ?? null;
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

                <div className="absolute right-4 top-16 scale-75 opacity-30">
                  <LuppLogo />
                </div>

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 pt-32">
                  <div className="mb-4 pr-16">
                    <h3 className="mb-1 text-lg font-medium text-white">{video.title}</h3>
                    <p className="line-clamp-2 text-sm text-white/80">
                      {video.description || 'Veja os detalhes dessa peça e compre sem sair da experiência.'}
                    </p>
                  </div>

                  {productName && (
                    <div className="mb-2 rounded-md border border-white/20 bg-black/40 p-3 backdrop-blur-xl">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 rounded-md bg-white/10 bg-cover bg-center" style={{ backgroundImage: product?.image_url ? `url(${product.image_url})` : undefined }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{productName}</p>
                          <p className="text-sm font-medium text-primary">{productPrice}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="h-9 flex-1 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                          asChild={Boolean(productUrl)}
                          onClick={() => track('product_click', video, product?.id ?? null)}
                        >
                          {productUrl ? <a href={productUrl} target="_blank" rel="noreferrer">Ver detalhes</a> : <span>Ver detalhes</span>}
                        </Button>
                        <Button
                          className="h-9 flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={() => {
                            track('add_to_cart_click', video, product?.id ?? null);
                            toast({ title: 'Teste de carrinho', description: 'Evento registrado para o e-commerce interno.' });
                          }}
                        >
                          {video.cta_label ?? 'Comprar agora'}
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
      </div>
    </div>
  );
}
