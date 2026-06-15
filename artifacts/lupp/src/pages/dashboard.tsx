import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/shared/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, MousePointerClick, TrendingUp, ShoppingCart, DollarSign, Film, CheckCircle2, Circle } from 'lucide-react';
import { mockVideos } from '@/data/mock';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { mockAnalyticsChart } from '@/data/mock';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const checklist = [
    { text: "Criar primeiro vídeo", done: true },
    { text: "Linkar produto", done: true },
    { text: "Instalar widget", done: false },
    { text: "Ativar feed", done: true },
    { text: "Ver preview", done: false },
  ];

  return (
    <AppLayout title="Dashboard">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <StatCard title="Views totais" value="18.420" icon={Eye} trend={12.5} />
        <StatCard title="Cliques em produtos" value="2.147" icon={MousePointerClick} trend={8.2} />
        <StatCard title="Taxa de conversão (CTR)" value="11.6%" icon={TrendingUp} trend={2.1} />
        <StatCard title="Add to Cart" value="384" icon={ShoppingCart} trend={15.4} />
        <StatCard title="Receita Atribuída" value="R$ 27.890" icon={DollarSign} trend={22.1} />
        <StatCard title="Vídeos Ativos" value="42" icon={Film} trend={4.5} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <Card className="lg:col-span-2 border-white/5 bg-card/50">
          <CardHeader>
            <CardTitle>Performance dos últimos 30 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockAnalyticsChart} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" stroke="#666" fontSize={12} tickMargin={10} />
                  <YAxis yAxisId="left" stroke="#666" fontSize={12} tickFormatter={(v) => `${v}`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#006BFF" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#121B33', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="views" name="Views" stroke="#00D4FF" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="revenue" name="Receita" stroke="#47FF9C" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-card/50">
          <CardHeader>
            <CardTitle>Configuração da loja</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-bold text-primary">60%</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full w-[60%]"></div>
                </div>
              </div>
              
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  {item.done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <span className={`text-sm ${item.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {item.text}
                  </span>
                </div>
              ))}
              
              <div className="pt-4">
                <Button className="w-full" asChild>
                  <Link href="/app/widgets">Instalar Widget</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/5 bg-card/50">
        <CardHeader>
          <CardTitle>Top Vídeos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/5 text-muted-foreground">
                  <th className="pb-3 font-medium">Vídeo</th>
                  <th className="pb-3 font-medium">Produto</th>
                  <th className="pb-3 font-medium text-right">Views</th>
                  <th className="pb-3 font-medium text-right">Cliques</th>
                  <th className="pb-3 font-medium text-right">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {mockVideos.slice(0, 4).map((video) => (
                  <tr key={video.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 font-medium">{video.title}</td>
                    <td className="py-3 text-muted-foreground">{video.productName}</td>
                    <td className="py-3 text-right">{video.views.toLocaleString()}</td>
                    <td className="py-3 text-right">{video.clicks.toLocaleString()}</td>
                    <td className="py-3 text-right text-emerald-400">R$ {video.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
