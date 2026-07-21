import { Badge } from "@/components/ui/badge";
import { adminConsoleService } from "@/services/admin-console.service";
import type { AdminStoreDetail, AdminStoreVideo } from "@/types/admin-console";
import { ExternalLink } from "lucide-react";
import { formatDateTime, formatNumber, statusTone } from "../shared";
import {
  CursorListPanel,
  DetailField,
  DetailGrid,
  ExpandableListRow,
} from "./shared";

export function VideosTab({
  detail,
  storeId,
}: {
  detail: AdminStoreDetail;
  storeId: string;
}) {
  return (
    <CursorListPanel
      title="Vídeos"
      countNoun="vídeo(s)"
      queryKey={["admin-console", "store", storeId, "videos"]}
      fetchPage={({ cursor, search }) =>
        adminConsoleService.getStoreVideos(storeId, { cursor, search })
      }
      searchPlaceholder="Buscar por título ou descrição"
      emptyMessage="Nenhum vídeo enviado."
      emptyFilteredMessage="Nenhum vídeo corresponde à busca."
      actions={
        <p className="text-xs font-bold text-muted-foreground">
          {formatNumber(detail.counts.videos_total)} no total ·{" "}
          {formatNumber(detail.counts.videos_processing)} processando ·{" "}
          {formatNumber(detail.counts.likes_total)} likes
        </p>
      }
      renderItem={(video) => <VideoRow key={video.id} video={video} />}
    />
  );
}

function boolLabel(value: boolean) {
  return value ? "sim" : "não";
}

function VideoRow({ video }: { video: AdminStoreVideo }) {
  return (
    <ExpandableListRow
      summary={
        <div className="flex items-center gap-3">
          {video.thumbnail_url ? (
            <img
              src={video.thumbnail_url}
              alt={video.title}
              className="h-12 w-8 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="h-12 w-8 shrink-0 rounded-md border border-border bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-bold text-foreground">
                {video.title}
              </span>
              <Badge className={`border ${statusTone(video.status)}`}>
                {video.status}
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">
                {video.processing_status}
              </span>
            </div>
            <p className="truncate text-xs font-medium text-muted-foreground">
              {formatNumber(video._count.video_products)} produto(s) ·{" "}
              {formatNumber(video._count.comments)} comentário(s) ·{" "}
              {formatNumber(video._count.likes)} like(s)
            </p>
          </div>
          <span className="shrink-0 text-xs font-bold text-muted-foreground">
            {formatDateTime(video.created_at)}
          </span>
        </div>
      }
    >
      {video.description ? (
        <DetailField label="Descrição">
          <span className="line-clamp-3">{video.description}</span>
        </DetailField>
      ) : null}
      <DetailGrid>
        <DetailField label="Provider">
          {video.provider}
          {video.provider_video_id ? ` · ${video.provider_video_id}` : ""}
        </DetailField>
        <DetailField label="Mídia">
          {video.duration_seconds ? `${video.duration_seconds}s · ` : ""}
          {video.aspect_ratio}
        </DetailField>
        <DetailField label="Exibição">
          feed: {boolLabel(video.is_feed_enabled)} · página de produto:{" "}
          {boolLabel(video.is_product_page_enabled)} · destaque:{" "}
          {boolLabel(video.is_featured)}
        </DetailField>
        <DetailField label="Interações">
          likes: {boolLabel(video.allow_likes)} · comentários:{" "}
          {boolLabel(video.allow_comments)} · compartilhar:{" "}
          {boolLabel(video.allow_sharing)}
        </DetailField>
        <DetailField label="CTA">{video.cta_label}</DetailField>
        <DetailField label="Datas">
          criado {formatDateTime(video.created_at)} · atualizado{" "}
          {formatDateTime(video.updated_at)}
        </DetailField>
        <DetailField label="ID interno">
          <span className="font-mono">{video.id}</span>
        </DetailField>
        {video.playback_url || video.video_url ? (
          <DetailField label="Arquivo">
            <a
              href={video.playback_url || video.video_url || "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
            >
              Abrir vídeo
              <ExternalLink className="h-3 w-3" />
            </a>
          </DetailField>
        ) : null}
      </DetailGrid>
    </ExpandableListRow>
  );
}
