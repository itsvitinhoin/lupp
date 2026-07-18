import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { useToast } from "@/hooks/use-toast";
import { useCurrentStore } from "@/hooks/useStore";
import { widgetsService } from "@/services/widgets.service";
import { env, isApiConfigured } from "@/lib/env";
import {
  PLAN_LIMITS,
  normalizeLuupPlanId,
  planAllowsHorizontalFeed,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  CloudUpload,
  Code2,
  ExternalLink,
  LayoutGrid,
  LockKeyhole,
  MessageCircle,
  Monitor,
  Move,
  Paintbrush,
  Palette,
  PlayCircle,
  Save,
  Settings2,
  ShoppingBag,
  Smartphone,
  Video,
  Zap,
} from "lucide-react";

type WidgetView = "overview" | "floating" | "horizontal-feed";

type WidgetOverviewCard = {
  id: WidgetView;
  title: string;
  description: string;
  soon?: boolean;
  tone: "launcher" | "interactions" | "feed" | "store";
};

const overviewCards: WidgetOverviewCard[] = [
  {
    id: "floating",
    title: "Miniatura flutuante",
    description:
      "Ajuste a chamada que aparece sobre a loja e abre o feed vertical da Lupp.",
    tone: "launcher",
  },
  {
    id: "horizontal-feed",
    title: "Feed Horizontal",
    description:
      "Carrossel lateral para a Home com vídeos, produtos e abertura do feed vertical.",
    tone: "feed",
  },
];

const sizeOptions = [
  { label: "Pequena", value: "60" },
  { label: "Média", value: "74" },
  { label: "Grande", value: "92" },
];

const modelOptions = [
  { label: "Retangular", value: "rectangular" },
  { label: "Quadrado", value: "square" },
  { label: "Circular", value: "circular" },
  { label: "Texto circular", value: "circular_text" },
  { label: "Destaque", value: "highlight" },
  { label: "Insta", value: "insta" },
  { label: "Insta neon", value: "insta_neon" },
];

