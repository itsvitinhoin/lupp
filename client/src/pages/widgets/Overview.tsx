import { cn } from "@/lib/utils";
import { ExternalLink, MessageCircle, Video, Zap } from "lucide-react";

export type WidgetView = "overview" | "floating" | "horizontal-feed";

export type WidgetOverviewCard = {
  id: WidgetView;
  title: string;
  description: string;
  soon?: boolean;
  tone: "launcher" | "interactions" | "feed" | "store";
};

export const overviewCards: WidgetOverviewCard[] = [
  {
    id: "floating",
    title: "Miniatura flutuante",
    description:
      "Ajuste a chamada que aparece sobre a loja e abre o feed vertical da Lupp.",
    tone: "launcher",
  },
  {
    id: "horizontal-feed",
    title: "Feed Horizontal",
    description:
      "Carrossel lateral para a Home com vídeos, produtos e abertura do feed vertical.",
    tone: "feed",
  },
];

function WorkspaceHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-7">
      <div>
        <h2 className="text-2xl font-bold leading-tight tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

export function Overview({
  cards,
  canUseHorizontalFeed,
  currentPlanName,
  isConnected,
  onOpenCard,
  storeSlug,
}: {
  cards: WidgetOverviewCard[];
  canUseHorizontalFeed: boolean;
  currentPlanName: string;
  isConnected: boolean;
  onOpenCard: (card: WidgetOverviewCard) => void;
  storeSlug?: string;
}) {
  return (
    <>
      <WorkspaceHeader
        title="Personalize"
        subtitle="Customize widgets, instalação e experiência visual da loja conectada."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onOpenCard(card)}
            className={cn(
              "group flex min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg",
              card.soon && "cursor-default opacity-85 hover:translate-y-0",
            )}
          >
            <WidgetPreviewStrip tone={card.tone} />
            <div className="mt-7 flex flex-1 flex-col">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold tracking-tight text-slate-950">
                  {card.title}
                </h3>
                {card.soon && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                    Em breve
                  </span>
                )}
                {card.id === "floating" && isConnected && (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    Ativo
                  </span>
                )}
                {card.id === "horizontal-feed" && !canUseHorizontalFeed && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                    Growth+
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-[520px] text-sm font-medium leading-6 text-slate-500">
                {card.description}
              </p>
              {card.id === "horizontal-feed" && !canUseHorizontalFeed ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-5 text-amber-800">
                  Seu plano {currentPlanName} permite 1 widget ativo. Para usar
                  a bolinha e o Feed Horizontal juntos, altere para Growth.
                </p>
              ) : null}
              <span
                className={cn(
                  "mt-auto inline-flex h-11 w-fit items-center rounded-xl px-5 text-sm font-bold transition",
                  card.soon
                    ? "bg-slate-100 text-slate-500"
                    : "bg-primary text-white group-hover:bg-primary/90",
                )}
              >
                {card.soon
                  ? "Em breve"
                  : card.id === "horizontal-feed"
                    ? "Configurar"
                    : "Personalizar"}
              </span>
            </div>
          </button>
        ))}
      </div>
      {storeSlug && (
        <a
          href={`/test-store/${storeSlug}?widget=floating_launcher`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-8 right-8 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/25 transition hover:scale-105"
        >
          <MessageCircle className="h-8 w-8" />
        </a>
      )}
    </>
  );
}

function WidgetPreviewStrip({ tone }: { tone: WidgetOverviewCard["tone"] }) {
  if (tone === "launcher") {
    return (
      <div className="relative h-40 overflow-hidden rounded-2xl bg-[#e9e7e3]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.56),rgba(0,0,0,.2)),radial-gradient(circle_at_18%_38%,#d2cabf_0_16%,transparent_18%),linear-gradient(90deg,#d8d3cb,#f1eee9)]" />
        <div className="absolute left-14 top-10 flex items-center">
          <div className="h-20 w-20 rounded-full border-[5px] border-primary bg-[linear-gradient(135deg,#a08d82,#44322b)] shadow-xl" />
          <div className="-ml-1 rounded-r-md bg-primary px-6 py-3 text-xs font-bold text-white">
            VIDEO DO PRODUTO
          </div>
        </div>
        <span className="absolute bottom-4 right-5 text-xs font-bold text-white/60">
          Luup
        </span>
      </div>
    );
  }

  if (tone === "interactions") {
    return (
      <div className="relative h-40 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#c7b6a0,#5f5148)]">
        <div className="absolute inset-0 bg-black/25" />
        <div className="absolute bottom-8 left-12 flex items-end gap-6 text-white">
          {[Video, MessageCircle, MessageCircle, Zap, ExternalLink].map(
            (Icon, index) => (
              <div key={index} className="text-center">
                <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-white/35 backdrop-blur">
                  <Icon className="h-7 w-7 fill-white/60" />
                </div>
                <span className="text-sm font-bold">
                  {index === 0 ? 150 : 68}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  if (tone === "feed") {
    return (
      <div className="relative h-40 overflow-hidden rounded-2xl bg-white">
        <div className="absolute left-0 right-0 top-3 text-center text-[10px] font-bold tracking-wide text-slate-800">
          DESCUBRA CADA DETALHE EM VÍDEO
        </div>
        <div className="absolute inset-x-[-22px] bottom-3 flex items-end justify-center gap-4">
          {["#d7c2ad", "#c7cdd2", "#b3937c", "#d9b9c0", "#b39a84"].map(
            (color, index) => (
              <div
                key={color}
                className={cn(
                  "relative w-16 overflow-hidden rounded-lg shadow-lg",
                  index === 2 ? "h-[122px] w-[74px]" : "h-28",
                )}
                style={{
                  background: `linear-gradient(180deg, ${color}, #5f5148)`,
                }}
              >
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 rounded-md bg-white/80 p-1">
                  <span className="h-5 w-5 rounded bg-slate-200" />
                  <span className="h-2 flex-1 rounded bg-slate-500/40" />
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-40 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#c7b6a0,#5f5148)]">
      <div className="absolute inset-0 bg-black/30" />
      <div className="absolute left-1/2 top-5 flex h-24 w-24 -translate-x-1/2 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-300">
        LOGO
      </div>
      <div className="absolute bottom-7 left-0 right-0 text-center text-xl font-bold text-white">
        Nome da sua loja
      </div>
    </div>
  );
}
