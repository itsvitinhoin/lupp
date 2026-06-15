import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PhonePreview } from '@/components/shared/PhonePreview';
import { VideoPlayerMock } from '@/components/shared/VideoPlayerMock';
import { Copy, ExternalLink, GripVertical } from 'lucide-react';
import { mockVideos } from '@/data/mock';
import { useToast } from '@/hooks/use-toast';
import { useCurrentStore } from '@/hooks/useStore';
import { useVideos } from '@/hooks/useVideos';

export default function FeedConfig() {
  const { toast } = useToast();
  const { store } = useCurrentStore();
  const videosQuery = useVideos(store?.id, '', 'active');
  const publicFeedPath = store ? `/s/${store.slug}/feed` : '/preview/feed';
  const publicFeedUrl = `${window.location.origin}${publicFeedPath}`;
  const videos = videosQuery.data?.length ? videosQuery.data : mockVideos.slice(0, 4);
  
  const handleSave = () => {
    toast({
      title: "Alterações salvas!",
      description: "As configurações do seu feed foram atualizadas.",
    });
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(publicFeedUrl);
    toast({
      title: "URL copiada",
      description: "Link do feed copiado para a área de transferência.",
    });
  };

  return (
    <AppLayout title="Configuração do Feed Vertical">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="border-white/5 bg-card/50">
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Ativar feed vertical</Label>
                <Switch defaultChecked />
              </div>
              <div className="space-y-2">
                <Label>URL pública do feed</Label>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-md border border-white/10 bg-background/50 px-3 py-2 text-sm text-muted-foreground flex items-center">
                    {publicFeedPath}
                  </div>
                  <Button variant="outline" size="icon" onClick={copyUrl}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-card/50">
            <CardHeader>
              <CardTitle>Aparência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Exibir logo da loja', checked: true },
                { label: 'Exibir nome do produto', checked: true },
                { label: 'Exibir preço', checked: true },
                { label: 'Exibir descrição', checked: false },
                { label: 'Exibir botão de compra', checked: true },
                { label: 'Exibir likes', checked: true },
                { label: 'Exibir comentários', checked: true },
                { label: 'Exibir compartilhamento', checked: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Label>{item.label}</Label>
                  <Switch defaultChecked={item.checked} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-card/50">
            <CardHeader>
              <CardTitle>Comportamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Autoplay com som mudo', checked: true },
                { label: 'Loop de vídeo', checked: true },
                { label: 'Carregar próximo vídeo no scroll', checked: true },
                { label: 'Pausar vídeo ao sair da tela', checked: true },
                { label: 'Add to cart sem sair do feed', checked: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Label>{item.label}</Label>
                  <Switch defaultChecked={item.checked} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-card/50">
            <CardHeader>
              <CardTitle>Organização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup defaultValue="recentes">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="recentes" id="recentes" />
                  <Label htmlFor="recentes">Mais recentes primeiro</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="vistos" id="vistos" />
                  <Label htmlFor="vistos">Mais vistos primeiro</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="conversao" id="conversao" />
                  <Label htmlFor="conversao">Maior conversão primeiro</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="manual" id="manual" />
                  <Label htmlFor="manual">Ordenação manual</Label>
                </div>
              </RadioGroup>

              <div className="space-y-2 pt-4 border-t border-white/5">
                <Label className="text-muted-foreground">Arraste para ordenar (modo manual)</Label>
                {videos.slice(0, 4).map((video: any) => (
                  <div key={video.id} className="flex items-center gap-3 rounded-md border border-white/5 bg-card/30 p-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                    <div className="h-10 w-8 rounded bg-primary/20 bg-cover bg-center shrink-0" style={{ backgroundImage: video.thumbnail_url ? `url(${video.thumbnail_url})` : undefined }}></div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm font-medium">{video.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sticky top-24 h-[calc(100vh-8rem)]">
          <div className="flex-1 flex items-center justify-center rounded-xl border border-white/5 bg-slate-950/50 p-8">
            <PhonePreview className="scale-90 lg:scale-100">
              <div className="h-full w-full bg-black">
                <VideoPlayerMock gradient="from-blue-900 via-slate-900 to-black" />
              </div>
            </PhonePreview>
          </div>
          
          <div className="mt-8 flex gap-4">
            <Button className="flex-1 shadow-lg shadow-primary/20" onClick={handleSave}>
              Salvar alterações
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <a href={publicFeedPath} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Ver preview
              </a>
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
