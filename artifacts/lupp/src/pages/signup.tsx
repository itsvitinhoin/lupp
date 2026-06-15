import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LuppLogo } from '@/components/shared/LuppLogo';
import { Link } from 'wouter';

export default function Signup() {
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
          <div className="space-y-2">
            <Label htmlFor="name">Nome completo</Label>
            <Input id="name" placeholder="Seu nome" className="bg-background/50 border-white/10" />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">E-mail de trabalho</Label>
            <Input id="email" type="email" placeholder="nome@sualoja.com.br" className="bg-background/50 border-white/10" />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" className="bg-background/50 border-white/10" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store">Nome da loja</Label>
            <Input id="store" placeholder="Ex: Bella Moda" className="bg-background/50 border-white/10" />
          </div>

          <div className="space-y-2">
            <Label>Plataforma da loja</Label>
            <Select>
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
          
          <Button className="w-full mt-6" size="lg" asChild>
            <Link href="/onboarding">Criar conta grátis</Link>
          </Button>
          
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
