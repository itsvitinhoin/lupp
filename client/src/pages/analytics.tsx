import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/shared/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, MousePointerClick, TrendingUp, ShoppingCart, DollarSign, Users, Clock, Trophy, Sparkles } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { mockAnalyticsChart, mockVideos } from '@/data/mock';

export default function Analytics() {
  return (
    <AppLayout title="Analytics e Métricas">
      <div className="mb-8 flex justify-between items-center">
        <Tabs defaultValue="30d">
          <TabsList className="bg-card/50 border border-white/5">
            <TabsTrigger value="hoje">Hoje</TabsTrigger>
            <TabsTrigger value="7d">7 dias</TabsTrigger>
            <TabsTrigger value="30d">30 dias</TabsTrigger>
            <TabsTrigger value="90d">90 dias</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <StatCard title="Views Totais" value="18.420" icon={Eye} trend={12.5} />
        <StatCard title="Usuários Únicos" value="12.150" icon={Users} trend={8.4} />
        <StatCard title="Retenção Média" value="42%" icon={Clock} trend={-1.2} />
        
        <StatCard title="Cliques em Produto" value="2.147" icon={MousePointerClick} trend={15.2} />
        <StatCard title="CTR Geral" value="11.6%" icon={TrendingUp} trend={3.1} />
        <StatCard title="Add to Cart" value="384" icon={ShoppingCart} trend={18.5} />
        
        <StatCard title="Receita Atribuída" value="R$ 27.890" icon={DollarSign} trend={22.4} />
        <StatCard title="Taxa de Conversão" value="3.1%" icon={TrendingUp} trend={0.5} />
        <StatCard title="Vídeo Campeão" value="Look de Verão" icon={Trophy} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <Card className="lg:col-span-2 border-white/5 bg-card/50">
          <CardHeader>
            <CardTitle>Evolução de Views e Receita</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
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

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Lupp AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0"></span>
                <span>Vídeos com pessoas usando o produto geraram <strong>42% mais cliques</strong>.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></span>
                <span>O produto Vestido Midi Azul teve alta intenção, mas <strong>baixa conversão</strong> (ajuste o preço ou descrição).</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0"></span>
                <span>Seu melhor horário de engajamento foi entre <strong>19h e 22h</strong>.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                <span>Vídeos com CTA "Ver produto" performaram <strong>15% melhor</strong> que "Comprar agora".</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/5 bg-card/50">
          <CardHeader>
            <CardTitle>Top Vídeos por Receita</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mockVideos.slice(0, 5)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" stroke="#666" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                  <YAxis dataKey="title" type="category" stroke="#fff" fontSize={12} width={120} tickFormatter={(str) => str.substring(0, 15) + '...'} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#121B33', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    formatter={(value) => [`R$ ${value}`, 'Receita']}
                  />
                  <Bar dataKey="revenue" fill="#47FF9C" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-card/50">
          <CardHeader>
            <CardTitle>Funil de Conversão do Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex flex-col justify-center gap-4 px-8">
              {[
                { label: 'Views Totais', value: 18420, pct: 100, color: 'bg-blue-500' },
                { label: 'Cliques em Produto', value: 2147, pct: 11.6, color: 'bg-cyan-500' },
                { label: 'Add to Cart', value: 384, pct: 2.1, color: 'bg-teal-500' },
                { label: 'Compras', value: 112, pct: 0.6, color: 'bg-emerald-500' },
              ].map((step, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{step.label}</span>
                    <span className="text-muted-foreground">{step.value.toLocaleString()} ({step.pct}%)</span>
                  </div>
                  <div className="h-8 w-full bg-slate-800 rounded-md overflow-hidden flex justify-center">
                    <div 
                      className={`h-full ${step.color} transition-all duration-1000`}
                      style={{ width: `${Math.max(step.pct, 5)}%` }} // min width for visibility
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
