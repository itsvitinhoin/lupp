import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCurrentStore } from "@/hooks/useStore";
import { widgetsService } from "@/services/widgets.service";
import { env, isApiConfigured } from "@/lib/env";
import {
  PLAN_LIMITS,
  normalizeLuupPlanId,
  planAllowsHorizontalFeed,
} from "@/lib/constants";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { FloatingEditor } from "./widgets/FloatingEditor";
import { HorizontalFeedEditor } from "./widgets/HorizontalFeedEditor";
import { FeedManager } from "./feed";
import {
  Overview,
  overviewCards,
  type WidgetOverviewCard,
  type WidgetView,
} from "./widgets/Overview";
import { asSettings, useWidgetSettingsForm } from "./widgets/useWidgetSettingsForm";
import { buildWidgetEmbedCode } from "@/lib/widget-embed";

type WidgetsManagerStore = {
  id: string;
  slug?: string | null;
  plan_id?: string | null;
};

/**
 * All of /app/widgets' actual editing logic, parameterized by store instead
 * of always reading useCurrentStore() — reused as-is by the admin console's
 * per-store "Widget & Feed" tab (client/src/pages/admin/store/widgets-tab.tsx)
 * so an admin gets the identical rich editor for an arbitrary store, not a
 * separate reimplementation that could drift from this one.
 */
export function WidgetsManager({ store }: { store: WidgetsManagerStore | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = React.useState<WidgetView>("overview");
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

  const { form, setField, buildLauncherSettings } = useWidgetSettingsForm({
    floatingWidget,
    canUseHorizontalFeed,
  });

  const activeWidgetCount =
    (floatingWidget?.status === "active" ? 1 : 0) +
    (form.carouselEnabled && canUseHorizontalFeed ? 1 : 0);
  const launcherWidget = {
    id: "floating-launcher",
    name: "Bolinha flutuante",
    status: "ativo",
    type: "floating_launcher",
  };

  const handleCarouselEnabledChange = (enabled: boolean) => {
    if (enabled && !canUseHorizontalFeed) {
      toast({
        title: "Upgrade necessário",
        description:
          "O plano Start permite 1 widget ativo. Para usar bolinha flutuante e Feed Horizontal juntos, altere para o Growth ou superior.",
      });
      return;
    }
    setField("carouselEnabled", enabled);
  };

  const getEmbedCode = () =>
    buildWidgetEmbedCode({
      store,
      widgetType: launcherWidget.type,
      commentLines: [
        "Apenas identidade: aparência, exibição e carrossel vêm das configurações",
        "salvas neste painel, resolvidas pelo servidor a cada página. Atributos",
        "extras no snippet SOBRESCREVEM o painel — não adicione a menos que queira",
        "fixar um valor para sempre.",
      ],
    });

  const getHomeCarouselEmbedCode = () =>
    buildWidgetEmbedCode({
      store,
      widgetType: "home_carousel",
      commentLines: [
        "Apenas identidade: título, textos e limites do carrossel vêm das",
        "configurações salvas neste painel, resolvidas pelo servidor.",
      ],
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
      if (form.carouselEnabled && !canUseHorizontalFeed) {
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
    if (card.id === "vertical-feed") {
      setView("vertical-feed");
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

  return (
    <div className="space-y-6 text-foreground">
      {view === "overview" ? (
        <Overview
          cards={overviewCards}
          canUseHorizontalFeed={canUseHorizontalFeed}
          currentPlanName={currentPlan.name}
          isConnected={Boolean(floatingWidget)}
          onOpenCard={handleOpenCard}
          storeSlug={store?.slug ?? undefined}
        />
      ) : view === "floating" ? (
        <FloatingEditor
          canPersist={Boolean(floatingWidget && store)}
          embedCode={getEmbedCode()}
          form={form}
          isInstallingNuvemshop={isInstallingNuvemshop}
          isSavingSettings={isSavingSettings}
          storeSlug={store?.slug ?? undefined}
          onBack={() => setView("overview")}
          onCopyCode={() => void handleCopyCode()}
          onInstallNuvemshop={() => void handleInstallNuvemshopScript()}
          onSave={() => void handleSaveLauncherSettings()}
          setField={setField}
        />
      ) : view === "vertical-feed" ? (
        <div>
          <div className="mb-6 flex items-center gap-4">
            <Button
              onClick={() => setView("overview")}
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl text-foreground/80 hover:bg-card"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
                Feed Vertical
              </h2>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Vídeos em tela cheia com curtidas, comentários e compra direto pelo vídeo.
              </p>
            </div>
          </div>
          <FeedManager store={store} />
        </div>
      ) : (
        <HorizontalFeedEditor
          activeWidgetCount={activeWidgetCount}
          canPersist={Boolean(floatingWidget && store)}
          currentPlanName={currentPlan.name}
          embedCode={getHomeCarouselEmbedCode()}
          form={form}
          isLockedByPlan={!canUseHorizontalFeed}
          isSavingSettings={isSavingSettings}
          requiredPlanName={PLAN_LIMITS.growth.name}
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
          setCarouselEnabled={handleCarouselEnabledChange}
          setField={setField}
        />
      )}
    </div>
  );
}

export default function Widgets() {
  const { store } = useCurrentStore();
  return (
    <AppLayout title="Widgets">
      <WidgetsManager store={store} />
    </AppLayout>
  );
}
