import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { PhonePreview } from '@/components/shared/PhonePreview';
import { VideoPlayerMock } from '@/components/shared/VideoPlayerMock';
import { UploadCloud, CheckCircle2 } from 'lucide-react';
import { mockProducts } from '@/data/mock';
import { useToast } from '@/hooks/use-toast';
import { Link, useLocation } from 'wouter';

export default function VideosNew() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [fileSelected, setFileSelected] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [selectedProductId, setSelectedProductId] = React.useState<string | null>(null);

  const selectedProduct = mockProducts.find(p => p.id === selectedProductId);

  const handleFileDrop = () => {
    setFileSelected(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 5;
      setProgress(p);
      if (p >= 75) clearInterval(interval);
    }, 100);
  };

  const handlePublish = () => {
    toast({
      title: "Vídeo publicado com sucesso!",
      description: "O vídeo já está disponível no seu feed vertical.",
    });
    setTimeout(() => setLocation('/app/videos'), 1500);
  };

  return (
    <AppLayout title="Adicionar Vídeo">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          {/* Upload Area */}
          <Card className="border-dashed border-2 border-white/20 bg-card/30">
            <CardContent className="flex flex-col items-center justify-center py-12">
              {!fileSelected ? (
                <button 
                  className="flex flex-col items-center gap-4 cursor-pointer outline-none focus:ring-2 focus:ring-primary rounded-xl p-4"
                  onClick={handleFileDrop}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UploadCloud className="h-8 w-8" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium">Arraste seu vídeo aqui</p>
                    <p className="text-sm text-muted-foreground mt-1">MP4, MOV ou WebM até 500MB</p>
                  </div>
                </button>
              ) : (
                <div className="w-full max-w-sm space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate pr-4">look-verao-2025.mp4</span>
                    <span className="text-muted-foreground">{progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  {progress === 75 && (
                    <p className="text-xs text-muted-foreground text-center">Processando vídeo...</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Details Form */}
          <Card className="border-white/5 bg-card/50">
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label>Título do Vídeo</Label>
                <Input placeholder="Ex: Provador Vestido Midi" />
              </div>
              
              <div className="space-y-2">
                <Label>Descrição curta</Label>
                <Textarea placeholder="Adicione uma legenda..." className="resize-none" rows={3} />
              </div>

              <div className="space-y-2">
                <Label>Produto linkado</Label>
                <Select onValueChange={setSelectedProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto do catálogo" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockProducts.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} - R$ {p.price}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>CTA do botão</Label>
                <Select defaultValue="ver">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ver">Ver produto</SelectItem>
                    <SelectItem value="comprar">Comprar agora</SelectItem>
                    <SelectItem value="carrinho">Adicionar ao carrinho</SelectItem>
                    <SelectItem value="conhecer">Conhecer peça</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/5">
                {[
                  { id: 'feed', label: 'Ativar no feed', defaultChecked: true },
                  { id: 'pagina', label: 'Exibir na página do produto', defaultChecked: true },
                  { id: 'likes', label: 'Permitir likes', defaultChecked: true },
                  { id: 'comments', label: 'Permitir comentários', defaultChecked: true },
                  { id: 'share', label: 'Permitir compartilhamento', defaultChecked: true },
                  { id: 'home', label: 'Destacar na home', defaultChecked: false },
                ].map(toggle => (
                  <div key={toggle.id} className="flex items-center justify-between">
                    <Label htmlFor={toggle.id} className="cursor-pointer">{toggle.label}</Label>
                    <Switch id={toggle.id} defaultChecked={toggle.defaultChecked} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col">
          <div className="flex-1 flex items-center justify-center rounded-xl border border-white/5 bg-slate-950/50 p-8">
            <PhonePreview className="scale-90 lg:scale-100 transform-origin-center">
              <div className="relative h-full w-full bg-black">
                {fileSelected ? (
                  <VideoPlayerMock gradient="from-purple-900 via-slate-900 to-black" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground bg-slate-900">
                    Preview do vídeo
                  </div>
                )}
                
                {selectedProduct && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 pt-20">
                    <div className="rounded-xl bg-card/80 p-3 backdrop-blur-md border border-white/10">
                      <p className="text-sm font-bold text-white mb-1">{selectedProduct.name}</p>
                      <p className="text-sm text-primary font-medium mb-3">R$ {selectedProduct.price}</p>
                      <Button className="w-full h-9 text-xs">Comprar agora</Button>
                    </div>
                  </div>
                )}
              </div>
            </PhonePreview>
          </div>
          
          <div className="mt-8 flex gap-4">
            <Button variant="outline" className="flex-1" onClick={() => setLocation('/app/videos')}>
              Salvar como rascunho
            </Button>
            <Button className="flex-1 shadow-lg shadow-primary/20" onClick={handlePublish} disabled={!fileSelected}>
              Publicar vídeo
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
