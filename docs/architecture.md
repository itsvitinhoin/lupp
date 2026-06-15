# Arquitetura Lupp MVP

## Visão geral

A Lupp segue React + TypeScript + Vite no frontend, Supabase para Auth, PostgreSQL, Storage e RLS, e uma camada de services em `artifacts/lupp/src/services`.

O objetivo desta base é permitir migração progressiva dos mocks para dados reais sem reescrever a interface existente.

## Camadas

- `src/lib`: env, constantes e client Supabase.
- `src/types`: contratos de banco e domínio.
- `src/services`: operações de auth, loja, vídeos, produtos, comentários, analytics, widgets, billing e integrações.
- `src/hooks`: hooks React Query/Auth para ligar services às páginas.
- `supabase/migrations`: schema, seed, RLS e storage.
- `public/widget.js`: widget leve em JavaScript puro para embed.

## Tabelas principais

- `profiles`
- `stores`
- `store_members`
- `products`
- `videos`
- `video_products`
- `widgets`
- `custom_pages`
- `custom_page_videos`
- `comments`
- `video_likes`
- `analytics_events`
- `integrations`
- `plans`
- `subscriptions`
- `feed_settings`

## Autenticação

O fluxo preparado é:

1. cadastro por e-mail/senha via Supabase Auth;
2. upsert de `profiles`;
3. onboarding cria `stores`, `store_members`, trial em `subscriptions`, widgets padrão, página padrão e `feed_settings`;
4. rotas privadas passam a depender de `AuthProvider` e da loja atual.

## Upload

`VideoStorageProvider` define a interface comum. O provider ativo é `SupabaseVideoProvider`.

Providers Bunny Stream e Cloudflare Stream existem como placeholders seguros, sem credenciais hardcoded e sem comportamento inventado.

## Feed público

O feed público deve buscar `stores` ativas por slug, vídeos ativos com `is_feed_enabled`, produtos linkados e registrar eventos em `analytics_events`.

Visitantes usam:

- `localStorage.lupp_visitor_id`;
- `sessionStorage.lupp_session_id`.

## Widgets

`widget.js` usa a REST API do Supabase com RLS. Widgets planejados:

- Product Video;
- Home Showcase;
- Floating Video;
- Stories Bar;
- Collection Feed.

O script registra `widget_view` e `video_view`; os próximos passos adicionam `product_click` e deep links por produto.

## Analytics

Eventos são salvos em `analytics_events`. O dashboard calcula:

- views;
- cliques em produto;
- CTR;
- add to cart;
- receita apenas quando `metadata.value` existir;
- likes;
- comentários pendentes;
- vídeos ativos.

## Planos

Planos seedados:

- Start: R$149, 30 vídeos, 5k views, 1 widget.
- Growth: R$199, 80 vídeos, 20k views, 5 widgets.
- Pro: R$299, 200 vídeos, 60k views.
- Scale: R$499, 500 vídeos, 150k views.

`billingService` concentra cálculo de uso e bloqueios básicos.

## Segurança

- RLS está ativa nas tabelas expostas.
- Usuários autenticados só acessam lojas nas quais são membros.
- Dados públicos exigem loja e vídeo ativos.
- Comentários públicos entram como `pending`.
- Eventos públicos são inseríveis apenas para lojas ativas.
- Chaves secretas não entram no frontend.

## Integrações futuras

As integrações de e-commerce implementam `EcommerceIntegration` e começam como placeholders:

- Nuvemshop
- Shopify
- WooCommerce
- Tray
- Yampi
- Loja Integrada
- VTEX

Tracking GA4, Meta Pixel, TikTok Pixel e Webhook deve salvar settings no banco e disparar eventos apenas quando configurado.
