import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { IntegrationCard } from '@/components/shared/IntegrationCard';
import { mockIntegrations, Integration } from '@/data/mock';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentStore } from '@/hooks/useStore';
import { integrationsService } from '@/services/integrations.service';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';

export default function Integrations() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { session, loading: authLoading } = useAuth();
  const { store } = useCurrentStore();
  const [connectingProvider, setConnectingProvider] = React.useState<string | null>(null);
  const integrationsQuery = useQuery({
    queryKey: ['integrations', store?.id],
    queryFn: () => integrationsService.listIntegrations(store!.id),
    enabled: Boolean(store?.id),
  });
  const manualSnippet = `<script src="https://cdn.lupp.app/embed.js" data-store="bella-moda"></script>`;
  const activeProviders = new Set((integrationsQuery.data ?? []).filter((integration) => integration.status === 'active').map((integration) => integration.provider));

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');

    if (connected === 'nuvemshop') {
      toast({ title: 'Nuvemshop conectada', description: 'Agora já podemos sincronizar o catálogo dessa loja.' });
      window.history.replaceState({}, '', window.location.pathname);
      void integrationsQuery.refetch();
      return;
    }

    if (error) {
      toast({ title: 'Falha ao conectar integração', description: error.replace(/_/g, ' ') });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConfigure = async (integration: Integration) => {
    if (integration.name.toLowerCase() !== 'nuvemshop') {
      toast({ title: 'Em breve', description: 'Vamos conectar essa plataforma depois da Nuvemshop.' });
      return;
    }

    if (!store) {
      toast({ title: 'Crie uma loja primeiro', description: 'A integração precisa estar associada a uma loja Luup.' });
      return;
    }

    if (!authLoading && !session) {
      toast({
        title: 'Faça login novamente',
        description: 'A conexão com a Nuvemshop precisa de uma sessão real do Supabase.',
      });
      setLocation('/login');
      return;
    }

    try {
      setConnectingProvider('nuvemshop');
      const authorizeUrl = await integrationsService.createNuvemshopAuthorizeUrl(store.id);
      window.location.assign(authorizeUrl);
    } catch (error) {
      toast({
        title: 'Não foi possível conectar a Nuvemshop',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  return (
    <AppLayout title="Integrações">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Plataformas e Integrações</h2>
        <p className="text-muted-foreground mt-1">Conecte a Lupp à sua loja virtual e ferramentas de analytics.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {mockIntegrations.map((integration) => {
              const providerKey = integration.name.toLowerCase();
              const normalizedProvider = providerKey === 'nuvemshop' ? 'nuvemshop' : providerKey;
              const displayIntegration = activeProviders.has(normalizedProvider)
                ? { ...integration, status: 'disponível' as const, description: `${integration.description} Conectada.` }
                : integration;
              return (
                <IntegrationCard
                  key={integration.id}
                  integration={displayIntegration}
                  isConfiguring={connectingProvider === normalizedProvider}
                  onConfigure={handleConfigure}
                />
              );
            })}
          </div>
        </div>

        <div>
          <Card className="sticky top-24 border-white/5 bg-card/30">
            <CardHeader>
              <CardTitle>Instalação Manual</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Se a sua plataforma não estiver na lista ou você usar uma loja customizada, insira este script no <code>&lt;head&gt;</code> do seu site:
              </p>
              
              <CodeBlock code={manualSnippet} />
              
              <div className="mt-6 space-y-4 text-sm">
                <h4 className="font-semibold">Próximos passos:</h4>
                <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
                  <li>Copie o código acima</li>
                  <li>Cole antes do fechamento da tag <code>&lt;/head&gt;</code></li>
                  <li>Salve e publique sua loja</li>
                  <li>Verifique se o widget aparece</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
