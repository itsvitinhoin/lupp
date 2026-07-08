import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LuppLogo } from '@/components/shared/LuppLogo';
import { ShopifyEmbeddedRecovery } from '@/components/shared/ShopifyEmbeddedRecovery';
import { authService } from '@/services/auth.service';
import { storesService } from '@/services/stores.service';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentStore } from '@/hooks/useStore';
import { isShopifyEmbeddedSession } from '@/lib/shopify-embedded';
import { Link, useLocation } from 'wouter';

function isEmailNotConfirmedError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /email.*not.*confirmed|not.*confirmed|email_not_confirmed/i.test(error.message);
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { error: authError, loading: authLoading, user } = useAuth();
  const storesQuery = useCurrentStore();
  const isEmbeddedShopify = isShopifyEmbeddedSession();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = React.useState('');
  const [isResendingConfirmation, setIsResendingConfirmation] = React.useState(false);

  React.useEffect(() => {
    if (!isEmbeddedShopify || authLoading || !user || storesQuery.isLoading) return;
    setLocation(storesQuery.store ? '/app' : '/onboarding');
  }, [authLoading, isEmbeddedShopify, setLocation, storesQuery.isLoading, storesQuery.store, user]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const confirmationEmail = params.get('confirm_email')?.trim();

    if (confirmationEmail) {
      setEmail(confirmationEmail);
      setUnconfirmedEmail(confirmationEmail);
      toast({
        title: 'Confirme seu e-mail',
        description: 'Enviamos um link de confirmação. Depois de confirmar, volte para fazer login.',
      });
    }

    if (params.get('confirmed') === '1') {
      toast({
        title: 'E-mail confirmado',
        description: 'Agora você já pode entrar na Luup.',
      });
    }

    if (params.get('reset') === '1') {
      toast({
        title: 'Recuperação aberta',
        description: 'Defina sua nova senha para continuar.',
      });
    }
  }, [toast]);

  if (isEmbeddedShopify) {
    return <ShopifyEmbeddedRecovery connecting={!authError} error={authError} />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      toast({ title: 'Preencha e-mail e senha.' });
      return;
    }

    try {
      setIsSubmitting(true);
      await authService.signIn({ email, password });
      const stores = await storesService.listUserStores();
      localStorage.removeItem('lupp_demo_auth');
      localStorage.removeItem('lupp_demo_store');
      toast({ title: 'Login realizado com sucesso.' });
      setLocation(stores.length ? '/app' : '/onboarding');
    } catch (error) {
      if (isEmailNotConfirmedError(error)) {
        const targetEmail = email.trim();
        setUnconfirmedEmail(targetEmail);
        toast({
          title: 'Confirme seu e-mail para entrar',
          description: 'Sua conta já foi criada, mas ainda falta clicar no link de confirmação enviado pela Supabase.',
        });
        return;
      }

      toast({
        title: 'Não foi possível entrar',
        description: error instanceof Error ? error.message : 'Confira suas credenciais e tente novamente.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    const targetEmail = (unconfirmedEmail || email).trim();
    if (!targetEmail) {
      toast({ title: 'Informe o e-mail cadastrado.' });
      return;
    }

    try {
      setIsResendingConfirmation(true);
      await authService.resendConfirmation(targetEmail);
      setUnconfirmedEmail(targetEmail);
      toast({
        title: 'Confirmação reenviada',
        description: 'Confira sua caixa de entrada e a pasta de spam.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível reenviar',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsResendingConfirmation(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      toast({ title: 'Informe seu e-mail para recuperar a senha.' });
      return;
    }

    try {
      setIsResetting(true);
      await authService.resetPassword(email.trim());
      toast({
        title: 'E-mail enviado',
        description: 'Se esse e-mail existir na Lupp, você receberá as instruções de recuperação.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível enviar',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background selection:bg-primary/30">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 rounded-full bg-primary/10 blur-[120px]"></div>
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 rounded-full bg-accent/10 blur-[120px]"></div>
      </div>
      
      <Card className="w-full max-w-md relative z-10 border-white/5 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/50">
        <CardHeader className="space-y-1 text-center pt-8">
          <div className="flex justify-center mb-4">
            <LuppLogo />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Bem-vindo de volta</CardTitle>
          <p className="text-sm text-muted-foreground">
            Acesse seu dashboard para gerenciar seus vídeos
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pb-8">
          <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="nome@sualoja.com.br"
              className="bg-background/50 border-white/10"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (unconfirmedEmail && event.target.value.trim() !== unconfirmedEmail) {
                  setUnconfirmedEmail('');
                }
              }}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                onClick={handlePasswordReset}
                disabled={isResetting}
              >
                {isResetting ? 'Enviando...' : 'Esqueci minha senha'}
              </button>
            </div>
            <Input
              id="password"
              type="password"
              className="bg-background/50 border-white/10"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
          
          <Button className="w-full mt-4" size="lg" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </Button>
          </form>

          {unconfirmedEmail && (
            <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">E-mail ainda não confirmado</p>
              <p className="mt-1">
                Confirme o link enviado para {unconfirmedEmail}. Se não recebeu, reenvie a confirmação.
              </p>
              <Button
                type="button"
                variant="link"
                className="mt-2 h-auto p-0 text-primary"
                onClick={handleResendConfirmation}
                disabled={isResendingConfirmation}
              >
                {isResendingConfirmation ? 'Reenviando...' : 'Reenviar e-mail de confirmação'}
              </Button>
            </div>
          )}
          
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Ou</span>
            </div>
          </div>
          
          <Button variant="outline" className="w-full bg-transparent border-white/10 hover:bg-white/5" disabled>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Entrar com Google em breve
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Ainda não tem conta?{' '}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Criar conta
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
