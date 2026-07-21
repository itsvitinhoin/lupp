import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { CommerceProductCard } from "@/components/shared/CommerceProductCard";
import { LazyVideoPlayer } from "@/components/shared/LazyVideoPlayer";
import { resolvePreloadStrategy, resolveVideoFitMode } from "@/lib/feed-playback";
import {
  Heart,
  MessageCircle,
  Share2,
  ArrowLeft,
  ShoppingBag,
  Star,
  Truck,
  ShieldCheck,
  X,
  Play,
  Volume2,
  VolumeX,
  ChevronsUp,
  Loader2,
  Minus,
  Plus,
} from "lucide-react";
import { mockVideos } from "@/data/mock";
import { Link, useRoute } from "wouter";
import { videosService } from "@/services/videos.service";
import { analyticsService } from "@/services/analytics.service";
import { commentsService } from "@/services/comments.service";
import { env, isApiConfigured } from "@/lib/env";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function feedOption(options: Record<string, any>, key: string, fallback: boolean) {
  return typeof options[key] === "boolean" ? options[key] : fallback;
}

function formatTikTokCount(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0";
  if (numeric >= 1_000_000) {
    return `${Number((numeric / 1_000_000).toFixed(1)).toLocaleString("pt-BR")} mi`;
  }
  if (numeric >= 10_000) {
    return `${Number((numeric / 1_000).toFixed(1)).toLocaleString("pt-BR")} mil`;
  }
  return Math.round(numeric).toLocaleString("pt-BR");
}

async function refreshBunnyStatusForPublicFeed(storeSlug: string) {
  if (!env.apiUrl) return;
  const params = new URLSearchParams({
    mode: "preview",
    store_slug: storeSlug,
    widget: "floating_launcher",
  });
  await fetch(
    `${env.apiUrl.replace(/\/$/, "")}/api/widget/bootstrap?${params.toString()}`,
  ).catch(() => null);
}

function getPrimaryProduct(video: any) {
  return (
    video.video_products?.find((item: any) => item.is_primary)?.products ??
    video.video_products?.[0]?.products ??
    null
  );
}