function asSettings(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function pathsFromText(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pathsToText(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).join("\n") : "";
}

function jsStringLiteral(value: string) {
  return JSON.stringify(value).replace(/<\/script/gi, "<\\/script");
}

function modelShape(model: string) {
  if (model === "rectangular") return "rounded-[20px] aspect-[1.45/1]";
  if (model === "square") return "rounded-[22px] aspect-square";
  return "rounded-full aspect-square";
}

export default function Widgets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { store } = useCurrentStore();
  const [view, setView] = React.useState<WidgetView>("overview");
  const [launcherLabel, setLauncherLabel] = React.useState("VIDEO DO PRODUTO");
  const [launcherPosition, setLauncherPosition] = React.useState("bottom-left");
  const [launcherAccent, setLauncherAccent] = React.useState("#176BFF");
  const [launcherBackground, setLauncherBackground] = React.useState("#0F172A");
  const [launcherTextColor, setLauncherTextColor] = React.useState("#ffffff");
  const [launcherFont, setLauncherFont] = React.useState(
    "Inter, system-ui, sans-serif",
  );
  const [launcherSize, setLauncherSize] = React.useState("74");
  const [launcherModel, setLauncherModel] = React.useState("circular");
  const [excludePaths, setExcludePaths] = React.useState(
    "/checkout\n/carrinho\n/cart",
  );
  const [homeExperienceEnabled, setHomeExperienceEnabled] =
    React.useState(true);
  const [homeOrdering, setHomeOrdering] = React.useState("manual");
  const [fixedVideo, setFixedVideo] = React.useState(false);
  const [allowClose, setAllowClose] = React.useState(true);
  const [randomizeThumbnail, setRandomizeThumbnail] = React.useState(false);
  const [customInstallmentsEnabled, setCustomInstallmentsEnabled] =
    React.useState(false);
  const [customInstallmentsCount, setCustomInstallmentsCount] =
    React.useState("6");
  const [customInstallmentsInterestFree, setCustomInstallmentsInterestFree] =
    React.useState(true);
  const [customPixDiscountEnabled, setCustomPixDiscountEnabled] =
    React.useState(false);
  const [customPixDiscountPercent, setCustomPixDiscountPercent] =
    React.useState("0");
  const [customPaymentNote, setCustomPaymentNote] = React.useState("");
  const [carouselEnabled, setCarouselEnabled] = React.useState(true);
  const [carouselTitle, setCarouselTitle] = React.useState(
    "Descubra cada detalhe e Compre",
  );
  const [carouselDescription, setCarouselDescription] = React.useState("");
  const [carouselBeforeHeading, setCarouselBeforeHeading] =
    React.useState("Com Capa");
  const [carouselDesktopCount, setCarouselDesktopCount] = React.useState("12");
  const [carouselMobileCount, setCarouselMobileCount] = React.useState("6");
  const [isSavingSettings, setIsSavingSettings] = React.useState(false);
  const [isInstallingNuvemshop, setIsInstallingNuvemshop] =
    React.useState(false);

  const widgetsQuery = useQuery({
    queryKey: ["widgets", store?.id],
    queryFn: () => widgetsService.listWidgets(store!.id),
    enabled: isApiConfigured && Boolean(store),
  });
  const floatingWidget =
    widgetsQuery.data?.find((widget) => widget.type === "floating_video") ??
    null;
  const currentPlanId = normalizeLuupPlanId(store?.plan_id);
  const currentPlan = PLAN_LIMITS[currentPlanId];
  const canUseHorizontalFeed = planAllowsHorizontalFeed(currentPlanId);
  const activeWidgetCount =
    (floatingWidget?.status === "active" ? 1 : 0) +
    (carouselEnabled && canUseHorizontalFeed ? 1 : 0);
  const launcherWidget = {
    id: "floating-launcher",
    name: "Bolinha flutuante",
    status: "ativo",
    type: "floating_launcher",
  };

  React.useEffect(() => {
    if (!floatingWidget) return;
    const settings = asSettings(floatingWidget.settings);
    const appearance = asSettings(settings.appearance);
    const display = asSettings(settings.display);
    const commerce = asSettings(settings.commerce);
    const carousel = asSettings(settings.carousel);

    setLauncherPosition(String(appearance.position || "bottom-left"));
    setLauncherAccent(String(appearance.accent_color || "#176BFF"));
    setLauncherBackground(String(appearance.background_color || "#0F172A"));
    setLauncherTextColor(String(appearance.text_color || "#ffffff"));
    setLauncherLabel(String(appearance.label ?? "VIDEO DO PRODUTO"));
    setLauncherFont(
      String(appearance.font_family || "Inter, system-ui, sans-serif"),
    );
    setLauncherSize(String(appearance.bubble_size || "74"));
    setLauncherModel(String(appearance.model || "circular"));
    setFixedVideo(Boolean(appearance.fixed_video));
    setAllowClose(appearance.allow_close !== false);
    setRandomizeThumbnail(Boolean(appearance.randomize_thumbnail));
    setExcludePaths(
      pathsToText(display.exclude_paths) || "/checkout\n/carrinho\n/cart",
    );
    setHomeExperienceEnabled(display.home_experience_enabled !== false);
    setHomeOrdering(String(display.home_ordering || "manual"));
    setCustomInstallmentsEnabled(Boolean(commerce.custom_installments_enabled));
    setCustomInstallmentsCount(
      String(commerce.custom_installments_count || "6"),
    );
    setCustomInstallmentsInterestFree(
      commerce.custom_installments_interest_free !== false,
    );
    setCustomPixDiscountEnabled(Boolean(commerce.custom_pix_discount_enabled));
    setCustomPixDiscountPercent(
      String(commerce.custom_pix_discount_percent || "0"),
    );
    setCustomPaymentNote(String(commerce.custom_payment_note || ""));
    setCarouselEnabled(carousel.enabled !== false);
    setCarouselTitle(
      String(carousel.title || "Descubra cada detalhe e Compre"),
    );
    setCarouselDescription(String(carousel.description || ""));
    setCarouselBeforeHeading(String(carousel.before_heading || "Com Capa"));
    setCarouselDesktopCount(String(carousel.max_items || "12"));
    setCarouselMobileCount(String(carousel.mobile_max_items || "6"));
  }, [floatingWidget?.id, floatingWidget?.updated_at]);

  React.useEffect(() => {
    if (!canUseHorizontalFeed && carouselEnabled) {
      setCarouselEnabled(false);
    }
  }, [canUseHorizontalFeed, carouselEnabled]);

  const handleCarouselEnabledChange = (enabled: boolean) => {
    if (enabled && !canUseHorizontalFeed) {
      toast({
        title: "Upgrade necessário",
        description:
          "O plano Start permite 1 widget ativo. Para usar bolinha flutuante e Feed Horizontal juntos, altere para o Growth ou superior.",
      });
      return;
    }
    setCarouselEnabled(enabled);
  };

  const getEmbedCode = () => {
    if (!store)
      return "<!-- Crie uma loja para gerar o código de instalação da Lupp. -->";

    return `<script>
(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = ${jsStringLiteral(env.widgetCdnUrl)};

  // Apenas identidade: aparência, exibição e carrossel vêm das configurações
  // salvas neste painel, resolvidas pelo servidor a cada página. Atributos
  // extras no snippet SOBRESCREVEM o painel — não adicione a menos que queira
  // fixar um valor para sempre.
  s.setAttribute('data-store-id', ${jsStringLiteral(store.id)});
  s.setAttribute('data-store', ${jsStringLiteral(store.slug)});
  s.setAttribute('data-widget', ${jsStringLiteral(launcherWidget.type)});
  s.setAttribute('data-require-active', 'true');
  s.setAttribute('data-lupp-url', ${jsStringLiteral(env.appUrl)});
  s.setAttribute('data-api-url', ${jsStringLiteral(env.apiUrl)});

  var firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(s, firstScript);
})();
</script>`;
  };

  const getHomeCarouselEmbedCode = () => {
    if (!store)
      return "<!-- Crie uma loja para gerar o código de instalação da Lupp. -->";

    return `<script>
(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = ${jsStringLiteral(env.widgetCdnUrl)};

  // Apenas identidade: título, textos e limites do carrossel vêm das
  // configurações salvas neste painel, resolvidas pelo servidor.
  s.setAttribute('data-store-id', ${jsStringLiteral(store.id)});
  s.setAttribute('data-store', ${jsStringLiteral(store.slug)});
  s.setAttribute('data-widget', 'home_carousel');
  s.setAttribute('data-require-active', 'true');
  s.setAttribute('data-lupp-url', ${jsStringLiteral(env.appUrl)});
  s.setAttribute('data-api-url', ${jsStringLiteral(env.apiUrl)});

  var firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(s, firstScript);
})();
</script>`;
  };

  const buildLauncherSettings = (currentSettings: Record<string, any>) => ({
    ...currentSettings,
    appearance: {
      accent_color: launcherAccent,
      allow_close: allowClose,
      background_color: launcherBackground,
      bubble_size: Number(launcherSize) || 74,
      fixed_video: fixedVideo,
      font_family: launcherFont,
      label: launcherLabel,
      model: launcherModel,
      position: launcherPosition,
      randomize_thumbnail: randomizeThumbnail,
      text_color: launcherTextColor,
    },
    display: {
      exclude_paths: pathsFromText(excludePaths),
      hide_without_videos: false,
      home_experience_enabled: homeExperienceEnabled,
      home_ordering: homeOrdering,
      include_paths: [],
      mode: "all",
      product_mode: "linked_or_all",
    },
    commerce: {
      custom_installments_enabled: customInstallmentsEnabled,
      custom_installments_count: Number(customInstallmentsCount) || 1,
      custom_installments_interest_free: customInstallmentsInterestFree,
      custom_pix_discount_enabled: customPixDiscountEnabled,
      custom_pix_discount_percent: Number(customPixDiscountPercent) || 0,
      custom_payment_note: customPaymentNote.trim(),
    },
    carousel: {
      enabled: canUseHorizontalFeed && carouselEnabled,
      title: carouselTitle.trim() || "Descubra cada detalhe e Compre",
      description: carouselDescription.trim(),
      before_heading: carouselBeforeHeading.trim() || "Com Capa",
      max_items: Number(carouselDesktopCount) || 12,
      mobile_max_items: Number(carouselMobileCount) || 6,
    },
  });

  const saveLauncherSettings = async () => {
    if (!store || !floatingWidget) {
      throw new Error(
        "Crie uma loja com os widgets padrão antes de salvar esta configuração.",
      );
    }

    const currentSettings = asSettings(floatingWidget.settings);
    await widgetsService.updateWidget(floatingWidget.id, {
      status: "active",
      settings: buildLauncherSettings(currentSettings),
    });
    await queryClient.invalidateQueries({ queryKey: ["widgets", store.id] });
  };

  const handleSaveLauncherSettings = async () => {
    try {
      setIsSavingSettings(true);
      await saveLauncherSettings();
      toast({
        title: "Miniatura configurada",
        description:
          "As regras de exibição foram salvas e o widget flutuante foi ativado.",
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
      setIsSavingSettings(false);
    }
  };

  const handleSaveHorizontalSettings = async () => {
    try {
      if (carouselEnabled && !canUseHorizontalFeed) {
        toast({
          title: "Feed Horizontal bloqueado no Start",
          description:
            "Esse carrossel conta como um segundo widget. Faça upgrade para Growth para manter a bolinha e o Feed Horizontal ativos.",
        });
        return;
      }
      setIsSavingSettings(true);
      await saveLauncherSettings();
      toast({
        title: "Feed Horizontal configurado",
        description:
          "O carrossel da Home foi salvo e passa a usar essas regras na loja.",
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
      setIsSavingSettings(false);
    }
  };

  const handleInstallNuvemshopScript = async () => {
    if (!store) return;

    try {
      setIsInstallingNuvemshop(true);
      await saveLauncherSettings();
      await widgetsService.installNuvemshopScript(store.id);
      toast({
        title: "Script instalado na Nuvemshop",
        description: "A miniatura da Lupp foi associada à loja conectada.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível instalar na Nuvemshop",
        description:
          error instanceof Error
            ? error.message
            : "Verifique o script_id e a permissão scripts no app.",
      });
    } finally {
      setIsInstallingNuvemshop(false);
    }
  };

  const handleCopyCode = async () => {
    const code = getEmbedCode();
    await navigator.clipboard.writeText(code);
    toast({
      title: "Código copiado!",
      description: "Cole esse script no HTML do seu e-commerce interno.",
    });
  };

  const handleOpenCard = (card: WidgetOverviewCard) => {
    if (card.id === "floating") {
      setView("floating");
      return;
    }
    if (card.id === "horizontal-feed") {
      setView("horizontal-feed");
      return;
    }
    toast({
      title: "Feed Horizontal em breve",
      description:
        "Esse widget será liberado depois da experiência vertical principal.",
    });
  };

  const currentSizeLabel =
    sizeOptions.find((option) => option.value === launcherSize)?.label ??
    "Média";

  return (
    <AppLayout title="Widgets">
      <div className="space-y-6 text-slate-950">
        {view === "overview" ? (
          <Overview
            cards={overviewCards}
            canUseHorizontalFeed={canUseHorizontalFeed}
            currentPlanName={currentPlan.name}
            isConnected={Boolean(floatingWidget)}
            onOpenCard={handleOpenCard}
            storeSlug={store?.slug}
          />
        ) : view === "floating" ? (
          <FloatingEditor
            allowClose={allowClose}
            currentSizeLabel={currentSizeLabel}
            excludePaths={excludePaths}
            fixedVideo={fixedVideo}
            homeExperienceEnabled={homeExperienceEnabled}
            homeOrdering={homeOrdering}
            isInstallingNuvemshop={isInstallingNuvemshop}
            isSavingSettings={isSavingSettings}
            launcherAccent={launcherAccent}
            launcherBackground={launcherBackground}
            launcherFont={launcherFont}
            launcherLabel={launcherLabel}
            launcherModel={launcherModel}
            launcherPosition={launcherPosition}
            launcherSize={launcherSize}
            launcherTextColor={launcherTextColor}
            randomizeThumbnail={randomizeThumbnail}
            storeSlug={store?.slug}
            onBack={() => setView("overview")}
            onCopyCode={() => void handleCopyCode()}
            onInstallNuvemshop={() => void handleInstallNuvemshopScript()}
            onSave={() => void handleSaveLauncherSettings()}
            setAllowClose={setAllowClose}
            setExcludePaths={setExcludePaths}
            setFixedVideo={setFixedVideo}
            setHomeExperienceEnabled={setHomeExperienceEnabled}
            setHomeOrdering={setHomeOrdering}
            setLauncherAccent={setLauncherAccent}
            setLauncherBackground={setLauncherBackground}
            setLauncherFont={setLauncherFont}
            setLauncherLabel={setLauncherLabel}
            setLauncherModel={setLauncherModel}
            setLauncherPosition={setLauncherPosition}
            setLauncherSize={setLauncherSize}
            setLauncherTextColor={setLauncherTextColor}
            setRandomizeThumbnail={setRandomizeThumbnail}
            embedCode={getEmbedCode()}
            canPersist={Boolean(floatingWidget && store)}
            customInstallmentsCount={customInstallmentsCount}
            customInstallmentsEnabled={customInstallmentsEnabled}
            customInstallmentsInterestFree={customInstallmentsInterestFree}
            customPaymentNote={customPaymentNote}
            customPixDiscountEnabled={customPixDiscountEnabled}
            customPixDiscountPercent={customPixDiscountPercent}
            setCustomInstallmentsCount={setCustomInstallmentsCount}
            setCustomInstallmentsEnabled={setCustomInstallmentsEnabled}
            setCustomInstallmentsInterestFree={setCustomInstallmentsInterestFree}
            setCustomPaymentNote={setCustomPaymentNote}
            setCustomPixDiscountEnabled={setCustomPixDiscountEnabled}
            setCustomPixDiscountPercent={setCustomPixDiscountPercent}
          />
        ) : (
          <HorizontalFeedEditor
            canPersist={Boolean(floatingWidget && store)}
            carouselBeforeHeading={carouselBeforeHeading}
            carouselDescription={carouselDescription}
            carouselDesktopCount={carouselDesktopCount}
            carouselEnabled={carouselEnabled}
            carouselMobileCount={carouselMobileCount}
            carouselTitle={carouselTitle}
            currentPlanName={currentPlan.name}
            embedCode={getHomeCarouselEmbedCode()}
            isLockedByPlan={!canUseHorizontalFeed}
            isSavingSettings={isSavingSettings}
            requiredPlanName={PLAN_LIMITS.growth.name}
            activeWidgetCount={activeWidgetCount}
            widgetLimit={currentPlan.widgetLimit}
            onBack={() => setView("overview")}
            onCopyCode={async () => {
              await navigator.clipboard.writeText(getHomeCarouselEmbedCode());
              toast({
                title: "Código do Feed Horizontal copiado",
                description:
                  "Use esse código quando quiser instalar apenas o carrossel.",
              });
            }}
            onSave={() => void handleSaveHorizontalSettings()}
            setCarouselBeforeHeading={setCarouselBeforeHeading}
            setCarouselDescription={setCarouselDescription}
            setCarouselDesktopCount={setCarouselDesktopCount}
            setCarouselEnabled={handleCarouselEnabledChange}
            setCarouselMobileCount={setCarouselMobileCount}
            setCarouselTitle={setCarouselTitle}
          />
        )}
      </div>
    </AppLayout>
  );
}

function WorkspaceHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-7">
      <div>
        <h2 className="text-2xl font-bold leading-tight tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Overview({
  cards,
  canUseHorizontalFeed,
  currentPlanName,
  isConnected,
  onOpenCard,
  storeSlug,
}: {
  cards: WidgetOverviewCard[];
  canUseHorizontalFeed: boolean;
  currentPlanName: string;
  isConnected: boolean;
  onOpenCard: (card: WidgetOverviewCard) => void;
  storeSlug?: string;
}) {
  return (
    <>
      <WorkspaceHeader
        title="Personalize"
        subtitle="Customize widgets, instalação e experiência visual da loja conectada."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onOpenCard(card)}
            className={cn(
              "group flex min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg",
              card.soon && "cursor-default opacity-85 hover:translate-y-0",
            )}
          >
            <WidgetPreviewStrip tone={card.tone} />
            <div className="mt-7 flex flex-1 flex-col">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold tracking-tight text-slate-950">
                  {card.title}
                </h3>
                {card.soon && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                    Em breve
                  </span>
                )}
                {card.id === "floating" && isConnected && (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    Ativo
                  </span>
                )}
                {card.id === "horizontal-feed" && !canUseHorizontalFeed && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                    Growth+
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-[520px] text-sm font-medium leading-6 text-slate-500">
                {card.description}
              </p>
              {card.id === "horizontal-feed" && !canUseHorizontalFeed ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-5 text-amber-800">
                  Seu plano {currentPlanName} permite 1 widget ativo. Para usar
                  a bolinha e o Feed Horizontal juntos, altere para Growth.
                </p>
              ) : null}
              <span
                className={cn(
                  "mt-auto inline-flex h-11 w-fit items-center rounded-xl px-5 text-sm font-bold transition",
                  card.soon
                    ? "bg-slate-100 text-slate-500"
                    : "bg-primary text-white group-hover:bg-primary/90",
                )}
              >
                {card.soon
                  ? "Em breve"
                  : card.id === "horizontal-feed"
                    ? "Configurar"
                    : "Personalizar"}
              </span>
            </div>
          </button>
        ))}
      </div>
      {storeSlug && (
        <a
          href={`/test-store/${storeSlug}?widget=floating_launcher`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-8 right-8 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/25 transition hover:scale-105"
        >
          <MessageCircle className="h-8 w-8" />
        </a>
      )}
    </>
  );
}

