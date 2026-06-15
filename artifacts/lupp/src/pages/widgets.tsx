import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { WidgetCard, type WidgetCardItem } from '@/components/shared/WidgetCard';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { mockWidgets } from '@/data/mock';
import { useToast } from '@/hooks/use-toast';
import { useCurrentStore } from '@/hooks/useStore';
import { widgetsService } from '@/services/widgets.service';
import { env, isSupabaseConfigured } from '@/lib/env';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Save } from 'lucide-react';

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

function asSettings(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function pathsFromText(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pathsToText(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).join('\n') : '';
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
  const floatingWidget = widgetsQuery.data?.find((widget) => widget.type === 'floating_video') ?? null;
  const [, setSelectedWidget] = React.useState<WidgetCardItem | null>(null);
  const launcherWidget: WidgetCardItem = {
    id: 'floating-launcher',
    name: 'Bolinha flutuante',
    description: 'Abre o feed vertical em overlay dentro da loja',
    status: 'ativo',
    type: 'floating_launcher',
  };
  const [launcherLabel, setLauncherLabel] = React.useState('Compre pelo vídeo');
  const [launcherPosition, setLauncherPosition] = React.useState('bottom-left');
  const [launcherAccent, setLauncherAccent] = React.useState('#fe2c55');
  const [launcherBackground, setLauncherBackground] = React.useState('#0b0b0f');
  const [launcherTextColor, setLauncherTextColor] = React.useState('#ffffff');
  const [launcherFont, setLauncherFont] = React.useState('Inter, system-ui, sans-serif');
  const [launcherSize, setLauncherSize] = React.useState('74');
  const [displayMode, setDisplayMode] = React.useState('all');
  const [includePaths, setIncludePaths] = React.useState('');
  const [excludePaths, setExcludePaths] = React.useState('/checkout\n/carrinho\n/cart');
  const [productMode, setProductMode] = React.useState('linked_or_all');
  const [hideWithoutVideos, setHideWithoutVideos] = React.useState(false);
  const [isSavingSettings, setIsSavingSettings] = React.useState(false);

  React.useEffect(() => {
    if (!floatingWidget) return;
    const settings = asSettings(floatingWidget.settings);
    const appearance = asSettings(settings.appearance);
    const display = asSettings(settings.display);

    setLauncherPosition(String(appearance.position || 'bottom-left'));
    setLauncherAccent(String(appearance.accent_color || '#fe2c55'));
    setLauncherBackground(String(appearance.background_color || '#0b0b0f'));
    setLauncherTextColor(String(appearance.text_color || '#ffffff'));
    setLauncherLabel(String(appearance.label ?? 'Compre pelo vídeo'));
    setLauncherFont(String(appearance.font_family || 'Inter, system-ui, sans-serif'));
    setLauncherSize(String(appearance.bubble_size || '74'));
    setDisplayMode(String(display.mode || 'all'));
    setIncludePaths(pathsToText(display.include_paths));
    setExcludePaths(pathsToText(display.exclude_paths) || '/checkout\n/carrinho\n/cart');
    setProductMode(String(display.product_mode || 'linked_or_all'));
    setHideWithoutVideos(Boolean(display.hide_without_videos));
  }, [floatingWidget?.id, floatingWidget?.updated_at]);

  const getWidgetType = (widget: WidgetCardItem) => widget.type || widget.id;

  const getEmbedCode = (widget: WidgetCardItem) => {
    if (!store) return '<!-- Crie uma loja para gerar o código de instalação da Lupp. -->';

    return [
      `<script`,
      `  src="${env.widgetCdnUrl}"`,
      `  data-store="${store.slug}"`,
      `  data-widget="${getWidgetType(widget)}"`,
      `  data-position="${launcherPosition}"`,
      `  data-accent-color="${launcherAccent}"`,
      `  data-background-color="${launcherBackground}"`,
      `  data-text-color="${launcherTextColor}"`,
      `  data-label="${launcherLabel}"`,
      `  data-font-family="${launcherFont}"`,
      `  data-bubble-size="${launcherSize}"`,
      `  data-display-mode="${displayMode}"`,
      `  data-include-paths="${pathsFromText(includePaths).join(',')}"`,
      `  data-exclude-paths="${pathsFromText(excludePaths).join(',')}"`,
      `  data-product-mode="${productMode}"`,
      `  data-hide-without-videos="${hideWithoutVideos}"`,
      `  data-require-active="true"`,
      `  data-supabase-url="${env.supabaseUrl}"`,
      `  data-supabase-key="${env.supabaseAnonKey}"`,
      `  data-lupp-url="${env.appUrl}"`,
      `  async`,
      `></script>`,
    ].join('\n');
  };

  const handleSaveLauncherSettings = async () => {
    if (!store || !floatingWidget) {
      toast({
        title: 'Widget flutuante não encontrado',
        description: 'Crie uma loja com os widgets padrão antes de salvar esta configuração.',
      });
      return;
    }

    try {
      setIsSavingSettings(true);
      const currentSettings = asSettings(floatingWidget.settings);
      await widgetsService.updateWidget(floatingWidget.id, {
        status: 'active',
        settings: {
          ...currentSettings,
          appearance: {
            accent_color: launcherAccent,
            background_color: launcherBackground,
            bubble_size: Number(launcherSize) || 74,
            font_family: launcherFont,
            label: launcherLabel,
            position: launcherPosition,
            text_color: launcherTextColor,
          },
          display: {
            exclude_paths: pathsFromText(excludePaths),
            hide_without_videos: hideWithoutVideos,
            include_paths: pathsFromText(includePaths),
            mode: displayMode,
            product_mode: productMode,
          },
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['widgets', store.id] });
      toast({
        title: 'Bolinha configurada',
        description: 'As regras de exibição foram salvas e o widget flutuante foi ativado.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível salvar',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsSavingSettings(false);
    }
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
            <CardTitle>Código da bolinha flutuante</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cole antes do fechamento do `body` no e-commerce. A bolinha aparece na loja e abre o feed vertical em overlay.
            </p>
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Posição</Label>
                  <Select value={launcherPosition} onValueChange={setLauncherPosition}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottom-left">Inferior esquerda</SelectItem>
                      <SelectItem value="bottom-right">Inferior direita</SelectItem>
                      <SelectItem value="top-left">Superior esquerda</SelectItem>
                      <SelectItem value="top-right">Superior direita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Texto</Label>
                  <Input value={launcherLabel} onChange={(event) => setLauncherLabel(event.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Cor principal</Label>
                  <Input type="color" value={launcherAccent} onChange={(event) => setLauncherAccent(event.target.value)} className="h-10 p-1" />
                </div>
                <div className="space-y-2">
                  <Label>Fundo</Label>
                  <Input type="color" value={launcherBackground} onChange={(event) => setLauncherBackground(event.target.value)} className="h-10 p-1" />
                </div>
                <div className="space-y-2">
                  <Label>Texto</Label>
                  <Input type="color" value={launcherTextColor} onChange={(event) => setLauncherTextColor(event.target.value)} className="h-10 p-1" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_88px]">
                <div className="space-y-2">
                  <Label>Fonte</Label>
                  <Input value={launcherFont} onChange={(event) => setLauncherFont(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Tamanho</Label>
                  <Input value={launcherSize} onChange={(event) => setLauncherSize(event.target.value)} inputMode="numeric" />
                </div>
              </div>
              <div className="grid gap-3 border-t border-white/10 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Mostrar em</Label>
                    <Select value={displayMode} onValueChange={setDisplayMode}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as páginas</SelectItem>
                        <SelectItem value="home">Somente home</SelectItem>
                        <SelectItem value="product">Somente páginas de produto</SelectItem>
                        <SelectItem value="custom">URLs específicas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Produto atual</Label>
                    <Select value={productMode} onValueChange={setProductMode}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="linked_or_all">Vinculado primeiro, fallback geral</SelectItem>
                        <SelectItem value="linked_only">Somente vídeos vinculados</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {displayMode === 'custom' && (
                  <div className="space-y-2">
                    <Label>URLs incluídas</Label>
                    <Textarea
                      value={includePaths}
                      onChange={(event) => setIncludePaths(event.target.value)}
                      placeholder={'/\n/produtos/*\n/colecao/verao'}
                      rows={3}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>URLs excluídas</Label>
                  <Textarea
                    value={excludePaths}
                    onChange={(event) => setExcludePaths(event.target.value)}
                    placeholder={'/checkout\n/carrinho\n/cart'}
                    rows={3}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-white/10 p-3">
                  <div>
                    <Label>Ocultar quando não houver vídeo</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Útil para páginas de produto sem vídeo vinculado.</p>
                  </div>
                  <Switch checked={hideWithoutVideos} onCheckedChange={setHideWithoutVideos} />
                </div>
              </div>
            </div>
            <Button className="w-full" onClick={() => void handleSaveLauncherSettings()} disabled={isSavingSettings || !floatingWidget}>
              <Save className="mr-2 h-4 w-4" />
              {isSavingSettings ? 'Salvando...' : 'Salvar e ativar bolinha'}
            </Button>
            <CodeBlock code={getEmbedCode(launcherWidget)} />
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
