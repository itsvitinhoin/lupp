import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { IntegrationCard } from '@/components/shared/IntegrationCard';
import { mockIntegrations, Integration } from '@/data/mock';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Integrations() {
  const manualSnippet = `<script src="https://cdn.lupp.app/embed.js" data-store="bella-moda"></script>`;

  return (
    <AppLayout title="Integrações">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Plataformas e Integrações</h2>
        <p className="text-muted-foreground mt-1">Conecte a Lupp à sua loja virtual e ferramentas de analytics.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {mockIntegrations.map(integration => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))}
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