function getLinkedProducts(video: any) {
  const links = Array.isArray(video.video_products) ? video.video_products : [];
  const seen = new Set<string>();
  return links
    .slice()
    .sort((left: any, right: any) => {
      if (left?.is_primary && !right?.is_primary) return -1;
      if (!left?.is_primary && right?.is_primary) return 1;
      return 0;
    })
    .map((link: any) => link?.products)
    .filter((product: any) => {
      if (!product?.id || seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    });
}

function formatPrice(value?: number | null) {
  if (!value) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatVariantPrice(value?: number | null) {
  return formatPrice(value) ?? "";
}

function numberFromUnknown(value: unknown) {
  const parsed =
    typeof value === "string"
      ? Number(
          value.includes(",")
            ? value.replace(/\./g, "").replace(",", ".")
            : value,
        )
      : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getCustomPaymentLines(store: any, priceValue?: number | null) {
  const commerce = asRecord(store?.widget_settings?.commerce);
  const lines: string[] = [];
  const installmentsCount = Math.max(
    1,
    Math.min(24, Number(commerce.custom_installments_count) || 1),
  );
  const pixDiscount = Math.max(
    0,
    Math.min(100, Number(commerce.custom_pix_discount_percent) || 0),
  );

  if (
    commerce.custom_installments_enabled &&
    installmentsCount > 1 &&
    priceValue
  ) {
    const installmentValue = priceValue / installmentsCount;
    const interestLabel =
      commerce.custom_installments_interest_free === false ? "" : " sem juros";
    lines.push(
      `${installmentsCount} x de ${formatPrice(installmentValue)}${interestLabel}`,
    );
  }

  if (commerce.custom_pix_discount_enabled && pixDiscount > 0) {
    if (priceValue) {
      const discountedPrice = priceValue * (1 - pixDiscount / 100);
      lines.push(
        `${pixDiscount.toLocaleString("pt-BR")}% OFF no Pix (${formatPrice(discountedPrice)})`,
      );
    } else {
      lines.push(`${pixDiscount.toLocaleString("pt-BR")}% OFF no Pix`);
    }
  }

  if (typeof commerce.custom_payment_note === "string") {
    const note = commerce.custom_payment_note.trim();
    if (note) lines.push(note);
  }

  return Array.from(new Set(lines.filter(Boolean)));
}

function normalizeColorName(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COLOR_HEX_BY_NAME: Record<string, string> = {
  amarelo: "#FFEE02",
  "azul claro": "#00BFFF",
  "azul marinho": "#123A8C",
  "azul petroleo": "#1F8BC7",
  "azul royal": "#003CFF",
  azul: "#0000DC",
  bege: "#F5F5DC",
  branco: "#FFFFFF",
  caramelo: "#C47A32",
  cinza: "#9CA3AF",
  fucsia: "#CE3B72",
  laranja: "#F97316",
  lavanda: "#C4B5FD",
  lilas: "#C084FC",
  marrom: "#7A4A2A",
  marsala: "#7B1E3A",
  nude: "#E8C7B8",
  off: "#F8F7F2",
  "off white": "#F8F7F2",
  preto: "#000000",
  rosa: "#F7A8C7",
  rose: "#D9A0A7",
  roxo: "#7E22CE",
  verde: "#3F7D20",
  "verde oliva": "#4B6F29",
  vermelho: "#FF0000",
};

function getVariantColorHex(variant: any) {
  const explicit =
    variant?.color_hex ||
    variant?.metadata?.color_hex ||
    variant?.metadata?.hex ||
    variant?.metadata?.swatch_hex;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const normalized = normalizeColorName(
    variant?.color_name || variant?.color_code,
  );
  return normalized ? COLOR_HEX_BY_NAME[normalized] : undefined;
}

function getVariantPaymentLines(variant: any) {
  const metadata = variant?.metadata || {};
  const rawTerms = metadata.payment_terms;
  const terms = Array.isArray(rawTerms)
    ? rawTerms
    : rawTerms
      ? [rawTerms]
      : [];
  const lines = [
    metadata.installment_text,
    metadata.pix_discount_text,
    ...terms,
  ]
    .filter((line) => typeof line === "string" && line.trim())
    .map((line) => line.trim());
  return Array.from(new Set(lines));
}

function slugifyProductName(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function upzeroReferenceSlug(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const refMatch = raw.match(/\bref\s*[:#-]?\s*(\d+[a-z0-9-]*)/i);
  if (refMatch?.[1]) return `ref${slugifyProductName(refMatch[1])}`;
  const numericMatch = raw.match(/\b(\d{3,}[a-z0-9-]*)\b/i);
  if (numericMatch?.[1]) return `ref${slugifyProductName(numericMatch[1])}`;
  return slugifyProductName(raw.replace(/^ref\s*[:#-]?\s*/i, "ref"));
}

function comparableMediaUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, window.location.href);
    parsed.search = "";
    parsed.hash = "";
    return parsed.href.toLowerCase();
  } catch (_) {
    return raw.split("?")[0].split("#")[0].toLowerCase();
  }
}

function firstUpzeroColorSlug(product: any) {
  const variants = Array.isArray(product?.product_variants)
    ? product.product_variants
    : Array.isArray(product?.variants)
      ? product.variants
      : [];
  const productImageKey = comparableMediaUrl(product?.image_url);
  const imageMatchedVariant = productImageKey
    ? variants.find((variant: any) => {
        const value =
          variant?.color_slug ||
          variant?.color_name ||
          variant?.color_code ||
          variant?.color ||
          variant?.option1;
        return (
          value &&
          !isDefaultShopifyOption(value) &&
          comparableMediaUrl(variant?.image_url) === productImageKey
        );
      })
    : null;
  if (imageMatchedVariant) {
    return slugifyProductName(
      imageMatchedVariant?.color_slug ||
        imageMatchedVariant?.color_name ||
        imageMatchedVariant?.color_code ||
        imageMatchedVariant?.color ||
        imageMatchedVariant?.option1,
    );
  }
  const firstVariantWithColor = variants.find((variant: any) => {
    const value =
      variant?.color_slug ||
      variant?.color_name ||
      variant?.color_code ||
      variant?.color ||
      variant?.option1;
    return value && !isDefaultShopifyOption(value);
  });
  return slugifyProductName(
    firstVariantWithColor?.color_slug ||
      firstVariantWithColor?.color_name ||
      firstVariantWithColor?.color_code ||
      firstVariantWithColor?.color ||
      firstVariantWithColor?.option1,
  );
}

function repairUpzeroProductUrl(product: any, savedUrl?: string | null, storeUrl?: string | null) {
  const base = (() => {
    try {
      return new URL(savedUrl || storeUrl || window.location.origin).origin;
    } catch (_) {
      return String(storeUrl || window.location.origin || "").replace(/\/+$/, "");
    }
  })();
  const referenceSlug = upzeroReferenceSlug(
    product?.product_url || product?.external_id || product?.name || product?.title,
  );
  const nameSlug = slugifyProductName(product?.name || product?.title);
  if (!base || !referenceSlug || !nameSlug) return savedUrl || null;
  const colorSlug = firstUpzeroColorSlug(product);
  const path = `/produtos/${referenceSlug}-${nameSlug}${colorSlug ? `/${colorSlug}` : ""}`;
  try {
    return new URL(path, `${base}/`).href;
  } catch (_) {
    return `${base}${path}`;
  }
}

function videoFeatureEnabled(video: any, key: string) {
  return video?.[key] !== false;
}

function isProductLikeUrl(value?: string | null) {
  if (!value) return false;
  try {
    return /\/(produto|produtos|product|products)\//i.test(
      new URL(value, window.location.origin).pathname,
    );
  } catch (_) {
    return false;
  }
}

function hasProductVariantSegment(value?: string | null) {
  if (!value) return false;
  try {
    const path = new URL(value, window.location.origin).pathname;
    return /\/(?:produto|produtos|product|products)\/[^/]+\/[^/]+/i.test(path);
  } catch (_) {
    return false;
  }
}

function productKeyFromUrl(value?: string | null) {
  if (!value) return "";
  try {
    const path = new URL(value, window.location.origin).pathname;
    const match = path.match(
      /\/(?:produto|produtos|product|products)\/([^/]+)/i,
    );
    const handle = match ? decodeURIComponent(match[1]).toLowerCase() : "";
    return handle.match(/^\d+/)?.[0] ?? handle;
  } catch (_) {
    return "";
  }
}

function sameProductUrl(left?: string | null, right?: string | null) {
  const leftKey = productKeyFromUrl(left);
  const rightKey = productKeyFromUrl(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

function absoluteUrl(value?: string | null, baseUrl?: string | null) {
  if (!value) return null;
  try {
    const base = baseUrl || window.location.origin;
    const parsed = new URL(value, base);
    if (
      parsed.protocol === "http:" &&
      !["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)
    ) {
      parsed.protocol = "https:";
    }
    return parsed.href;
  } catch (_) {
    return value;
  }
}

function resolveProductUrl(
  product: any,
  fallbackUrl?: string | null,
  contextualProductUrl?: string | null,
  storeUrl?: string | null,
) {
  if (
    contextualProductUrl &&
    isProductLikeUrl(contextualProductUrl) &&
    (!product?.product_url ||
      sameProductUrl(contextualProductUrl, product.product_url))
  ) {
    return absoluteUrl(contextualProductUrl, storeUrl) || contextualProductUrl;
  }

  const savedUrl = absoluteUrl(product?.product_url, storeUrl);
  if (savedUrl && product?.platform === "upzero") {
    try {
      const parsed = new URL(savedUrl);
      const match = parsed.pathname.match(/^\/produto\/(\d+)\/?$/i);
      const nameSlug = slugifyProductName(product.name);
      if (match && nameSlug) {
        parsed.pathname = `/produtos/${match[1]}-${nameSlug}`;
        parsed.search = "";
        parsed.hash = "";
        return parsed.href;
      }
      if (/%3a|ref:/i.test(savedUrl) || !hasProductVariantSegment(savedUrl)) {
        return repairUpzeroProductUrl(product, savedUrl, storeUrl) || savedUrl;
      }
    } catch (_) {
      // Keep the stored URL if it cannot be parsed.
    }
  }

  return savedUrl || absoluteUrl(fallbackUrl, storeUrl);
}

function productToView(
  product: any,
  fallbackUrl?: string | null,
  contextualProductUrl?: string | null,
  storeUrl?: string | null,
) {
  if (!product?.id) return null;

  const productUrl = resolveProductUrl(
    product,
    fallbackUrl,
    contextualProductUrl,
    storeUrl,
  );
  const priceValue = numberFromUnknown(product.price);
  return {
    id: product.id,
    name: product.name ?? "Produto",
    description: product.description ?? "",
    price: formatPrice(priceValue),
    priceValue,
    paymentTerms: null,
    imageUrl: product.image_url ?? null,
    productUrl,
    platform: product.platform ?? null,
    externalId: product.external_id ?? null,
    variants: Array.isArray(product.product_variants)
      ? product.product_variants
          .filter((variant: any) => variant?.status !== "archived")
          .sort((left: any, right: any) => {
            const colorCompare = String(left.color_name || "").localeCompare(
              String(right.color_name || ""),
              "pt-BR",
              { numeric: true },
            );
            if (colorCompare) return colorCompare;
            return String(left.size_name || "").localeCompare(
              String(right.size_name || ""),
              "pt-BR",
              { numeric: true },
            );
          })
      : [],
  };
}

function getProductView(
  video: any,
  fallbackUrl?: string | null,
  contextualProductUrl?: string | null,
  storeUrl?: string | null,
) {
  return productToView(
    getPrimaryProduct(video),
    fallbackUrl,
    contextualProductUrl,
    storeUrl,
  );
}

function getProductViews(
  video: any,
  fallbackUrl?: string | null,
  contextualProductUrl?: string | null,
  storeUrl?: string | null,
) {
  return getLinkedProducts(video)
    .map((product: any) =>
      productToView(product, fallbackUrl, contextualProductUrl, storeUrl),
    )
    .filter(Boolean) as Array<NonNullable<ReturnType<typeof productToView>>>;
}

function isUpzeroCommerce(store: any, product: any) {
  return (
    String(store?.platform || "").toLowerCase() === "upzero" ||
    String(product?.platform || "").toLowerCase() === "upzero"
  );
}

function isNuvemshopCommerce(store: any, product: any) {
  return (
    String(store?.platform || "").toLowerCase() === "nuvemshop" ||
    String(product?.platform || "").toLowerCase() === "nuvemshop"
  );
}

function isShopifyCommerce(store: any, product: any) {
  return (
    String(store?.platform || "").toLowerCase() === "shopify" ||
    String(product?.platform || "").toLowerCase() === "shopify"
  );
}

function humanizeCartError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message === "shopify_product_not_published") {
    return "Esse produto não está publicado na loja Shopify. Publique o produto no canal Loja virtual ou vincule o vídeo a outro produto ativo.";
  }
  if (message === "shopify_variant_not_found") {
    return "Não encontramos uma variante disponível para esse produto na Shopify.";
  }
  return message || "Tente novamente em instantes.";
}

function displayProductForAccess<T extends ReturnType<typeof getProductView>>(
  product: T,
  restricted: boolean,
): T | null {
  if (!product) return null;
  if (!restricted) return product;
  return {
    ...product,
    paymentTerms: "Entre ou cadastre-se para visualizar valores.",
    price: "",
  };
}

type QuickOrderItem = {
  asset_id?: string | null;
  product_variant_id: number;
  quantity: number;
};

type QuickOrderPayload = {
  items: QuickOrderItem[];
  productUrl?: string | null;
};

type NuvemshopQuickOrderItem = {
  product_id: number;
  quantity: number;
  variant_id: number;
};

type ShopifyQuickOrderItem = {
  quantity: number;
  variant_id: number;
};

type ShopifyProductPayload = {
  external_id?: string | null;
  handle?: string | null;
  image_url?: string | null;
  options?: string[];
  title?: string | null;
  variants?: any[];
};

function uniqueVariantColors(variants: any[]) {
  const colors = new Map<string, any>();
  for (const variant of variants) {
    const key = String(
      variant.color_code || variant.color_name || "Produto",
    ).toLowerCase();
    if (!colors.has(key)) colors.set(key, variant);
  }
  return Array.from(colors.values()).sort((left, right) => {
    const leftIndex = Number(left?.metadata?.color_index);
    const rightIndex = Number(right?.metadata?.color_index);
    if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex)) {
      return leftIndex - rightIndex;
    }
    return String(left.color_name || left.color_code || "").localeCompare(
      String(right.color_name || right.color_code || ""),
    );
  });
}

function uniqueVariantSizes(variants: any[]) {
  const sizes = new Map<string, any>();
  for (const variant of variants) {
    const key = String(
      variant.size_code || variant.size_name || "Unico",
    ).toLowerCase();
    if (!sizes.has(key)) sizes.set(key, variant);
  }
  const sizeOrder = ["PP", "P", "M", "G", "GG", "XG", "XGG", "U", "UNICO"];
  return Array.from(sizes.values()).sort((left, right) => {
    const leftIndex = Number(left?.metadata?.size_index);
    const rightIndex = Number(right?.metadata?.size_index);
    if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex)) {
      return leftIndex - rightIndex;
    }
    const leftName = String(
      left.size_name || left.size_code || "",
    ).toUpperCase();
    const rightName = String(
      right.size_name || right.size_code || "",
    ).toUpperCase();
    const knownLeft = sizeOrder.indexOf(leftName);
    const knownRight = sizeOrder.indexOf(rightName);
    if (knownLeft !== -1 && knownRight !== -1) return knownLeft - knownRight;
    if (knownLeft !== -1) return -1;
    if (knownRight !== -1) return 1;
    return leftName.localeCompare(rightName);
  });
}

function variantGridKey(variant: any) {
  return `${variantColorKey(variant)}|${variantSizeKey(variant)}`;
}

function variantColorKey(variant: any) {
  return String(variant.color_code || variant.color_name || "produto").toLowerCase();
}

function variantSizeKey(variant: any) {
  return String(variant.size_code || variant.size_name || "unico").toLowerCase();
}

function hasUsableVariantExternalId(variant: any) {
  const externalId = Number(variant?.external_id);
  return Number.isFinite(externalId) && externalId > 0;
}

function isAvailableCommerceVariant(variant: any) {
  const status = String(variant?.status || "active").toLowerCase();
  return (
    hasUsableVariantExternalId(variant) &&
    status !== "archived" &&
    status !== "inactive" &&
    status !== "disabled" &&
    variant?.stock_qty !== 0
  );
}

function normalizedOptionValue(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isDefaultShopifyOption(value: unknown) {
  const normalized = normalizedOptionValue(value);
  return (
    !normalized ||
    normalized === "default title" ||
    normalized === "title" ||
    normalized === "produto" ||
    normalized === "unico"
  );
}

function hasRealVariantColor(variant: any) {
  return !isDefaultShopifyOption(variant?.color_code || variant?.color_name);
}

function hasRealVariantSize(variant: any) {
  return !isDefaultShopifyOption(variant?.size_code || variant?.size_name);
}

function hasUsableQuickOrderGrid(product: any) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const purchasableVariants = variants.filter(isAvailableCommerceVariant);
  if (!purchasableVariants.length) return false;
  if (purchasableVariants.length > 1) return true;
  return true;
}

function shouldHydrateShopifyVariants(product: any) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return true;
  const hasRealOptions = variants.some(
    (variant: any) => hasRealVariantColor(variant) || hasRealVariantSize(variant),
  );
  return !hasRealOptions;
}

function LoadingVideoPreview({
  posterUrl,
  videoUrl,
}: {
  posterUrl?: string | null;
  videoUrl?: string | null;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  return (
    <div
      className="absolute inset-0 bg-black bg-cover bg-center"
      style={{ backgroundImage: posterUrl ? `url(${posterUrl})` : undefined }}
    >
      {videoUrl && (
        <LazyVideoPlayer
          ref={videoRef}
          src={videoUrl}
          poster={posterUrl ?? undefined}
          className="h-full w-full object-cover"
          autoPlay={false}
          muted
          preload="auto"
          onLoadedData={() => {
            const element = videoRef.current;
            if (!element) return;
            element.pause();
            try {
              element.currentTime = 0;
            } catch (_) {
              // Some browsers do not allow seeking before the media is ready.
            }
          }}
        />
      )}
      <div className="absolute inset-0 bg-black/10" />
      <div className="absolute inset-x-0 bottom-24 flex justify-center">
        <div className="rounded-full bg-black/45 px-4 py-2 text-xs font-bold text-white shadow-xl backdrop-blur-md">
          Carregando vídeo e produto...
        </div>
      </div>
    </div>
  );
}

export default function PreviewFeed() {
  const { toast } = useToast();
  const [, params] = useRoute("/s/:storeSlug/feed");
  const storeSlug = params?.storeSlug;
  const [likedMap, setLikedMap] = React.useState<Record<string, boolean>>({});
  const isEmbedded =
    new URLSearchParams(window.location.search).get("embed") === "1";
  const requestAutoplaySound = React.useMemo(
    () => new URLSearchParams(window.location.search).get("autoplay_sound") === "1",
    [],
  );
  const requestedVideoId = React.useMemo(
    () => new URLSearchParams(window.location.search).get("v"),
    [],
  );
  const sourceProductUrl = React.useMemo(
    () => new URLSearchParams(window.location.search).get("product_url"),
    [],
  );
  const initialCustomerApproved = React.useMemo(
    () =>
      new URLSearchParams(window.location.search).get("customer_approved") ===
      "1",
    [],
  );
  const initialCustomerLoggedIn = React.useMemo(
    () =>
      new URLSearchParams(window.location.search).get("customer_logged_in") ===
      "1",
    [],
  );
  const initialCustomerStatus = React.useMemo(
    () =>
      new URLSearchParams(window.location.search).get("customer_status") ||
      "UNKNOWN",
    [],
  );
  const [customerApproved, setCustomerApproved] = React.useState(
    initialCustomerApproved,
  );
  const [customerLoggedIn, setCustomerLoggedIn] = React.useState(
    initialCustomerLoggedIn,
  );
  const [customerStatus, setCustomerStatus] = React.useState(
    initialCustomerStatus,
  );
  const loadingPreviewVideoUrl = React.useMemo(
    () => new URLSearchParams(window.location.search).get("preview_video_url"),
    [],
  );
  const loadingPreviewPosterUrl = React.useMemo(
    () => new URLSearchParams(window.location.search).get("preview_poster_url"),
    [],
  );

  const feedQuery = useQuery({
    queryKey: ["public-feed", storeSlug, requestedVideoId, sourceProductUrl],
    queryFn: async () => {
      await refreshBunnyStatusForPublicFeed(storeSlug!);
      return videosService.listPublicFeedVideosByStoreSlug(
        storeSlug!,
        requestedVideoId,
        sourceProductUrl,
      );
    },
    enabled: isApiConfigured && Boolean(storeSlug),
  });

  const store = feedQuery.data?.store;
  const feedOptions = asRecord((feedQuery.data as any)?.feed_options);
  const showLogo = feedOption(feedOptions, "show_logo", true);
  const showProductName = feedOption(feedOptions, "show_product_name", true);
  const showPrice = feedOption(feedOptions, "show_price", true);
  const showDescription = feedOption(feedOptions, "show_description", true);
  const showBuyButton = feedOption(feedOptions, "show_buy_button", true);
  const showLikes = feedOption(feedOptions, "show_likes", true);
  const showComments = feedOption(feedOptions, "show_comments", true);
  const showShare = feedOption(feedOptions, "show_share", true);
  const loopVideo = feedOption(feedOptions, "loop_video", true);
  const autoplayMuted = feedOption(feedOptions, "autoplay_muted", true);
  const effectiveAutoplayMuted = requestAutoplaySound ? false : autoplayMuted;
  const preloadNext = feedOption(feedOptions, "preload_next", true);
  const pauseWhenHidden = feedOption(feedOptions, "pause_when_hidden", true);
  const addToCartInline = feedOption(feedOptions, "add_to_cart_inline", true);
  const realVideos = feedQuery.data?.videos ?? [];
  const videos = storeSlug
    ? realVideos
    : mockVideos.filter((video) => video.productName);
  const orderedVideos = React.useMemo(() => {
    if (!requestedVideoId) return videos;
    const requestedIndex = videos.findIndex(
      (video: any) => video.id === requestedVideoId,
    );
    if (requestedIndex <= 0) return videos;
    return [
      videos[requestedIndex],
      ...videos.slice(requestedIndex + 1),
      ...videos.slice(0, requestedIndex),
    ];
  }, [requestedVideoId, videos]);
  const productRelatedVideoCount = React.useMemo(() => {
    if (!sourceProductUrl) return 0;
    return orderedVideos.filter((video: any) =>
      sameProductUrl(getPrimaryProduct(video)?.product_url, sourceProductUrl),
    ).length;
  }, [orderedVideos, sourceProductUrl]);
  const isProductSwipeHint = productRelatedVideoCount > 1;
  const productViewsByVideoId = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof getProductViews>>();
    for (const video of orderedVideos as any[]) {
      map.set(
        video.id,
        getProductViews(
          video,
          null,
          video.id === requestedVideoId ? sourceProductUrl : null,
          store?.url,
        ),
      );
    }
    return map;
  }, [orderedVideos, requestedVideoId, sourceProductUrl, store?.url]);
  const [selectedProduct, setSelectedProduct] = React.useState<{
    video: any;
    product: NonNullable<ReturnType<typeof getProductView>>;
  } | null>(null);
  const [selectedCheckout, setSelectedCheckout] = React.useState<{
    video: any;
    product: NonNullable<ReturnType<typeof getProductView>>;
  } | null>(null);
  const [selectedQuickOrder, setSelectedQuickOrder] = React.useState<{
    video: any;
    product: NonNullable<ReturnType<typeof getProductView>>;
  } | null>(null);
  const [quickOrderQuantities, setQuickOrderQuantities] = React.useState<
    Record<string, number>
  >({});
  const [nuvemshopVariantSelection, setNuvemshopVariantSelection] =
    React.useState<{
      colorKey: string | null;
      sizeKey: string | null;
      variantId: string | null;
    }>({ colorKey: null, sizeKey: null, variantId: null });
  const [quickOrderStatus, setQuickOrderStatus] = React.useState<
    "idle" | "submitting"
  >("idle");
  const [selectedCommentVideo, setSelectedCommentVideo] = React.useState<
    any | null
  >(null);
  const [isSubmittingComment, setIsSubmittingComment] = React.useState(false);
  const [localCommentCounts, setLocalCommentCounts] = React.useState<
    Record<string, number>
  >({});
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);
  const activeIndex = Math.max(
    0,
    orderedVideos.findIndex((video: any) => video.id === activeVideoId),
  );
  const [pausedMap, setPausedMap] = React.useState<Record<string, boolean>>({});
  const [isMuted, setIsMuted] = React.useState(() => effectiveAutoplayMuted);
  const [soundUnlocked, setSoundUnlocked] = React.useState(
    () => !effectiveAutoplayMuted,
  );
  const [speedVideoId, setSpeedVideoId] = React.useState<string | null>(null);
  const [showSwipeHint, setShowSwipeHint] = React.useState(false);
  const videoRefs = React.useRef(new Map<string, HTMLVideoElement>());
  const sectionRefs = React.useRef(new Map<string, HTMLElement>());
  const viewedVideoIdsRef = React.useRef(new Set<string>());
  const tapTimerRef = React.useRef<number | null>(null);
  const tapCountRef = React.useRef(0);
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressActiveRef = React.useRef(false);
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const sectionObserverRef = React.useRef<IntersectionObserver | null>(null);
  // Per-video "show controls" triggers registered by mounted FeedItems so the
  // controls-visibility state can live inside each item instead of re-rendering
  // the whole feed on every tap.
  const controlsHandlesRef = React.useRef(
    new Map<string, (keepVisible?: boolean) => void>(),
  );
  const quickOrderRequestsRef = React.useRef(
    new Map<
      string,
      {
        reject: (error: Error) => void;
        resolve: () => void;
        timeout: number;
      }
    >(),
  );
  const shopifyProductRequestsRef = React.useRef(
    new Map<
      string,
      {
        reject: (error: Error) => void;
        resolve: (product: ShopifyProductPayload) => void;
        timeout: number;
      }
    >(),
  );

  const requestCustomerStatusRefresh = React.useCallback(() => {
    if (!isEmbedded || window.parent === window) return;
    window.parent.postMessage(
      { type: "LUPP_UPZERO_CUSTOMER_STATUS_REQUEST" },
      "*",
    );
  }, [isEmbedded]);

  const closeCheckoutAndRefresh = React.useCallback(() => {
    setSelectedCheckout(null);
    requestCustomerStatusRefresh();
  }, [requestCustomerStatusRefresh]);

  const openProductInStorePage = React.useCallback(
    (productUrl?: string | null) => {
      if (!productUrl) return;
      if (isEmbedded && window.parent !== window) {
        window.parent.postMessage(
          { type: "LUPP_OPEN_PRODUCT_PAGE_REQUEST", url: productUrl },
          "*",
        );
        return;
      }
      window.location.href = productUrl;
    },
    [isEmbedded],
  );

  const sendShopifyProductRequest = React.useCallback(
    (productUrl?: string | null) => {
      if (!isEmbedded || window.parent === window) {
        return Promise.reject(
          new Error("Abra o vídeo dentro da loja para carregar as variações."),
        );
      }

      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      return new Promise<ShopifyProductPayload>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          shopifyProductRequestsRef.current.delete(requestId);
          reject(new Error("A loja não respondeu às variações do produto."));
        }, 12000);

        shopifyProductRequestsRef.current.set(requestId, {
          reject,
          resolve,
          timeout,
        });
        window.parent.postMessage(
          {
            type: "LUPP_SHOPIFY_PRODUCT_REQUEST",
            requestId,
            productUrl,
          },
          "*",
        );
      });
    },
    [isEmbedded],
  );

  React.useEffect(() => {
    const handleCustomerStatusMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data;
      if (!data || data.type !== "LUPP_UPZERO_CUSTOMER_STATUS_RESPONSE") return;

      setCustomerApproved(Boolean(data.approved));
      setCustomerLoggedIn(Boolean(data.loggedIn));
      setCustomerStatus(String(data.status || "UNKNOWN"));
    };

    window.addEventListener("message", handleCustomerStatusMessage);
    return () =>
      window.removeEventListener("message", handleCustomerStatusMessage);
  }, []);

  React.useEffect(() => {
    const handleQuickOrderMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data;
      if (
        !data ||
        ![
          "LUPP_UPZERO_ADD_TO_CART_RESPONSE",
          "LUPP_NUVEMSHOP_ADD_TO_CART_RESPONSE",
          "LUPP_SHOPIFY_ADD_TO_CART_RESPONSE",
        ].includes(data.type)
      )
        return;
      const requestId = String(data.requestId || "");
      const request = quickOrderRequestsRef.current.get(requestId);
      if (!request) return;
      window.clearTimeout(request.timeout);
      quickOrderRequestsRef.current.delete(requestId);
      if (data.ok) {
        request.resolve();
        return;
      }
      request.reject(
        new Error(data.error || "Não foi possível adicionar ao carrinho."),
      );
    };

    window.addEventListener("message", handleQuickOrderMessage);
    return () => {
      window.removeEventListener("message", handleQuickOrderMessage);
      quickOrderRequestsRef.current.forEach((request) =>
        window.clearTimeout(request.timeout),
      );
      quickOrderRequestsRef.current.clear();
    };
  }, []);

  React.useEffect(() => {
    const handleShopifyProductMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data;
      if (!data || data.type !== "LUPP_SHOPIFY_PRODUCT_RESPONSE") return;
      const requestId = String(data.requestId || "");
      const request = shopifyProductRequestsRef.current.get(requestId);
      if (!request) return;
      window.clearTimeout(request.timeout);
      shopifyProductRequestsRef.current.delete(requestId);
      if (data.ok && data.product) {
        request.resolve(data.product as ShopifyProductPayload);
        return;
      }
      request.reject(
        new Error(data.error || "Não foi possível carregar as variações."),
      );
    };

    window.addEventListener("message", handleShopifyProductMessage);
    return () => {
      window.removeEventListener("message", handleShopifyProductMessage);
      shopifyProductRequestsRef.current.forEach((request) =>
        window.clearTimeout(request.timeout),
      );
      shopifyProductRequestsRef.current.clear();
    };
  }, []);

  React.useEffect(() => {
    if (!store?.id || !isApiConfigured) return;
    void analyticsService
      .trackEvent({ store_id: store.id, event_type: "feed_open" })
      .catch(() => {});
  }, [store?.id]);

  React.useEffect(() => {
    if (
      !selectedCheckout ||
      customerApproved ||
      !isUpzeroCommerce(store, selectedCheckout.product)
    ) {
      return;
    }

    requestCustomerStatusRefresh();
    const refreshInterval = window.setInterval(
      requestCustomerStatusRefresh,
      2500,
    );

    return () => window.clearInterval(refreshInterval);
  }, [customerApproved, requestCustomerStatusRefresh, selectedCheckout, store]);

  const track = (
    eventType:
      | "video_view"
      | "product_click"
      | "add_to_cart_click"
      | "share_click"
      | "like_click"
      | "comment_create",
    video: any,
    productId?: string | null,
  ) => {
    if (!store?.id || !isApiConfigured) return;
    void analyticsService
      .trackEvent({
        store_id: store.id,
        video_id: video.id,
        product_id: productId ?? null,
        event_type: eventType,
        metadata: { source: "vertical_feed" },
      })
      .catch(() => {});
  };

  const handleLike = async (video: any) => {
    if (!videoFeatureEnabled(video, "allow_likes")) return;
    setLikedMap((current) => ({ ...current, [video.id]: !current[video.id] }));
    if (store?.id) {
      void analyticsService.likeVideo(store.id, video.id).catch(() => {});
    }
    track(
      "like_click",
      video,
      getPrimaryProduct(video)?.id ?? video.productId ?? null,
    );
  };

  const likeVideo = (video: any) => {
    if (!videoFeatureEnabled(video, "allow_likes")) return;
    setLikedMap((current) => {
      if (current[video.id]) return current;
      if (store?.id) {
        void analyticsService.likeVideo(store.id, video.id).catch(() => {});
      }
      track(
        "like_click",
        video,
        getPrimaryProduct(video)?.id ?? video.productId ?? null,
      );
      return { ...current, [video.id]: true };
    });
  };

  const handleShare = async (
    video: any,
    product: NonNullable<ReturnType<typeof getProductView>>,
  ) => {
    const shareUrl = product.productUrl || window.location.href;
    const text = `Olha esse Produto ${shareUrl}`;
    track(
      "share_click",
      video,
      getPrimaryProduct(video)?.id ?? video.productId ?? null,
    );
    try {
      if (navigator.share) {
        await navigator.share({
          text,
          title: product.name || video.title || "Produto",
          url: shareUrl,
        });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch (_) {
      // Fallback below keeps sharing available when native share is cancelled or unavailable.
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleSubmitComment = async (
    rawAuthor: string,
    rawBody: string,
  ): Promise<boolean> => {
    if (!selectedCommentVideo || !store?.id || isSubmittingComment) {
      return false;
    }
    const body = rawBody.trim();
    const authorName = rawAuthor.trim() || "Cliente";
    if (!body) {
      toast({
        title: "Escreva um comentário",
        description: "Digite sua dúvida ou feedback antes de enviar.",
      });
      return false;
    }

    setIsSubmittingComment(true);
    try {
      await commentsService.createPublicComment({
        storeId: store.id,
        videoId: selectedCommentVideo.id,
        authorName,
        body,
      });
      track(
        "comment_create",
        selectedCommentVideo,
        getPrimaryProduct(selectedCommentVideo)?.id ??
          selectedCommentVideo.productId ??
          null,
      );
      setLocalCommentCounts((current) => ({
        ...current,
        [selectedCommentVideo.id]: (current[selectedCommentVideo.id] ?? 0) + 1,
      }));
      setSelectedCommentVideo(null);
      toast({
        title: "Comentário enviado",
        description: "Ele entrou na fila de moderação da loja.",
      });
      return true;
    } catch (error) {
      toast({
        title: "Não foi possível enviar",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
      return false;
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const openProductPage = (
    video: any,
    product: NonNullable<ReturnType<typeof getProductView>>,
  ) => {
    if (!product.productUrl) return;
    track("add_to_cart_click", video, product.id);
    setSelectedProduct(null);
    if (isUpzeroCommerce(store, product)) {
      openProductInStorePage(product.productUrl);
      return;
    }
    setSelectedCheckout({ video, product });
  };

  const openQuickOrder = (
    video: any,
    product: NonNullable<ReturnType<typeof getProductView>>,
  ) => {
    setSelectedProduct(null);
    setSelectedQuickOrder({ video, product });
    setQuickOrderQuantities({});
    setNuvemshopVariantSelection({
      colorKey: null,
      sizeKey: null,
      variantId: null,
    });

    if (isShopifyCommerce(store, product) && shouldHydrateShopifyVariants(product)) {
      void sendShopifyProductRequest(product.productUrl)
        .then((shopifyProduct) => {
          const hydratedVariants = Array.isArray(shopifyProduct.variants)
            ? shopifyProduct.variants
            : [];
          if (!hydratedVariants.length) return;
          setSelectedQuickOrder((current) => {
            if (!current || current.product.id !== product.id) return current;
            return {
              ...current,
              product: {
                ...current.product,
                externalId:
                  current.product.externalId || shopifyProduct.external_id,
                imageUrl:
                  current.product.imageUrl || shopifyProduct.image_url || null,
                name: current.product.name || shopifyProduct.title || "Produto",
                variants: hydratedVariants,
              },
            };
          });
        })
        .catch((error) => {
          toast({
            title: "Não foi possível carregar variações",
            description: humanizeCartError(error),
          });
        });
    }
  };

  const handleAddToCart = (
    video: any,
    product: NonNullable<ReturnType<typeof getProductView>>,
  ) => {
    track("add_to_cart_click", video, product.id);
    if (isUpzeroCommerce(store, product)) {
      if (!customerApproved) {
        openProductInStorePage(product.productUrl);
        return;
      }

      if (hasUsableQuickOrderGrid(product)) {
        openQuickOrder(video, product);
        return;
      }

      openProductInStorePage(product.productUrl);
      return;
    }
    if (isNuvemshopCommerce(store, product)) {
      if (hasUsableQuickOrderGrid(product)) {
        openQuickOrder(video, product);
        return;
      }

      toast({
        title: "Produto sem variante",
        description:
          "Sincronize os produtos da Nuvemshop para carregar as opções de carrinho.",
      });
      return;
    }
    if (isShopifyCommerce(store, product)) {
      if (hasUsableQuickOrderGrid(product) || product.productUrl) {
        openQuickOrder(video, product);
        return;
      }

      toast({
        title: "Produto sem variante",
        description:
          "Sincronize os produtos da Shopify para carregar as opções de carrinho.",
      });
      return;
    }
    if (!product.productUrl) return;
    setSelectedProduct(null);
    setSelectedCheckout({ video, product });
  };

  const updateQuickOrderQuantity = (variantId: string, delta: number) => {
    setQuickOrderQuantities((current) => {
      const next = Math.max(0, (current[variantId] ?? 0) + delta);
      return { ...current, [variantId]: next };
    });
  };

  const sendUpzeroQuickOrder = ({ items, productUrl }: QuickOrderPayload) => {
    if (!isEmbedded || window.parent === window) {
      return Promise.reject(
        new Error("Abra o vídeo dentro da loja para adicionar ao carrinho."),
      );
    }

    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        quickOrderRequestsRef.current.delete(requestId);
        reject(new Error("A loja não respondeu ao pedido de carrinho."));
      }, 12000);

      quickOrderRequestsRef.current.set(requestId, {
        reject,
        resolve,
        timeout,
      });
      window.parent.postMessage(
        {
          type: "LUPP_UPZERO_ADD_TO_CART_REQUEST",
          requestId,
          items,
          productUrl,
        },
        "*",
      );
    });
  };

  const sendNuvemshopQuickOrder = ({
    items,
    productUrl,
  }: {
    items: NuvemshopQuickOrderItem[];
    productUrl?: string | null;
  }) => {
    if (!isEmbedded || window.parent === window) {
      return Promise.reject(
        new Error("Abra o vídeo dentro da loja para adicionar ao carrinho."),
      );
    }

    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        quickOrderRequestsRef.current.delete(requestId);
        reject(new Error("A loja não respondeu ao pedido de carrinho."));
      }, 12000);

      quickOrderRequestsRef.current.set(requestId, {
        reject,
        resolve,
        timeout,
      });
      window.parent.postMessage(
        {
          type: "LUPP_NUVEMSHOP_ADD_TO_CART_REQUEST",
          requestId,
          items,
          productUrl,
        },
        "*",
      );
    });
  };

  const sendShopifyQuickOrder = ({
    items,
    productUrl,
  }: {
    items: ShopifyQuickOrderItem[];
    productUrl?: string | null;
  }) => {
    if (!isEmbedded || window.parent === window) {
      return Promise.reject(
        new Error("Abra o vídeo dentro da loja para adicionar ao carrinho."),
      );
    }

    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        quickOrderRequestsRef.current.delete(requestId);
        reject(new Error("A loja não respondeu ao pedido de carrinho."));
      }, 12000);

      quickOrderRequestsRef.current.set(requestId, {
        reject,
        resolve,
        timeout,
      });
      window.parent.postMessage(
        {
          type: "LUPP_SHOPIFY_ADD_TO_CART_REQUEST",
          requestId,
          items,
          productUrl,
        },
        "*",
      );
    });
  };

  const submitQuickOrder = async () => {
    if (!selectedQuickOrder || quickOrderStatus === "submitting") return;
    const isNuvemshopOrder = isNuvemshopCommerce(
      store,
      selectedQuickOrder.product,
    );
    const isShopifyOrder = isShopifyCommerce(store, selectedQuickOrder.product);
    const isB2cOrder = isNuvemshopOrder || isShopifyOrder;
    const variants = selectedQuickOrder.product.variants ?? [];
    const selectedB2cVariantId =
      isB2cOrder && nuvemshopVariantSelection.variantId
        ? nuvemshopVariantSelection.variantId
        : isB2cOrder && variants.filter(isAvailableCommerceVariant).length === 1
          ? String(variants.filter(isAvailableCommerceVariant)[0]?.id || "")
          : "";
    const items = variants
      .map((variant: any) => {
        const quantity = isB2cOrder
          ? String(variant.id) === String(selectedB2cVariantId)
            ? 1
            : 0
          : quickOrderQuantities[variant.id] ?? 0;
        const externalId = Number(variant.external_id);
        if (!quantity || !Number.isFinite(externalId) || externalId <= 0) {
          return null;
        }
        if (isNuvemshopOrder) {
          const productId = Number(selectedQuickOrder.product.externalId);
          if (!Number.isFinite(productId) || productId <= 0) return null;
          return {
            product_id: Math.trunc(productId),
            quantity,
            variant_id: Math.trunc(externalId),
          };
        }

        if (isShopifyOrder) {
          return {
            quantity,
            variant_id: Math.trunc(externalId),
          };
        }

        return {
          asset_id: variant.asset_id ?? undefined,
          product_variant_id: externalId,
          quantity,
        };
      })
      .filter(Boolean) as QuickOrderItem[] | NuvemshopQuickOrderItem[] | ShopifyQuickOrderItem[];

    if (!items.length) {
      toast({
        title: isB2cOrder ? "Selecione a variação" : "Selecione a grade",
        description:
          isB2cOrder
            ? "Escolha uma cor e tamanho disponíveis para adicionar."
            : "Informe pelo menos uma cor e tamanho válido para adicionar.",
      });
      return;
    }

    setQuickOrderStatus("submitting");
    try {
      if (isNuvemshopOrder) {
        await sendNuvemshopQuickOrder({
          items: items as NuvemshopQuickOrderItem[],
          productUrl: selectedQuickOrder.product.productUrl,
        });
      } else if (isShopifyOrder) {
        await sendShopifyQuickOrder({
          items: items as ShopifyQuickOrderItem[],
          productUrl: selectedQuickOrder.product.productUrl,
        });
      } else {
        await sendUpzeroQuickOrder({
          items: items as QuickOrderItem[],
          productUrl: selectedQuickOrder.product.productUrl,
        });
      }
      track(
        "add_to_cart_click",
        selectedQuickOrder.video,
        selectedQuickOrder.product.id,
      );
      toast({
        title: "Produto adicionado",
        description: "A grade foi enviada para o carrinho da loja.",
      });
      setSelectedQuickOrder(null);
      setQuickOrderQuantities({});
      setNuvemshopVariantSelection({
        colorKey: null,
        sizeKey: null,
        variantId: null,
      });
    } catch (error) {
      toast({
        title: "Não foi possível adicionar",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    } finally {
      setQuickOrderStatus("idle");
    }
  };

  const setVideoRef = React.useCallback(
    (id: string) => (element: HTMLVideoElement | null) => {
      if (element) videoRefs.current.set(id, element);
      else videoRefs.current.delete(id);
    },
    [],
  );

  const setSectionRef = React.useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) {
        sectionRefs.current.set(id, element);
        // Windowed sections mount after the observer effect has run; observing
        // on attach keeps active-video detection working (observe() is a no-op
        // for already-observed targets).
        sectionObserverRef.current?.observe(element);
      } else {
        const existing = sectionRefs.current.get(id);
        if (existing) sectionObserverRef.current?.unobserve(existing);
        sectionRefs.current.delete(id);
      }
    },
    [],
  );

  const showControlsFor = (videoId: string, keepVisible = false) => {
    controlsHandlesRef.current.get(videoId)?.(keepVisible);
  };

  const toggleMute = (video: any, event?: React.MouseEvent) => {
    event?.stopPropagation();
    setSoundUnlocked(true);
    setIsMuted((current) => !current);
    showControlsFor(video.id);
  };

  const togglePlay = (video: any, event?: React.MouseEvent) => {
    event?.stopPropagation();
    setSoundUnlocked(true);
    setPausedMap((current) => {
      const nextPaused = !current[video.id];
      showControlsFor(video.id, nextPaused);
      return { ...current, [video.id]: nextPaused };
    });
  };

  const clearGestureTimers = () => {
    if (longPressTimerRef.current)
      window.clearTimeout(longPressTimerRef.current);
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

  const handleMediaPointerDown = (
    video: any,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    setSoundUnlocked(true);
    longPressActiveRef.current = false;
    if (longPressTimerRef.current)
      window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      const element = videoRefs.current.get(video.id);
      if (element) element.playbackRate = 2;
      longPressActiveRef.current = true;
      setSpeedVideoId(video.id);
    }, 420);
  };

  const handleMediaPointerUp = (
    video: any,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (longPressTimerRef.current)
      window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;

    const pointerStart = pointerStartRef.current;
    pointerStartRef.current = null;
    if (pointerStart) {
      const deltaX = Math.abs(event.clientX - pointerStart.x);
      const deltaY = Math.abs(event.clientY - pointerStart.y);
      if (deltaY > 18 || deltaX > 18) {
        tapCountRef.current = 0;
        if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
        return;
      }
    }

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
    if (!orderedVideos.length) return;
    if (
      !activeVideoId ||
      !orderedVideos.some((video: any) => video.id === activeVideoId)
    ) {
      setActiveVideoId(orderedVideos[0].id);
    }
  }, [activeVideoId, orderedVideos]);

  React.useEffect(() => {
    viewedVideoIdsRef.current.clear();
  }, [store?.id, orderedVideos]);

  React.useEffect(() => {
    if (feedQuery.isLoading || orderedVideos.length < 2) return;
    const sourceKey = productKeyFromUrl(sourceProductUrl);
    const hintKey =
      isProductSwipeHint && sourceKey
        ? `lupp_swipe_colors_hint_seen:${sourceKey}`
        : "lupp_swipe_hint_seen";
    if (localStorage.getItem(hintKey) === "1") return;
    setShowSwipeHint(true);
    localStorage.setItem(hintKey, "1");
    const timer = window.setTimeout(() => setShowSwipeHint(false), 4200);
    return () => window.clearTimeout(timer);
  }, [
    feedQuery.isLoading,
    isProductSwipeHint,
    orderedVideos.length,
    sourceProductUrl,
  ]);

  React.useEffect(() => {
    if (!orderedVideos.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio,
          )[0];
        const id = visible?.target.getAttribute("data-video-id");
        if (id) setActiveVideoId(id);
      },
      { threshold: [0.65, 0.8, 0.95] },
    );

    sectionObserverRef.current = observer;
    sectionRefs.current.forEach((section) => observer.observe(section));
    return () => {
      sectionObserverRef.current = null;
      observer.disconnect();
    };
  }, [orderedVideos]);

  React.useEffect(() => {
    videoRefs.current.forEach((element, id) => {
      const isActive =
        id === activeVideoId &&
        !selectedProduct &&
        !selectedCheckout &&
        !selectedQuickOrder;
      element.muted = isMuted || !soundUnlocked;
      element.playbackRate = speedVideoId === id ? 2 : 1;

      if (pausedMap[id] || (!isActive && pauseWhenHidden)) {
        element.pause();
        return;
      }

      void element.play().catch(() => {
        element.muted = true;
        setIsMuted(true);
        void element.play().catch(() => {});
      });
    });
  }, [
    activeVideoId,
    isMuted,
    pauseWhenHidden,
    pausedMap,
    selectedCheckout,
    selectedQuickOrder,
    selectedProduct,
    soundUnlocked,
    speedVideoId,
    ]);

  React.useEffect(() => {
    if (!store?.id || !activeVideoId || !isApiConfigured) return;
    if (viewedVideoIdsRef.current.has(activeVideoId)) return;

    const timer = window.setTimeout(() => {
      if (viewedVideoIdsRef.current.has(activeVideoId)) return;
      const video = orderedVideos.find((item: any) => item.id === activeVideoId);
      if (!video) return;
      const product = getProductView(
        video,
        null,
        video.id === requestedVideoId ? sourceProductUrl : null,
        store?.url,
      );
      viewedVideoIdsRef.current.add(activeVideoId);
      void analyticsService
        .trackEvent({
          store_id: store.id,
          video_id: video.id,
          product_id: product?.id ?? null,
          event_type: "video_view",
          metadata: { source: "vertical_feed", trigger: "active_video" },
        })
        .catch(() => {
          viewedVideoIdsRef.current.delete(activeVideoId);
        });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    activeVideoId,
    orderedVideos,
    requestedVideoId,
    sourceProductUrl,
    store?.id,
    store?.url,
  ]);

  React.useEffect(() => {
    return () => clearGestureTimers();
  }, []);

  const selectedProductRestricted = Boolean(
    selectedProduct &&
    isUpzeroCommerce(store, selectedProduct.product) &&
    !customerApproved,
  );
  const selectedProductView = selectedProduct
    ? displayProductForAccess(
        selectedProduct.product,
        selectedProductRestricted,
      )
    : null;
  const customerAccessLabel =
    customerLoggedIn && customerStatus !== "UNAUTHENTICATED"
      ? "Aguardando aprovação"
      : "Cadastre-se para ver o preço";
  const commerceActionLabel = React.useCallback(
    (product: any) => {
      if (!isUpzeroCommerce(store, product)) return "Adicionar ao carrinho";
      return customerApproved ? "Comprar" : customerAccessLabel;
    },
    [customerAccessLabel, customerApproved, store],
  );

  const latestFeedHandlersRef = React.useRef({
    handleAddToCart,
    handleLike,
    handleMediaPointerDown,
    handleMediaPointerUp,
    handleShare,
    openProductPage,
    resetSpeed,
    toggleMute,
    togglePlay,
  });
  latestFeedHandlersRef.current = {
    handleAddToCart,
    handleLike,
    handleMediaPointerDown,
    handleMediaPointerUp,
    handleShare,
    openProductPage,
    resetSpeed,
    toggleMute,
    togglePlay,
  };

  // Stable action identities so memoized FeedItems only re-render when their
  // data props change; each call forwards to the latest handler closures.
  const feedItemActions = React.useMemo<FeedItemActions>(
    () => ({
      onAddToCart: (video, product) =>
        latestFeedHandlersRef.current.handleAddToCart(video, product),
      onLike: (video) => void latestFeedHandlersRef.current.handleLike(video),
      onOpenComments: (video) => setSelectedCommentVideo(video),
      onOpenProductPage: (video, product) =>
        latestFeedHandlersRef.current.openProductPage(video, product),
      onPointerCancel: (video) =>
        latestFeedHandlersRef.current.resetSpeed(video),
      onPointerDown: (video, event) =>
        latestFeedHandlersRef.current.handleMediaPointerDown(video, event),
      onPointerLeave: (video) => {
        if (longPressActiveRef.current) {
          latestFeedHandlersRef.current.resetSpeed(video);
        }
      },
      onPointerUp: (video, event) =>
        latestFeedHandlersRef.current.handleMediaPointerUp(video, event),
      onShare: (video, product) =>
        void latestFeedHandlersRef.current.handleShare(video, product),
      onToggleMute: (video, event) =>
        latestFeedHandlersRef.current.toggleMute(video, event),
      onTogglePlay: (video, event) =>
        latestFeedHandlersRef.current.togglePlay(video, event),
    }),
    [],
  );

  return (
    <div className="h-dvh w-full bg-black overflow-hidden flex justify-center text-white">
      <div className="relative flex h-full w-full max-w-[420px] flex-col bg-slate-950">
        <div className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4">
          {isEmbedded ? (
            <div className="w-10" />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="text-white hover:bg-white/20"
            >
              <Link href="/app/feed">
                <ArrowLeft className="h-6 w-6" />
              </Link>
            </Button>
          )}
          <div className="flex max-w-[240px] items-center justify-center">
            {showLogo &&
              (store?.logo_url ? (
                <img
                  src={store.logo_url}
                  alt={store?.name ?? "Logo da loja"}
                  className="max-h-9 max-w-[180px] object-contain"
                />
              ) : (
                <img
                  src="/luup-logo-completa-white.png"
                  alt="Luup"
                  className="max-h-8 max-w-[160px] object-contain"
                />
              ))}
          </div>
          <div className="w-10" />
        </div>

        {feedQuery.isLoading && (
          <div className="absolute inset-0 z-0">
            <LoadingVideoPreview
              posterUrl={loadingPreviewPosterUrl}
              videoUrl={loadingPreviewVideoUrl}
            />
          </div>
        )}

        {!feedQuery.isLoading && !orderedVideos.length && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white/70">
            <ShoppingBag className="h-8 w-8" />
            <p>Nenhum vídeo ativo no feed ainda.</p>
          </div>
        )}

        <div
          className="h-full w-full snap-y snap-mandatory overflow-y-auto"
          style={{ scrollbarWidth: "none" }}
          onScroll={() => setShowSwipeHint(false)}
        >
          {orderedVideos.map((video: any, index: number) => {
            const isActiveVideo =
              activeVideoId === video.id || (!activeVideoId && index === 0);
            if (Math.abs(index - activeIndex) > 2 && !isActiveVideo) {
              return (
                <FeedItemPlaceholder
                  key={video.id}
                  setSectionRef={setSectionRef}
                  video={video}
                />
              );
            }

            return (
              <FeedItem
                key={video.id}
                actions={feedItemActions}
                addToCartInline={addToCartInline}
                commerceActionLabel={commerceActionLabel}
                controlsHandles={controlsHandlesRef.current}
                customerApproved={customerApproved}
                extraComments={localCommentCounts[video.id] ?? 0}
                isActiveVideo={isActiveVideo}
                isMuted={isMuted}
                isPaused={Boolean(pausedMap[video.id])}
                liked={Boolean(likedMap[video.id])}
                loopVideo={loopVideo}
                playerActive={
                  isActiveVideo || Math.abs(index - activeIndex) <= 1
                }
                offsetFromActive={index - activeIndex}
                preloadNextEnabled={preloadNext}
                productViews={productViewsByVideoId.get(video.id) ?? []}
                setSectionRef={setSectionRef}
                setVideoRef={setVideoRef}
                showBuyButton={showBuyButton}
                showComments={showComments}
                showDescription={showDescription}
                showLikes={showLikes}
                showPrice={showPrice}
                showProductName={showProductName}
                showShare={showShare}
                soundUnlocked={soundUnlocked}
                speedActive={speedVideoId === video.id}
                store={store}
                video={video}
              />
            );
          })}
        </div>

        {showSwipeHint && (
          <div
            className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center bg-black/25 px-8 text-center"
            aria-hidden="true"
          >
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-black/55 px-6 py-5 text-white shadow-2xl backdrop-blur-md">
              <ChevronsUp className="h-10 w-10 animate-bounce" />
              <div>
                <p className="text-base font-black">
                  {isProductSwipeHint
                    ? "Deslize para ver mais cores"
                    : "Deslize para ver mais"}
                </p>
                <p className="mt-1 text-xs font-semibold text-white/75">
                  {isProductSwipeHint
                    ? "Veja outros vídeos e variações deste produto."
                    : "Continue navegando pelos vídeos da marca."}
                </p>
              </div>
            </div>
          </div>
        )}

        <Drawer
          open={Boolean(selectedProduct)}
          onOpenChange={(open) => !open && setSelectedProduct(null)}
        >
          <DrawerContent className="mx-auto max-w-[420px] border-white/10 bg-white text-slate-950">
            {selectedProduct && (
              <>
                <DrawerHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <DrawerTitle className="text-base">
                      Produto do vídeo
                    </DrawerTitle>
                    <button
                      className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                      onClick={() => setSelectedProduct(null)}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </DrawerHeader>
                <div className="max-h-[66dvh] overflow-y-auto px-4 pb-4">
                  <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
                    <div
                      className="aspect-square rounded-sm bg-slate-100 bg-cover bg-center"
                      style={{
                        backgroundImage: selectedProduct.product.imageUrl
                          ? `url(${selectedProduct.product.imageUrl})`
                          : undefined,
                      }}
                    />
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 text-sm font-bold leading-tight">
                        {selectedProductView?.name}
                      </h2>
                      {selectedProductView?.price ? (
                        <p className="mt-2 text-2xl font-black text-[#fe2c55]">
                          {selectedProductView.price}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm font-bold text-[#fe2c55]">
                          {customerAccessLabel}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-1 text-xs text-warning">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star
                            key={index}
                            className="h-3.5 w-3.5 fill-current"
                          />
                        ))}
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Descrição
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {selectedProduct.product.description}
                    </p>
                  </div>
                </div>
                <DrawerFooter className="border-t border-slate-100 bg-white">
                  <Button
                    className="h-12 bg-[#fe2c55] text-base font-black text-white hover:bg-[#e6294e]"
                    onClick={() => {
                      if (selectedProductRestricted) {
                        openProductPage(
                          selectedProduct.video,
                          selectedProduct.product,
                        );
                        return;
                      }
                      handleAddToCart(
                        selectedProduct.video,
                        selectedProduct.product,
                      );
                    }}
                  >
                    {selectedProductRestricted
                      ? customerAccessLabel
                      : "Adicionar ao carrinho"}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 border-slate-200"
                    onClick={() => setSelectedProduct(null)}
                  >
                    Continuar vendo
                  </Button>
                </DrawerFooter>
              </>
            )}
          </DrawerContent>
        </Drawer>

        <Drawer
          open={Boolean(selectedQuickOrder)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedQuickOrder(null);
              setQuickOrderQuantities({});
              setNuvemshopVariantSelection({
                colorKey: null,
                sizeKey: null,
                variantId: null,
              });
            }
          }}
        >
          <DrawerContent className="mx-auto max-w-[420px] border-white/10 bg-white text-slate-950">
            {selectedQuickOrder &&
              (() => {
                const variants = (
                  selectedQuickOrder.product.variants ?? []
                ).filter(isAvailableCommerceVariant);
                const colors = uniqueVariantColors(variants);
                const sizes = uniqueVariantSizes(variants);
                const variantsByGridKey = new Map(
                  variants.map((variant: any) => [
                    variantGridKey(variant),
                    variant,
                  ]) as Array<[string, any]>,
                );
                const totalQuantity = Object.values(
                  quickOrderQuantities,
                ).reduce((sum, quantity) => sum + quantity, 0);
                const isB2cQuickOrder =
                  isNuvemshopCommerce(store, selectedQuickOrder.product) ||
                  isShopifyCommerce(store, selectedQuickOrder.product);

                if (isB2cQuickOrder) {
                  const isShopifyQuickOrder = isShopifyCommerce(
                    store,
                    selectedQuickOrder.product,
                  );
                  const isLoadingShopifyVariants =
                    isShopifyQuickOrder &&
                    shouldHydrateShopifyVariants(selectedQuickOrder.product) &&
                    variants.length === 0;
                  const hasColorOptions = variants.some(hasRealVariantColor);
                  const hasSizeOptions = variants.some(hasRealVariantSize);
                  const selectedColorKey =
                    hasColorOptions
                      ? nuvemshopVariantSelection.colorKey ||
                        (colors[0] ? variantColorKey(colors[0]) : null)
                      : variantColorKey(variants[0]);
                  const availableSizes = sizes.filter((size: any) =>
                    selectedColorKey
                      ? variantsByGridKey.has(
                          `${selectedColorKey}|${variantSizeKey(size)}`,
                        )
                      : true,
                  );
                  const selectedSizeKey =
                    hasSizeOptions
                      ? nuvemshopVariantSelection.sizeKey ||
                        (availableSizes.length === 1
                          ? variantSizeKey(availableSizes[0])
                          : null)
                      : variantSizeKey(variants[0]);
                  const selectedVariant =
                    nuvemshopVariantSelection.variantId
                      ? variants.find(
                          (variant: any) =>
                            String(variant.id) ===
                            String(nuvemshopVariantSelection.variantId),
                        )
                      : selectedColorKey && selectedSizeKey
                        ? variantsByGridKey.get(
                            `${selectedColorKey}|${selectedSizeKey}`,
                          )
                        : variants.length === 1
                          ? variants[0]
                          : null;
                  const selectedPriceValue =
                    numberFromUnknown(selectedVariant?.price) ??
                    selectedQuickOrder.product.priceValue ??
                    null;
                  const displayPrice =
                    formatVariantPrice(selectedPriceValue) ||
                    selectedQuickOrder.product.price;
                  const variantPaymentLines =
                    getVariantPaymentLines(selectedVariant);
                  const paymentLines = variantPaymentLines.length
                    ? variantPaymentLines
                    : getCustomPaymentLines(store, selectedPriceValue);

                  return (
                    <>
                      <DrawerHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <DrawerTitle className="pr-4 text-left text-base leading-tight">
                            {selectedQuickOrder.product.name}
                          </DrawerTitle>
                          <button
                            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                            onClick={() => {
                              setSelectedQuickOrder(null);
                              setQuickOrderQuantities({});
                              setNuvemshopVariantSelection({
                                colorKey: null,
                                sizeKey: null,
                                variantId: null,
                              });
                            }}
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      </DrawerHeader>

                      <div className="max-h-[66dvh] overflow-y-auto px-5 pb-5">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                          <div>
                            <p className="text-xl font-semibold text-slate-950">
                              {displayPrice || selectedQuickOrder.product.price}
                            </p>
                            {paymentLines.length > 0 && (
                              <div className="mt-4 space-y-1">
                                {paymentLines.map((line) => (
                                  <p
                                    key={line}
                                    className="text-sm text-slate-700"
                                  >
                                    {line}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                          <div
                            className="h-16 w-16 shrink-0 rounded-sm bg-slate-100 bg-cover bg-center"
                            style={{
                              backgroundImage:
                                selectedVariant?.image_url ||
                                selectedQuickOrder.product.imageUrl
                                  ? `url(${
                                      selectedVariant?.image_url ||
                                      selectedQuickOrder.product.imageUrl
                                    })`
                                  : undefined,
                            }}
                          />
                        </div>

                        {isLoadingShopifyVariants && (
                          <div className="mt-4 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                            Carregando variações do produto...
                          </div>
                        )}

                        {hasColorOptions && (
                          <div className="mt-4">
                            <p className="text-3xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Cor
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {colors.map((color: any) => {
                                const colorKey = variantColorKey(color);
                                const selected = selectedColorKey === colorKey;
                                return (
                                  <button
                                    key={colorKey}
                                    type="button"
                                    className={`flex h-7 w-7 items-center justify-center border ${
                                      selected
                                        ? "border-slate-950"
                                        : "border-slate-300"
                                    } bg-white`}
                                    onClick={() => {
                                      setQuickOrderQuantities({});
                                      setNuvemshopVariantSelection({
                                        colorKey,
                                        sizeKey: null,
                                        variantId: null,
                                      });
                                    }}
                                    aria-label={
                                      color.color_name ||
                                      color.color_code ||
                                      "Selecionar cor"
                                    }
                                    title={
                                      color.color_name ||
                                      color.color_code ||
                                      "Selecionar cor"
                                    }
                                  >
                                    <span
                                      className="h-4 w-4 border border-slate-300 bg-slate-100"
                                      style={{
                                        backgroundColor: getVariantColorHex(color),
                                      }}
                                    />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {hasSizeOptions && (
                          <div className="mt-5">
                            <p className="text-3xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Tamanho
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {sizes.map((size: any) => {
                                const sizeKey = variantSizeKey(size);
                                const variant = selectedColorKey
                                  ? variantsByGridKey.get(
                                      `${selectedColorKey}|${sizeKey}`,
                                    )
                                  : null;
                                const unavailable =
                                  !variant ||
                                  !isAvailableCommerceVariant(variant);
                                const selected = selectedSizeKey === sizeKey;
                                return (
                                  <button
                                    key={sizeKey}
                                    type="button"
                                    disabled={unavailable}
                                    className={`min-h-8 min-w-8 border px-3 text-xs font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-30 ${
                                      selected
                                        ? "border-slate-950 bg-slate-950 text-white"
                                        : "border-slate-300 bg-white text-slate-950"
                                    }`}
                                    onClick={() => {
                                      if (!variant) return;
                                      setQuickOrderQuantities({
                                        [variant.id]: 1,
                                      });
                                      setNuvemshopVariantSelection({
                                        colorKey: selectedColorKey,
                                        sizeKey,
                                        variantId: String(variant.id),
                                      });
                                    }}
                                  >
                                    {size.size_name ||
                                      size.size_code ||
                                      "Unico"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <DrawerFooter className="border-t border-slate-100 bg-white px-5">
                        <Button
                          className="h-12 rounded-none bg-[#37a928] text-xs font-semibold uppercase tracking-[0.32em] text-black hover:bg-[#2f9822]"
                          disabled={
                            quickOrderStatus === "submitting" ||
                            isLoadingShopifyVariants ||
                            !selectedVariant ||
                            !isAvailableCommerceVariant(selectedVariant)
                          }
                          onClick={() => void submitQuickOrder()}
                        >
                          {quickOrderStatus === "submitting"
                            ? "Adicionando..."
                            : "Comprar"}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11 border-slate-200"
                          onClick={() => {
                            setSelectedQuickOrder(null);
                            setQuickOrderQuantities({});
                            setNuvemshopVariantSelection({
                              colorKey: null,
                              sizeKey: null,
                              variantId: null,
                            });
                          }}
                        >
                          Continuar vendo
                        </Button>
                      </DrawerFooter>
                    </>
                  );
                }

                return (
                  <>
                    <DrawerHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <DrawerTitle className="text-base">
                            Pedido rápido
                          </DrawerTitle>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Cada ajuste atualiza o carrinho.
                          </p>
                        </div>
                        <button
                          className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                          onClick={() => {
                            setSelectedQuickOrder(null);
                            setQuickOrderQuantities({});
                            setNuvemshopVariantSelection({
                              colorKey: null,
                              sizeKey: null,
                              variantId: null,
                            });
                          }}
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    </DrawerHeader>

                    <div className="max-h-[66dvh] overflow-y-auto px-4 pb-4">
                      <div className="mb-3 flex items-center gap-3 rounded-md bg-slate-50 p-3">
                        <div
                          className="h-14 w-14 shrink-0 rounded-sm bg-slate-200 bg-cover bg-center"
                          style={{
                            backgroundImage: selectedQuickOrder.product.imageUrl
                              ? `url(${selectedQuickOrder.product.imageUrl})`
                              : undefined,
                          }}
                        />
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-black uppercase">
                            {selectedQuickOrder.product.name}
                          </p>
                          {selectedQuickOrder.product.price && (
                            <p className="mt-1 text-sm font-bold text-blue-600">
                              A partir de {selectedQuickOrder.product.price}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-md border border-slate-200">
                        <div
                          className="grid min-w-max"
                          style={{
                            gridTemplateColumns: `92px repeat(${Math.max(
                              sizes.length,
                              1,
                            )}, 82px)`,
                          }}
                        >
                          <div className="border-b border-r border-slate-200 bg-slate-50" />
                          {sizes.map((size: any) => (
                            <div
                              key={String(size.size_code || size.size_name)}
                              className="border-b border-r border-slate-200 bg-white px-2 py-3 text-center text-sm font-black"
                            >
                              {size.size_name || size.size_code || "Unico"}
                            </div>
                          ))}

                          {colors.map((color: any) => (
                            <React.Fragment
                              key={String(color.color_code || color.color_name)}
                            >
                              <div className="flex min-h-[82px] flex-col items-center justify-center gap-2 border-b border-r border-slate-200 bg-slate-50 px-2 text-center">
                                <span
                                  className="h-8 w-8 rounded-full border border-slate-300 bg-slate-300"
                                  style={{
                                    backgroundColor: getVariantColorHex(color),
                                  }}
                                  title={
                                    color.color_name ||
                                    color.color_code ||
                                    "Produto"
                                  }
                                />
                                <span className="line-clamp-2 text-3xs font-bold uppercase leading-tight text-slate-600">
                                  {color.color_name ||
                                    color.color_code ||
                                    "Produto"}
                                </span>
                              </div>
                              {sizes.map((size: any) => {
                                const gridKey = `${String(
                                  color.color_code ||
                                    color.color_name ||
                                    "produto",
                                ).toLowerCase()}|${String(
                                  size.size_code || size.size_name || "unico",
                                ).toLowerCase()}`;
                                const variant = variantsByGridKey.get(gridKey);
                                const quantity =
                                  quickOrderQuantities[variant?.id] ?? 0;
                                const unavailable =
                                  !variant ||
                                  !isAvailableCommerceVariant(variant);

                                return (
                                  <div
                                    key={`${String(
                                      color.color_code || color.color_name,
                                    )}-${String(size.size_code || size.size_name)}`}
                                    className="flex min-h-[82px] flex-col items-center justify-center gap-1 border-b border-r border-slate-200 bg-white px-1 py-2"
                                  >
                                    {unavailable ? (
                                      <span className="h-4 w-4 rounded-full bg-slate-300" />
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className="flex h-6 w-8 items-center justify-center rounded-sm text-slate-500 hover:bg-slate-100"
                                          onClick={() =>
                                            updateQuickOrderQuantity(
                                              variant.id,
                                              1,
                                            )
                                          }
                                          aria-label="Aumentar quantidade"
                                        >
                                          <Plus className="h-4 w-4" />
                                        </button>
                                        <span className="text-xl font-black tabular-nums">
                                          {quantity}
                                        </span>
                                        <button
                                          type="button"
                                          className="flex h-6 w-8 items-center justify-center rounded-sm text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                                          disabled={quantity === 0}
                                          onClick={() =>
                                            updateQuickOrderQuantity(
                                              variant.id,
                                              -1,
                                            )
                                          }
                                          aria-label="Diminuir quantidade"
                                        >
                                          <Minus className="h-4 w-4" />
                                        </button>
                                        {formatVariantPrice(variant.price) && (
                                          <span className="mt-1 text-3xs font-semibold text-slate-500">
                                            {formatVariantPrice(variant.price)}
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </div>

                    <DrawerFooter className="border-t border-slate-100 bg-white">
                      <Button
                        className="h-12 bg-blue-600 text-base font-black text-white hover:bg-blue-700"
                        disabled={
                          quickOrderStatus === "submitting" ||
                          totalQuantity === 0
                        }
                        onClick={() => void submitQuickOrder()}
                      >
                        {quickOrderStatus === "submitting"
                          ? "Adicionando..."
                          : `Adicionar ${totalQuantity || ""} ao carrinho`}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 border-slate-200"
                        onClick={() => {
                          setSelectedQuickOrder(null);
                          setQuickOrderQuantities({});
                          setNuvemshopVariantSelection({
                            colorKey: null,
                            sizeKey: null,
                            variantId: null,
                          });
                        }}
                      >
                        Continuar vendo
                      </Button>
                    </DrawerFooter>
                  </>
                );
              })()}
          </DrawerContent>
        </Drawer>

        {selectedCheckout && (
          <div className="absolute inset-0 z-[80] flex flex-col bg-white text-slate-950">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
                onClick={closeCheckoutAndRefresh}
                aria-label="Voltar para o vídeo"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1 px-2 text-center">
                <p className="truncate text-sm font-semibold">
                  {selectedCheckout.product.name}
                </p>
                <p className="truncate text-2xs text-slate-500">
                  {selectedCheckout.product.productUrl}
                </p>
              </div>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
                onClick={closeCheckoutAndRefresh}
                aria-label="Fechar produto"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe
              title={`Comprar ${selectedCheckout.product.name}`}
              src={selectedCheckout.product.productUrl || undefined}
              className="min-h-0 flex-1 border-0 bg-white"
              allow="payment *; clipboard-write; encrypted-media; fullscreen"
            />
          </div>
        )}

        <CommentDrawer
          open={Boolean(selectedCommentVideo)}
          isSubmitting={isSubmittingComment}
          onClose={() => setSelectedCommentVideo(null)}
          onSubmit={handleSubmitComment}
        />
      </div>
    </div>
  );
}

type ProductView = NonNullable<ReturnType<typeof productToView>>;

type FeedItemActions = {
  onAddToCart: (video: any, product: ProductView) => void;
  onLike: (video: any) => void;
  onOpenComments: (video: any) => void;
  onOpenProductPage: (video: any, product: ProductView) => void;
  onPointerCancel: (video: any) => void;
  onPointerDown: (video: any, event: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (video: any) => void;
  onPointerUp: (video: any, event: React.PointerEvent<HTMLElement>) => void;
  onShare: (video: any, product: ProductView) => void;
  onToggleMute: (video: any, event?: React.MouseEvent) => void;
  onTogglePlay: (video: any, event?: React.MouseEvent) => void;
};

type SectionRefFactory = (id: string) => (element: HTMLElement | null) => void;

// Lightweight stand-in for videos far from the active index: same height and
// snap behavior so scrolling and active-video detection keep working, but no
// player, overlays, or product DOM.
const FeedItemPlaceholder = React.memo(function FeedItemPlaceholder({
  setSectionRef,
  video,
}: {
  setSectionRef: SectionRefFactory;
  video: any;
}) {
  const sectionRefCb = React.useMemo(
    () => setSectionRef(video.id),
    [setSectionRef, video.id],
  );

  return (
    <section
      ref={sectionRefCb}
      data-video-id={video.id}
      data-active="false"
      className="relative h-full w-full snap-start bg-black"
    >
      <div
        className="absolute inset-0 bg-black bg-cover bg-center"
        style={{
          backgroundImage: video.thumbnail_url
            ? `url(${video.thumbnail_url})`
            : undefined,
        }}
      />
    </section>
  );
});

type FeedItemProps = {
  actions: FeedItemActions;
  addToCartInline: boolean;
  commerceActionLabel: (product: any) => string;
  controlsHandles: Map<string, (keepVisible?: boolean) => void>;
  customerApproved: boolean;
  extraComments: number;
  isActiveVideo: boolean;
  isMuted: boolean;
  isPaused: boolean;
  liked: boolean;
  loopVideo: boolean;
  offsetFromActive: number;
  playerActive: boolean;
  preloadNextEnabled: boolean;
  productViews: ProductView[];
  setSectionRef: SectionRefFactory;
  setVideoRef: (id: string) => (element: HTMLVideoElement | null) => void;
  showBuyButton: boolean;
  showComments: boolean;
  showDescription: boolean;
  showLikes: boolean;
  showPrice: boolean;
  showProductName: boolean;
  showShare: boolean;
  soundUnlocked: boolean;
  speedActive: boolean;
  store: any;
  video: any;
};

const FeedItem = React.memo(function FeedItem({
  actions,
  addToCartInline,
  commerceActionLabel,
  controlsHandles,
  customerApproved,
  extraComments,
  isActiveVideo,
  isMuted,
  isPaused,
  liked,
  loopVideo,
  offsetFromActive,
  playerActive,
  preloadNextEnabled,
  productViews,
  setSectionRef,
  setVideoRef,
  showBuyButton,
  showComments,
  showDescription,
  showLikes,
  showPrice,
  showProductName,
  showShare,
  soundUnlocked,
  speedActive,
  store,
  video,
}: FeedItemProps) {
  const sectionRefCb = React.useMemo(
    () => setSectionRef(video.id),
    [setSectionRef, video.id],
  );
  const videoRefCb = React.useMemo(
    () => setVideoRef(video.id),
    [setVideoRef, video.id],
  );

  const [controlsVisible, setControlsVisible] = React.useState(false);
  const controlsTimerRef = React.useRef<number | null>(null);

  const showControls = React.useCallback((keepVisible = false) => {
    setControlsVisible(true);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = null;

    if (!keepVisible) {
      controlsTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 2200);
    }
  }, []);

  const hideControls = React.useCallback(() => {
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = null;
    setControlsVisible(false);
  }, []);

  React.useEffect(() => {
    controlsHandles.set(video.id, showControls);
    return () => {
      controlsHandles.delete(video.id);
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, [controlsHandles, showControls, video.id]);

  const isPausedRef = React.useRef(isPaused);
  isPausedRef.current = isPaused;
  // Mirrors the previous page-level [activeVideoId] effect: becoming the
  // active video while paused keeps controls visible; leaving hides them.
  React.useEffect(() => {
    if (isActiveVideo && isPausedRef.current) showControls(true);
    else hideControls();
  }, [hideControls, isActiveVideo, showControls]);

  const product = productViews[0] ?? null;
  const visibleProducts = productViews
    .map((item) => ({
      product: item,
      view: displayProductForAccess(
        {
          ...item,
          platform: item.platform ?? store?.platform ?? "e-commerce",
        },
        Boolean(isUpzeroCommerce(store, item) && !customerApproved),
      ),
    }))
    .filter(
      (item) =>
        item.view &&
        (item.product.productUrl || item.product.variants.length > 0),
    ) as Array<{
    product: NonNullable<ReturnType<typeof getProductView>>;
    view: NonNullable<ReturnType<typeof displayProductForAccess>>;
  }>;
  const storedLikes = video.metrics?.likes ?? video.likes ?? 0;
  const likes = liked ? storedLikes + 1 : storedLikes;
  const comments =
    (video.metrics?.comments ?? video.comments_count ?? 0) + extraComments;
  const canLike = videoFeatureEnabled(video, "allow_likes");
  const canComment = videoFeatureEnabled(video, "allow_comments");
  const canShare = videoFeatureEnabled(video, "allow_sharing");
  const hasRealVideo = Boolean(video.video_url);
  const showVideoControls = isActiveVideo && (controlsVisible || isPaused);
  const fitMode = resolveVideoFitMode(video.aspect_ratio);
  const [isBuffering, setIsBuffering] = React.useState(false);
  const showBufferingSpinner =
    isActiveVideo && isBuffering && !isPaused && hasRealVideo;

  return (
    <section
      ref={sectionRefCb}
      data-video-id={video.id}
      data-active={isActiveVideo ? "true" : "false"}
      className="relative h-full w-full snap-start bg-black"
    >
      {hasRealVideo ? (
        <>
          {fitMode === "contain" && video.thumbnail_url && (
            // Square/landscape source video would either crop (cover) or
            // letterbox on black (plain contain) — a blurred, scaled copy of
            // the same frame behind it fills the edges instead, the same
            // treatment Reels/TikTok use for non-vertical uploads.
            <div
              aria-hidden="true"
              className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl brightness-50"
              style={{ backgroundImage: `url(${video.thumbnail_url})` }}
            />
          )}
          <LazyVideoPlayer
            ref={videoRefCb}
            src={video.video_url}
            poster={video.thumbnail_url ?? undefined}
            className={
              fitMode === "contain"
                ? "absolute inset-0 h-full w-full object-contain"
                : "absolute inset-0 h-full w-full object-cover"
            }
            active={playerActive}
            style={{
              backgroundColor: fitMode === "contain" ? "transparent" : "#000",
              backgroundImage:
                fitMode === "cover" && video.thumbnail_url
                  ? `url(${video.thumbnail_url})`
                  : undefined,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
            muted={isMuted || !soundUnlocked}
            hlsStartQuality="high"
            loop={loopVideo}
            autoPlay
            preload={resolvePreloadStrategy(offsetFromActive, preloadNextEnabled)}
            onBufferingChange={setIsBuffering}
          />
        </>
      ) : (
        <div
          className="absolute inset-0 bg-black bg-cover bg-center"
          style={{
            backgroundImage: video.thumbnail_url
              ? `url(${video.thumbnail_url})`
              : undefined,
          }}
        />
      )}

      {showBufferingSpinner && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <Loader2 className="h-9 w-9 animate-spin text-white/85" />
        </div>
      )}

      <div
        className="absolute inset-0 z-10"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(event) => actions.onPointerDown(video, event)}
        onPointerUp={(event) => actions.onPointerUp(video, event)}
        onPointerCancel={() => actions.onPointerCancel(video)}
        onPointerLeave={() => actions.onPointerLeave(video)}
      />

      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        {showVideoControls && isPaused && (
          <button
            type="button"
            className="pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full bg-black/35 text-white opacity-100 shadow-2xl backdrop-blur-md transition-opacity"
            onClick={(event) => actions.onTogglePlay(video, event)}
            aria-label="Reproduzir vídeo"
          >
            <Play className="ml-1 h-10 w-10 fill-white" />
          </button>
        )}
        {showVideoControls && (
          <button
            type="button"
            className="pointer-events-auto absolute top-[38%] flex h-11 w-11 -translate-y-20 items-center justify-center rounded-full bg-black/35 text-white shadow-xl backdrop-blur-md transition-opacity"
            onClick={(event) => actions.onToggleMute(video, event)}
            aria-label={isMuted ? "Ligar som" : "Mutar vídeo"}
          >
            {isMuted || !soundUnlocked ? (
              <VolumeX className="h-5 w-5" />
            ) : (
              <Volume2 className="h-5 w-5" />
            )}
          </button>
        )}
        {speedActive && (
          <div className="absolute top-24 rounded-full bg-white px-4 py-2 text-sm font-black text-black shadow-xl">
            2x
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black via-black/60 to-transparent p-4 pt-32">
        {(String(video.title || "").trim() ||
          (showDescription && String(video.description || "").trim())) && (
          <div className="mb-4 pr-16">
            {String(video.title || "").trim() && (
              <h3 className="mb-1 text-lg font-medium text-white">
                {video.title}
              </h3>
            )}
            {showDescription && String(video.description || "").trim() && (
              <p className="line-clamp-2 text-sm text-white/80">
                {video.description}
              </p>
            )}
          </div>
        )}

        {visibleProducts.length > 0 &&
          (visibleProducts.length > 1 ? (
            <div className="-mx-4 flex gap-3 overflow-x-auto pl-4 pr-16 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleProducts.map((item) => {
                const itemRestricted = Boolean(
                  isUpzeroCommerce(store, item.product) && !customerApproved,
                );
                return (
                  <div key={item.product.id} className="w-[78%] shrink-0">
                    <CommerceProductCard
                      product={item.view}
                      singleAction
                      showAction={showBuyButton}
                      showName={showProductName}
                      showPrice={showPrice}
                      actionLabel={commerceActionLabel(item.product)}
                      onDetails={() =>
                        itemRestricted
                          ? actions.onOpenProductPage(video, item.product)
                          : addToCartInline
                            ? actions.onAddToCart(video, item.product)
                            : actions.onOpenProductPage(video, item.product)
                      }
                      onAction={() =>
                        itemRestricted
                          ? actions.onOpenProductPage(video, item.product)
                          : addToCartInline
                            ? actions.onAddToCart(video, item.product)
                            : actions.onOpenProductPage(video, item.product)
                      }
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <CommerceProductCard
              product={visibleProducts[0].view}
              singleAction
              showAction={showBuyButton}
              showName={showProductName}
              showPrice={showPrice}
              actionLabel={commerceActionLabel(visibleProducts[0].product)}
              onDetails={() =>
                isUpzeroCommerce(store, visibleProducts[0].product) &&
                !customerApproved
                  ? actions.onOpenProductPage(video, visibleProducts[0].product)
                  : addToCartInline
                    ? actions.onAddToCart(video, visibleProducts[0].product)
                    : actions.onOpenProductPage(
                        video,
                        visibleProducts[0].product,
                      )
              }
              onAction={() =>
                isUpzeroCommerce(store, visibleProducts[0].product) &&
                !customerApproved
                  ? actions.onOpenProductPage(video, visibleProducts[0].product)
                  : addToCartInline
                    ? actions.onAddToCart(video, visibleProducts[0].product)
                    : actions.onOpenProductPage(
                        video,
                        visibleProducts[0].product,
                      )
              }
            />
          ))}
      </div>

      <div className="absolute bottom-[206px] right-2 z-40 flex flex-col items-center gap-3">
        {canLike && showLikes && (
          <button
            type="button"
            className="flex w-10 flex-col items-center gap-1 text-white"
            onClick={() => actions.onLike(video)}
            aria-label="Curtir"
          >
            <Heart
              className="h-8 w-8 drop-shadow-[0_2px_7px_rgba(0,0,0,.45)] transition-all"
              fill={liked ? "#fe2c55" : "white"}
              stroke={liked ? "#fe2c55" : "white"}
              strokeWidth={2.3}
            />
            <span className="text-2xs font-black leading-none text-white [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">
              {formatTikTokCount(likes)}
            </span>
          </button>
        )}
        {canComment && showComments && (
          <button
            type="button"
            className="flex w-10 flex-col items-center gap-1 text-white"
            onClick={() => actions.onOpenComments(video)}
            aria-label="Comentários"
          >
            <MessageCircle
              className="h-8 w-8 drop-shadow-[0_2px_7px_rgba(0,0,0,.45)]"
              fill="white"
              stroke="white"
              strokeWidth={2.4}
            />
            <span className="text-2xs font-black leading-none text-white [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">
              {formatTikTokCount(comments)}
            </span>
          </button>
        )}
        {canShare && showShare && product && (
          <button
            type="button"
            className="flex w-10 flex-col items-center gap-1 text-white"
            onClick={() => actions.onShare(video, product)}
            aria-label="Compartilhar"
          >
            <Share2
              className="h-8 w-8 drop-shadow-[0_2px_7px_rgba(0,0,0,.45)]"
              fill="white"
              stroke="white"
              strokeWidth={2.4}
            />
            <span className="text-2xs font-black leading-none text-white [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">
              Compart.
            </span>
          </button>
        )}
      </div>
    </section>
  );
});

// Owns the comment inputs so typing re-renders only this drawer, never the
// feed. Fields persist across open/close and clear only after a successful
// submit, matching the previous page-level state behavior.
function CommentDrawer({
  isSubmitting,
  onClose,
  onSubmit,
  open,
}: {
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (authorName: string, body: string) => Promise<boolean>;
  open: boolean;
}) {
  const [author, setAuthor] = React.useState("");
  const [body, setBody] = React.useState("");

  const submit = async () => {
    const ok = await onSubmit(author, body);
    if (ok) {
      setAuthor("");
      setBody("");
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DrawerContent className="mx-auto max-w-[420px] border-white/10 bg-white text-slate-950">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-base">
              Enviar comentário
            </DrawerTitle>
            <button
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DrawerHeader>
        <div className="space-y-3 px-4 pb-4">
          <Input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="Seu nome"
          />
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Escreva seu comentário"
            rows={4}
          />
          <p className="text-xs text-slate-500">
            O comentário aparece no painel da loja como pendente.
          </p>
        </div>
        <DrawerFooter className="border-t border-slate-100 bg-white">
          <Button
            className="h-12 bg-[#fe2c55] text-base font-black text-white hover:bg-[#e6294e]"
            disabled={isSubmitting}
            onClick={() => void submit()}
          >
            {isSubmitting ? "Enviando..." : "Enviar comentário"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
