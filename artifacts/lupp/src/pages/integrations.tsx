import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { IntegrationCard } from "@/components/shared/IntegrationCard";
import { mockIntegrations, Integration } from "@/data/mock";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStore } from "@/hooks/useStore";
import { integrationsService } from "@/services/integrations.service";
import { storesService } from "@/services/stores.service";
import {
  widgetsService,
  type NuvemshopScriptInstallResult,
  type WidgetBootstrapProbe,
} from "@/services/widgets.service";
import { env } from "@/lib/env";
import type { LuppStore } from "@/types/store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

function getProviderKey(integration: Integration) {
  const name = integration.name.toLowerCase();
  if (name === "up zero" || name === "upzero") return "upzero";
  if (name === "nuvemshop") return "nuvemshop";
  if (name === "shopify") return "shopify";
  return name;
}

function isActiveProviderKey(provider: string) {
  return provider === "nuvemshop" || provider === "upzero" || provider === "shopify";
}

function humanizeConnectionError(error: string) {
  if (
    error.includes("nuvemshop_store_already_connected_to_another_luup_store")
  ) {
    return "A Nuvemshop autorizou uma loja que já está conectada em outra conta Luup. Saia da conta errada na Nuvemshop ou escolha a loja correta antes de instalar novamente.";
  }

  if (error === "invalid_oauth_state") {
    return "A instalação expirou. Clique em Conectar novamente para abrir a tela de instalação da Nuvemshop.";
  }

  if (error === "nuvemshop_token_exchange_failed") {
    return "A Nuvemshop não concluiu a autorização. Tente instalar o app novamente na loja correta.";
  }

  if (error === "missing_shopify_shop_domain") {
    return "Informe no cadastro da loja o domínio myshopify.com antes de conectar a Shopify.";
  }

  if (error === "shopify_token_exchange_failed") {
    return "A Shopify não concluiu a autorização. Tente instalar o app novamente na loja correta.";
  }

  if (error === "invalid_shopify_hmac") {
    return "A Shopify retornou uma assinatura inválida para este fluxo. Para a OSANG, conecte pelo bloco de App personalizado usando o Admin API access token da loja.";
  }

  return error.replace(/_/g, " ");
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function normalizeShopifyShopDomain(value: string) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (!cleaned) return "";
  if (/^[a-z0-9][a-z0-9-]*$/.test(cleaned)) {
    return `${cleaned}.myshopify.com`;
  }
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    return cleaned;
  }
  return "";
}

function isOsangShopifyShop(value: string) {
  return normalizeShopifyShopDomain(value) === "osang-brasil.myshopify.com";
}

function isOsangStore(store: LuppStore | null | undefined) {
  if (!store) return false;
  const haystack = `${store.name || ""} ${store.slug || ""} ${store.url || ""}`.toLowerCase();
  return haystack.includes("osang");
}

function inferStoreNameFromUrl(value: string) {
  try {
    const hostname = new URL(normalizeUrl(value)).hostname.replace(
      /^www\./,
      "",
    );
    const [firstLabel] = hostname.split(".");
    if (!firstLabel) return "Loja UP Zero";
    return firstLabel
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "Loja UP Zero";
  }
}

function jsStringLiteral(value: string) {
  return JSON.stringify(value).replace(/<\/script/gi, "<\\/script");
}

function hasNuvemshopScriptInstalled(settings: unknown) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return false;
  }

  const scriptInstall = (settings as Record<string, unknown>).script_install;
  return Boolean(
    scriptInstall &&
      typeof scriptInstall === "object" &&
      !Array.isArray(scriptInstall) &&
      (scriptInstall as Record<string, unknown>).installed_at,
  );
}

type WidgetInstallCheck = {
  detail?: string;
  label: string;
  status: "ok" | "warning" | "error";
};

function describeBootstrapError(error: string | null) {
  if (error === "store_not_found") {
    return "A vitrine não consegue localizar esta loja na Luup. Sincronize os produtos ou confira a URL cadastrada nas configurações.";
  }
  if (error === "trial_expired") {
    return "O período de teste ou a assinatura expirou — o widget fica oculto até regularizar o billing.";
  }
  if (error === "no_active_widget") {
    return "Nenhum widget ativo configurado. Ative a bolinha na aba Widgets.";
  }
  return error ? error.replace(/_/g, " ") : null;
}

