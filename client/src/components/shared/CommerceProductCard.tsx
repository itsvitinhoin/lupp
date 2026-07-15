import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CommerceProductCardView = {
  id?: string | null;
  imageUrl?: string | null;
  name: string;
  paymentTerms?: string | null;
  platform?: string | null;
  price?: string | null;
};

type CommerceProductCardProps = {
  actionLabel?: string;
  buyLabel?: string;
  className?: string;
  detailsLabel?: string;
  onAction?: () => void;
  onBuy?: () => void;
  onDetails?: () => void;
  product: CommerceProductCardView;
  showAction?: boolean;
  showName?: boolean;
  showPrice?: boolean;
  singleAction?: boolean;
};

export function CommerceProductCard({
  actionLabel,
  buyLabel = "Comprar agora",
  className,
  detailsLabel = "Ver detalhes",
  onAction,
  onBuy,
  onDetails,
  product,
  showAction = true,
  showName = true,
  showPrice = true,
  singleAction = false,
}: CommerceProductCardProps) {
  const primaryActionLabel = actionLabel || buyLabel;
  const handlePrimaryAction = onAction || onBuy || onDetails;

  return (
    <div
      className={cn(
        "mb-2 overflow-hidden rounded-md border border-white/18 bg-white/26 text-white shadow-2xl shadow-black/25 backdrop-blur-xl",
        className,
      )}
    >
      <button
        className="flex w-full items-center gap-2 p-2 text-left"
        type="button"
        onClick={onDetails}
      >
        <div
          className="h-[70px] w-[70px] shrink-0 rounded-sm bg-white/20 bg-cover bg-center ring-1 ring-white/25"
          style={{
            backgroundImage: product.imageUrl
              ? `url(${product.imageUrl})`
              : undefined,
          }}
        />
        <div className="min-w-0 flex-1">
          {showName && (
            <p className="line-clamp-1 text-[13px] font-medium uppercase leading-tight text-white">
              {product.name}
            </p>
          )}
          {showPrice && product.price && (
            <p className="mt-1 text-[15px] font-semibold text-white">
              {product.price}
            </p>
          )}
          {product.paymentTerms && (
            <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-white/75">
              {product.paymentTerms}
            </p>
          )}
        </div>
      </button>
      {showAction && (
        <div
          className={cn(
            "grid gap-2 border-t border-white/10 p-2 pt-2",
            singleAction ? "grid-cols-1" : "grid-cols-[1fr_1.05fr]",
          )}
        >
          {!singleAction && (
            <Button
              variant="outline"
              className="h-9 border-white/18 bg-white/14 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/22 hover:text-white"
              onClick={onDetails}
              type="button"
            >
              {detailsLabel}
            </Button>
          )}
          <Button
            className="h-9 bg-white/92 text-xs font-bold text-slate-950 hover:bg-white"
            onClick={singleAction ? handlePrimaryAction : onBuy}
            type="button"
          >
            {singleAction ? primaryActionLabel : buyLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
