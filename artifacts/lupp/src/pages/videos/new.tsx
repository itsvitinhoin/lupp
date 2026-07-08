import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CommerceProductCard,
  type CommerceProductCardView,
} from "@/components/shared/CommerceProductCard";
import { PhonePreview } from "@/components/shared/PhonePreview";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useCurrentStore } from "@/hooks/useStore";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_VIDEO_INPUT_TYPES,
  MAX_VIDEO_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_MB,
  isAcceptedVideoFile,
} from "@/lib/constants";
import { videoStorageProvider } from "@/services/storage/video-storage.provider";
import { videosService } from "@/services/videos.service";
import { widgetsService } from "@/services/widgets.service";
import type { LuppProduct } from "@/types/product";
import type { VideoUploadProgress } from "@/types/video";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  Link2,
  MessageCircle,
  PackageSearch,
  Search,
  Share2,
  Sparkles,
  UploadCloud,
  VideoIcon,
} from "lucide-react";
import { useLocation } from "wouter";

type UploadFlow = "product" | "campaign";
type UploadStep = "choice" | "product" | "upload" | "publish";
type ProductVisibilityScope = "product" | "variant";

const ctaLabels: Record<string, string> = {
  ver: "Ver produto",
  comprar: "Comprar agora",
  carrinho: "Adicionar ao carrinho",
  conhecer: "Conhecer peça",
};

const uploadPhaseLabels: Record<VideoUploadProgress["phase"], string> = {
  preparing: "Preparando upload...",
  uploading: "Enviando vídeo...",
  processing: "Finalizando...",
  complete: "Upload concluído",
};

const steps = [
  { id: "product", label: "Escolha os seus produtos" },
  { id: "upload", label: "Envie seus vídeos" },
  { id: "publish", label: "Publicar seu Luup" },
] as const;

function formatBytes(bytes?: number) {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "";
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function productSubtitle(product: LuppProduct) {
  const parts = [
    formatMoney(product.price),
    product.product_url
      ? product.product_url.replace(/^https?:\/\//i, "")
      : "sem URL pública",
  ];
  return parts.filter(Boolean).join(" · ");
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const details = error as Record<string, unknown>;
    return String(
      details.message ||
        details.error ||
        details.details ||
        details.hint ||
        "Tente novamente em instantes.",
    );
  }
  return "Tente novamente em instantes.";
}

function productPaymentTerms(product?: LuppProduct) {
  return null;
}

function slugifyProductName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseProductUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    const segments = url.pathname.split("/").filter(Boolean);
    const productIndex = segments.findIndex((segment) =>
      ["produto", "produtos", "product", "products"].includes(
        segment.toLowerCase(),
      ),
    );
    if (productIndex === -1 || !segments[productIndex + 1]) return null;
    return {
      handle: decodeURIComponent(segments[productIndex + 1]),
      origin: url.origin,
      variant: segments[productIndex + 2]
        ? decodeURIComponent(segments[productIndex + 2])
        : null,
    };
  } catch (_) {
    return null;
  }
}

function humanizeSlug(value?: string | null) {
  const label = String(value || "")
    .replace(/[-_]+/g, " ")
    .trim();
  return label
    ? label.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("pt-BR"))
    : "Cor atual";
}

function productModelKey(product?: LuppProduct) {
  if (!product?.product_url) return "";
  const parsed = parseProductUrl(product.product_url);
  if (!parsed) return "";
  const numericSku = parsed.handle.match(/^\d+/)?.[0];
  return `${parsed.origin}|${numericSku || parsed.handle.toLowerCase()}`;
}

function productColorLabel(product?: LuppProduct) {
  const parsed = parseProductUrl(product?.product_url);
  return humanizeSlug(parsed?.variant || "cor-atual");
}

function colorOptionsForProduct(products: LuppProduct[], product?: LuppProduct) {
  if (!product) return [];
  const key = productModelKey(product);
  const candidates = key
    ? products.filter((item) => productModelKey(item) === key)
    : [product];
  const byUrl = new Map<string, LuppProduct>();
  for (const item of candidates.length ? candidates : [product]) {
    byUrl.set(item.product_url || item.id, item);
  }
  return Array.from(byUrl.values()).sort((left, right) => {
    if (left.id === product.id) return -1;
    if (right.id === product.id) return 1;
    return productColorLabel(left).localeCompare(productColorLabel(right));
  });
}

