import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LuppLogo } from '@/components/shared/LuppLogo';
import { EnvNotice } from '@/components/shared/EnvNotice';
import { authService } from '@/services/auth.service';
import { isSupabaseConfigured } from '@/lib/env';
import { useToast } from '@/hooks/use-toast';
import { Link, useLocation } from 'wouter';

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [storeName, setStoreName] = React.useState('');
  const [platform, setPlatform] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const persistOnboardingPrefill = () => {
    sessionStorage.setItem(
      'lupp_onboarding_prefill',
      JSON.stringify({ storeName, platform }),
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim() || !email.trim() || password.length < 6) {
      toast({ title: 'Revise o cadastro', description: 'Informe nome, e-mail e uma senha com pelo menos 6 caracteres.' });
      return;
    }

    persistOnboardingPrefill();

    if (!isSupabaseConfigured) {
      localStorage.setItem('lupp_demo_auth', JSON.stringify({ email, name }));
      toast({ title: 'Conta de teste criada localmente', description: 'Configure Supabase para criar o usuário real.' });
      setLocation('/onboarding');
      return;
    }

    try {
      setIsSubmitting(true);
      const data = await authService.signUp({ name, email, password });

      if (!data.session) {
        toast({
          title: 'Cadastro criado',
          description: 'Confirme seu e-mail para entrar e concluir o onboarding.',
        });
        setLocation('/login');
        return;
      }

      toast({ title: 'Cadastro criado com sucesso.' });
      setLocation('/onboarding');
    } catch (error) {
      toast({
        title: 'Não foi possível criar a conta',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background selection:bg-primary/30">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 rounded-full bg-primary/5 blur-[120px]"></div>
      </div>
      
      <Card className="w-full max-w-md relative z-10 border-white/5 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/50">
        <CardHeader className="space-y-1 text-center pt-8">
          <div className="flex justify-center mb-4">
            <LuppLogo />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Crie sua conta</CardTitle>
          <p className="text-sm text-muted-foreground">
            Comece a transformar sua loja em um feed de vídeos
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pb-8">
          <EnvNotice />
          <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name">Nome completo</Label>
            <Input
              id="name"
              placeholder="Seu nome"
              className="bg-background/50 border-white/10"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">E-mail de trabalho</Label>
            <Input
              id="email"
              type="email"
              placeholder="nome@sualoja.com.br"
              className="bg-background/50 border-white/10"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              className="bg-background/50 border-white/10"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store">Nome da loja</Label>
            <Input
              id="store"
              placeholder="Ex: Bella Moda"
              className="bg-background/50 border-white/10"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Plataforma da loja</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="bg-background/50 border-white/10">
                <SelectValue placeholder="Selecione sua plataforma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nuvemshop">Nuvemshop</SelectItem>
                <SelectItem value="shopify">Shopify</SelectItem>
                <SelectItem value="woocommerce">WooCommerce</SelectItem>
                <SelectItem value="tray">Tray</SelectItem>
                <SelectItem value="yampi">Yampi</SelectItem>
                <SelectItem value="vtex">VTEX</SelectItem>
                <SelectItem value="outra">Outra plataforma</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button className="w-full mt-6" size="lg" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Criando conta...' : 'Criar conta grátis'}
          </Button>
          </form>
          
          <p className="text-center text-sm text-muted-foreground mt-6">
            Já tem uma conta?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
