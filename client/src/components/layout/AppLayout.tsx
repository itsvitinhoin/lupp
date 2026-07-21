import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AlertTriangle, Clock3 } from 'lucide-react';
import { isApiConfigured } from '@/lib/env';
import { billingService } from '@/services/billing.service';
import { useCurrentStore } from '@/hooks/useStore';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
}

function TrialBanner() {
  const { store } = useCurrentStore();
  const subscriptionQuery = useQuery({
    queryKey: ["billing-subscription", store?.id],
    queryFn: () => billingService.getCurrentSubscription(store!.id),
    enabled: isApiConfigured && Boolean(store?.id),
  });
  const access = billingService.getAccessStatus(subscriptionQuery.data, store);

  if (!store || access.isPaid || !access.isTrialing) return null;

  if (access.isTrialExpired) {
    return (
      <div className="border-b border-destructive-surface-border bg-destructive-surface px-4 py-3 text-destructive-surface-foreground sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-bold">Seu teste gratuito acabou.</p>
              <p className="text-sm font-medium text-destructive">
                Os vídeos foram pausados na loja. Assine um plano para voltar a
                exibir a experiência Luup.
              </p>
            </div>
          </div>
          <Link
            href="/app/billing"
            className="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:bg-destructive/90"
          >
            Assinar agora
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-info-surface-border bg-info-surface px-4 py-3 text-info-surface-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-bold">
              Teste gratuito: {access.daysLeft > 1
                ? `${access.daysLeft} dias restantes`
                : `${Math.max(access.hoursLeft, 1)} horas restantes`}
            </p>
            <p className="text-sm font-medium text-info-surface-foreground">
              Sua loja está usando a Luup sem cobrança. Assine antes do fim do
              teste para manter os vídeos no ar.
            </p>
          </div>
        </div>
        <Link
          href="/app/billing"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          Ver planos
        </Link>
      </div>
    </div>
  );
}

export function AppLayout({ children, title }: AppLayoutProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Sidebar />
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <Header title={title} />
        <TrialBanner />
        {/* Full-width content column: pages own their internal max widths
            (forms cap themselves; grids add 2xl column steps). */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
