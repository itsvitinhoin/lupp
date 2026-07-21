import React from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isApiConfigured } from "@/lib/env";
import { useCurrentStore } from "@/hooks/useStore";
import { feedbacksService } from "@/services/feedbacks.service";
import { MessageSquareText, Star } from "lucide-react";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export default function Feedbacks() {
  const { store } = useCurrentStore();
  const feedbacksQuery = useQuery({
    queryKey: ["video-feedbacks", store?.id],
    queryFn: () => feedbacksService.listFeedbacks(store!.id),
    enabled: isApiConfigured && Boolean(store?.id),
  });
  const feedbacks = feedbacksQuery.data ?? [];
  const ratingAverage = average(feedbacks.map((feedback) => feedback.rating));
  const optionCounts = feedbacks.reduce<Record<string, number>>(
    (accumulator, feedback) => {
      accumulator[feedback.option] = (accumulator[feedback.option] ?? 0) + 1;
      return accumulator;
    },
    {},
  );
  const topOptions = Object.entries(optionCounts).sort(
    ([, left], [, right]) => right - left,
  );

  return (
    <AppLayout title="Feedbacks">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Feedbacks do Feed
        </h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Respostas coletadas quando o cliente fecha a experiência de vídeo.
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-muted-foreground">Respostas</p>
            <p className="mt-2 text-3xl font-black text-foreground">
              {feedbacks.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-muted-foreground">
              Média de estrelas
            </p>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-3xl font-black text-foreground">
                {ratingAverage.toFixed(1)}
              </p>
              <Star className="h-6 w-6 fill-amber-400 text-warning" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-muted-foreground">
              Comentários escritos
            </p>
            <p className="mt-2 text-3xl font-black text-foreground">
              {feedbacks.filter((feedback) => feedback.comment).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Opções selecionadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topOptions.length ? (
              topOptions.map(([option, count]) => (
                <div
                  key={option}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/50 p-3"
                >
                  <span className="text-sm font-semibold text-foreground/80">
                    {option}
                  </span>
                  <Badge variant="outline" className="bg-card">
                    {count}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm font-medium text-muted-foreground">
                Nenhum feedback coletado ainda.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Comentários recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {feedbacksQuery.isLoading ? (
              <p className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                Carregando feedbacks...
              </p>
            ) : feedbacks.length ? (
              <div className="space-y-3">
                {feedbacks.map((feedback) => (
                  <article
                    key={feedback.id}
                    className="rounded-xl border border-border p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">
                          {feedback.videoTitle}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground">
                          {formatDate(feedback.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star
                            key={index}
                            className={`h-4 w-4 ${
                              index < feedback.rating
                                ? "fill-amber-400 text-warning"
                                : "text-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <Badge variant="outline" className="mb-3 bg-muted/50">
                      {feedback.option}
                    </Badge>
                    {feedback.comment ? (
                      <p className="text-sm leading-relaxed text-foreground/80">
                        {feedback.comment}
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 text-sm italic text-muted-foreground/70">
                        <MessageSquareText className="h-4 w-4" />
                        Sem comentário escrito
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm font-medium text-muted-foreground">
                Quando alguém responder ao formulário de fechamento do vídeo, os
                feedbacks aparecem aqui.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