function buildWidgetInstallChecks(
  install: NuvemshopScriptInstallResult | null,
  probeById: WidgetBootstrapProbe | null,
  probeByDomain: WidgetBootstrapProbe | null,
  hasStoreUrl: boolean,
): WidgetInstallCheck[] {
  const checks: WidgetInstallCheck[] = [];

  if (install) {
    if (install.verified === true) {
      checks.push({
        detail: "Confirmado pela API da Nuvemshop.",
        label: "Script instalado na Nuvemshop",
        status: "ok",
      });
    } else if (install.pending_manual_install || install.installed === false) {
      checks.push({
        detail:
          install.message ||
          "A Nuvemshop não confirmou o script. Verifique a aprovação do app ou instale manualmente.",
        label: "Script instalado na Nuvemshop",
        status: "error",
      });
    } else {
      checks.push({
        detail:
          install.message ||
          install.warning?.replace(/_/g, " ") ||
          "Instalação registrada, mas sem confirmação da Nuvemshop.",
        label: "Script instalado na Nuvemshop",
        status: install.verified === false ? "warning" : "ok",
      });
    }
  } else {
    checks.push({
      detail: "A instalação falhou. Veja a mensagem de erro acima.",
      label: "Script instalado na Nuvemshop",
      status: "error",
    });
  }

  if (probeById) {
    if (probeById.active) {
      checks.push({
        detail: "Loja ativa, billing em dia e widget configurado.",
        label: "Widget liberado para a loja",
        status: "ok",
      });
    } else {
      checks.push({
        detail:
          describeBootstrapError(probeById.error) ||
          "A vitrine não recebeu um widget ativo para esta loja.",
        label: "Widget liberado para a loja",
        status: probeById.error === "no_active_widget" ? "warning" : "error",
      });
    }
  }

  if (hasStoreUrl) {
    if (probeByDomain?.active) {
      checks.push({
        detail: `Domínio resolvido pela vitrine (via ${probeByDomain.resolvedBy || "domínio"}).`,
        label: "Loja localizável pelo domínio",
        status: "ok",
      });
    } else if (probeByDomain) {
      checks.push({
        detail:
          probeByDomain.error === "store_not_found"
            ? "O domínio da loja não resolve para a Luup — rode uma sincronização de produtos ou confira a URL cadastrada."
            : describeBootstrapError(probeByDomain.error) ||
              "Falha ao consultar a vitrine pelo domínio.",
        label: "Loja localizável pelo domínio",
        status: "error",
      });
    }
  } else {
    checks.push({
      detail:
        "Cadastre a URL da loja nas configurações para a vitrine localizar a loja pelo domínio.",
      label: "Loja localizável pelo domínio",
      status: "warning",
    });
  }

  const carouselReason =
    probeById?.carouselDisabledReason || probeByDomain?.carouselDisabledReason;
  if (carouselReason === "plan_widget_limit") {
    checks.push({
      detail:
        "O plano atual não inclui o carrossel horizontal (disponível a partir do Growth).",
      label: "Carrossel horizontal",
      status: "warning",
    });
  } else if (carouselReason) {
    checks.push({
      detail: "Carrossel desativado nas configurações do widget.",
      label: "Carrossel horizontal",
      status: "warning",
    });
  } else if (probeById?.active) {
    checks.push({
      detail: "Liberado para renderizar quando configurado.",
      label: "Carrossel horizontal",
      status: "ok",
    });
  }

  return checks;
}

function isShopifyCustomManualSettings(settings: unknown) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return false;
  }

  const value = settings as Record<string, unknown>;
  return value.connected_via === "custom_app_manual";
}

function getManualSnippet(store: LuppStore | null) {
  const storeId = store?.id || "id-da-loja";
  const storeSlug = store?.slug || "sua-loja";
  const storeName = store?.name || "Sua loja";
  const storeUrl = store?.url || "https://sualoja.com.br";

  return `<script>
(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = ${jsStringLiteral(env.widgetCdnUrl)};

  s.setAttribute('data-store-id', ${jsStringLiteral(storeId)});
  s.setAttribute('data-store', ${jsStringLiteral(storeSlug)});
  s.setAttribute('data-store-name', ${jsStringLiteral(storeName)});
  s.setAttribute('data-store-url', ${jsStringLiteral(storeUrl)});
  s.setAttribute('data-widget', 'floating_launcher');
  s.setAttribute('data-lupp-url', ${jsStringLiteral(env.appUrl)});
  s.setAttribute('data-require-active', 'true');

  var firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(s, firstScript);
})();
</script>`;
}

