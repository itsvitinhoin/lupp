import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PhonePreview } from "@/components/shared/PhonePreview";
import { Copy, ExternalLink, Heart, MessageCircle, Send, ShoppingBag } from "lucide-react";
import { mockVideos } from "@/data/mock";
import { useToast } from "@/hooks/use-toast";
import { useCurrentStore } from "@/hooks/useStore";
import { useVideos } from "@/hooks/useVideos";
import { widgetsService } from "@/services/widgets.service";
import { isApiConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";

type FeedOptions = {
  addToCartInline: boolean;
  autoplayMuted: boolean;
  enabled: boolean;
  loopVideo: boolean;
  pauseWhenHidden: boolean;
  preloadNext: boolean;
  showBuyButton: boolean;
  showComments: boolean;
  showDescription: boolean;
  showLikes: boolean;
  showLogo: boolean;
  showPrice: boolean;
  showProductName: boolean;
  showShare: boolean;
};

const defaultFeedOptions: FeedOptions = {
  addToCartInline: true,
  autoplayMuted: true,
  enabled: true,
  loopVideo: true,
  pauseWhenHidden: true,
  preloadNext: true,
  showBuyButton: true,
  showComments: true,
  showDescription: false,
  showLikes: true,
  showLogo: true,
  showPrice: true,
  showProductName: true,
  showShare: true,
};

function asSettings(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function productFromVideo(video: any) {
  return (
    video?.video_products?.find((item: any) => item.is_primary)?.products ??
    video?.video_products?.[0]?.products ??
    null
  );
}

function money(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(numeric);
}

export default function FeedConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { store } = useCurrentStore();
  const videosQuery = useVideos(store?.id, "", "active");
  const widgetsQuery = useQuery({
    queryKey: ["widgets", store?.id],
    queryFn: () => widgetsService.listWidgets(store!.id),
    enabled: isApiConfigured && Boolean(store),
  });
  const publicFeedPath = store ? `/s/${store.slug}/feed` : "/preview/feed";
  const publicFeedUrl = `${window.location.origin}${publicFeedPath}`;
  const videos = videosQuery.data?.length
    ? videosQuery.data
    : mockVideos.slice(0, 4);
  const previewVideo = videos[0] ?? null;
  const previewProduct = productFromVideo(previewVideo);
  const floatingWidget =
    widgetsQuery.data?.find((widget) => widget.type === "floating_video") ??
    null;

  const [options, setOptions] =
    React.useState<FeedOptions>(defaultFeedOptions);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!floatingWidget) return;
    const settings = asSettings(floatingWidget.settings);
    const display = asSettings(settings.display);
    const feed = asSettings(settings.feed_options);
    setOptions({
      addToCartInline: asBoolean(
        feed.add_to_cart_inline,
        defaultFeedOptions.addToCartInline,
      ),
      autoplayMuted: asBoolean(
        feed.autoplay_muted,
        defaultFeedOptions.autoplayMuted,
      ),
      enabled: asBoolean(display.feed_enabled, defaultFeedOptions.enabled),
      loopVideo: asBoolean(feed.loop_video, defaultFeedOptions.loopVideo),
      pauseWhenHidden: asBoolean(
        feed.pause_when_hidden,
        defaultFeedOptions.pauseWhenHidden,
      ),
      preloadNext: asBoolean(feed.preload_next, defaultFeedOptions.preloadNext),
      showBuyButton: asBoolean(
        feed.show_buy_button,
        defaultFeedOptions.showBuyButton,
      ),
      showComments: asBoolean(
        feed.show_comments,
        defaultFeedOptions.showComments,
      ),
      showDescription: asBoolean(
        feed.show_description,
        defaultFeedOptions.showDescription,
      ),
      showLikes: asBoolean(feed.show_likes, defaultFeedOptions.showLikes),
      showLogo: asBoolean(feed.show_logo, defaultFeedOptions.showLogo),
      showPrice: asBoolean(feed.show_price, defaultFeedOptions.showPrice),
      showProductName: asBoolean(
        feed.show_product_name,
        defaultFeedOptions.showProductName,
      ),
      showShare: asBoolean(feed.show_share, defaultFeedOptions.showShare),
    });
  }, [floatingWidget?.id, floatingWidget?.updated_at]);

  const setOption = (key: keyof FeedOptions, value: boolean) => {
    setOptions((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (!store || !floatingWidget) {
      toast({
        title: "Widget não encontrado",
        description: "Ative a miniatura flutuante antes de salvar o feed.",
      });
      return;
    }

    try {
      setIsSaving(true);
      const currentSettings = asSettings(floatingWidget.settings);
      const display = asSettings(currentSettings.display);
      await widgetsService.updateWidget(floatingWidget.id, {
        settings: {
          ...currentSettings,
          display: {
            ...display,
            feed_enabled: options.enabled,
          },
          feed_options: {
            add_to_cart_inline: options.addToCartInline,
            autoplay_muted: options.autoplayMuted,
            loop_video: options.loopVideo,
            pause_when_hidden: options.pauseWhenHidden,
            preload_next: options.preloadNext,
            show_buy_button: options.showBuyButton,
            show_comments: options.showComments,
            show_description: options.showDescription,
            show_likes: options.showLikes,
            show_logo: options.showLogo,
            show_price: options.showPrice,
            show_product_name: options.showProductName,
            show_share: options.showShare,
          },
        },
        status: options.enabled ? "active" : floatingWidget.status,
      });
      await queryClient.invalidateQueries({ queryKey: ["widgets", store.id] });
      toast({
        title: "Feed atualizado",
        description: "As opções do feed vertical foram salvas.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(publicFeedUrl);
    toast({
      title: "URL copiada",
      description: "Link do feed copiado para a área de transferência.",
    });
  };

  return (
    <AppLayout title="Configuração do Feed Vertical">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-950">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ToggleRow
                checked={options.enabled}
                label="Ativar feed vertical"
                onChange={(value) => setOption("enabled", value)}
              />
              <div className="space-y-2">
                <Label className="text-slate-700">URL pública do feed</Label>
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    {publicFeedPath}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    onClick={copyUrl}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-950">Aparência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToggleRow
                checked={options.showLogo}
                label="Exibir logo da loja"
                onChange={(value) => setOption("showLogo", value)}
              />
              <ToggleRow
                checked={options.showProductName}
                label="Exibir nome do produto"
                onChange={(value) => setOption("showProductName", value)}
              />
              <ToggleRow
                checked={options.showPrice}
                label="Exibir preço"
                onChange={(value) => setOption("showPrice", value)}
              />
              <ToggleRow
                checked={options.showDescription}
                label="Exibir descrição"
                onChange={(value) => setOption("showDescription", value)}
              />
              <ToggleRow
                checked={options.showBuyButton}
                label="Exibir botão de compra"
                onChange={(value) => setOption("showBuyButton", value)}
              />
              <ToggleRow
                checked={options.showLikes}
                label="Exibir likes"
                onChange={(value) => setOption("showLikes", value)}
              />
              <ToggleRow
                checked={options.showComments}
                label="Exibir comentários"
                onChange={(value) => setOption("showComments", value)}
              />
              <ToggleRow
                checked={options.showShare}
                label="Exibir compartilhamento"
                onChange={(value) => setOption("showShare", value)}
              />
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-950">Comportamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToggleRow
                checked={options.autoplayMuted}
                label="Autoplay com som mudo"
                onChange={(value) => setOption("autoplayMuted", value)}
              />
              <ToggleRow
                checked={options.loopVideo}
                label="Loop de vídeo"
                onChange={(value) => setOption("loopVideo", value)}
              />
              <ToggleRow
                checked={options.preloadNext}
                label="Carregar próximo vídeo no scroll"
                onChange={(value) => setOption("preloadNext", value)}
              />
              <ToggleRow
                checked={options.pauseWhenHidden}
                label="Pausar vídeo ao sair da tela"
                onChange={(value) => setOption("pauseWhenHidden", value)}
              />
              <ToggleRow
                checked={options.addToCartInline}
                label="Add to cart sem sair do feed"
                onChange={(value) => setOption("addToCartInline", value)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="sticky top-24 flex h-[calc(100vh-8rem)] flex-col">
          <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <PhonePreview className="scale-90 lg:scale-100">
              <FeedPhonePreview
                options={options}
                product={previewProduct}
                store={store}
                video={previewVideo}
              />
            </PhonePreview>
          </div>

          <div className="mt-8 flex gap-4">
            <Button
              className="flex-1 shadow-lg shadow-primary/20"
              disabled={isSaving}
              onClick={handleSave}
            >
              {isSaving ? "Salvando..." : "Salvar alterações"}
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              asChild
            >
              <a
                href={publicFeedPath}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Ver preview
              </a>
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-slate-700">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function FeedPhonePreview({
  options,
  product,
  store,
  video,
}: {
  options: FeedOptions;
  product: any;
  store: any;
  video: any;
}) {
  const videoImage =
    video?.thumbnail_url ||
    product?.image_url ||
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80";
  const title = String(video?.title || "").trim();
  const description = String(video?.description || "").trim();

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${videoImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/35" />

      {options.showLogo && (
        <div className="absolute left-0 right-0 top-0 z-20 flex justify-center px-4 py-4">
          {store?.logo_url ? (
            <img
              src={store.logo_url}
              alt={store?.name ?? "Logo"}
              className="max-h-9 max-w-[170px] object-contain"
            />
          ) : (
            <span className="rounded-full bg-black/30 px-4 py-2 text-sm font-bold backdrop-blur">
              {store?.name ?? "Sua loja"}
            </span>
          )}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pt-24">
        {(title || (options.showDescription && description)) && (
          <div className="mb-4 pr-14">
            {title && (
              <h3 className="line-clamp-2 text-lg font-semibold leading-tight">
                {title}
              </h3>
            )}
            {options.showDescription && description && (
              <p className="mt-1 line-clamp-2 text-sm text-white/80">
                {description}
              </p>
            )}
          </div>
        )}

        {product && (
          <div className="overflow-hidden rounded-md border border-white/18 bg-white/26 text-white shadow-2xl shadow-black/25 backdrop-blur-xl">
            <div className="flex items-center gap-2 p-2">
              <div
                className="h-[70px] w-[70px] shrink-0 rounded-sm bg-white/20 bg-cover bg-center ring-1 ring-white/25"
                style={{
                  backgroundImage: product.image_url
                    ? `url(${product.image_url})`
                    : undefined,
                }}
              />
              <div className="min-w-0 flex-1">
                {options.showProductName && (
                  <p className="line-clamp-1 text-[13px] font-medium uppercase leading-tight text-white">
                    {product.name}
                  </p>
                )}
                {options.showPrice && money(product.price) && (
                  <p className="mt-1 text-[15px] font-semibold text-white">
                    {money(product.price)}
                  </p>
                )}
              </div>
            </div>
            {options.showBuyButton && (
              <div className="border-t border-white/10 p-2">
                <button
                  type="button"
                  className="h-9 w-full rounded-md bg-white/92 text-xs font-bold text-slate-950"
                >
                  Adicionar ao carrinho
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="absolute bottom-32 right-2 z-30 flex flex-col items-center gap-5">
        <PreviewAction hidden={!options.showLikes} icon={<Heart />} label="12" />
        <PreviewAction
          hidden={!options.showComments}
          icon={<MessageCircle />}
          label="3"
        />
        <PreviewAction hidden={!options.showShare} icon={<Send />} label="Share" />
      </div>

      {!options.enabled && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/72 px-8 text-center">
          <div className="rounded-md border border-white/12 bg-white/10 p-5 backdrop-blur">
            <ShoppingBag className="mx-auto mb-3 h-7 w-7" />
            <p className="text-sm font-semibold">Feed vertical desativado</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewAction({
  hidden,
  icon,
  label,
}: {
  hidden: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 transition",
        hidden && "hidden",
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/25 [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </div>
      <span className="text-[10px] font-bold">{label}</span>
    </div>
  );
}
