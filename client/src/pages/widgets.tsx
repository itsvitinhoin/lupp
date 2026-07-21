import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
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
import { FloatingEditor } from "./widgets/FloatingEditor";
import { HorizontalFeedEditor } from "./widgets/HorizontalFeedEditor";
import {
  Overview,
  overviewCards,
  type WidgetOverviewCard,
  type WidgetView,
} from "./widgets/Overview";
import { asSettings, useWidgetSettingsForm } from "./widgets/useWidgetSettingsForm";
import { buildWidgetEmbedCode } from "@/lib/widget-embed";

export default function Widgets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { store } = useCurrentStore();
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
    <AppLayout title="Widgets">
      <div className="space-y-6 text-foreground">
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
            canPersist={Boolean(floatingWidget && store)}
            embedCode={getEmbedCode()}
            form={form}
            isInstallingNuvemshop={isInstallingNuvemshop}
            isSavingSettings={isSavingSettings}
            storeSlug={store?.slug}
            onBack={() => setView("overview")}
            onCopyCode={() => void handleCopyCode()}
            onInstallNuvemshop={() => void handleInstallNuvemshopScript()}
            onSave={() => void handleSaveLauncherSettings()}
            setField={setField}
          />
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
    </AppLayout>
  );
}
