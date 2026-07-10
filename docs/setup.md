# Setup Local da Lupp

## Requisitos

- Node.js compatível com o workspace.
- pnpm.
- Supabase CLI, opcional para ambiente local.

## Instalação

```bash
pnpm install
```

Se o ambiente local usar store isolado do pnpm:

```bash
pnpm install --store-dir .pnpm-store --config.confirmModulesPurge=false
```

## Variáveis de ambiente

Copie `artifacts/lupp/.env.example` para `artifacts/lupp/.env.local` e preencha:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_URL=http://localhost:5173
VITE_WIDGET_CDN_URL=http://localhost:5173/widget.js
VITE_VIDEO_PROVIDER=supabase
```

Use apenas chave pública/publishable no frontend. `STRIPE_SECRET_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, tokens Bunny e tokens Cloudflare devem ficar em backend/edge functions quando forem implementados.

## Rodando o app

O `vite.config.ts` exige `PORT` e `BASE_PATH`:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/lupp run dev
```

## Teste da Etapa 2

Sem `.env.local`, o app entra em modo teste local:

1. Abra `http://localhost:5173/signup`.
2. Crie uma conta de teste.
3. Conclua o onboarding.
4. O app salva uma sessão/loja demo em `localStorage` e abre `/app`.
5. Use o botão de sair no topo para testar logout e proteção de rota.

Com Supabase configurado, o mesmo fluxo usa Auth, RLS e as tabelas reais. Antes de testar cadastro real, aplique a migration e confira se Auth por e-mail/senha está habilitado no projeto Supabase.

## Supabase

Crie um projeto Supabase e aplique a migration:

```bash
supabase db push
```

Ou copie o SQL em `supabase/migrations/20260615131513_init_lupp_mvp_schema.sql` para o SQL Editor do Supabase.

A migration cria:

- tabelas principais do SaaS;
- RLS;
- grants para Data API;
- buckets `videos`, `thumbnails` e `store-assets`;
- seed dos planos Start, Growth, Pro e Scale.

## Upload de vídeo

O provider inicial é `SupabaseVideoProvider`, usando o bucket `videos`. Regras iniciais:

- MP4, MOV e WebM;
- limite de 200MB;
- path no formato `{storeId}/{uuid}.{ext}` para RLS por loja.

## Feed público

As rotas públicas planejadas são:

- `/s/:storeSlug/feed`
- `/s/:storeSlug/pages/:pageSlug`
- `/preview/feed` continua como demo visual.

## Widget

O MVP inclui `artifacts/lupp/public/widget.js`.

Exemplo local:

```html
<script>
(function () {
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.playluup.com.br/widget.js";
  s.setAttribute("data-store-id", "ID_DA_LOJA_LUUP");
  s.setAttribute("data-store", "slug-da-loja");
  s.setAttribute("data-store-name", "Nome da loja");
  s.setAttribute("data-store-url", "https://loja.com.br/");
  s.setAttribute("data-widget", "floating_launcher");
  s.setAttribute("data-lupp-url", "https://www.playluup.com.br");
  s.setAttribute("data-require-active", "true");

  var firstScript = document.getElementsByTagName("script")[0];
  firstScript.parentNode.insertBefore(s, firstScript);
})();
</script>
```

Em produção, o lojista não deve colar chaves de Supabase, UP Zero, Shopify,
Asaas ou Bunny no HTML da loja. O `widget.js` resolve a configuração pública pelo
bootstrap da Luup e qualquer chamada sensível deve passar por Edge Functions.
