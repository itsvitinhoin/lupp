import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AlertTriangle, Clock3 } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/env';
import { billingService } from '@/services/billing.service';
import { useCurrentStore } from '@/hooks/useStore';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  /** Lets the page span the full content width instead of the max-w-7xl column. */
  fullWidth?: boolean;
}

function TrialBanner() {
  const { store } = useCurrentStore();
  const subscriptionQuery = useQuery({
    queryKey: ["billing-subscription", store?.id],
    queryFn: () => billingService.getCurrentSubscription(store!.id),
    enabled: isSupabaseConfigured && Boolean(store?.id),
  });
  const access = billingService.getAccessStatus(subscriptionQuery.data, store);

  if (!store || access.isPaid || !access.isTrialing) return null;

  if (access.isTrialExpired) {
    return (
      <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-red-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-bold">Seu teste gratuito acabou.</p>
              <p className="text-sm font-medium text-red-700">
                Os vídeos foram pausados na loja. Assine um plano para voltar a
                exibir a experiência Luup.
              </p>
            </div>
          </div>
          <Link
            href="/app/billing"
            className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700"
          >
            Assinar agora
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 text-blue-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="font-bold">
              Teste gratuito: {access.daysLeft > 1
                ? `${access.daysLeft} dias restantes`
                : `${Math.max(access.hoursLeft, 1)} horas restantes`}
            </p>
            <p className="text-sm font-medium text-blue-700">
              Sua loja está usando a Luup sem cobrança. Assine antes do fim do
              teste para manter os vídeos no ar.
            </p>
          </div>
        </div>
        <Link
          href="/app/billing"
          className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
        >
          Ver planos
        </Link>
      </div>
    </div>
  );
}

export function AppLayout({ children, title, fullWidth = false }: AppLayoutProps) {
  return (
    <div className="min-h-[100dvh] bg-[#f6f8fb] text-slate-950">
      <Sidebar />
      <div className="flex min-h-[100dvh] flex-col lg:pl-64">
        <Header title={title} />
        <TrialBanner />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className={fullWidth ? "w-full" : "mx-auto max-w-7xl"}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