function productWideUrl(product?: LuppProduct) {
  if (!product?.product_url) return null;
  const parsed = parseProductUrl(product.product_url);
  if (!parsed) return product.product_url;

  const numericSku = parsed.handle.match(/^\d+/)?.[0];
  const nameSlug = slugifyProductName(product.name);
  const handle =
    product.platform === "upzero" && numericSku && nameSlug
      ? `${numericSku}-${nameSlug}`
      : parsed.handle;
  return `${parsed.origin}/produtos/${handle}/*`;
}

function productVisibilityUrl(
  product: LuppProduct | undefined,
  scope: ProductVisibilityScope,
) {
  if (!product?.product_url) return null;
  return scope === "product" ? productWideUrl(product) : product.product_url;
}

function toCommerceProductView(product: LuppProduct): CommerceProductCardView {
  return {
    id: product.id,
    imageUrl: product.image_url ?? null,
    name: product.name,
    paymentTerms: productPaymentTerms(product),
    platform: product.platform ?? "e-commerce",
    price: formatMoney(product.price),
  };
}

function readVideoDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(duration);
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      finish(
        Number.isFinite(duration) && duration > 0
          ? Math.max(1, Math.round(duration))
          : null,
      );
    };
    video.onerror = () => finish(null);
    window.setTimeout(() => finish(null), 5000);
    video.src = objectUrl;
  });
}

