import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PhonePreview } from '@/components/shared/PhonePreview';
import { UploadCloud, VideoIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useProducts } from '@/hooks/useProducts';
import { useCurrentStore } from '@/hooks/useStore';
import { isSupabaseConfigured } from '@/lib/env';
import { ACCEPTED_VIDEO_TYPES } from '@/lib/constants';
import { videoStorageProvider } from '@/services/storage/video-storage.provider';
import { videosService } from '@/services/videos.service';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';

const ctaLabels: Record<string, string> = {
  ver: 'Ver produto',
  comprar: 'Comprar agora',
  carrinho: 'Adicionar ao carrinho',
  conhecer: 'Conhecer peça',
};

export default function VideosNew() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { store } = useCurrentStore();
  const productsQuery = useProducts(store?.id);
  const products = productsQuery.data ?? [];
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [progress, setProgress] = React.useState(0);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [selectedProductId, setSelectedProductId] = React.useState('');
  const [cta, setCta] = React.useState('comprar');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [toggles, setToggles] = React.useState({
    feed: true,
    productPage: true,
    likes: true,
    comments: true,
    sharing: true,
    featured: false,
  });

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectedProduct = products.find((product) => product.id === selectedProductId);

  const handleFile = (nextFile?: File | null) => {
    if (!nextFile) return;

    if (!ACCEPTED_VIDEO_TYPES.includes(nextFile.type)) {
      toast({ title: 'Formato inválido', description: 'Envie um vídeo MP4, MOV ou WebM.' });
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setProgress(5);
    if (!title.trim()) {
      setTitle(nextFile.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    }
  };

  const setToggle = (key: keyof typeof toggles, value: boolean) => {
    setToggles((current) => ({ ...current, [key]: value }));
  };

  const handlePublish = async (status: 'active' | 'draft') => {
    if (!isSupabaseConfigured) {
      toast({ title: 'Supabase não configurado', description: 'Configure Supabase para subir vídeos reais.' });
      return;
    }

    if (!store) {
      toast({ title: 'Crie uma loja primeiro', description: 'Conclua o onboarding antes de enviar vídeos.' });
      setLocation('/onboarding');
      return;
    }

    if (!file) {
      toast({ title: 'Selecione um vídeo para enviar.' });
      return;
    }

    if (!title.trim()) {
      toast({ title: 'Informe o título do vídeo.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const uploaded = await videoStorageProvider.uploadVideo(file, store.id, setProgress);
      const video = await videosService.createVideo(
        {
          store_id: store.id,
          title: title.trim(),
          description: description.trim() || null,
          video_url: uploaded.url,
          storage_path: uploaded.path,
          provider: uploaded.provider,
          status,
          cta_label: ctaLabels[cta],
          is_feed_enabled: toggles.feed,
          is_product_page_enabled: toggles.productPage,
          allow_likes: toggles.likes,
          allow_comments: toggles.comments,
          allow_sharing: toggles.sharing,
          is_featured: toggles.featured,
        },
        selectedProductId ? [selectedProductId] : [],
      );

      await queryClient.invalidateQueries({ queryKey: ['videos', store.id] });
      toast({
        title: status === 'active' ? 'Vídeo publicado!' : 'Rascunho salvo!',
        description: status === 'active' ? 'Ele já pode aparecer no feed vertical.' : 'Você pode publicar depois pela biblioteca.',
      });
      setLocation(status === 'active' ? `/s/${store.slug}/feed?v=${video.id}` : '/app/videos');
    } catch (error) {
      toast({
        title: 'Não foi possível salvar o vídeo',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout title="Adicionar Vídeo">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <Card className="border-dashed border-2 border-white/20 bg-card/30">
            <CardContent
              className="flex min-h-[260px] flex-col items-center justify-center py-12"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleFile(event.dataTransfer.files.item(0));
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_VIDEO_TYPES.join(',')}
                className="sr-only"
                onChange={(event) => handleFile(event.target.files?.item(0))}
              />

              {!file ? (
                <button
                  type="button"
                  className="flex cursor-pointer flex-col items-center gap-4 rounded-xl p-4 outline-none focus:ring-2 focus:ring-primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UploadCloud className="h-8 w-8" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium">Arraste seu vídeo aqui</p>
                    <p className="mt-1 text-sm text-muted-foreground">MP4, MOV ou WebM até 200MB</p>
                  </div>
                </button>
              ) : (
                <div className="w-full max-w-sm space-y-4">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="truncate font-medium">{file.name}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
                      Trocar
                    </Button>
                  </div>
                  <Progress value={progress} />
                  <p className="text-center text-xs text-muted-foreground">
                    {isSubmitting ? 'Enviando para o Supabase Storage...' : 'Pronto para publicar'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-card/50">
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="video-title">Título do vídeo</Label>
                <Input id="video-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex: Provador Vestido Midi" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="video-description">Descrição curta</Label>
                <Textarea id="video-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Adicione uma legenda..." className="resize-none" rows={3} />
              </div>

              <div className="space-y-2">
                <Label>Produto linkado</Label>
                <Select value={selectedProductId || 'none'} onValueChange={(value) => setSelectedProductId(value === 'none' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={productsQuery.isLoading ? 'Carregando produtos...' : 'Selecione um produto do catálogo'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem produto por enquanto</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}{product.price ? ` - R$ ${Number(product.price).toFixed(2).replace('.', ',')}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>CTA do botão</Label>
                <Select value={cta} onValueChange={setCta}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ver">Ver produto</SelectItem>
                    <SelectItem value="comprar">Comprar agora</SelectItem>
                    <SelectItem value="carrinho">Adicionar ao carrinho</SelectItem>
                    <SelectItem value="conhecer">Conhecer peça</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 border-t border-white/5 pt-4">
                {[
                  { key: 'feed' as const, label: 'Ativar no feed' },
                  { key: 'productPage' as const, label: 'Exibir na página do produto' },
                  { key: 'likes' as const, label: 'Permitir likes' },
                  { key: 'comments' as const, label: 'Permitir comentários' },
                  { key: 'sharing' as const, label: 'Permitir compartilhamento' },
                  { key: 'featured' as const, label: 'Destacar na home' },
                ].map((toggle) => (
                  <div key={toggle.key} className="flex items-center justify-between">
                    <Label htmlFor={toggle.key} className="cursor-pointer">{toggle.label}</Label>
                    <Switch id={toggle.key} checked={toggles[toggle.key]} onCheckedChange={(checked) => setToggle(toggle.key, checked)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col">
          <div className="flex flex-1 items-center justify-center rounded-xl border border-white/5 bg-slate-950/50 p-8">
            <PhonePreview className="scale-90 lg:scale-100 transform-origin-center">
              <div className="relative h-full w-full bg-black">
                {previewUrl ? (
                  <video src={previewUrl} className="h-full w-full object-cover" muted playsInline loop autoPlay />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-900 text-muted-foreground">
                    <VideoIcon className="h-8 w-8" />
                    Preview do vídeo
                  </div>
                )}

                {selectedProduct && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 pt-20">
                    <div className="rounded-md border border-white/10 bg-card/80 p-3 backdrop-blur-md">
                      <p className="mb-1 text-sm font-bold text-white">{selectedProduct.name}</p>
                      {selectedProduct.price && <p className="mb-3 text-sm font-medium text-primary">R$ {Number(selectedProduct.price).toFixed(2).replace('.', ',')}</p>}
                      <Button className="h-9 w-full text-xs">{ctaLabels[cta]}</Button>
                    </div>
                  </div>
                )}
              </div>
            </PhonePreview>
          </div>

          <div className="mt-8 flex gap-4">
            <Button variant="outline" className="flex-1" onClick={() => void handlePublish('draft')} disabled={!file || isSubmitting}>
              Salvar rascunho
            </Button>
            <Button className="flex-1 shadow-lg shadow-primary/20" onClick={() => void handlePublish('active')} disabled={!file || isSubmitting}>
              {isSubmitting ? 'Publicando...' : 'Publicar vídeo'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