export default function Integrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { session, loading: authLoading } = useAuth();
  const storesQuery = useCurrentStore();
  const { store } = storesQuery;
  const [connectingProvider, setConnectingProvider] = React.useState<
    string | null
  >(null);
  const [syncingProvider, setSyncingProvider] = React.useState<string | null>(
    null,
  );
  const [installingWidgetProvider, setInstallingWidgetProvider] =
    React.useState<string | null>(null);
  const [widgetInstallChecks, setWidgetInstallChecks] = React.useState<
    WidgetInstallCheck[] | null
  >(null);
  const [upzeroDialogOpen, setUpzeroDialogOpen] = React.useState(false);
  const [shopifyDialogOpen, setShopifyDialogOpen] = React.useState(false);
  const [shopifyShopDomain, setShopifyShopDomain] = React.useState("");
  const [shopifyCustomToken, setShopifyCustomToken] = React.useState("");
  const [shopifyClientId, setShopifyClientId] = React.useState("");
  const [shopifyClientSecret, setShopifyClientSecret] = React.useState("");
  const [upzeroApiKey, setUpzeroApiKey] = React.useState("");
  const [upzeroBaseUrl, setUpzeroBaseUrl] = React.useState(
    "https://api.upzero.com.br",
  );
  const [upzeroIntegrationName, setUpzeroIntegrationName] = React.useState("");
  const [upzeroStorefrontUrl, setUpzeroStorefrontUrl] = React.useState("");
  const [upzeroProductUrlPattern, setUpzeroProductUrlPattern] = React.useState(
    "/produtos/{code}-{name_slug}",
  );
  const [pendingConnectedProvider, setPendingConnectedProvider] =
    React.useState(() => {
      return new URLSearchParams(window.location.search).get("connected");
    });
  const connectIntentHandledRef = React.useRef(false);
  const integrationsQuery = useQuery({
    queryKey: ["integrations", store?.id],
    queryFn: () => integrationsService.listIntegrations(store!.id),
    enabled: Boolean(store?.id),
  });
  const manualSnippet = React.useMemo(
    () => getManualSnippet(store ?? null),
    [store?.slug, store?.name, store?.url],
  );
  const activeProviders = new Set(
    (integrationsQuery.data ?? [])
      .filter((integration) => integration.status === "active")
      .map((integration) => integration.provider),
  );
  const nuvemshopIntegration = (integrationsQuery.data ?? []).find(
    (integration) =>
      integration.provider === "nuvemshop" && integration.status === "active",
  );
  const shopifyIntegration = (integrationsQuery.data ?? []).find(
    (integration) =>
      integration.provider === "shopify" && integration.status === "active",
  );
  const isNuvemshopWidgetInstalled = hasNuvemshopScriptInstalled(
    nuvemshopIntegration?.settings,
  );
  const shouldUseOsangCustomApp =
    isOsangStore(store) || isOsangShopifyShop(shopifyShopDomain);
  const isShopifyManualMode =
    isShopifyCustomManualSettings(shopifyIntegration?.settings);
  const showShopifyCustomApp = isShopifyManualMode || shouldUseOsangCustomApp;

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = pendingConnectedProvider || params.get("connected");
    const error = params.get("error");

    if (connected === "nuvemshop" || connected === "shopify") {
      const providerName = connected === "shopify" ? "Shopify" : "Nuvemshop";
      toast({
        title: `${providerName} conectada`,
        description:
          connected === "shopify"
            ? "Vamos sincronizar produtos automaticamente."
            : "Vamos sincronizar produtos e ativar o widget automaticamente.",
      });
      void integrationsQuery.refetch();
      return;
    }

    if (error) {
      toast({
        title: "Falha ao conectar integração",
        description: humanizeConnectionError(error),
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [pendingConnectedProvider]);

  React.useEffect(() => {
    if (!store?.url || upzeroStorefrontUrl) return;
    setUpzeroStorefrontUrl(store.url);
  }, [store?.url, upzeroStorefrontUrl]);

  React.useEffect(() => {
    if (shopifyShopDomain) return;
    if (isOsangStore(store)) {
      setShopifyShopDomain("osang-brasil.myshopify.com");
      return;
    }
    if (!store?.url) return;
    const inferredShop = normalizeShopifyShopDomain(store.url);
    if (inferredShop) setShopifyShopDomain(inferredShop);
  }, [store, store?.url, shopifyShopDomain]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      !["nuvemshop", "shopify"].includes(
        pendingConnectedProvider || params.get("connected") || "",
      ) ||
      !store?.id
    )
      return;
    const connectedProvider = pendingConnectedProvider || params.get("connected");

    let cancelled = false;
    const finishConnectedSetup = async () => {
      try {
        const syncResult =
          connectedProvider === "shopify"
            ? await integrationsService.syncShopifyProducts(store.id)
            : await integrationsService.syncNuvemshopProducts(store.id);
        await queryClient.invalidateQueries({
          queryKey: ["products", store.id],
        });
        await integrationsQuery.refetch();

        if (connectedProvider === "shopify") {
          await widgetsService.ensureFloatingWidgetForProductPage(store.id);
          await queryClient.invalidateQueries({
            queryKey: ["widgets", store.id],
          });
          if (!cancelled) {
            toast({
              title: "Shopify pronta",
              description: `${syncResult.count ?? 0} produtos sincronizados e bolinha ativada.`,
            });
          }
        } else {
          try {
            await widgetsService.installNuvemshopScript(store.id);
            if (!cancelled) {
              toast({
                title: "Nuvemshop pronta",
                description: `${syncResult.count ?? 0} produtos sincronizados e widget instalado na loja.`,
              });
            }
          } catch (installError) {
            if (!cancelled) {
              toast({
                title: "Produtos sincronizados",
                description: `${syncResult.count ?? 0} produtos importados. Instalação automática do widget requer permissão de scripts na Nuvemshop.`,
              });
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          const providerName = connectedProvider === "shopify" ? "Shopify" : "Nuvemshop";
          toast({
            title: `${providerName} conectada`,
            description:
              error instanceof Error
                ? `Conectou, mas o sync automático falhou: ${error.message}`
                : "Conectou, mas o sync automático falhou.",
          });
        }
      } finally {
        if (!cancelled) {
          setPendingConnectedProvider(null);
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
    };

    void finishConnectedSetup();
    return () => {
      cancelled = true;
    };
  }, [pendingConnectedProvider, store?.id]);

  const handleConfigure = async (integration: Integration) => {
    const provider = getProviderKey(integration);

    if (!isActiveProviderKey(provider)) {
      toast({
        title: "Em breve",
        description: `${integration.name} ainda não está disponível para conexão.`,
      });
      return;
    }

    if (provider === "upzero") {
      setUpzeroDialogOpen(true);
      return;
    }

    if (provider === "shopify") {
      setShopifyDialogOpen(true);
      return;
    }

    if (!store) {
      toast({
        title: "Crie uma loja primeiro",
        description: "A integração precisa estar associada a uma loja Luup.",
      });
      return;
    }

    if (authLoading) {
      toast({
        title: "Aguarde a sessão carregar",
        description:
          "Vamos iniciar a conexão com a Nuvemshop em alguns segundos.",
      });
      return;
    }

    if (!session?.access_token) {
      toast({
        title: "Faça login novamente",
        description:
          "A conexão com a Nuvemshop precisa de uma sessão real.",
      });
      setLocation("/login");
      return;
    }

    try {
      setConnectingProvider(provider);
      const authorizeUrl = await integrationsService.createNuvemshopAuthorizeUrl(
        store.id,
      );
      window.location.assign(authorizeUrl);
    } catch (error) {
      toast({
        title: "Não foi possível conectar a Nuvemshop",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  React.useEffect(() => {
    if (connectIntentHandledRef.current || !store?.id || authLoading) return;
    const params = new URLSearchParams(window.location.search);
    const connectProvider = params.get("connect");
    if (!connectProvider) return;

    connectIntentHandledRef.current = true;
    window.history.replaceState({}, "", window.location.pathname);

    if (connectProvider === "upzero") {
      setUpzeroDialogOpen(true);
      return;
    }

    if (connectProvider === "shopify") {
      setShopifyDialogOpen(true);
      return;
    }

    const integration = mockIntegrations.find(
      (item) => getProviderKey(item) === connectProvider,
    );
    if (integration && connectProvider === "nuvemshop") {
      void handleConfigure(integration);
    }
  }, [authLoading, session?.access_token, store?.id]);

  const handleConnectShopify = async () => {
    if (!store) {
      toast({
        title: "Crie uma loja primeiro",
        description: "A Shopify precisa estar associada a uma loja Luup.",
      });
      return;
    }

    if (authLoading) {
      toast({
        title: "Aguarde a sessão carregar",
        description: "Vamos iniciar a conexão com a Shopify em alguns segundos.",
      });
      return;
    }

    if (!session?.access_token) {
      toast({
        title: "Faça login novamente",
        description:
          "A conexão com a Shopify precisa de uma sessão real.",
      });
      setLocation("/login");
      return;
    }

    const shop = normalizeShopifyShopDomain(shopifyShopDomain);
    if (!shop) {
      toast({
        title: "Informe o domínio myshopify.com",
        description:
          "Use o domínio interno da loja, por exemplo: sualoja.myshopify.com.",
      });
      return;
    }

    try {
      setConnectingProvider("shopify");
      const authorizeUrl = await integrationsService.createShopifyAuthorizeUrl(
        store.id,
        shop,
      );
      window.location.assign(authorizeUrl);
    } catch (error) {
      toast({
        title: "Não foi possível conectar a Shopify",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleConnectShopifyCustomApp = async () => {
    if (!store) {
      toast({
        title: "Crie uma loja primeiro",
        description: "A Shopify precisa estar associada a uma loja Luup.",
      });
      return;
    }

    if (!session?.access_token) {
      toast({
        title: "Faça login novamente",
        description:
          "A conexão manual da Shopify precisa de uma sessão real.",
      });
      setLocation("/login");
      return;
    }

    const shop = normalizeShopifyShopDomain(shopifyShopDomain);
    if (!shop) {
      toast({
        title: "Informe o domínio myshopify.com",
        description:
          "Use o domínio interno da loja, por exemplo: osang-brasil.myshopify.com.",
      });
      return;
    }

    const accessToken = shopifyCustomToken.trim();
    const clientId = shopifyClientId.trim();
    const clientSecret = shopifyClientSecret.trim();
    if (!accessToken && (!clientId || !clientSecret)) {
      toast({
        title: "Informe as credenciais da Shopify",
        description:
          "Cole o Admin API access token ou preencha Client ID e Client Secret.",
      });
      return;
    }

    try {
      setConnectingProvider("shopify-custom");
      const connection = await integrationsService.connectShopifyCustomApp(
        store.id,
        { accessToken, clientId, clientSecret, shop },
      );
      const syncResult = await integrationsService.syncShopifyProducts(store.id);
      await widgetsService.ensureFloatingWidgetForProductPage(store.id);
      await queryClient.invalidateQueries({
        queryKey: ["products", store.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["widgets", store.id],
      });
      await integrationsQuery.refetch();
      setShopifyCustomToken("");
      setShopifyClientId("");
      setShopifyClientSecret("");
      setShopifyDialogOpen(false);
      toast({
        title: "Shopify conectada por app personalizado",
        description: `${connection.shop_name || connection.shop_domain}: ${syncResult.count ?? 0} produtos sincronizados.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível conectar o app personalizado",
        description:
          error instanceof Error
            ? error.message
            : "Confira o domínio e o Admin API token da Shopify.",
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleConnectUpzero = async () => {
    if (!authLoading && !session) {
      toast({
        title: "Faça login novamente",
        description:
          "A conexão com a UP Zero precisa de uma sessão real.",
      });
      setLocation("/login");
      return;
    }

    if (!session?.user?.id) {
      toast({
        title: "Aguarde a sessão carregar",
        description:
          "Tente novamente em alguns segundos para associar a integração à sua loja.",
      });
      return;
    }

    if (!upzeroApiKey.trim()) {
      toast({ title: "Informe a API key da UP Zero." });
      return;
    }

    try {
      setConnectingProvider("upzero");
      let targetStore: LuppStore | null = store;

      if (!targetStore) {
        const refreshedStores = await storesQuery.refetch();
        targetStore = refreshedStores.data?.[0] ?? null;
      }

      if (!targetStore) {
        const storefrontUrl = normalizeUrl(upzeroStorefrontUrl.trim());
        targetStore = await storesService.createStoreWithDefaults({
          name: inferStoreNameFromUrl(storefrontUrl),
          url: storefrontUrl || undefined,
          platform: "upzero",
          segment: "moda",
        });
        await queryClient.invalidateQueries({
          queryKey: ["stores", session.user.id],
        });
        toast({
          title: "Loja Luup criada",
          description:
            "Criamos a loja automaticamente para associar a integração UP Zero.",
        });
      }

      const storefrontUrl = normalizeUrl(
        upzeroStorefrontUrl.trim() || targetStore.url || "",
      );
      const result = await integrationsService.connectUpzero(targetStore.id, {
        apiKey: upzeroApiKey.trim(),
        baseUrl: upzeroBaseUrl.trim() || "https://api.upzero.com.br",
        integrationName: upzeroIntegrationName.trim(),
        productUrlPattern:
          upzeroProductUrlPattern.trim() || "/produtos/{code}-{name_slug}",
        storefrontUrl,
      });
      const syncResult = await integrationsService.syncUpzeroProducts(
        targetStore.id,
      );
      setUpzeroApiKey("");
      setUpzeroDialogOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["integrations", targetStore.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["products", targetStore.id],
      });
      await integrationsQuery.refetch();
      toast({
        title: "UP Zero pronta para vídeos",
        description: `Conexão validada e ${syncResult.count ?? result.products_previewed ?? 0} produto(s) sincronizados automaticamente.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível conectar a UP Zero",
        description:
          error instanceof Error
            ? error.message
            : "Confira a API key e tente novamente.",
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleSync = async (integration: Integration) => {
    const provider = getProviderKey(integration);
    if (!store) return;

    try {
      setSyncingProvider(provider);
      const result =
        provider === "upzero"
          ? await integrationsService.syncUpzeroProducts(store.id)
          : provider === "nuvemshop"
            ? await integrationsService.syncNuvemshopProducts(store.id)
            : provider === "shopify"
              ? await integrationsService.syncShopifyProducts(store.id)
            : null;
      if (!result) return;
      if (provider === "shopify") {
        await widgetsService.ensureFloatingWidgetForProductPage(store.id);
        await queryClient.invalidateQueries({
          queryKey: ["widgets", store.id],
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["products", store.id] });
      await integrationsQuery.refetch();
      toast({
        title: "Produtos sincronizados",
        description:
          provider === "shopify"
            ? `${result.count ?? 0} produtos importados ou atualizados de ${integration.name}. Bolinha ativada.`
            : `${result.count ?? 0} produtos importados ou atualizados de ${integration.name}.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível sincronizar",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    } finally {
      setSyncingProvider(null);
    }
  };

  const runWidgetInstallProbes = async (
    installResult: NuvemshopScriptInstallResult | null,
  ) => {
    if (!store) return;
    const [probeById, probeByDomain] = await Promise.all([
      widgetsService
        .probeWidgetBootstrap({ storeId: store.id })
        .catch(() => null),
      store.url
        ? widgetsService
            .probeWidgetBootstrap({
              provider: "nuvemshop",
              storeDomain: store.url,
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    setWidgetInstallChecks(
      buildWidgetInstallChecks(
        installResult,
        probeById,
        probeByDomain,
        Boolean(store.url),
      ),
    );
  };

  const handleInstallWidget = async (integration: Integration) => {
    const provider = getProviderKey(integration);
    if (!store || provider !== "nuvemshop") return;

    try {
      setInstallingWidgetProvider(provider);
      await widgetsService.ensureFloatingWidgetForProductPage(store.id);
      const installResult = await widgetsService.installNuvemshopScript(
        store.id,
      );
      await queryClient.invalidateQueries({
        queryKey: ["widgets", store.id],
      });
      await integrationsQuery.refetch();
      await runWidgetInstallProbes(installResult);
      if (installResult.verified === false || installResult.pending_manual_install) {
        toast({
          title: "Widget instalado, aguardando confirmação",
          description:
            installResult.message ||
            "A Nuvemshop ainda não confirmou o script ativo. Confira o status detalhado abaixo dos cards.",
        });
      } else {
        toast({
          title: "Widget instalado na Nuvemshop",
          description:
            "Instalação confirmada. Confira o status detalhado abaixo dos cards de integração.",
        });
      }
    } catch (error) {
      await runWidgetInstallProbes(null).catch(() => undefined);
      toast({
        title: "Não foi possível instalar o widget",
        description:
          error instanceof Error
            ? error.message
            : "Confira se o app da Nuvemshop tem permissão de scripts.",
      });
    } finally {
      setInstallingWidgetProvider(null);
    }
  };

  return (
    <AppLayout title="Integrações">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">
          Plataformas e Integrações
        </h2>
        <p className="text-muted-foreground mt-1">
          Conecte a Lupp à sua loja virtual e ferramentas de analytics.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {mockIntegrations.map((integration) => {
              const normalizedProvider = getProviderKey(integration);
              const isProviderActive = isActiveProviderKey(normalizedProvider);
              const normalizedIntegration = isProviderActive
                ? integration
                : { ...integration, status: "em breve" as const };
              const isConnected =
                isProviderActive && activeProviders.has(normalizedProvider);
              const displayIntegration = isConnected
                ? {
                    ...normalizedIntegration,
                    description: `${normalizedIntegration.description} Conectada.`,
                  }
                : normalizedIntegration;
              return (
                <IntegrationCard
                  key={integration.id}
                  integration={displayIntegration}
                  isConnected={isConnected}
                  isConfiguring={connectingProvider === normalizedProvider}
                  isInstallingWidget={
                    installingWidgetProvider === normalizedProvider
                  }
                  isSyncing={syncingProvider === normalizedProvider}
                  widgetInstalled={
                    normalizedProvider === "nuvemshop" &&
                    isNuvemshopWidgetInstalled
                  }
                  onConfigure={handleConfigure}
                  onInstallWidget={
                    normalizedProvider === "nuvemshop"
                      ? handleInstallWidget
                      : undefined
                  }
                  onSync={handleSync}
                />
              );
            })}
          </div>

          {widgetInstallChecks && (
            <Card className="mt-6 border-slate-200 bg-white text-slate-950 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-slate-950">
                  Status do widget na vitrine
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  {widgetInstallChecks.map((check) => (
                    <li key={check.label} className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className={
                          check.status === "ok"
                            ? "mt-0.5 text-emerald-600"
                            : check.status === "warning"
                              ? "mt-0.5 text-amber-500"
                              : "mt-0.5 text-red-600"
                        }
                      >
                        ●
                      </span>
                      <div>
                        <p className="font-medium text-slate-950">
                          {check.label}
                        </p>
                        {check.detail && (
                          <p className="mt-0.5 text-slate-500">
                            {check.detail}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Card className="sticky top-24 border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-950">
                Instalação Manual
              </CardTitle>
            </CardHeader>
            <CardContent>
              {store && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-950">{store.name}</p>
                  <p className="mt-1 truncate text-slate-500">
                    {store.url || "URL da loja ainda não cadastrada"}
                  </p>
                </div>
              )}
              <p className="mb-4 text-sm leading-relaxed text-slate-600">
                Se a sua plataforma não permitir instalação automática, insira
                este script antes do fechamento da tag{" "}
                <code>&lt;/head&gt;</code> ou <code>&lt;/body&gt;</code>. Ele é
                gerado com os dados da loja selecionada.
              </p>

              <CodeBlock code={manualSnippet} />

              <div className="mt-6 space-y-4 text-sm">
                <h4 className="font-semibold text-slate-950">
                  Próximos passos:
                </h4>
                <ol className="list-decimal space-y-2 pl-4 text-slate-600">
                  <li>Copie o código acima</li>
                  <li>
                    Cole antes do fechamento da tag <code>&lt;/head&gt;</code>
                  </li>
                  <li>Salve e publique sua loja</li>
                  <li>Verifique se o widget aparece</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={shopifyDialogOpen} onOpenChange={setShopifyDialogOpen}>
        <DialogContent className="border-slate-200 bg-white text-slate-950 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {showShopifyCustomApp
                ? "Conectar Shopify por token"
                : "Conectar Shopify"}
            </DialogTitle>
            <DialogDescription>
              {showShopifyCustomApp
                ? "Use o Admin API access token do app personalizado para sincronizar produtos sem alterar o app público em revisão."
                : "Informe o domínio interno da loja para abrir a instalação oficial do app na Shopify. Para a OSANG, use osang-brasil.myshopify.com."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="shopify-shop-domain">
                Domínio myshopify.com
              </Label>
              <Input
                id="shopify-shop-domain"
                placeholder="sualoja.myshopify.com"
                value={shopifyShopDomain}
                onChange={(event) =>
                  setShopifyShopDomain(event.target.value)
                }
              />
            </div>
            {!showShopifyCustomApp && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm leading-relaxed text-blue-900">
                A Luup vai redirecionar para a Shopify. Depois que o lojista
                aprovar o app, a Shopify retorna para a Luup com os dados de
                autorização para sincronizar produtos e ativar carrinho.
              </div>
            )}

            {showShopifyCustomApp && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-slate-950">
                    App personalizado Shopify
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Use Client ID e Client Secret do app personalizado. Se
                    você já tiver um Admin API access token antigo, também pode
                    usar o campo opcional abaixo.
                  </p>
                </div>
                <div className="grid gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="shopify-client-id">Client ID</Label>
                    <Input
                      id="shopify-client-id"
                      placeholder="Client ID do app personalizado"
                      value={shopifyClientId}
                      onChange={(event) =>
                        setShopifyClientId(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shopify-client-secret">
                      Client Secret
                    </Label>
                    <Input
                      id="shopify-client-secret"
                      type="password"
                      placeholder="Client Secret do app personalizado"
                      value={shopifyClientSecret}
                      onChange={(event) =>
                        setShopifyClientSecret(event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="shopify-custom-token">
                    Admin API access token opcional
                  </Label>
                  <Input
                    id="shopify-custom-token"
                    type="password"
                    placeholder="shpat_..."
                    value={shopifyCustomToken}
                    onChange={(event) =>
                      setShopifyCustomToken(event.target.value)
                    }
                  />
                </div>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  onClick={handleConnectShopifyCustomApp}
                  disabled={connectingProvider === "shopify-custom"}
                >
                  {connectingProvider === "shopify-custom"
                    ? "Conectando OSANG..."
                    : "Conectar app personalizado"}
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShopifyDialogOpen(false)}
              disabled={
                connectingProvider === "shopify" ||
                connectingProvider === "shopify-custom"
              }
            >
              Cancelar
            </Button>
            {showShopifyCustomApp ? (
              <Button
                onClick={handleConnectShopifyCustomApp}
                disabled={connectingProvider === "shopify-custom"}
              >
                {connectingProvider === "shopify-custom"
                  ? "Conectando Shopify..."
                  : "Salvar conexão por token"}
              </Button>
            ) : (
              <Button
                onClick={handleConnectShopify}
                disabled={
                  connectingProvider === "shopify" ||
                  connectingProvider === "shopify-custom"
                }
              >
                {connectingProvider === "shopify"
                  ? "Abrindo Shopify..."
                  : "Instalar app na Shopify"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={upzeroDialogOpen} onOpenChange={setUpzeroDialogOpen}>
        <DialogContent className="border-slate-200 bg-white text-slate-950 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Conectar UP Zero</DialogTitle>
            <DialogDescription>
              Insira a API key da loja para validar a conexão e permitir a
              sincronização de produtos no Luup.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="upzero-api-key">API key</Label>
              <Input
                id="upzero-api-key"
                type="password"
                placeholder="Cole a chave X-API-Key da UP Zero"
                value={upzeroApiKey}
                onChange={(event) => setUpzeroApiKey(event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="upzero-base-url">URL da API</Label>
                <Input
                  id="upzero-base-url"
                  placeholder="https://api.upzero.com.br"
                  value={upzeroBaseUrl}
                  onChange={(event) => setUpzeroBaseUrl(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="upzero-integration">Integração/source</Label>
                <Input
                  id="upzero-integration"
                  placeholder="Opcional: bling, tiny, custom_erp"
                  value={upzeroIntegrationName}
                  onChange={(event) =>
                    setUpzeroIntegrationName(event.target.value)
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="upzero-storefront">URL pública da loja</Label>
                <Input
                  id="upzero-storefront"
                  placeholder="https://sualoja.com.br"
                  value={upzeroStorefrontUrl}
                  onChange={(event) =>
                    setUpzeroStorefrontUrl(event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="upzero-product-pattern">
                  Padrão de URL do produto
                </Label>
                <Input
                  id="upzero-product-pattern"
                  placeholder="/produtos/{code}-{name_slug}"
                  value={upzeroProductUrlPattern}
                  onChange={(event) =>
                    setUpzeroProductUrlPattern(event.target.value)
                  }
                />
              </div>
            </div>
            <p className="text-sm text-slate-500">
              O sync usa a Storefront API da UP Zero para trazer produtos,
              imagens e preços. A URL pública é usada pelo botão Comprar agora
              no feed.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUpzeroDialogOpen(false)}
              disabled={connectingProvider === "upzero"}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConnectUpzero}
              disabled={connectingProvider === "upzero"}
            >
              {connectingProvider === "upzero"
                ? "Conectando..."
                : "Conectar e testar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