export default function VideosNew() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { store } = useCurrentStore();
  const productsQuery = useProducts(store?.id);
  const products = React.useMemo(
    () =>
      (productsQuery.data ?? []).filter(
        (product) =>
          String(product.status || "active").toLowerCase() === "active",
      ),
    [productsQuery.data],
  );
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [flow, setFlow] = React.useState<UploadFlow | null>(null);
  const [step, setStep] = React.useState<UploadStep>("choice");
  const [search, setSearch] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [progress, setProgress] = React.useState(0);
  const [uploadProgress, setUploadProgress] =
    React.useState<VideoUploadProgress | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [selectedProductIds, setSelectedProductIds] = React.useState<string[]>(
    [],
  );
  const [selectedColorProductId, setSelectedColorProductId] =
    React.useState("");
  const [productVisibilityScope, setProductVisibilityScope] =
    React.useState<ProductVisibilityScope>("product");
  const [cta, setCta] = React.useState("comprar");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [toggles, setToggles] = React.useState({
    feed: true,
    productPage: true,
    likes: true,
    comments: true,
    sharing: true,
    featured: false,
  });

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectedProduct = products.find(
    (product) => product.id === selectedProductIds[0],
  );
  const selectedProducts = selectedProductIds
    .map((productId) => products.find((product) => product.id === productId))
    .filter(Boolean) as LuppProduct[];
  const colorOptions = React.useMemo(
    () => colorOptionsForProduct(products, selectedProduct),
    [products, selectedProduct],
  );
  const selectedColorProduct =
    colorOptions.find((product) => product.id === selectedColorProductId) ??
    selectedProduct;

  React.useEffect(() => {
    if (!selectedProduct) {
      setSelectedColorProductId("");
      return;
    }
    if (!colorOptions.some((product) => product.id === selectedColorProductId)) {
      setSelectedColorProductId(selectedProduct.id);
    }
  }, [colorOptions, selectedColorProductId, selectedProduct]);
  const visibleProducts = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => {
      return [product.name, product.external_id, product.product_url]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [products, search]);

  const activeStepIndex =
    flow === "campaign"
      ? step === "publish"
        ? 2
        : step === "upload"
          ? 1
          : 0
      : steps.findIndex((item) => item.id === step);

  const setToggle = (key: keyof typeof toggles, value: boolean) => {
    setToggles((current) => ({ ...current, [key]: value }));
  };

  const startFlow = (nextFlow: UploadFlow) => {
    setFlow(nextFlow);
    setStep(nextFlow === "product" ? "product" : "upload");
    setToggles((current) => ({
      ...current,
      productPage: nextFlow === "product",
    }));
  };

  const goBack = () => {
    if (step === "choice") return;
    if (step === "product" || (step === "upload" && flow === "campaign")) {
      setStep("choice");
      setFlow(null);
      return;
    }
    if (step === "upload") setStep("product");
    if (step === "publish") setStep("upload");
  };

  const handleFile = (nextFile?: File | null) => {
    if (!nextFile) return;

    if (!isAcceptedVideoFile(nextFile)) {
      toast({
        title: "Formato inválido",
        description: "Envie um vídeo MP4, MOV ou WebM.",
      });
      return;
    }

    if (nextFile.size > MAX_VIDEO_UPLOAD_BYTES) {
      toast({
        title: "Vídeo muito grande",
        description: `O limite atual é ${MAX_VIDEO_UPLOAD_MB}MB por vídeo.`,
      });
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setProgress(0);
    setUploadProgress(null);
  };

  const continueFromProduct = () => {
    if (!selectedProductIds.length) {
      toast({
        title: "Escolha pelo menos um produto",
        description:
          "Selecione um ou mais produtos que aparecem neste vídeo.",
      });
      return;
    }
    setStep("upload");
  };

  const continueFromUpload = () => {
    if (!file) {
      toast({
        title: "Selecione um vídeo",
        description: "Envie o arquivo antes de avançar para publicação.",
      });
      return;
    }
    setStep("publish");
  };

  const ensureProductWidgetPlacement = async () => {
    if (!store || !selectedProduct || !toggles.productPage) return;
    await widgetsService.ensureFloatingWidgetForProductPage(store.id);
    await queryClient.invalidateQueries({ queryKey: ["widgets", store.id] });
  };

  const handlePublish = async (status: "active" | "draft") => {
    if (!store) {
      toast({
        title: "Crie uma loja primeiro",
        description: "Conclua o onboarding antes de enviar vídeos.",
      });
      setLocation("/onboarding");
      return;
    }

    if (!file) {
      toast({ title: "Selecione um vídeo para enviar." });
      return;
    }

    if (flow === "product" && !selectedProducts.length) {
      toast({
        title: "Escolha pelo menos um produto",
        description:
          "O vídeo com vínculo precisa ter ao menos um produto selecionado.",
      });
      setStep("product");
      return;
    }

    try {
      setIsSubmitting(true);
      const durationSeconds = await readVideoDuration(file);
      const uploaded = await videoStorageProvider.uploadVideo(
        file,
        store.id,
        (nextProgress) => {
          setProgress(nextProgress.progress);
          setUploadProgress(nextProgress);
        },
      );
      const video = await videosService.createVideo(
        {
          store_id: store.id,
          title: title.trim(),
          description: description.trim() || null,
          video_url: uploaded.url,
          thumbnail_url: uploaded.thumbnail_url ?? null,
          storage_path: uploaded.path,
          provider: uploaded.provider,
          provider_video_id: uploaded.provider_video_id ?? null,
          playback_url: uploaded.playback_url ?? uploaded.url,
          processing_status: uploaded.processing_status ?? "ready",
          file_size: uploaded.file_size ?? file.size,
          duration_seconds: uploaded.duration_seconds ?? durationSeconds,
          status,
          cta_label: ctaLabels[cta],
          is_feed_enabled: toggles.feed,
          is_product_page_enabled: toggles.productPage,
          allow_likes: toggles.likes,
          allow_comments: toggles.comments,
          allow_sharing: toggles.sharing,
          is_featured: toggles.featured,
          product_visibility_scope:
            flow === "product" ? productVisibilityScope : "product",
          product_visibility_url:
            flow === "product"
              ? productVisibilityUrl(
                  productVisibilityScope === "variant"
                    ? selectedColorProduct
                    : selectedProduct,
                  productVisibilityScope,
                )
              : null,
        },
        selectedProducts.length
          ? Array.from(
              new Set([
                productVisibilityScope === "variant" && selectedColorProduct
                  ? selectedColorProduct.id
                  : selectedProducts[0].id,
                ...selectedProducts
                  .slice(1)
                  .map((product) => product.id),
              ]),
            )
          : [],
      );

      if (status === "active") {
        await ensureProductWidgetPlacement();
      }

      await queryClient.invalidateQueries({ queryKey: ["videos", store.id] });
      toast({
        title: status === "active" ? "Vídeo publicado!" : "Rascunho salvo!",
        description:
          status === "active" && selectedProduct?.product_url
            ? "O vídeo foi vinculado ao produto e a miniatura foi liberada para essa página."
            : status === "active"
              ? "Ele já pode aparecer no feed vertical."
              : "Você pode publicar depois pela biblioteca.",
      });
      setLocation(
        status === "active"
          ? `/app/videos?published=${video.id}`
          : "/app/videos",
      );
    } catch (error) {
      toast({
        title: "Não foi possível salvar o vídeo",
        description: errorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout title="Adicionar Vídeo">
      <div className="mx-auto max-w-6xl">
        {step !== "choice" && (
          <div className="mb-5 flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              className="gap-2 text-slate-600"
              onClick={goBack}
              disabled={isSubmitting}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <StepHeader
              activeIndex={activeStepIndex < 0 ? 0 : activeStepIndex}
              skipProduct={flow === "campaign"}
            />
          </div>
        )}

        {step === "choice" ? (
          <ChoiceStep onStart={startFlow} />
        ) : step === "product" ? (
          <ProductStep
            isLoading={productsQuery.isLoading}
            products={visibleProducts}
            search={search}
            selectedProductIds={selectedProductIds}
            setSearch={setSearch}
            setSelectedProductIds={setSelectedProductIds}
            onContinue={continueFromProduct}
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              {step === "upload" ? (
                <UploadStepCard
                  cta={cta}
                  description={description}
                  file={file}
                  fileInputRef={fileInputRef}
                  flow={flow}
                  handleFile={handleFile}
                  isSubmitting={isSubmitting}
                  productVisibilityScope={productVisibilityScope}
                  progress={progress}
                  products={products}
                  selectedColorProduct={selectedColorProduct}
                  selectedProduct={selectedProduct}
                  selectedProducts={selectedProducts}
                  setCta={setCta}
                  setSelectedColorProductId={setSelectedColorProductId}
                  setDescription={setDescription}
                  setProductVisibilityScope={setProductVisibilityScope}
                  setTitle={setTitle}
                  title={title}
                  uploadProgress={uploadProgress}
                  onContinue={continueFromUpload}
                />
              ) : (
                <PublishStepCard
                  cta={cta}
                  file={file}
                  flow={flow}
                  isSubmitting={isSubmitting}
                  productVisibilityScope={productVisibilityScope}
                  selectedColorProduct={selectedColorProduct}
                  selectedProduct={selectedProduct}
                  selectedProducts={selectedProducts}
                  setToggle={setToggle}
                  toggles={toggles}
                  uploadProgress={uploadProgress}
                  progress={progress}
                  onPublish={handlePublish}
                />
              )}
            </div>

            <PreviewColumn
              cta={cta}
              previewUrl={previewUrl}
              selectedProduct={selectedProduct}
              selectedProducts={selectedProducts}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function StepHeader({
  activeIndex,
  skipProduct,
}: {
  activeIndex: number;
  skipProduct: boolean;
}) {
  const visibleSteps = skipProduct ? steps.slice(1) : steps;
  const visibleActiveIndex = skipProduct
    ? Math.max(0, activeIndex - 1)
    : activeIndex;

  return (
    <div className="hidden min-w-[560px] items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 shadow-sm md:flex">
      {visibleSteps.map((item, index) => {
        const done = index < visibleActiveIndex;
        const active = index === visibleActiveIndex;
        return (
          <React.Fragment key={item.id}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                  done || active
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-400",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={active ? "text-slate-950" : "text-slate-500"}>
                {item.label}
              </span>
            </div>
            {index < visibleSteps.length - 1 && (
              <div className="mx-4 h-px w-10 bg-slate-200" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ChoiceStep({ onStart }: { onStart: (flow: UploadFlow) => void }) {
  return (
    <div className="flex min-h-[620px] items-center justify-center">
      <Card className="w-full max-w-3xl border-slate-200 bg-white text-slate-950 shadow-xl shadow-slate-200/70">
        <CardContent className="p-8 sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <UploadCloud className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold">
              Como você deseja adicionar seu vídeo?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-tight text-slate-500">
              Escolha vincular seu vídeo a um produto ou subir um vídeo sem
              vínculo para promoções e campanhas.
            </p>
          </div>

          <div className="mt-8 grid gap-4">
            <ChoiceCard
              description="Associe seu vídeo a um produto da sua loja para destacar reviews, demonstrações ou lançamentos e aparecer na página do produto."
              title="Vincule vídeos a um produto específico"
              type="product"
              onStart={onStart}
            />
            <ChoiceCard
              description="Envie vídeos de promoções, novidades ou campanhas sem associá-los a um produto específico."
              title="Suba seus vídeos sem vínculo direto com um produto"
              type="campaign"
              onStart={onStart}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChoiceCard({
  description,
  onStart,
  title,
  type,
}: {
  description: string;
  onStart: (flow: UploadFlow) => void;
  title: string;
  type: UploadFlow;
}) {
  return (
    <div className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-primary/40 hover:shadow-md sm:grid-cols-[128px_1fr_auto] sm:items-center">
      <div className="flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 via-slate-50 to-slate-100">
        {type === "product" ? (
          <PackageSearch className="h-12 w-12 text-primary" />
        ) : (
          <Sparkles className="h-12 w-12 text-primary" />
        )}
      </div>
      <div>
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        <p className="mt-2 max-w-md text-sm font-medium leading-tight text-slate-500">
          {description}
        </p>
      </div>
      <Button
        className="min-w-32 rounded-lg font-bold"
        onClick={() => onStart(type)}
      >
        Adicionar
      </Button>
    </div>
  );
}

function ProductStep({
  isLoading,
  onContinue,
  products,
  search,
  selectedProductIds,
  setSearch,
  setSelectedProductIds,
}: {
  isLoading: boolean;
  onContinue: () => void;
  products: LuppProduct[];
  search: string;
  selectedProductIds: string[];
  setSearch: (value: string) => void;
  setSelectedProductIds: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const toggleProduct = (productId: string) => {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  };

  return (
    <Card className="mx-auto max-w-3xl border-slate-200 bg-white text-slate-950 shadow-xl shadow-slate-200/70">
      <CardContent className="p-0">
        <div className="border-b border-slate-100 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <PackageSearch className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold">
            Escolha os produtos ({products.length})
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-tight text-slate-500">
            Selecione um ou mais produtos que aparecem no vídeo. O primeiro
            selecionado será o produto principal.
          </p>
          <div className="mx-auto mt-4 inline-flex rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
            Seleção múltipla ativada
          </div>
          <div className="relative mx-auto mt-6 max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-12 rounded-xl border-slate-200 bg-white pl-11 font-semibold text-slate-950"
              placeholder="Buscar por produto"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-5">
          {isLoading ? (
            <p className="py-10 text-center text-sm font-semibold text-slate-500">
              Carregando produtos...
            </p>
          ) : products.length ? (
            <div className="grid gap-3">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => toggleProduct(product.id)}
                  className={cn(
                    "grid gap-4 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-primary/40 sm:grid-cols-[64px_1fr_auto] sm:items-center",
                    selectedProductIds.includes(product.id) &&
                      "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <span
                    className="block h-16 w-16 rounded-xl bg-slate-100 bg-cover bg-center"
                    style={{
                      backgroundImage: product.image_url
                        ? `url(${product.image_url})`
                        : undefined,
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-950">
                      {product.name}
                    </span>
                    <span className="mt-1 block truncate text-xs font-medium text-slate-500">
                      {productSubtitle(product)}
                    </span>
                    {selectedProductIds[0] === product.id && (
                      <span className="mt-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                        Produto principal
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold",
                      selectedProductIds.includes(product.id)
                        ? "border-primary bg-primary text-white"
                        : "border-slate-200 text-slate-300",
                    )}
                  >
                    {selectedProductIds.includes(product.id) ? (
                      selectedProductIds[0] === product.id ? (
                        "1"
                      ) : (
                        <Check className="h-4 w-4" />
                      )
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center">
              <p className="text-lg font-semibold text-slate-950">
                Nenhum produto encontrado
              </p>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Sincronize os produtos em Integrações ou refaça sua busca.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
          <div className="mr-auto flex items-center text-sm font-semibold text-slate-500">
            {selectedProductIds.length} selecionado
            {selectedProductIds.length === 1 ? "" : "s"}
          </div>
          <Button
            className="min-w-36 rounded-xl font-bold"
            onClick={onContinue}
          >
            Continuar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UploadStepCard({
  cta,
  description,
  file,
  fileInputRef,
  flow,
  handleFile,
  isSubmitting,
  productVisibilityScope,
  products,
  progress,
  selectedColorProduct,
  selectedProduct,
  selectedProducts,
  setCta,
  setDescription,
  setSelectedColorProductId,
  setProductVisibilityScope,
  setTitle,
  title,
  uploadProgress,
  onContinue,
}: {
  cta: string;
  description: string;
  file: File | null;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  flow: UploadFlow | null;
  handleFile: (file?: File | null) => void;
  isSubmitting: boolean;
  productVisibilityScope: ProductVisibilityScope;
  products: LuppProduct[];
  progress: number;
  selectedColorProduct?: LuppProduct;
  selectedProduct?: LuppProduct;
  selectedProducts: LuppProduct[];
  setCta: (value: string) => void;
  setDescription: (value: string) => void;
  setSelectedColorProductId: (value: string) => void;
  setProductVisibilityScope: (value: ProductVisibilityScope) => void;
  setTitle: (value: string) => void;
  title: string;
  uploadProgress: VideoUploadProgress | null;
  onContinue: () => void;
}) {
  const colorOptions = React.useMemo(
    () => colorOptionsForProduct(products, selectedProduct),
    [products, selectedProduct],
  );

  return (
    <>
      <Card className="border-dashed border-2 border-slate-200 bg-white text-slate-950">
        <CardContent
          className="flex min-h-[250px] flex-col items-center justify-center p-8"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleFile(event.dataTransfer.files.item(0));
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_VIDEO_INPUT_TYPES.join(",")}
            className="sr-only"
            onChange={(event) => handleFile(event.target.files?.item(0))}
          />

          {!file ? (
            <button
              type="button"
              className="flex cursor-pointer flex-col items-center gap-4 rounded-xl p-4 text-center outline-none focus:ring-2 focus:ring-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UploadCloud className="h-8 w-8" />
              </div>
              <div>
                <p className="text-lg font-bold">Arraste seu vídeo aqui</p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  MP4, MOV ou WebM até {MAX_VIDEO_UPLOAD_MB}MB
                </p>
              </div>
            </button>
          ) : (
            <div className="w-full max-w-md space-y-4">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate font-bold">{file.name}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                >
                  Trocar
                </Button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>
                    {isSubmitting && uploadProgress
                      ? uploadPhaseLabels[uploadProgress.phase]
                      : "Pronto para publicar"}
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
                {isSubmitting && uploadProgress ? (
                  <p className="text-center text-xs font-medium text-slate-500">
                    {formatBytes(uploadProgress.bytesUploaded)} de{" "}
                    {formatBytes(uploadProgress.bytesTotal)}
                  </p>
                ) : (
                  <p className="text-center text-xs font-medium text-slate-500">
                    O progresso aparece assim que você publicar.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white text-slate-950">
        <CardContent className="space-y-5 p-6">
          {flow === "product" && selectedProduct && (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
              <div
                className="h-12 w-12 rounded-xl bg-slate-100 bg-cover bg-center"
                style={{
                  backgroundImage: selectedProduct.image_url
                    ? `url(${selectedProduct.image_url})`
                    : undefined,
                }}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">
                  {selectedProduct.name}
                </p>
                <p className="truncate text-xs font-medium text-slate-500">
                  {selectedProducts.length > 1
                    ? `${selectedProducts.length} produtos vinculados`
                    : productSubtitle(selectedProduct)}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="video-title">Título do vídeo (opcional)</Label>
            <Input
              id="video-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex: Provador Vestido Midi"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="video-description">Descrição curta (opcional)</Label>
            <Textarea
              id="video-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Adicione uma legenda..."
              className="resize-none"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>CTA do botão</Label>
            <Select value={cta} onValueChange={setCta}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ver">Ver produto</SelectItem>
                <SelectItem value="comprar">Comprar agora</SelectItem>
                <SelectItem value="carrinho">Adicionar ao carrinho</SelectItem>
                <SelectItem value="conhecer">Conhecer peça</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {flow === "product" && selectedProduct && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <Label className="text-sm font-bold text-slate-950">
                  Cores
                </Label>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                  Escolha se este vídeo deve ser priorizado em todas as cores do
                  modelo ou em uma cor específica sincronizada.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setProductVisibilityScope("product")}
                  className={cn(
                    "rounded-xl border bg-white p-3 text-left transition",
                    productVisibilityScope === "product"
                      ? "border-primary ring-1 ring-primary"
                      : "border-slate-200 hover:border-primary/40",
                  )}
                >
                  <span className="block text-sm font-bold text-slate-950">
                    Produto inteiro
                  </span>
                  <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">
                    Usa {productWideUrl(selectedProduct) ?? "a URL do produto"}{" "}
                    para cobrir todas as cores do modelo.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setProductVisibilityScope("variant")}
                  className={cn(
                    "rounded-xl border bg-white p-3 text-left transition",
                    productVisibilityScope === "variant"
                      ? "border-primary ring-1 ring-primary"
                      : "border-slate-200 hover:border-primary/40",
                  )}
                >
                  <span className="block text-sm font-bold text-slate-950">
                    Somente cor atual
                  </span>
                  <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">
                    Usa {selectedProduct.product_url ?? "a URL sincronizada"}{" "}
                    ou uma cor abaixo, sem ampliar para outras cores.
                  </span>
                </button>
              </div>
              {productVisibilityScope === "variant" && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                  <Label className="text-xs font-bold uppercase text-slate-500">
                    Cor vinculada
                  </Label>
                  {colorOptions.length > 1 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {colorOptions.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => setSelectedColorProductId(product.id)}
                          className={cn(
                            "rounded-lg border p-3 text-left transition",
                            selectedColorProduct?.id === product.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-slate-200 hover:border-primary/40",
                          )}
                        >
                          <span className="block text-sm font-bold text-slate-950">
                            {productColorLabel(product)}
                          </span>
                          <span className="mt-1 block truncate text-xs font-medium text-slate-500">
                            {product.product_url}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-slate-500">
                      Só encontrei a cor atual para este produto sincronizado:{" "}
                      <span className="font-bold text-slate-700">
                        {productColorLabel(selectedProduct)}
                      </span>
                      .
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button className="rounded-xl font-bold" onClick={onContinue}>
              Continuar para publicação
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function PublishStepCard({
  cta,
  file,
  flow,
  isSubmitting,
  onPublish,
  progress,
  productVisibilityScope,
  selectedColorProduct,
  selectedProduct,
  selectedProducts,
  setToggle,
  toggles,
  uploadProgress,
}: {
  cta: string;
  file: File | null;
  flow: UploadFlow | null;
  isSubmitting: boolean;
  onPublish: (status: "active" | "draft") => void;
  progress: number;
  productVisibilityScope: ProductVisibilityScope;
  selectedColorProduct?: LuppProduct;
  selectedProduct?: LuppProduct;
  selectedProducts: LuppProduct[];
  setToggle: (
    key: keyof PublishStepCardProps["toggles"],
    value: boolean,
  ) => void;
  toggles: PublishStepCardProps["toggles"];
  uploadProgress: VideoUploadProgress | null;
}) {
  const items = [
    { key: "feed" as const, label: "Ativar no feed vertical" },
    {
      key: "productPage" as const,
      label:
        flow === "product"
          ? "Exibir bolinha na página deste produto"
          : "Permitir uso em páginas de produto",
    },
    { key: "likes" as const, label: "Permitir likes" },
    { key: "comments" as const, label: "Permitir comentários" },
    { key: "sharing" as const, label: "Permitir compartilhamento" },
    { key: "featured" as const, label: "Destacar na home" },
  ];

  return (
    <Card className="border-slate-200 bg-white text-slate-950">
      <CardContent className="space-y-6 p-6">
        <div>
          <h2 className="text-xl font-bold">Pronto para publicar</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Revise onde este vídeo deve aparecer. Ao publicar com produto, a
            Lupp prioriza esse vídeo na página do produto e mantém o feed da
            marca em seguida.
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <ReviewLine
            label="Arquivo"
            value={file?.name ?? "Nenhum vídeo selecionado"}
          />
          <ReviewLine
            label={selectedProducts.length > 1 ? "Produtos" : "Produto"}
            value={
              selectedProducts.length > 1
                ? `${selectedProducts.length} produtos vinculados`
                : selectedProduct?.name ?? "Sem produto vinculado"
            }
          />
          {flow === "product" && selectedProduct && (
            <ReviewLine
              label="Cores"
              value={
                productVisibilityScope === "product"
                  ? "Produto inteiro"
                  : `Somente ${productColorLabel(selectedColorProduct)}`
              }
            />
          )}
          <ReviewLine label="CTA" value={ctaLabels[cta]} />
        </div>

        <div className="space-y-4">
          {items.map((toggle) => (
            <div
              key={toggle.key}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3"
            >
              <Label
                htmlFor={toggle.key}
                className="cursor-pointer text-sm font-semibold text-slate-700"
              >
                {toggle.label}
              </Label>
              <Switch
                id={toggle.key}
                checked={toggles[toggle.key]}
                onCheckedChange={(checked) => setToggle(toggle.key, checked)}
              />
            </div>
          ))}
        </div>

        {isSubmitting && uploadProgress && (
          <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>{uploadPhaseLabels[uploadProgress.phase]}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
            <p className="text-center text-xs font-medium text-slate-500">
              {formatBytes(uploadProgress.bytesUploaded)} de{" "}
              {formatBytes(uploadProgress.bytesTotal)}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1 rounded-xl font-bold"
            onClick={() => void onPublish("draft")}
            disabled={!file || isSubmitting}
          >
            Salvar rascunho
          </Button>
          <Button
            className="flex-1 rounded-xl font-bold shadow-lg shadow-primary/20"
            onClick={() => void onPublish("active")}
            disabled={!file || isSubmitting}
          >
            {isSubmitting ? "Publicando..." : "Publicar vídeo"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type PublishStepCardProps = {
  toggles: {
    feed: boolean;
    productPage: boolean;
    likes: boolean;
    comments: boolean;
    sharing: boolean;
    featured: boolean;
  };
};

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="truncate text-right font-bold text-slate-950">
        {value}
      </span>
    </div>
  );
}

function PreviewColumn({
  cta,
  previewUrl,
  selectedProduct,
  selectedProducts,
}: {
  cta: string;
  previewUrl: string;
  selectedProduct?: LuppProduct;
  selectedProducts: LuppProduct[];
}) {
  return (
    <div className="flex min-h-[650px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <PhonePreview className="scale-90 transform-origin-center lg:scale-100">
        <div className="relative h-full w-full bg-black">
          {previewUrl ? (
            <video
              src={previewUrl}
              className="h-full w-full object-cover"
              muted
              playsInline
              loop
              autoPlay
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-900 text-slate-400">
              <VideoIcon className="h-8 w-8" />
              Preview do vídeo
            </div>
          )}

          {selectedProducts.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 pt-20">
              {selectedProducts.length > 1 ? (
                <div className="-mr-4 flex gap-3 overflow-x-auto pr-12">
                  {selectedProducts.map((product) => (
                    <div key={product.id} className="w-[78%] shrink-0">
                      <CommerceProductCard
                        singleAction
                        actionLabel="Adicionar ao carrinho"
                        product={toCommerceProductView(product)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <CommerceProductCard
                  singleAction
                  actionLabel="Adicionar ao carrinho"
                  product={toCommerceProductView(selectedProducts[0])}
                />
              )}
            </div>
          )}

          <div className="absolute bottom-[206px] right-2 z-20 flex flex-col items-center gap-3 text-white">
            <button
              type="button"
              className="flex w-10 flex-col items-center gap-1"
              aria-label="Curtir"
            >
              <Heart
                className="h-8 w-8 drop-shadow-[0_2px_7px_rgba(0,0,0,.45)]"
                fill="white"
                stroke="white"
                strokeWidth={2.3}
              />
              <span className="text-[11px] font-black leading-none [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">
                0
              </span>
            </button>
            <button
              type="button"
              className="flex w-10 flex-col items-center gap-1"
              aria-label="Comentários"
            >
              <MessageCircle
                className="h-8 w-8 drop-shadow-[0_2px_7px_rgba(0,0,0,.45)]"
                fill="white"
                stroke="white"
                strokeWidth={2.4}
              />
              <span className="text-[11px] font-black leading-none [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">
                0
              </span>
            </button>
            <button
              type="button"
              className="flex w-10 flex-col items-center gap-1"
              aria-label="Compartilhar"
            >
              <Share2
                className="h-8 w-8 drop-shadow-[0_2px_7px_rgba(0,0,0,.45)]"
                fill="white"
                stroke="white"
                strokeWidth={2.4}
              />
              <span className="text-[11px] font-black leading-none [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">
                Compart.
              </span>
            </button>
          </div>
        </div>
      </PhonePreview>

      <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-500">
        <Link2 className="h-4 w-4" />
        {selectedProduct?.product_url
          ? "A miniatura será liberada para a URL do produto."
          : "Vídeos sem produto aparecem no feed geral."}
      </div>
    </div>
  );
}
