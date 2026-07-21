import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Integration } from '@/data/mock';
import { BrandIcon, brandIconFor } from './BrandIcons';
import { StatusBadge } from './StatusBadge';
import { Globe, ShoppingBag } from 'lucide-react';

interface IntegrationCardProps {
  integration: Integration;
  isConnected?: boolean;
  isConfiguring?: boolean;
  isInstallingWidget?: boolean;
  isSyncing?: boolean;
  widgetInstalled?: boolean;
  onConfigure?: (integration: Integration) => void;
  onInstallWidget?: (integration: Integration) => void;
  onSync?: (integration: Integration) => void;
}

export function IntegrationCard({
  integration,
  isConnected = false,
  isConfiguring = false,
  isInstallingWidget = false,
  isSyncing = false,
  widgetInstalled = false,
  onConfigure,
  onInstallWidget,
  onSync,
}: IntegrationCardProps) {
  const getIcon = () => {
    if (brandIconFor(integration.name)) {
      return <BrandIcon brand={integration.name} className="h-6 w-6" />;
    }
    const name = integration.name.toLowerCase();
    if (name.includes('shop') || name.includes('commerce')) return <ShoppingBag className="h-6 w-6" />;
    return <Globe className="h-6 w-6" />;
  };

  const isDisabled = integration.status === 'em breve';
  const buttonLabel = isConfiguring
    ? 'Conectando...'
    : isConnected
      ? 'Reconectar'
    : integration.status === 'disponível'
      ? 'Conectar'
      : integration.status === 'enterprise'
        ? 'Falar com vendas'
        : 'Aguarde';
  const badgeIntegration = isConnected ? { ...integration, status: 'ativo' as const } : integration;

  return (
    <Card className={`bg-card transition-all hover:border-primary/30 hover:shadow-md ${isDisabled ? 'opacity-60' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted/50 text-primary">
          {getIcon()}
        </div>
        <StatusBadge status={badgeIntegration.status} />
      </CardHeader>
      <CardContent>
        <CardTitle className="mb-2 text-lg">{integration.name}</CardTitle>
        <p className="mb-4 text-sm text-muted-foreground">{integration.description}</p>
        <div className="grid gap-2">
          <Button
            variant={isConnected ? 'outline' : integration.status === 'disponível' ? 'default' : 'outline'}
            className="w-full"
            disabled={isDisabled || isConfiguring}
            onClick={() => onConfigure?.(integration)}
          >
            {buttonLabel}
          </Button>
          {isConnected && (
            <Button
              variant="ghost"
              className="w-full border border-border"
              disabled={isSyncing}
              onClick={() => onSync?.(integration)}
            >
              {isSyncing ? 'Sincronizando...' : 'Sincronizar produtos'}
            </Button>
          )}
          {isConnected && onInstallWidget && (
            <Button
              variant={widgetInstalled ? 'outline' : 'default'}
              className="w-full"
              disabled={isInstallingWidget}
              onClick={() => onInstallWidget(integration)}
            >
              {isInstallingWidget
                ? 'Instalando widget...'
                : widgetInstalled
                  ? 'Reinstalar widget'
                  : 'Instalar widget na loja'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
