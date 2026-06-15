import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { VideoCard } from '@/components/shared/VideoCard';
import { mockVideos } from '@/data/mock';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

export default function VideosList() {
  const { toast } = useToast();
  
  const handleToggle = (video: any) => {
    toast({
      title: "Status alterado",
      description: `O vídeo "${video.title}" foi ${video.status === 'ativo' ? 'pausado' : 'ativado'}.`
    });
  };

  const handleDelete = () => {
    toast({
      title: "Vídeo excluído",
      description: "O vídeo foi movido para a lixeira.",
      variant: "destructive"
    });
  };

  return (
    <AppLayout title="Biblioteca de Vídeos">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs defaultValue="todos" className="w-full sm:w-auto">
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
            />
          </div>
          <Button variant="outline" size="icon" className="border-white/10 bg-card/50 shrink-0">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {mockVideos.map((video) => (
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
