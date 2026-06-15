import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PricingCard } from '@/components/shared/PricingCard';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

export default function Billing() {
  return (
    <AppLayout title="Planos e Assinatura">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Assinatura Atual</h2>
        <p className="text-muted-foreground mt-1">Gerencie seu plano e acompanhe o uso.</p>
      </div>

      <div className="grid gap-6 mb-12 lg:grid-cols-3">
        <Card className="lg:col-span-1 border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary mb-2 w-fit">
              Plano atual
            </div>
            <CardTitle className="text-2xl">Growth</CardTitle>
            <p className="text-3xl font-bold mt-2">R$ 199<span className="text-sm text-muted-foreground font-normal">/mês</span></p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between"><span>Ciclo de faturamento</span><span>Mensal</span></div>
            <div className="flex justify-between"><span>Próxima cobrança</span><span>15/Nov/2025</span></div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-white/5">
          <CardHeader>
            <CardTitle>Uso do Plano</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Views do mês</span>
                <span className="font-medium text-amber-500">18.420 / 20.000 (92%)</span>
              </div>
              <Progress value={92} className="h-2 bg-slate-800" indicatorClassName="bg-amber-500" />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Vídeos ativos</span>
                <span className="font-medium">42 / 80 (53%)</span>
              </div>
              <Progress value={53} className="h-2 bg-slate-800" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Widgets ativos</span>
                <span className="font-medium">3 / 5 (60%)</span>
              </div>
              <Progress value={60} className="h-2 bg-slate-800" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Alert className="mb-8 border-amber-500/50 bg-amber-500/10 text-amber-500">
        <AlertTriangle className="h-4 w-4 stroke-amber-500" />
        <AlertTitle>Atenção ao limite</AlertTitle>
        <AlertDescription>
          Você está próximo do limite de views do seu plano (92%). Faça upgrade para continuar exibindo seus vídeos sem interrupção.
        </AlertDescription>
      </Alert>

      <div className="mb-8">
        <h3 className="text-xl font-bold mb-6">Mudar de Plano</h3>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <PricingCard
            name="Start"
            price={149}
            features={['Até 30 vídeos', '10.000 views', '1 loja conectada']}
            ctaText="Fazer downgrade"
          />
          <PricingCard
            name="Growth"
            price={199}
            features={['Até 80 vídeos', '20.000 views', '5 widgets', 'Analytics avançado']}
            selected
            ctaText="Plano Atual"
          />
          <PricingCard
            name="Pro"
            price={299}
            isPopular
            features={['Até 200 vídeos', '50.000 views', 'Widgets ilimitados', 'Suporte prioritário']}
            ctaText="Fazer upgrade"
          />
          <PricingCard
            name="Scale"
            price={499}
            features={['Vídeos ilimitados', '150.000 views', 'Lojas ilimitadas', 'API de integração']}
            ctaText="Fazer upgrade"
          />
        </div>
      </div>
    </AppLayout>
  );
}
