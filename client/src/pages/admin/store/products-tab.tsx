import { formatBRL } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { adminConsoleService } from "@/services/admin-console.service";
import type { AdminStoreDetail, AdminStoreProduct } from "@/types/admin-console";
import { ExternalLink } from "lucide-react";
import { formatDateTime, formatNumber, statusTone } from "../shared";
import {
  CursorListPanel,
  DetailField,
  DetailGrid,
  ExpandableListRow,
} from "./shared";

export function ProductsTab({
  detail,
  storeId,
}: {
  detail: AdminStoreDetail;
  storeId: string;
}) {
  return (
    <CursorListPanel
      title="Produtos"
      countNoun="produto(s)"
      queryKey={["admin-console", "store", storeId, "products"]}
      fetchPage={({ cursor, search }) =>
        adminConsoleService.getStoreProducts(storeId, { cursor, search })
      }
      searchPlaceholder="Buscar por nome ou ID externo"
      emptyMessage="Nenhum produto sincronizado."
      emptyFilteredMessage="Nenhum produto corresponde à busca."
      actions={
        <p className="text-xs font-bold text-muted-foreground">
          {formatNumber(detail.counts.products_total)} no total ·{" "}
          {formatNumber(detail.counts.products_active)} ativos
        </p>
      }
      renderItem={(product) => <ProductRow key={product.id} product={product} />}
    />
  );
}

function ProductRow({ product }: { product: AdminStoreProduct }) {
  return (
    <ExpandableListRow
      summary={
        <div className="flex items-center gap-3">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="h-9 w-9 shrink-0 rounded-lg border border-border bg-white object-cover"
            />
          ) : (
            <div className="h-9 w-9 shrink-0 rounded-lg border border-border bg-white" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-bold text-foreground">
                {product.name}
              </span>
              <Badge className={`border ${statusTone(product.status)}`}>
                {product.status}
              </Badge>
            </div>
            <p className="truncate text-xs font-medium text-muted-foreground">
              {product.platform || "manual"}
              {product.external_id ? ` · #${product.external_id}` : ""}
            </p>
          </div>
          <span className="shrink-0 text-sm font-black text-success">
            {product.price !== null ? formatBRL(Number(product.price)) : "—"}
          </span>
        </div>
      }
    >
      {product.description ? (
        <DetailField label="Descrição">
          <span className="line-clamp-3">{product.description}</span>
        </DetailField>
      ) : null}
      <DetailGrid>
        <DetailField label="Preço">
          {product.price !== null ? formatBRL(Number(product.price)) : "—"}
          {product.compare_at_price !== null
            ? ` (de ${formatBRL(Number(product.compare_at_price))})`
            : ""}{" "}
          · {product.currency}
        </DetailField>
        <DetailField label="Variantes / vídeos vinculados">
          {formatNumber(product._count.variants)} variante(s) ·{" "}
          {formatNumber(product._count.video_products)} vídeo(s)
        </DetailField>
        <DetailField label="Plataforma">
          {product.platform || "manual"}
          {product.external_id ? ` · #${product.external_id}` : ""}
        </DetailField>
        <DetailField label="Datas">
          criado {formatDateTime(product.created_at)} · atualizado{" "}
          {formatDateTime(product.updated_at)}
        </DetailField>
        <DetailField label="ID interno">
          <span className="font-mono">{product.id}</span>
        </DetailField>
        {product.product_url ? (
          <DetailField label="Página do produto">
            <a
              href={product.product_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
            >
              Abrir na loja
              <ExternalLink className="h-3 w-3" />
            </a>
          </DetailField>
        ) : null}
      </DetailGrid>
    </ExpandableListRow>
  );
}
