import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LuppLogo } from '@/components/shared/LuppLogo';
import { authService } from '@/services/auth.service';
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
  // Email confirmation disabled for now — see auth.service.ts / server sign-up.ts.
  // const [pendingConfirmationEmail, setPendingConfirmationEmail] = React.useState('');
  // const [isResending, setIsResending] = React.useState(false);

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

    try {
      setIsSubmitting(true);
      await authService.signUp({ name, email, password });

      // Email confirmation disabled for now — sign-up never returns a
      // session (see auth.service.ts), so send the user straight to login.
      toast({
        title: 'Cadastro criado',
        description: 'Faça login para continuar.',
      });
      setLocation('/login');
    } catch (error) {
      toast({
        title: 'Não foi possível criar a conta',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Email confirmation disabled for now — see auth.service.ts / server sign-up.ts.
  // const handleResendConfirmation = async () => {
  //   const targetEmail = pendingConfirmationEmail || email.trim();
  //   if (!targetEmail) {
  //     toast({ title: 'Informe o e-mail cadastrado.' });
  //     return;
  //   }
  //
  //   try {
  //     setIsResending(true);
  //     await authService.resendConfirmation(targetEmail);
  //     toast({ title: 'Confirmação reenviada', description: 'Confira sua caixa de entrada e spam.' });
  //   } catch (error) {
  //     toast({
  //       title: 'Não foi possível reenviar',
  //       description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
  //     });
  //   } finally {
  //     setIsResending(false);
  //   }
  // };

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

          {/* Email confirmation disabled for now — see auth.service.ts / server sign-up.ts.
          {pendingConfirmationEmail && (
            <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-sm text-muted-foreground">
              <p>Cadastro criado para {pendingConfirmationEmail}. Confirme seu e-mail para liberar o login.</p>
              <Button
                type="button"
                variant="link"
                className="mt-1 h-auto p-0 text-primary"
                onClick={handleResendConfirmation}
                disabled={isResending}
              >
                {isResending ? 'Reenviando...' : 'Reenviar e-mail de confirmação'}
              </Button>
            </div>
          )}
          */}

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
