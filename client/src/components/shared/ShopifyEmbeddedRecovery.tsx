import { AlertCircle, ExternalLink, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LuppLogo } from "@/components/shared/LuppLogo";
import {
  getPersistedLaunchParams,
  getShopifyEmbeddedError,
  openShopifyUrl,
} from "@/lib/shopify-embedded";

type ShopifyEmbeddedRecoveryProps = {
  connecting?: boolean;
  error?: unknown;
};

function supportMessage(code?: string, connecting?: boolean) {
  if (connecting) {
    return "Estamos abrindo o painel da Luup dentro da Shopify.";
  }

  if (code === "shopify_oauth_required") {
    return "Autorize o app para conectar a loja e abrir o painel.";
  }

  if (code === "shopify_session_token_missing") {
    return "A Shopify ainda nao liberou a sessao embedded para esta janela.";
  }

  return "Nao foi possivel concluir a conexao automaticamente nesta tentativa.";
}

export function ShopifyEmbeddedRecovery({ connecting = false, error }: ShopifyEmbeddedRecoveryProps) {
  const details = getShopifyEmbeddedError(error);
  const launchParams = getPersistedLaunchParams();
  const shop = details?.shop || launchParams.shop || "sua loja Shopify";
  const hasAuthorizeUrl = Boolean(details?.authorizeUrl);
  const standaloneUrl = `/login?shopify_standalone=1${
    shop && shop !== "sua loja Shopify"
      ? `&shop_domain=${encodeURIComponent(shop)}`
      : ""
  }`;

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-950 flex items-center justify-center p-6">
      <Card className="w-full max-w-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <LuppLogo />
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Shopify
            </span>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl">Conectar Luup na Shopify</CardTitle>
            <p className="text-sm leading-6 text-slate-600">
              Loja: <span className="font-medium text-slate-900">{shop}</span>. {supportMessage(details?.code, connecting)}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connecting ? (
            <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-none" />
              <div>
                <p className="font-semibold">Conexao em andamento</p>
                <p className="mt-1">Se a Shopify nao abrir automaticamente, use uma das acoes abaixo.</p>
              </div>
            </div>
          ) : details?.message ? (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
              <div>
                <p className="font-semibold">Status da conexao</p>
                <p className="mt-1">{details.message}</p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {hasAuthorizeUrl ? (
              <Button className="h-12 bg-blue-600 text-white hover:bg-blue-700" onClick={() => openShopifyUrl(details!.authorizeUrl!)}>
                Autorizar Shopify
              </Button>
            ) : (
              <Button className="h-12 bg-blue-600 text-white hover:bg-blue-700" onClick={() => window.location.reload()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
            )}
            <Button
              className="h-12"
              variant="outline"
              onClick={() => window.open(window.location.href, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir em nova aba
            </Button>
          </div>

          <Button
            className="h-12 w-full"
            variant="secondary"
            onClick={() =>
              window.open(standaloneUrl, "_blank", "noopener,noreferrer")
            }
          >
            <LogIn className="mr-2 h-4 w-4" />
            Abrir Luup fora da Shopify
          </Button>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">O que fazer agora?</p>
            <p className="mt-1">
              Se o embedded da Shopify nao liberar a sessao, use a Luup fora
              da Shopify. A integracao e os videos continuam funcionando na
              loja, sem depender desta janela do admin.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
