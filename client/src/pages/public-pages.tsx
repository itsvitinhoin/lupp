import type React from "react";
import { Link } from "wouter";
import { ArrowRight, Mail, Settings, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LuppLogo } from "@/components/shared/LuppLogo";

const supportEmail = "playluup@gmail.com";

function PublicShell({
  children,
  eyebrow,
  title,
  description,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-200 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/">
            <LuppLogo />
          </Link>
          <Button asChild className="bg-blue-600 text-white hover:bg-blue-700">
            <Link href="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            {description}
          </p>
        </div>
        <div className="mt-10">{children}</div>
      </main>
    </div>
  );
}

export function PublicSettingsPage() {
  return (
    <PublicShell
      eyebrow="Configurações"
      title="Configure a Luup para sua loja"
      description="A área de configurações permite conectar integrações, sincronizar produtos, publicar widgets e ajustar a experiência de vídeo commerce da loja."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="p-6">
            <Settings className="h-8 w-8 text-blue-600" />
            <h2 className="mt-4 text-xl font-black">Painel da loja</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Acesse o painel para configurar integração Nuvemshop, produtos,
              vídeos, miniaturas flutuantes, feed vertical e ordenação.
            </p>
            <Button asChild className="mt-5 bg-blue-600 hover:bg-blue-700">
              <Link href="/app/integrations">
                Abrir configurações
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="p-6">
            <ShieldCheck className="h-8 w-8 text-blue-600" />
            <h2 className="mt-4 text-xl font-black">Conta segura</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Somente usuários autorizados da marca conseguem alterar
              configurações, conectar plataformas e publicar vídeos na loja.
            </p>
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}

export function PrivacyPolicyPage() {
  return (
    <PublicShell
      eyebrow="Política de privacidade"
      title="Como a Luup protege dados de lojas e consumidores"
      description="Esta política resume como coletamos, usamos e protegemos dados necessários para operar a experiência Luup em lojas virtuais."
    >
      <div className="space-y-6 text-base leading-8 text-slate-700">
        <section>
          <h2 className="text-2xl font-black text-slate-950">
            Dados coletados
          </h2>
          <p className="mt-2">
            Coletamos dados da conta da marca, informações de integração com a
            plataforma de e-commerce, catálogo de produtos, vídeos enviados,
            configurações do widget e eventos de uso como visualizações,
            cliques, interações, comentários e adições ao carrinho.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-black text-slate-950">
            Finalidade de uso
          </h2>
          <p className="mt-2">
            Usamos os dados para instalar e operar o widget, sincronizar
            produtos, exibir vídeos relacionados, gerar métricas de performance,
            prestar suporte e melhorar a experiência de video commerce.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-black text-slate-950">
            Compartilhamento
          </h2>
          <p className="mt-2">
            A Luup não vende dados pessoais. Dados podem ser compartilhados com
            provedores essenciais de infraestrutura, hospedagem, banco de dados,
            armazenamento de vídeo, pagamentos e integrações de e-commerce,
            sempre para execução do serviço contratado.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-black text-slate-950">
            Segurança e retenção
          </h2>
          <p className="mt-2">
            Aplicamos controles de acesso, autenticação e segregação de dados
            por loja. Mantemos dados enquanto forem necessários para prestação
            do serviço, cumprimento legal, auditoria e suporte operacional.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-black text-slate-950">
            Contato
          </h2>
          <p className="mt-2">
            Para solicitações sobre privacidade, suporte ou remoção de dados,
            entre em contato pelo e-mail{" "}
            <a className="font-bold text-blue-600" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </PublicShell>
  );
}

export function SupportPage() {
  return (
    <PublicShell
      eyebrow="Suporte"
      title="Suporte Luup"
      description="Nosso suporte ajuda marcas a conectar a plataforma, instalar o widget, sincronizar produtos, publicar vídeos e acompanhar métricas."
    >
      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="p-6">
          <Mail className="h-8 w-8 text-blue-600" />
          <h2 className="mt-4 text-xl font-black">Atendimento por e-mail</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Envie sua solicitação com nome da loja, plataforma utilizada, URL da
            loja e descrição do problema. Para erros de instalação, inclua um
            print da tela e o horário aproximado do teste.
          </p>
          <Button asChild className="mt-5 bg-blue-600 hover:bg-blue-700">
            <a href={`mailto:${supportEmail}`}>
              {supportEmail}
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </PublicShell>
  );
}
