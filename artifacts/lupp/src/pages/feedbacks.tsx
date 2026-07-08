import React from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isSupabaseConfigured } from "@/lib/env";
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
    enabled: isSupabaseConfigured && Boolean(store?.id),
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
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">
          Feedbacks do Feed
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Respostas coletadas quando o cliente fecha a experiência de vídeo.
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-slate-500">Respostas</p>
            <p className="mt-2 text-3xl font-black text-slate-950">
              {feedbacks.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-slate-500">
              Média de estrelas
            </p>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-3xl font-black text-slate-950">
                {ratingAverage.toFixed(1)}
              </p>
              <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-slate-500">
              Comentários escritos
            </p>
            <p className="mt-2 text-3xl font-black text-slate-950">
              {feedbacks.filter((feedback) => feedback.comment).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Opções selecionadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topOptions.length ? (
              topOptions.map(([option, count]) => (
                <div
                  key={option}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <span className="text-sm font-semibold text-slate-700">
                    {option}
                  </span>
                  <Badge variant="outline" className="bg-white">
                    {count}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 p-6 text-sm font-medium text-slate-500">
                Nenhum feedback coletado ainda.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Comentários recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {feedbacksQuery.isLoading ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Carregando feedbacks...
              </p>
            ) : feedbacks.length ? (
              <div className="space-y-3">
                {feedbacks.map((feedback) => (
                  <article
                    key={feedback.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">
                          {feedback.videoTitle}
                        </p>
                        <p className="text-xs font-medium text-slate-500">
                          {formatDate(feedback.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star
                            key={index}
                            className={`h-4 w-4 ${
                              index < feedback.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-200"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <Badge variant="outline" className="mb-3 bg-slate-50">
                      {feedback.option}
                    </Badge>
                    {feedback.comment ? (
                      <p className="text-sm leading-relaxed text-slate-700">
                        {feedback.comment}
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 text-sm italic text-slate-400">
                        <MessageSquareText className="h-4 w-4" />
                        Sem comentário escrito
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm font-medium text-slate-500">
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
