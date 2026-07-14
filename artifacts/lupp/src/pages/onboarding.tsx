import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Stepper } from '@/components/shared/Stepper';
import { LuppLogo } from '@/components/shared/LuppLogo';
import { storesService } from '@/services/stores.service';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Check, CheckCircle2, MonitorPlay, Presentation, Smartphone, TrendingUp } from 'lucide-react';

export default function Onboarding() {
  const [step, setStep] = React.useState(0);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [storeName, setStoreName] = React.useState('Bella Moda');
  const [storeUrl, setStoreUrl] = React.useState('bellamoda.com.br');
  const [platform, setPlatform] = React.useState('');
  const [segment, setSegment] = React.useState('moda');
  const [goal, setGoal] = React.useState('conversion');
  const [firstWidget, setFirstWidget] = React.useState('feed');

  React.useEffect(() => {
    const raw = sessionStorage.getItem('lupp_onboarding_prefill');
    if (!raw) return;

    try {
      const prefill = JSON.parse(raw) as { storeName?: string; platform?: string };
      if (prefill.storeName) setStoreName(prefill.storeName);
      if (prefill.platform) setPlatform(prefill.platform);
    } catch {
      sessionStorage.removeItem('lupp_onboarding_prefill');
    }
  }, []);

  const normalizeUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  const validateStoreStep = () => {
    if (!storeName.trim()) {
      toast({ title: 'Informe o nome da loja.' });
      return false;
    }

    if (!platform) {
      toast({ title: 'Selecione a plataforma da loja.' });
      return false;
    }

    if (!segment) {
      toast({ title: 'Selecione o segmento da loja.' });
      return false;
    }

    const url = normalizeUrl(storeUrl);
    if (url) {
      try {
        new URL(url);
      } catch {
        toast({ title: 'URL inválida', description: 'Use algo como sualoja.com.br ou https://sualoja.com.br.' });
        return false;
      }
    }

    return true;
  };

  const completeOnboarding = async () => {
    if (!validateStoreStep()) {
      setStep(1);
      return;
    }

    if (!user) {
      toast({ title: 'Sessão expirada', description: 'Entre novamente para concluir o onboarding.' });
      setLocation('/login');
      return;
    }

    try {
      setIsSubmitting(true);
      await storesService.createStoreWithDefaults({
        name: storeName.trim(),
        url: normalizeUrl(storeUrl) || undefined,
        platform,
        segment,
      });
      await queryClient.invalidateQueries({ queryKey: ['stores', user.id] });
      localStorage.removeItem('lupp_demo_auth');
      localStorage.removeItem('lupp_demo_store');
      sessionStorage.removeItem('lupp_onboarding_prefill');
      toast({ title: 'Loja criada com sucesso', description: 'Agora conecte a plataforma para sincronizar produtos automaticamente.' });
      setLocation(platform && platform !== 'outra' ? `/app/integrations?connect=${platform}` : '/app/integrations');
    } catch (error) {
      toast({
        title: 'Não foi possível criar a loja',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step === 1 && !validateStoreStep()) return;

    if (step < 4) {
      setStep(step + 1);
    } else {
      void completeOnboarding();
    }
  };

  const steps = ['Boas-vindas', 'Loja', 'Objetivo', 'Widget', 'Pronto'];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="w-full max-w-3xl mx-auto px-6 pt-12 flex-1 flex flex-col">
        <div className="mb-12 flex justify-center">
          <LuppLogo />
        </div>

        <Stepper steps={steps} currentStep={step} />

        <div className="flex-1 flex flex-col justify-center py-12">
          <Card className="border-white/5 bg-card/40 backdrop-blur-xl shadow-2xl">
            <CardContent className="p-8 sm:p-12">
              
              {/* Step 1: Boas-vindas */}
              {step === 0 && (
                <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-6">
                    <span className="text-3xl">👋</span>
                  </div>
                  <h1 className="text-3xl font-bold">Bem-vindo à Lupp</h1>
                  <p className="text-lg text-muted-foreground max-w-md mx-auto">
                    Vamos configurar sua loja em poucos passos para que você comece a vender através de vídeos.
                  </p>
                  <Button size="lg" className="mt-8 px-8" onClick={handleNext}>
                    Começar configuração
                  </Button>
                </div>
              )}

              {/* Step 2: Dados da loja */}
              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold">Detalhes da sua loja</h2>
                    <p className="text-muted-foreground mt-2">Precisamos de algumas informações básicas.</p>
                  </div>
                  
                  <div className="space-y-4 max-w-md mx-auto">
                    <div className="space-y-2">
                      <Label>Nome da loja</Label>
                      <Input value={storeName} onChange={(event) => setStoreName(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>URL da loja</Label>
                      <Input value={storeUrl} onChange={(event) => setStoreUrl(event.target.value)} placeholder="sualoja.com.br" />
                    </div>
                    <div className="space-y-2">
                      <Label>Plataforma</Label>
                      <Select value={platform} onValueChange={setPlatform}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nuvemshop">Nuvemshop</SelectItem>
                          <SelectItem value="upzero">UP Zero</SelectItem>
                          <SelectItem value="shopify">Shopify</SelectItem>
                          <SelectItem value="woocommerce">WooCommerce</SelectItem>
                          <SelectItem value="tray">Tray</SelectItem>
                          <SelectItem value="yampi">Yampi</SelectItem>
                          <SelectItem value="loja_integrada">Loja Integrada</SelectItem>
                          <SelectItem value="vtex">VTEX</SelectItem>
                          <SelectItem value="outra">Outra</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Segmento</Label>
                      <Select value={segment} onValueChange={setSegment}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="moda">Moda feminina</SelectItem>
                          <SelectItem value="beleza">Beleza e cosméticos</SelectItem>
                          <SelectItem value="acessorios">Acessórios</SelectItem>
                          <SelectItem value="casa">Casa e decoração</SelectItem>
                          <SelectItem value="fitness">Fitness</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full mt-6" onClick={handleNext}>Continuar</Button>
                  </div>
                </div>
              )}

              {/* Step 3: Objetivo */}
              {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold">Qual o seu objetivo principal?</h2>
                    <p className="text-muted-foreground mt-2">Isso nos ajuda a personalizar sua experiência.</p>
                  </div>
                  
                  <div className="grid gap-4 sm:grid-cols-2 max-w-2xl mx-auto">
                    {[
                      { id: "conversion", icon: TrendingUp, title: "Aumentar conversão", desc: "Vender mais na mesma página" },
                      { id: "product-page", icon: Presentation, title: "Melhorar página de produto", desc: "Substituir fotos estáticas" },
                      { id: "feed", icon: Smartphone, title: "Feed estilo TikTok", desc: "Criar vitrine interativa" },
                      { id: "analytics", icon: MonitorPlay, title: "Medir performance", desc: "Entender views e cliques" }
                    ].map((item, i) => (
                      <button
                        key={item.id}
                        onClick={() => setGoal(item.id)}
                        className={`text-left flex items-start gap-4 p-4 rounded-xl border transition-all focus:ring-2 focus:ring-primary outline-none ${goal === item.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-card/50 hover:border-primary/50 hover:bg-primary/5'}`}
                      >
                        <div className="mt-1 p-2 rounded-lg bg-primary/10 text-primary">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{item.title}</h3>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-center mt-8">
                    <Button onClick={handleNext} className="px-8">Continuar</Button>
                  </div>
                </div>
              )}

              {/* Step 4: Widget */}
              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold">Escolha seu primeiro widget</h2>
                    <p className="text-muted-foreground mt-2">Você pode adicionar outros depois.</p>
                  </div>
                  
                  <div className="grid gap-4 max-w-xl mx-auto">
                    {[
                      { id: "feed", title: "Feed vertical", desc: "Uma página inteira com scroll infinito estilo TikTok", rec: true },
                      { id: "product-video", title: "Vídeo na página de produto", desc: "Player embutido junto às fotos do produto" },
                      { id: "home-showcase", title: "Carrossel na Home", desc: "Vitrine horizontal de vídeos na capa do site" }
                    ].map((item, i) => (
                      <button
                        key={item.id}
                        onClick={() => setFirstWidget(item.id)}
                        className={`relative text-left p-4 rounded-xl border ${firstWidget === item.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-card/50 hover:border-primary/50'} transition-all`}
                      >
                        {item.rec && (
                          <span className="absolute top-4 right-4 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">Recomendado</span>
                        )}
                        <h3 className="font-semibold text-lg">{item.title}</h3>
                        <p className="text-muted-foreground">{item.desc}</p>
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-center mt-8">
                    <Button onClick={handleNext} className="px-8">Continuar</Button>
                  </div>
                </div>
              )}

              {/* Step 5: Concluído */}
              {step === 4 && (
                <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
                  <div className="mx-auto w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-8">
                    <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                  </div>
                  <h2 className="text-3xl font-bold">Tudo pronto!</h2>
                  <p className="text-lg text-muted-foreground max-w-md mx-auto">
                    Sua loja está configurada e pronta para receber vídeos compráveis.
                  </p>
                  <Button size="lg" className="mt-8 px-12" onClick={handleNext} disabled={isSubmitting}>
                    {isSubmitting ? 'Criando loja...' : 'Ir para o Dashboard'}
                  </Button>
                </div>
              )}

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
