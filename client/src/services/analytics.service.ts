import { asRecord } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/api";
import type {
  DashboardCapabilities,
  DashboardChartPoint,
  DashboardRankingItem,
  DashboardMetrics,
  TrackEventPayload,
  TrackingContext,
} from "@/types/analytics";

export function getOrCreateVisitorId() {
  const key = "lupp_visitor_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const visitorId = crypto.randomUUID();
  localStorage.setItem(key, visitorId);
  return visitorId;
}

export function getOrCreateSessionId() {
  const key = "lupp_session_id";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(key, sessionId);
  return sessionId;
}

function numberFromMetadata(metadata: unknown) {
  const payload = asRecord(metadata);
  const value =
    payload.revenue ??
    payload.order_value ??
    payload.amount ??
    payload.value ??
    payload.total ??
    0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function eventAction(metadata: unknown) {
  return String(asRecord(metadata).action || "");
}

function uniqueCount(values: Array<string | null | undefined>) {
  return new Set(values.filter(Boolean).map(String)).size;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function dayLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function emptyChartWindow() {
  const points: DashboardChartPoint[] = [];
  for (let index = 29; index >= 0; index -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - index);
    points.push({
      addToCart: 0,
      date: dayLabel(date),
      feedOpens: 0,
      impressions: 0,
      productClicks: 0,
      revenue: 0,
      views: 0,
    });
  }
  return points;
}

function providerLabel(provider: string) {
  const normalized = provider.toLowerCase();
  if (normalized === "upzero") return "UP Zero";
  if (normalized === "nuvemshop") return "Nuvemshop";
  if (normalized === "shopify") return "Shopify";
  if (normalized === "woocommerce") return "WooCommerce";
  return provider ? provider.replace(/_/g, " ") : "Integração manual";
}

function dashboardCapabilities(provider: string): DashboardCapabilities {
  const normalized = provider.toLowerCase();
  const isShopify = normalized === "shopify";
  const isNuvemshop = normalized === "nuvemshop";
  const isUpzero = normalized === "upzero";

  return {
    attributionLabel: isShopify
      ? "Compras confirmadas pelo checkout integrado."
      : isNuvemshop
        ? "Disponível quando o app de pedidos estiver ativo."
        : isUpzero
          ? "UP Zero não envia pedidos confirmados para a Luup."
          : "Disponível com integração de pedidos.",
    checkoutLabel: isShopify
      ? "Checkout dentro da experiência Luup."
      : isNuvemshop
        ? "Carrinho integrado; checkout da loja."
        : isUpzero
          ? "Pedido finalizado na UP Zero."
          : "Checkout externo ou em breve.",
    integrationName: providerLabel(normalized),
    provider: normalized || "manual",
    supportsAttributedOrders: isShopify,
    supportsAttributedRevenue: isShopify,
    supportsCartEvents: true,
    supportsInlineCheckout: isShopify,
    supportsVariantGrid: isUpzero,
  };
}

function rankingRate(addToCart: number, views: number) {
  return views > 0 ? addToCart / views : 0;
}

export const analyticsService = {
  async likeVideo(storeId: string, videoId: string) {
    // Public API route — idempotent per (video, visitor) server-side.
    await apiPost("/api/widget/likes", {
      store_id: storeId,
      video_id: videoId,
      visitor_id: getOrCreateVisitorId(),
    });
  },

  async trackEvent(payload: TrackEventPayload, context?: TrackingContext) {
    // Public API route — works for anonymous storefront visitors too.
    await apiPost<{ ok: boolean }>("/api/widget/events", {
      ...payload,
      visitor_id:
        payload.visitor_id ?? context?.visitorId ?? getOrCreateVisitorId(),
      session_id:
        payload.session_id ?? context?.sessionId ?? getOrCreateSessionId(),
      url: payload.url ?? context?.url ?? window.location.href,
      referrer:
        payload.referrer ?? context?.referrer ?? (document.referrer || null),
      user_agent:
        payload.user_agent ?? context?.userAgent ?? navigator.userAgent,
      metadata: payload.metadata ?? {},
    });
  },

  async getDashboardMetrics(storeId: string): Promise<DashboardMetrics> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const storeParams = new URLSearchParams({ store_id: storeId });
    const eventParams = new URLSearchParams({
      store_id: storeId,
      since: thirtyDaysAgo.toISOString(),
      fields: "full",
    });

    const [counts, storeResult, integrationsResult, eventsResult, videosResult, productsResult] =
      await Promise.all([
        apiGet<{ active_videos: number; total_likes: number; pending_comments: number }>(
          `/api/analytics/dashboard-counts?${storeParams}`,
        ),
        apiGet<{ store: { id: string; platform?: string | null } }>(`/api/stores/${storeId}`),
        apiGet<{ integrations: any[] }>(`/api/integrations?${storeParams}`),
        apiGet<{ events: any[] }>(`/api/analytics/events?${eventParams}`),
        apiGet<{ videos: any[] }>(`/api/videos?${storeParams}`),
        apiGet<{ products: any[] }>(`/api/products?${storeParams}`),
      ]);

    const activeVideos = counts.active_videos;
    const totalLikes = counts.total_likes;
    const pendingComments = counts.pending_comments;

    const events = eventsResult.events ?? [];
    const activeProviders = (integrationsResult.integrations ?? [])
      .filter((integration) => integration.status === "active")
      .map((integration) => String(integration.provider || "").toLowerCase());
    const provider =
      activeProviders[0] ||
      String(storeResult.store?.platform || "").toLowerCase() ||
      "manual";
    const capabilities = dashboardCapabilities(provider);

    const visibleWidgetEvents = events.filter(
      (event) =>
        event.event_type === "widget_view" && !eventAction(event.metadata),
    );
    const launcherImpressionEvents = events.filter(
      (event) => event.event_type === "launcher_impression",
    );
    const views = events.filter((event) => event.event_type === "video_view").length;
    const feedOpens = events.filter((event) => event.event_type === "feed_open").length;
    const feedCloseDurations = events
      .filter((event) => event.event_type === "feed_close")
      .map((event) => Number(asRecord(event.metadata).duration_seconds ?? 0))
      .filter((duration) => Number.isFinite(duration) && duration > 0);
    const averageFeedSessionSeconds = feedCloseDurations.length
      ? feedCloseDurations.reduce((sum, duration) => sum + duration, 0) /
        feedCloseDurations.length
      : 0;
    const productClicks = events.filter(
      (event) => event.event_type === "product_click",
    ).length;
    const addToCart = events.filter(
      (event) => event.event_type === "add_to_cart_click",
    ).length;
    const shares = events.filter((event) => event.event_type === "share_click").length;
    const likes = events.filter((event) => event.event_type === "like_click").length;
    const comments = events.filter(
      (event) => event.event_type === "comment_create",
    ).length;
    const checkoutStarted = events.filter(
      (event) => {
        const type = String(event.event_type);
        return (
          type === "checkout_start" ||
          asRecord(event.metadata).action === "checkout_start"
        );
      },
    ).length;
    const attributedPurchases = events.filter((event) => {
      const action = eventAction(event.metadata);
      const type = String(event.event_type);
      return (
        type === "purchase" ||
        type === "order_paid" ||
        type === "purchase_attributed" ||
        action === "purchase" ||
        action === "order_paid"
      );
    }).length;
    const attributedRevenue = events.reduce(
      (sum, event) => sum + numberFromMetadata(event.metadata),
      0,
    );

    const ratingEvents = events
      .map((event) => Number(asRecord(event.metadata).feedback_rating || 0))
      .filter((rating) => Number.isFinite(rating) && rating > 0);
    const averageFeedbackRating = ratingEvents.length
      ? ratingEvents.reduce((sum, rating) => sum + rating, 0) /
        ratingEvents.length
      : 0;

    const chartByDay = new Map(emptyChartWindow().map((point) => [point.date, point]));
    for (const event of events) {
      const eventDate = new Date(event.created_at);
      const point = chartByDay.get(dayLabel(eventDate));
      if (!point) continue;
      if (
        event.event_type === "launcher_impression" ||
        (launcherImpressionEvents.length === 0 &&
          event.event_type === "widget_view" &&
          !eventAction(event.metadata))
      ) {
        point.impressions += 1;
      }
      if (event.event_type === "video_view") point.views += 1;
      if (event.event_type === "feed_open") point.feedOpens += 1;
      if (event.event_type === "product_click") point.productClicks += 1;
      if (event.event_type === "add_to_cart_click") point.addToCart += 1;
      point.revenue += numberFromMetadata(event.metadata);
    }
    const chartData = Array.from(chartByDay.values());

    const videoMap = new Map<string, DashboardRankingItem>();
    for (const video of (videosResult.videos ?? []) as any[]) {
      const links = Array.isArray((video as any).video_products)
        ? (video as any).video_products
        : [];
      const productName =
        links.find((link: any) => link?.is_primary)?.products?.name ??
        links[0]?.products?.name ??
        "Sem produto vinculado";
      videoMap.set(video.id, {
        addToCart: 0,
        clicks: 0,
        id: video.id,
        imageUrl: video.thumbnail_url,
        label: video.title || "Vídeo sem título",
        rate: 0,
        revenue: 0,
        subtitle: productName,
        views: 0,
      });
    }

    const productMap = new Map<string, DashboardRankingItem>();
    for (const product of (productsResult.products ?? []) as any[]) {
      productMap.set(product.id, {
        addToCart: 0,
        clicks: 0,
        id: product.id,
        imageUrl: product.image_url,
        label: product.name,
        rate: 0,
        revenue: 0,
        subtitle: "Produto",
        views: 0,
      });
    }

    for (const event of events) {
      if (event.video_id && videoMap.has(event.video_id)) {
        const item = videoMap.get(event.video_id)!;
        if (event.event_type === "video_view") item.views += 1;
        if (event.event_type === "product_click") item.clicks += 1;
        if (event.event_type === "add_to_cart_click") item.addToCart += 1;
        item.revenue += numberFromMetadata(event.metadata);
      }
      if (event.product_id && productMap.has(event.product_id)) {
        const item = productMap.get(event.product_id)!;
        if (event.event_type === "product_click") item.clicks += 1;
        if (event.event_type === "add_to_cart_click") item.addToCart += 1;
        item.revenue += numberFromMetadata(event.metadata);
      }
    }

    const topVideos = Array.from(videoMap.values())
      .map((item) => ({
        ...item,
        rate: rankingRate(item.addToCart, item.views),
      }))
      .sort((left, right) => {
        if (right.addToCart !== left.addToCart) return right.addToCart - left.addToCart;
        return right.views - left.views;
      })
      .slice(0, 6);

    const topProducts = Array.from(productMap.values())
      .map((item) => ({
        ...item,
        rate: rankingRate(item.addToCart, Math.max(1, item.clicks)),
      }))
      .sort((left, right) => {
        if (right.addToCart !== left.addToCart) return right.addToCart - left.addToCart;
        return right.clicks - left.clicks;
      })
      .slice(0, 6);

    const widgetImpressions = launcherImpressionEvents.length || visibleWidgetEvents.length;
    const funnel = [
      {
        description: "A Luup apareceu na loja.",
        enabled: true,
        key: "impressions",
        rateFromPrevious: null,
        title: "Impressões da bolinha",
        value: widgetImpressions,
      },
      {
        description: "Visitantes abriram a experiência.",
        enabled: true,
        key: "feed_open",
        rateFromPrevious: percent(feedOpens, widgetImpressions),
        title: "Aberturas do feed",
        value: feedOpens,
      },
      {
        description: "Reproduções iniciadas no feed.",
        enabled: true,
        key: "views",
        rateFromPrevious: percent(views, feedOpens),
        title: "Views de vídeo",
        value: views,
      },
      {
        description: "Interesse direto no produto.",
        enabled: true,
        key: "product_clicks",
        rateFromPrevious: percent(productClicks, views),
        title: "Cliques em produto",
        value: productClicks,
      },
      {
        description: "Principal métrica de intenção de compra.",
        enabled: capabilities.supportsCartEvents,
        key: "cart",
        rateFromPrevious: percent(addToCart, Math.max(productClicks, views)),
        title: "Adições ao carrinho",
        value: addToCart,
      },
      {
        description: capabilities.checkoutLabel,
        enabled: capabilities.supportsInlineCheckout,
        key: "checkout",
        rateFromPrevious: percent(checkoutStarted, addToCart),
        title: "Checkout iniciado",
        value: checkoutStarted,
      },
      {
        description: capabilities.attributionLabel,
        enabled: capabilities.supportsAttributedOrders,
        key: "purchases",
        rateFromPrevious: percent(attributedPurchases, Math.max(checkoutStarted, addToCart)),
        title: "Compras atribuídas",
        value: attributedPurchases,
      },
    ];

    return {
      views,
      productClicks,
      ctr: views > 0 ? productClicks / views : 0,
      addToCart,
      attributedRevenue,
      activeVideos,
      attributedPurchases,
      averageFeedbackRating,
      averageFeedSessionSeconds,
      capabilities,
      cartRate: percent(addToCart, views),
      chartData,
      checkoutRate: percent(checkoutStarted, addToCart),
      checkoutStarted,
      engagementRate: percent(likes + comments + shares, views),
      feedOpenRate: percent(feedOpens, widgetImpressions),
      feedOpens,
      funnel,
      productClickRate: percent(productClicks, views),
      revenueMode: capabilities.supportsAttributedRevenue
        ? "attributed"
        : attributedRevenue > 0
          ? "estimated"
          : "unavailable",
      sessions: uniqueCount(events.map((event) => event.session_id)),
      topProducts,
      topVideos,
      totalLikes,
      pendingComments,
      uniqueVisitors: uniqueCount(events.map((event) => event.visitor_id)),
      widgetImpressions,
    };
  },
};
