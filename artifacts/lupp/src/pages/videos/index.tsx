import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { VideoCard, type VideoCardItem } from '@/components/shared/VideoCard';
import { mockVideos } from '@/data/mock';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useCurrentStore } from '@/hooks/useStore';
import { useVideos } from '@/hooks/useVideos';
import { videosService } from '@/services/videos.service';
import { isSupabaseConfigured } from '@/lib/env';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';

const STATUS_FILTERS: Record<string, string> = {
  todos: 'all',
  ativos: 'active',
  pausados: 'paused',
  rascunhos: 'draft',
};

function toCardItem(video: any): VideoCardItem {
  const statusMap: Record<string, VideoCardItem['status']> = {
    active: 'ativo',
    paused: 'pausado',
    draft: 'rascunho',
    archived: 'pausado',
  };
  const primaryProduct = video.video_products?.find((item: any) => item.is_primary)?.products ?? video.video_products?.[0]?.products;

  return {
    id: video.id,
    title: video.title,
    status: statusMap[video.status] ?? 'rascunho',
    views: 0,
    likes: 0,
    comments: 0,
    clicks: 0,
    revenue: 0,
    productId: primaryProduct?.id ?? null,
    productName: primaryProduct?.name ?? null,
    thumbnail: video.thumbnail_url ?? '',
    videoUrl: video.video_url,
  };
}

export default function VideosList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { store } = useCurrentStore();
  const [statusTab, setStatusTab] = React.useState('todos');
  const [search, setSearch] = React.useState('');
  const videosQuery = useVideos(store?.id, search, STATUS_FILTERS[statusTab]);
  const realVideos = videosQuery.data?.map(toCardItem) ?? [];
  const videos = isSupabaseConfigured && realVideos.length ? realVideos : mockVideos;

  const refreshVideos = async () => {
    await queryClient.invalidateQueries({ queryKey: ['videos', store?.id] });
  };

  const handleToggle = async (video: VideoCardItem) => {
    if (!isSupabaseConfigured) {
      toast({
        title: "Status alterado",
        description: `O vídeo "${video.title}" foi ${video.status === 'ativo' ? 'pausado' : 'ativado'}.`
      });
      return;
    }

    try {
      await videosService.updateVideo(video.id, { status: video.status === 'ativo' ? 'paused' : 'active' });
      await refreshVideos();
      toast({
        title: "Status alterado",
        description: `O vídeo "${video.title}" foi ${video.status === 'ativo' ? 'pausado' : 'ativado'}.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível alterar",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
    }
  };

  const handleDelete = async (video: VideoCardItem) => {
    if (!isSupabaseConfigured) {
      toast({
        title: "Vídeo excluído",
        description: "O vídeo foi movido para a lixeira.",
        variant: "destructive"
      });
      return;
    }

    try {
      await videosService.archiveVideo(video.id);
      await refreshVideos();
      toast({
        title: "Vídeo arquivado",
        description: "O vídeo saiu da biblioteca ativa.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível arquivar",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
    }
  };

  return (
    <AppLayout title="Biblioteca de Vídeos">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={statusTab} onValueChange={setStatusTab} className="w-full sm:w-auto">
          <TabsList className="bg-card/50 border border-white/5">
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="ativos">Ativos</TabsTrigger>
            <TabsTrigger value="pausados">Pausados</TabsTrigger>
            <TabsTrigger value="rascunhos">Rascunhos</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Buscar vídeos..." 
              className="pl-9 bg-card/50 border-white/10"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" className="border-white/10 bg-card/50 shrink-0">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          <Button className="shrink-0 shadow-lg shadow-primary/20" asChild>
            <Link href="/app/videos/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo
            </Link>
          </Button>
        </div>
      </div>

      {videosQuery.isLoading && (
        <div className="mb-6 rounded-md border border-white/10 bg-card/40 p-4 text-sm text-muted-foreground">
          Carregando vídeos da loja...
        </div>
      )}

      {isSupabaseConfigured && !videosQuery.isLoading && !realVideos.length && (
        <div className="mb-6 rounded-md border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Nenhum vídeo real ainda. Envie o primeiro vídeo para testar o feed vertical ao vivo.
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {videos.map((video) => (
          <VideoCard 
            key={video.id} 
            video={video} 
            onToggleStatus={handleToggle}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </AppLayout>
  );
}