function HorizontalFeedEditor(props: {
  activeWidgetCount: number;
  canPersist: boolean;
  carouselBeforeHeading: string;
  carouselDescription: string;
  carouselDesktopCount: string;
  carouselEnabled: boolean;
  carouselMobileCount: string;
  carouselTitle: string;
  currentPlanName: string;
  embedCode: string;
  isLockedByPlan: boolean;
  isSavingSettings: boolean;
  onBack: () => void;
  onCopyCode: () => void | Promise<void>;
  onSave: () => void;
  requiredPlanName: string;
  setCarouselBeforeHeading: (value: string) => void;
  setCarouselDescription: (value: string) => void;
  setCarouselDesktopCount: (value: string) => void;
  setCarouselEnabled: (value: boolean) => void;
  setCarouselMobileCount: (value: string) => void;
  setCarouselTitle: (value: string) => void;
  widgetLimit: number;
}) {
  const desktopCount = Math.max(1, Number(props.carouselDesktopCount) || 1);
  const mobileCount = Math.max(1, Number(props.carouselMobileCount) || 1);

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex gap-4">
          <Button
            onClick={props.onBack}
            variant="ghost"
            size="icon"
            className="mt-1 h-10 w-10 rounded-xl text-slate-700 hover:bg-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-slate-950">
              Feed Horizontal
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
              Configure o carrossel de vídeos que aparece na Home da loja antes
              de abrir o feed vertical completo.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="h-11 rounded-xl bg-white px-5 text-sm font-bold"
            onClick={() => void props.onCopyCode()}
          >
            <Code2 className="mr-2 h-5 w-5" />
            Copiar código
          </Button>
          <Button
            onClick={props.onSave}
            disabled={props.isSavingSettings || !props.canPersist}
            className="h-11 rounded-xl px-8 text-sm font-bold"
          >
            <Save className="mr-2 h-5 w-5" />
            {props.isSavingSettings ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="grid gap-7 xl:grid-cols-[minmax(360px,560px)_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <Video className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-slate-950">
              Aparência do carrossel
            </h3>
          </div>

          {props.isLockedByPlan ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-black text-amber-900">
                    Feed Horizontal disponível no {props.requiredPlanName}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-amber-800">
                    O plano {props.currentPlanName} permite{" "}
                    {props.widgetLimit} widget ativo. A bolinha flutuante já
                    conta como 1 widget; o carrossel da Home é o segundo.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm font-semibold text-slate-600">
              Uso atual: {props.activeWidgetCount} de{" "}
              {props.widgetLimit >= 999 ? "widgets ilimitados" : `${props.widgetLimit} widgets`}{" "}
              no plano {props.currentPlanName}.
            </div>
          )}

          <div className="space-y-6">
            <AdvancedSwitch
              checked={props.carouselEnabled && !props.isLockedByPlan}
              description={
                props.isLockedByPlan
                  ? "Faça upgrade para Growth ou superior para ativar a bolinha flutuante e o Feed Horizontal ao mesmo tempo."
                  : "Mostra o carrossel na Home para lojas com vídeos ativos. Nas páginas de produto, a miniatura continua priorizando o produto vinculado."
              }
              disabled={props.isLockedByPlan}
              label="Exibir Feed Horizontal na Home"
              onChange={props.setCarouselEnabled}
            />

            <div className="space-y-2">
              <Label className="font-semibold text-slate-500">Título</Label>
              <Input
                value={props.carouselTitle}
                onChange={(event) =>
                  props.setCarouselTitle(event.target.value)
                }
                placeholder="Descubra cada detalhe e Compre"
                className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-slate-500">
                Descrição opcional
              </Label>
              <Textarea
                value={props.carouselDescription}
                onChange={(event) =>
                  props.setCarouselDescription(event.target.value)
                }
                rows={3}
                placeholder="Veja os produtos em vídeo e compre sem sair da experiência."
                className="rounded-xl border-slate-200 bg-white text-sm text-slate-950"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-slate-500">
                Inserir antes da seção
              </Label>
              <Input
                value={props.carouselBeforeHeading}
                onChange={(event) =>
                  props.setCarouselBeforeHeading(event.target.value)
                }
                placeholder="Com Capa"
                className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
              />
              <p className="text-xs font-semibold leading-5 text-slate-500">
                A Luup procura esse título na Home. Se não encontrar, tenta
                posicionar logo depois da faixa de benefícios da loja.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold text-slate-500">
                  Vídeos no desktop
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={props.carouselDesktopCount}
                  onChange={(event) =>
                    props.setCarouselDesktopCount(event.target.value)
                  }
                  className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-slate-500">
                  Vídeos no mobile
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={props.carouselMobileCount}
                  onChange={(event) =>
                    props.setCarouselMobileCount(event.target.value)
                  }
                  className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                />
              </div>
            </div>

            <CodeBlock code={props.embedCode} />
          </div>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
              preview
            </p>
            <h3 className="mt-2 text-xl font-black text-slate-950">
              Como aparece na Home
            </h3>
          </div>
          <div className="bg-slate-50 p-6">
            <div className="rounded-xl bg-white py-8 shadow-sm">
              <h2 className="px-6 text-center text-2xl font-semibold text-slate-950">
                {props.carouselTitle || "Descubra cada detalhe e Compre"}
              </h2>
              {props.carouselDescription ? (
                <p className="mx-auto mt-3 max-w-xl px-6 text-center text-sm font-semibold leading-6 text-slate-500">
                  {props.carouselDescription}
                </p>
              ) : null}
              <div className="mt-7 flex gap-5 overflow-hidden px-6">
                {Array.from({ length: Math.min(desktopCount, 5) }).map(
                  (_, index) => (
                    <div
                      key={index}
                      className="relative h-[300px] w-[170px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-700 shadow-lg"
                    >
                      <div className="absolute inset-x-2 bottom-2 rounded-lg border border-white/20 bg-slate-700/80 p-2 text-white backdrop-blur">
                        <div className="flex items-center gap-2">
                          <span className="h-10 w-10 rounded-md bg-white/80" />
                          <span className="min-w-0 text-xs font-bold">
                            Produto em vídeo
                          </span>
                        </div>
                        <div className="mt-2 rounded-lg border-2 border-primary bg-white px-3 py-2 text-center text-xs font-black text-slate-950">
                          Comprar
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
              <div className="mt-5 px-6 text-xs font-semibold text-slate-500">
                Mobile exibe até {mobileCount} vídeos; desktop exibe até{" "}
                {desktopCount}.
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function WidgetPreviewStrip({ tone }: { tone: WidgetOverviewCard["tone"] }) {
  if (tone === "launcher") {
    return (
      <div className="relative h-40 overflow-hidden rounded-2xl bg-[#e9e7e3]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.56),rgba(0,0,0,.2)),radial-gradient(circle_at_18%_38%,#d2cabf_0_16%,transparent_18%),linear-gradient(90deg,#d8d3cb,#f1eee9)]" />
        <div className="absolute left-14 top-10 flex items-center">
          <div className="h-20 w-20 rounded-full border-[5px] border-primary bg-[linear-gradient(135deg,#a08d82,#44322b)] shadow-xl" />
          <div className="-ml-1 rounded-r-md bg-primary px-6 py-3 text-xs font-bold text-white">
            VIDEO DO PRODUTO
          </div>
        </div>
        <span className="absolute bottom-4 right-5 text-xs font-bold text-white/60">
          Luup
        </span>
      </div>
    );
  }

  if (tone === "interactions") {
    return (
      <div className="relative h-40 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#c7b6a0,#5f5148)]">
        <div className="absolute inset-0 bg-black/25" />
        <div className="absolute bottom-8 left-12 flex items-end gap-6 text-white">
          {[Video, MessageCircle, MessageCircle, Zap, ExternalLink].map(
            (Icon, index) => (
              <div key={index} className="text-center">
                <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-white/35 backdrop-blur">
                  <Icon className="h-7 w-7 fill-white/60" />
                </div>
                <span className="text-sm font-bold">
                  {index === 0 ? 150 : 68}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  if (tone === "feed") {
    return (
      <div className="relative h-40 overflow-hidden rounded-2xl bg-white">
        <div className="absolute left-0 right-0 top-3 text-center text-[10px] font-bold tracking-wide text-slate-800">
          DESCUBRA CADA DETALHE EM VÍDEO
        </div>
        <div className="absolute inset-x-[-22px] bottom-3 flex items-end justify-center gap-4">
          {["#d7c2ad", "#c7cdd2", "#b3937c", "#d9b9c0", "#b39a84"].map(
            (color, index) => (
              <div
                key={color}
                className={cn(
                  "relative w-16 overflow-hidden rounded-lg shadow-lg",
                  index === 2 ? "h-[122px] w-[74px]" : "h-28",
                )}
                style={{
                  background: `linear-gradient(180deg, ${color}, #5f5148)`,
                }}
              >
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 rounded-md bg-white/80 p-1">
                  <span className="h-5 w-5 rounded bg-slate-200" />
                  <span className="h-2 flex-1 rounded bg-slate-500/40" />
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-40 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#c7b6a0,#5f5148)]">
      <div className="absolute inset-0 bg-black/30" />
      <div className="absolute left-1/2 top-5 flex h-24 w-24 -translate-x-1/2 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-300">
        LOGO
      </div>
      <div className="absolute bottom-7 left-0 right-0 text-center text-xl font-bold text-white">
        Nome da sua loja
      </div>
    </div>
  );
}

function FloatingEditor(props: {
  allowClose: boolean;
  canPersist: boolean;
  currentSizeLabel: string;
  customInstallmentsCount: string;
  customInstallmentsEnabled: boolean;
  customInstallmentsInterestFree: boolean;
  customPaymentNote: string;
  customPixDiscountEnabled: boolean;
  customPixDiscountPercent: string;
  embedCode: string;
  excludePaths: string;
  fixedVideo: boolean;
  homeExperienceEnabled: boolean;
  homeOrdering: string;
  isInstallingNuvemshop: boolean;
  isSavingSettings: boolean;
  launcherAccent: string;
  launcherBackground: string;
  launcherFont: string;
  launcherLabel: string;
  launcherModel: string;
  launcherPosition: string;
  launcherSize: string;
  launcherTextColor: string;
  randomizeThumbnail: boolean;
  storeSlug?: string;
  onBack: () => void;
  onCopyCode: () => void;
  onInstallNuvemshop: () => void;
  onSave: () => void;
  setAllowClose: (value: boolean) => void;
  setCustomInstallmentsCount: (value: string) => void;
  setCustomInstallmentsEnabled: (value: boolean) => void;
  setCustomInstallmentsInterestFree: (value: boolean) => void;
  setCustomPaymentNote: (value: string) => void;
  setCustomPixDiscountEnabled: (value: boolean) => void;
  setCustomPixDiscountPercent: (value: string) => void;
  setExcludePaths: (value: string) => void;
  setFixedVideo: (value: boolean) => void;
  setHomeExperienceEnabled: (value: boolean) => void;
  setHomeOrdering: (value: string) => void;
  setLauncherAccent: (value: string) => void;
  setLauncherBackground: (value: string) => void;
  setLauncherFont: (value: string) => void;
  setLauncherLabel: (value: string) => void;
  setLauncherModel: (value: string) => void;
  setLauncherPosition: (value: string) => void;
  setLauncherSize: (value: string) => void;
  setLauncherTextColor: (value: string) => void;
  setRandomizeThumbnail: (value: boolean) => void;
}) {
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex gap-4">
          <Button
            onClick={props.onBack}
            variant="ghost"
            size="icon"
            className="mt-1 h-10 w-10 rounded-xl text-slate-700 hover:bg-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-slate-950">
              Miniatura flutuante
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Personalize sua miniatura flutuante para que ela se destaque no
              site e ofereça uma experiência única aos seus clientes.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex justify-end">
        <div className="flex flex-wrap justify-end gap-3">
          {props.storeSlug && (
            <Button
              variant="outline"
              asChild
              className="h-11 rounded-xl bg-white px-4 text-sm font-semibold"
            >
              <a
                href={`/test-store/${props.storeSlug}?widget=floating_launcher`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="mr-2 h-5 w-5" />
                Prévia real
              </a>
            </Button>
          )}
          <Button
            onClick={props.onSave}
            disabled={props.isSavingSettings || !props.canPersist}
            className="h-11 rounded-xl px-8 text-sm font-bold"
          >
            <Save className="mr-2 h-5 w-5" />
            {props.isSavingSettings ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="grid gap-7 xl:grid-cols-[minmax(360px,560px)_1fr]">
        <aside className="max-h-[calc(100vh-250px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 p-6">
            <Paintbrush className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-slate-950">Personalizar</h3>
          </div>
          <div className="max-h-[calc(100vh-350px)] space-y-7 overflow-y-auto p-6">
            <section>
              <div className="mb-5 flex items-center gap-3">
                <Palette className="h-5 w-5 text-slate-700" />
                <h4 className="text-base font-bold text-slate-950">Cores</h4>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <ColorField
                  label="Cor do fundo"
                  value={props.launcherAccent}
                  onChange={props.setLauncherAccent}
                />
                <ColorField
                  label="Cor do texto"
                  value={props.launcherTextColor}
                  onChange={props.setLauncherTextColor}
                />
              </div>
              <div className="mt-5 grid gap-3">
                <Label className="text-sm font-semibold text-slate-500">
                  Texto da chamada
                </Label>
                <Input
                  value={props.launcherLabel}
                  onChange={(event) =>
                    props.setLauncherLabel(event.target.value)
                  }
                  className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                />
              </div>
            </section>

            <SectionDivider />

            <section>
              <h4 className="mb-4 text-base font-bold text-slate-950">
                Tamanho
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {sizeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => props.setLauncherSize(option.value)}
                    className="flex items-center gap-2 rounded-xl px-1 py-2 text-left text-sm font-semibold text-slate-500"
                  >
                    <span
                      className={cn(
                        "h-6 w-6 rounded-full border-4 border-slate-200 bg-white",
                        props.launcherSize === option.value &&
                          "border-primary bg-primary",
                      )}
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <SectionDivider />

            <section>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Move className="h-7 w-7" />
                  <h4 className="text-base font-bold text-slate-950">
                    Posição da miniatura
                  </h4>
                </div>
                <div className="flex rounded-xl bg-[#f2f4f5] p-1">
                  <button
                    type="button"
                    className="rounded-lg bg-primary/10 p-2 text-primary"
                  >
                    <Monitor className="h-5 w-5" />
                  </button>
                  <button type="button" className="p-2 text-slate-400">
                    <Smartphone className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <Select
                value={props.launcherPosition}
                onValueChange={props.setLauncherPosition}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-left">Inferior esquerda</SelectItem>
                  <SelectItem value="bottom-right">Inferior direita</SelectItem>
                  <SelectItem value="top-left">Superior esquerda</SelectItem>
                  <SelectItem value="top-right">Superior direita</SelectItem>
                </SelectContent>
              </Select>
              <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-center text-sm font-medium leading-tight text-slate-500">
                Você pode mover a miniatura para a posição desejada e salvar a
                regra para a loja.
              </div>
            </section>

            <SectionDivider />

            <section>
              <div className="mb-5 flex items-center gap-3">
                <LayoutGrid className="h-5 w-5 text-slate-700" />
                <h4 className="text-base font-bold text-slate-950">Modelos</h4>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {modelOptions.map((model) => (
                  <button
                    key={model.value}
                    type="button"
                    onClick={() => props.setLauncherModel(model.value)}
                    className={cn(
                      "min-h-36 rounded-2xl border border-slate-200 bg-white p-4 text-center transition hover:border-primary/50",
                      props.launcherModel === model.value &&
                        "border-primary ring-1 ring-primary",
                    )}
                  >
                    <div className="mx-auto flex h-24 w-24 items-center justify-center">
                      <div
                        className={cn(
                          "flex w-20 items-center justify-center bg-[#f2f2f2] text-[#9a9a9a]",
                          modelShape(model.value),
                          model.value.includes("insta") &&
                            "bg-[linear-gradient(135deg,#ffb13b,#f33f86,#7b4dff)] p-[3px]",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-full w-full items-center justify-center bg-[#f2f2f2]",
                            modelShape(model.value),
                          )}
                        >
                          <PlayCircle className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-500">
                      {model.label}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <SectionDivider />

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-base font-bold text-slate-950">
                  Configurações avançadas
                </h4>
                <ChevronDown className="h-6 w-6" />
              </div>
              <div className="space-y-4">
                <AdvancedSwitch
                  checked={props.fixedVideo}
                  description="O vídeo permanece na posição configurada e não se move ao rolar a página."
                  label="Vídeo fixo (não rola com a página)"
                  onChange={props.setFixedVideo}
                />
                <AdvancedSwitch
                  checked={props.allowClose}
                  description="Adiciona opção de esconder vídeo na página."
                  label="Permitir fechar o vídeo"
                  onChange={props.setAllowClose}
                />
                <AdvancedSwitch
                  checked={props.randomizeThumbnail}
                  description="Cada atualização de página alterna o vídeo da miniatura."
                  label="Randomizar miniatura"
                  onChange={props.setRandomizeThumbnail}
                />
              </div>
            </section>

            <SectionDivider />

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Settings2 className="h-5 w-5 text-slate-700" />
                <h4 className="text-base font-bold text-slate-950">
                  Experiência na loja
                </h4>
              </div>
              <AdvancedSwitch
                checked={props.homeExperienceEnabled}
                description="Mostra a experiência principal também na Home. Nas páginas de produto, a miniatura prioriza o vídeo vinculado e continua no feed da marca."
                label="Ativar experiência na Home"
                onChange={props.setHomeExperienceEnabled}
              />
              <div className="space-y-2">
                <Label className="font-semibold text-slate-500">
                  Ordenação da Home
                </Label>
                <Select
                  value={props.homeOrdering}
                  onValueChange={props.setHomeOrdering}
                >
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automatic">Automática</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-slate-500">
                  URLs excluídas
                </Label>
                <Textarea
                  value={props.excludePaths}
                  onChange={(event) =>
                    props.setExcludePaths(event.target.value)
                  }
                  rows={3}
                  placeholder={"/checkout\n/carrinho\n/cart"}
                  className="rounded-xl border-slate-200 bg-white text-sm text-slate-950"
                />
              </div>
            </section>

            <SectionDivider />

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <ShoppingBag className="h-5 w-5 text-slate-700" />
                <h4 className="text-base font-bold text-slate-950">
                  Condições comerciais
                </h4>
              </div>
              <AdvancedSwitch
                checked={props.customInstallmentsEnabled}
                description="Mostra uma condição de parcelamento no card quando a integração não enviar essa informação automaticamente."
                label="Usar parcelamento personalizado"
                onChange={props.setCustomInstallmentsEnabled}
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-500">
                    Parcelas
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={props.customInstallmentsCount}
                    onChange={(event) =>
                      props.setCustomInstallmentsCount(event.target.value)
                    }
                    className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-500">
                    Desconto Pix (%)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={props.customPixDiscountPercent}
                    onChange={(event) =>
                      props.setCustomPixDiscountPercent(event.target.value)
                    }
                    className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                  />
                </div>
              </div>
              <AdvancedSwitch
                checked={props.customInstallmentsInterestFree}
                description="Adiciona a expressão sem juros ao parcelamento configurado."
                label="Parcelamento sem juros"
                onChange={props.setCustomInstallmentsInterestFree}
              />
              <AdvancedSwitch
                checked={props.customPixDiscountEnabled}
                description="Exibe uma linha de desconto no Pix quando o percentual estiver preenchido."
                label="Exibir desconto no Pix"
                onChange={props.setCustomPixDiscountEnabled}
              />
              <div className="space-y-2">
                <Label className="font-semibold text-slate-500">
                  Texto extra opcional
                </Label>
                <Input
                  value={props.customPaymentNote}
                  onChange={(event) =>
                    props.setCustomPaymentNote(event.target.value)
                  }
                  placeholder="Cupom de primeira compra disponível na loja"
                  className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                />
              </div>
            </section>

            <SectionDivider />

            <section className="space-y-4 pb-6">
              <div className="flex items-center gap-3">
                <Code2 className="h-5 w-5 text-slate-700" />
                <h4 className="text-base font-bold text-slate-950">
                  Instalação
                </h4>
              </div>
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl bg-white text-sm font-bold text-primary"
                onClick={props.onInstallNuvemshop}
                disabled={props.isInstallingNuvemshop || !props.canPersist}
              >
                <CloudUpload className="mr-2 h-5 w-5" />
                {props.isInstallingNuvemshop
                  ? "Instalando..."
                  : "Instalar automaticamente na Nuvemshop"}
              </Button>
              <Button
                className="h-11 w-full rounded-xl text-sm font-bold"
                onClick={props.onCopyCode}
              >
                Copiar código manual
              </Button>
              <CodeBlock code={props.embedCode} />
            </section>
          </div>
        </aside>

        <PreviewPanel
          accent={props.launcherAccent}
          background={props.launcherBackground}
          font={props.launcherFont}
          label={props.launcherLabel}
          model={props.launcherModel}
          position={props.launcherPosition}
          size={props.launcherSize}
          sizeLabel={props.currentSizeLabel}
          textColor={props.launcherTextColor}
        />
      </div>
    </>
  );
}

function SectionDivider() {
  return <div className="-mx-6 border-t border-slate-100" />;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <Input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-16 w-16 shrink-0 rounded-xl border-0 p-1"
      />
      <span className="grid flex-1 gap-1">
        <span className="block text-sm font-semibold text-slate-500">
          {label}
        </span>
        <Input
          aria-label={`${label} hexadecimal`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 rounded-lg border-slate-200 bg-white font-mono text-sm font-semibold text-slate-950"
        />
      </span>
    </label>
  );
}

function AdvancedSwitch({
  checked,
  description,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
        <span className="text-sm font-semibold text-slate-600">{label}</span>
      </div>
      <p className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium leading-tight text-slate-500">
        {description}
      </p>
    </div>
  );
}

function PreviewPanel({
  accent,
  background,
  font,
  label,
  model,
  position,
  size,
  sizeLabel,
  textColor,
}: {
  accent: string;
  background: string;
  font: string;
  label: string;
  model: string;
  position: string;
  size: string;
  sizeLabel: string;
  textColor: string;
}) {
  const bubblePx = Math.max(60, Number(size) || 74);
  const isRight = position.includes("right");
  const isTop = position.includes("top");
  const isRectangular = model === "rectangular";
  const isSquare = model === "square";
  const previewShape = isRectangular
    ? "rounded-[22px]"
    : isSquare
      ? "rounded-[22px]"
      : "rounded-full";
  const launcherStyle: React.CSSProperties = {
    [isRight ? "right" : "left"]: "7%",
    [isTop ? "top" : "bottom"]: isTop ? "20%" : "45%",
    fontFamily: font,
  };

  return (
    <section className="min-h-[720px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-6">
        <div className="flex gap-3">
          <span className="h-3.5 w-3.5 rounded-full bg-[#d7514e]" />
          <span className="h-3.5 w-3.5 rounded-full bg-[#efcf4f]" />
          <span className="h-3.5 w-3.5 rounded-full bg-[#72db92]" />
        </div>
        <div className="flex items-center gap-3 text-base font-bold text-slate-950">
          Pré-visualização
          <Monitor className="h-5 w-5" />
        </div>
      </div>
      <div className="relative min-h-[640px] overflow-hidden bg-[#fbfbfb] p-8">
        <SkeletonStorefront />
        <div
          className="absolute z-10 flex items-center drop-shadow-[0_14px_22px_rgba(0,0,0,.22)]"
          style={launcherStyle}
        >
          <div
            className={cn(
              "relative shrink-0 overflow-hidden border-[4px] border-[#1e1e1e] bg-[#d7d2ce]",
              previewShape,
              model.includes("insta") &&
                "border-transparent bg-[linear-gradient(135deg,#ffb13b,#f33f86,#7b4dff)] p-[4px]",
            )}
            style={{
              width: isRectangular ? bubblePx * 1.35 : bubblePx,
              height: isRectangular ? bubblePx * 0.78 : bubblePx,
              boxShadow: `0 0 0 5px ${accent}`,
            }}
          >
            <div
              className={cn(
                "h-full w-full bg-[linear-gradient(135deg,#b9b1aa,#5d514d)] bg-cover bg-center",
                previewShape,
              )}
              style={{
                backgroundImage:
                  "linear-gradient(135deg, rgba(255,255,255,.12), rgba(0,0,0,.2)), radial-gradient(circle at 55% 34%, #d8c5b7 0 16%, transparent 17%), linear-gradient(120deg,#9e8d84,#2d2524)",
              }}
            />
          </div>
          <div
            className="-ml-1 min-w-[210px] rounded-r-lg px-6 py-3 text-sm font-bold uppercase tracking-normal"
            style={{ backgroundColor: accent, color: textColor }}
          >
            {label || "VIDEO DO PRODUTO"}
          </div>
        </div>
        <div className="absolute bottom-6 left-8 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm">
          {sizeLabel} ·{" "}
          {modelOptions.find((option) => option.value === model)?.label ??
            "Circular"}
        </div>
        <div className="absolute bottom-8 right-8 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#4cc231] text-white shadow-[0_18px_36px_rgba(36,135,60,.3)]">
          <MessageCircle className="h-9 w-9" />
        </div>
      </div>
    </section>
  );
}

function SkeletonStorefront() {
  return (
    <div className="pointer-events-none select-none">
      <div className="mb-7 flex items-start gap-8">
        <div className="h-[104px] w-[104px] rounded-full bg-[#f0f0f0]" />
        <div className="flex-1 pt-4">
          <div className="mb-9 h-10 w-1/2 rounded-lg bg-[#f0f0f0]" />
          <div className="h-10 w-28 rounded-lg bg-[#f0f0f0]" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-8">
        <div className="h-10 rounded-lg bg-[#f0f0f0]" />
        <div className="h-10 rounded-lg bg-[#f0f0f0]" />
        <div className="h-10 rounded-lg bg-[#f0f0f0]" />
        <div className="h-10 rounded-lg bg-[#f0f0f0]" />
      </div>
      <div className="mt-5 grid grid-cols-[1fr_180px] gap-8">
        <div className="space-y-5">
          <div className="h-10 rounded-lg bg-[#f0f0f0]" />
          <div className="h-10 w-3/4 rounded-lg bg-[#f0f0f0]" />
          <div className="h-10 rounded-lg bg-[#f0f0f0]" />
          <div className="mt-8 grid grid-cols-5 gap-8">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="h-64 rounded-lg bg-[#f2f2f2]">
                <div className="mx-auto mt-14 h-[88px] w-[88px] rounded-full bg-[#f7f7f7]" />
                <div className="mx-auto mt-10 h-8 w-1/2 rounded bg-[#f7f7f7]" />
              </div>
            ))}
          </div>
        </div>
        <div className="h-40 rounded-lg bg-[#f0f0f0]" />
      </div>
    </div>
  );
}
