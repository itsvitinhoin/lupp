import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { VideoCard, type VideoCardItem } from "@/components/shared/VideoCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCurrentStore } from "@/hooks/useStore";
import { useVideos } from "@/hooks/useVideos";
import { videosService } from "@/services/videos.service";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

const STATUS_FILTERS: Record<string, string> = {
  todos: "all",
  ativos: "active",
  pausados: "paused",
  rascunhos: "draft",
};

function toCardItem(video: any): VideoCardItem {
  const statusMap: Record<string, VideoCardItem["status"]> = {
    active: "ativo",
    paused: "pausado",
    draft: "rascunho",
    archived: "pausado",
  };
  const primaryProduct =
    video.video_products?.find((item: any) => item.is_primary)?.products ??
    video.video_products?.[0]?.products;
  const products =
    video.video_products
      ?.map((item: any) => item.products)
      .filter(Boolean)
      .map((product: any) => ({
        id: product.id,
        imageUrl: product.image_url ?? null,
        name: product.name,
      })) ?? [];

  return {
    id: video.id,
    title: video.title,
    status: statusMap[video.status] ?? "rascunho",
    views: video.metrics?.views ?? 0,
    likes: video.metrics?.likes ?? 0,
    comments: video.metrics?.comments ?? 0,
    clicks: video.metrics?.clicks ?? 0,
    revenue: video.metrics?.revenue ?? 0,
    productId: primaryProduct?.id ?? null,
    productName: primaryProduct?.name ?? null,
    products,
    thumbnail: video.thumbnail_url ?? "",
    videoUrl: video.video_url,
    durationSeconds: video.duration_seconds ?? null,
  };
}

export default function VideosList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { store } = useCurrentStore();
  const [statusTab, setStatusTab] = React.useState("todos");
  const [search, setSearch] = React.useState("");
  const videosQuery = useVideos(store?.id, search, STATUS_FILTERS[statusTab]);
  const videos = videosQuery.data?.map(toCardItem) ?? [];

  const refreshVideos = async () => {
    await queryClient.invalidateQueries({ queryKey: ["videos", store?.id] });
  };

  const handleToggle = async (video: VideoCardItem) => {
    try {
      await videosService.updateVideo(video.id, {
        status: video.status === "ativo" ? "paused" : "active",
      });
      await refreshVideos();
      toast({
        title: "Status alterado",
        description: `O vídeo "${video.title}" foi ${video.status === "ativo" ? "pausado" : "ativado"}.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível alterar",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    }
  };

  const handleDelete = async (video: VideoCardItem) => {
    if (!store?.id) return;
    const confirmed = window.confirm(
      `Excluir definitivamente o vídeo "${video.title || "sem título"}"?`,
    );
    if (!confirmed) return;

    try {
      await videosService.deleteVideo(video.id, store.id);
      await refreshVideos();
      toast({
        title: "Vídeo excluído",
        description: "O vídeo foi removido da biblioteca.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível excluir",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    }
  };

  return (
    <AppLayout title="Biblioteca de Vídeos">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={statusTab}
          onValueChange={setStatusTab}
          className="w-full sm:w-auto"
        >
          <TabsList className="border border-slate-200 bg-white text-slate-500">
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="ativos">Ativos</TabsTrigger>
            <TabsTrigger value="pausados">Pausados</TabsTrigger>
            <TabsTrigger value="rascunhos">Rascunhos</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="search"
              placeholder="Buscar vídeos..."
              className="border-slate-200 bg-white pl-9 text-slate-950 placeholder:text-slate-400"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
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
        <div className="mb-6 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Carregando vídeos da loja...
        </div>
      )}

      {!videosQuery.isLoading && !videos.length && (
        <div className="mb-6 rounded-md border border-primary/20 bg-primary/5 p-4 text-sm text-slate-600">
          Nenhum vídeo real ainda. Envie o primeiro vídeo para testar o feed
          vertical ao vivo.
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
