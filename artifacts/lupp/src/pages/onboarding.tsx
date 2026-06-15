import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Stepper } from '@/components/shared/Stepper';
import { LuppLogo } from '@/components/shared/LuppLogo';
import { Link, useLocation } from 'wouter';
import { Check, CheckCircle2, MonitorPlay, Presentation, Smartphone, TrendingUp } from 'lucide-react';

export default function Onboarding() {
  const [step, setStep] = React.useState(0);
  const [, setLocation] = useLocation();

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      setLocation('/app');
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
                      <Input defaultValue="Bella Moda" />
                    </div>
                    <div className="space-y-2">
                      <Label>URL da loja</Label>
                      <Input defaultValue="bellamoda.com.br" />
                    </div>
                    <div className="space-y-2">
                      <Label>Segmento</Label>
                      <Select defaultValue="moda">
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
                      { icon: TrendingUp, title: "Aumentar conversão", desc: "Vender mais na mesma página" },
                      { icon: Presentation, title: "Melhorar página de produto", desc: "Substituir fotos estáticas" },
                      { icon: Smartphone, title: "Feed estilo TikTok", desc: "Criar vitrine interativa" },
                      { icon: MonitorPlay, title: "Medir performance", desc: "Entender views e cliques" }
                    ].map((item, i) => (
                      <button key={i} className="text-left flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-card/50 hover:border-primary/50 hover:bg-primary/5 transition-all focus:ring-2 focus:ring-primary outline-none">
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
                      { title: "Feed vertical", desc: "Uma página inteira com scroll infinito estilo TikTok", rec: true },
                      { title: "Vídeo na página de produto", desc: "Player embutido junto às fotos do produto" },
                      { title: "Carrossel na Home", desc: "Vitrine horizontal de vídeos na capa do site" }
                    ].map((item, i) => (
                      <button key={i} className={`relative text-left p-4 rounded-xl border ${item.rec ? 'border-primary bg-primary/5' : 'border-white/10 bg-card/50 hover:border-primary/50'} transition-all`}>
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
                  <Button size="lg" className="mt-8 px-12" onClick={handleNext}>
                    Ir para o Dashboard
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
