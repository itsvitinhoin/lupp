import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WidgetCard, type WidgetCardItem } from '@/components/shared/WidgetCard';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { mockWidgets } from '@/data/mock';
import { useToast } from '@/hooks/use-toast';
import { useCurrentStore } from '@/hooks/useStore';
import { widgetsService } from '@/services/widgets.service';
import { env, isSupabaseConfigured } from '@/lib/env';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';

const widgetDescriptions: Record<string, string> = {
  product_video: 'Mostre vídeos compráveis dentro da página de produto',
  home_showcase: 'Adicione uma vitrine horizontal de vídeos na página inicial',
  floating_video: 'Exiba um vídeo flutuante no canto da loja',
  collection_feed: 'Mostre vídeos por coleção ou categoria',
  stories_bar: 'Adicione bolhas de vídeos no estilo stories',
};

function toWidgetCard(widget: any): WidgetCardItem {
  return {
    id: widget.id,
    name: widget.name,
    description: widgetDescriptions[widget.type] ?? 'Widget instalável da Lupp',
    status: widget.status,
    type: widget.type,
  };
}

export default function Widgets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { store } = useCurrentStore();
  const widgetsQuery = useQuery({
    queryKey: ['widgets', store?.id],
    queryFn: () => widgetsService.listWidgets(store!.id),
    enabled: isSupabaseConfigured && Boolean(store),
  });
  const realWidgets = widgetsQuery.data?.map(toWidgetCard) ?? [];
  const widgets = realWidgets.length ? realWidgets : mockWidgets.map((widget) => ({ ...widget, type: widget.id }));
  const [selectedWidget, setSelectedWidget] = React.useState<WidgetCardItem | null>(null);
  const currentWidget = selectedWidget ?? widgets[0] ?? null;

  const getWidgetType = (widget: WidgetCardItem) => widget.type || widget.id;

  const getEmbedCode = (widget: WidgetCardItem) => {
    if (!store) return '<!-- Crie uma loja para gerar o código de instalação da Lupp. -->';

    return [
      `<script`,
      `  src="${env.widgetCdnUrl}"`,
      `  data-store="${store.slug}"`,
      `  data-widget="${getWidgetType(widget)}"`,
      `  data-supabase-url="${env.supabaseUrl}"`,
      `  data-supabase-key="${env.supabaseAnonKey}"`,
      `  data-lupp-url="${env.appUrl}"`,
      `  async`,
      `></script>`,
    ].join('\n');
  };

  const handleToggle = async (widget: WidgetCardItem, active: boolean) => {
    if (!isSupabaseConfigured) {
      toast({
        title: active ? 'Widget ativado' : 'Widget desativado',
        description: `O widget ${widget.name} foi ${active ? 'ativado' : 'desativado'}.`,
      });
      return;
    }

    try {
      await widgetsService.updateWidget(widget.id, { status: active ? 'active' : 'inactive' });
      await queryClient.invalidateQueries({ queryKey: ['widgets', store?.id] });
      toast({
        title: active ? 'Widget ativado' : 'Widget desativado',
        description: `O widget ${widget.name} foi ${active ? 'ativado' : 'desativado'}.`,
      });
    } catch (error) {
      toast({
        title: 'Não foi possível atualizar',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    }
  };

  const handleCopyCode = async (widget: WidgetCardItem) => {
    const code = getEmbedCode(widget);
    await navigator.clipboard.writeText(code);
    setSelectedWidget(widget);
    toast({
      title: 'Código copiado!',
      description: 'Cole esse script no HTML do seu e-commerce interno.',
    });
  };

  return (
    <AppLayout title="Widgets e Embeds">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Widgets da Loja</h2>
          <p className="mt-1 text-muted-foreground">Instale a Lupp no seu e-commerce interno e teste com o feed real.</p>
        </div>
        {store && (
          <Button variant="outline" asChild>
            <a href={`/test-store/${store.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Loja teste
            </a>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-6 md:grid-cols-2">
          {widgets.map((widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              onToggle={handleToggle}
              onCopyCode={handleCopyCode}
              onConfigure={setSelectedWidget}
              onPreview={(item) => {
                setSelectedWidget(item);
                if (store) window.open(`/test-store/${store.slug}?widget=${getWidgetType(item)}`, '_blank', 'noopener');
              }}
            />
          ))}
        </div>

        <Card className="border-white/5 bg-card/50">
          <CardHeader>
            <CardTitle>Código de instalação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cole antes do fechamento do `body` no e-commerce interno. Para página de produto, adicione também `data-product-url` com a URL do produto atual.
            </p>
            <CodeBlock code={currentWidget ? getEmbedCode(currentWidget) : '<!-- Nenhum widget disponível. -->'} />
            {store && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                Feed público: <a className="text-primary hover:underline" href={`/s/${store.slug}/feed`} target="_blank" rel="noreferrer">{window.location.origin}/s/{store.slug}/feed</a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
