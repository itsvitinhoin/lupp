import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Integration } from '@/data/mock';
import { StatusBadge } from './StatusBadge';
import { Globe, ShoppingBag, ShoppingCart } from 'lucide-react';

interface IntegrationCardProps {
  integration: Integration;
  isConnected?: boolean;
  isConfiguring?: boolean;
  isSyncing?: boolean;
  onConfigure?: (integration: Integration) => void;
  onSync?: (integration: Integration) => void;
}

export function IntegrationCard({ integration, isConnected = false, isConfiguring = false, isSyncing = false, onConfigure, onSync }: IntegrationCardProps) {
  // Mock icons based on name
  const getIcon = () => {
    const name = integration.name.toLowerCase();
    if (name.includes('shop') || name.includes('commerce') || name.includes('vtex')) return <ShoppingBag className="h-6 w-6" />;
    return <Globe className="h-6 w-6" />;
  };

  const isDisabled = integration.status === 'em breve';
  const buttonLabel = isConfiguring
    ? 'Conectando...'
    : isConnected
      ? 'Conectado'
    : integration.status === 'disponível'
      ? 'Conectar'
      : integration.status === 'enterprise'
        ? 'Falar com vendas'
        : 'Aguarde';
  const badgeIntegration = isConnected ? { ...integration, status: 'ativo' as const } : integration;

  return (
    <Card className={`border-white/5 bg-card/50 backdrop-blur-sm transition-all hover:border-white/10 ${isDisabled ? 'opacity-60' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
            disabled={isDisabled || isConfiguring || isConnected}
            onClick={() => onConfigure?.(integration)}
          >
            {buttonLabel}
          </Button>
          {isConnected && (
            <Button
              variant="ghost"
              className="w-full border border-white/10"
              disabled={isSyncing}
              onClick={() => onSync?.(integration)}
            >
              {isSyncing ? 'Sincronizando...' : 'Sincronizar produtos'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
