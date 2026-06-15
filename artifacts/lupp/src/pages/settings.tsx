import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const { toast } = useToast();

  const handleSave = () => {
    toast({
      title: "Configurações salvas",
      description: "Suas alterações foram aplicadas com sucesso.",
    });
  };

  return (
    <AppLayout title="Configurações">
      <Tabs defaultValue="loja" className="w-full">
        <TabsList className="mb-6 w-full justify-start overflow-x-auto bg-transparent border-b border-white/10 rounded-none h-auto p-0">
          <TabsTrigger value="loja" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Loja</TabsTrigger>
          <TabsTrigger value="marca" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Marca</TabsTrigger>
          <TabsTrigger value="notificacoes" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Notificações</TabsTrigger>
        </TabsList>

        <TabsContent value="loja">
          <Card className="border-white/5 bg-card/50">
            <CardHeader>
              <CardTitle>Dados da Loja</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome da loja</Label>
                  <Input defaultValue="Bella Moda" />
                </div>
                <div className="space-y-2">
                  <Label>URL da loja</Label>
                  <Input defaultValue="bellamoda.com.br" />
                </div>
                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <Select defaultValue="nuvemshop">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nuvemshop">Nuvemshop</SelectItem>
                      <SelectItem value="shopify">Shopify</SelectItem>
                      <SelectItem value="woocommerce">WooCommerce</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Segmento</Label>
                  <Select defaultValue="moda">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moda">Moda feminina</SelectItem>
                      <SelectItem value="beleza">Beleza</SelectItem>
                      <SelectItem value="acessorios">Acessórios</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleSave}>Salvar alterações</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marca">
          <Card className="border-white/5 bg-card/50">
            <CardHeader>
              <CardTitle>Aparência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Cor principal</Label>
                    <div className="flex gap-2">
                      <div className="h-10 w-10 rounded-md bg-primary cursor-pointer border-2 border-white"></div>
                      <div className="h-10 w-10 rounded-md bg-pink-500 cursor-pointer border border-white/20"></div>
                      <div className="h-10 w-10 rounded-md bg-purple-500 cursor-pointer border border-white/20"></div>
                      <div className="h-10 w-10 rounded-md bg-amber-500 cursor-pointer border border-white/20"></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border rounded-md border-white/10 p-4 bg-card/30">
                    <div className="space-y-0.5">
                      <Label className="text-base">Modo Escuro</Label>
                      <p className="text-sm text-muted-foreground">Forçar o widget a usar modo escuro</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-card p-6 flex flex-col items-center justify-center space-y-4">
                  <p className="text-sm font-medium">Preview do Botão</p>
                  <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                    Comprar agora
                  </Button>
                </div>
              </div>
              <Button onClick={handleSave}>Salvar aparência</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificacoes">
          <Card className="border-white/5 bg-card/50">
            <CardHeader>
              <CardTitle>Preferências de Notificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: "Relatório semanal", desc: "Receba um resumo de performance toda segunda-feira.", checked: true },
                { title: "Alertas de limite", desc: "Avisar quando atingir 80% do limite de views do plano.", checked: true },
                { title: "Novos comentários", desc: "Receber email para cada comentário aguardando aprovação.", checked: false },
                { title: "Vídeo em alta", desc: "Avisar quando um vídeo tiver performance 50% acima da média.", checked: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0">
                  <div className="space-y-0.5">
                    <Label className="text-base">{item.title}</Label>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch defaultChecked={item.checked} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
