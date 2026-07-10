# Arquitetura Luup

## Visao Geral

A Luup e uma plataforma de video commerce com experiencia de feed vertical, bolinha flutuante e carrossel horizontal dentro do e-commerce do cliente.

A base atual usa:

- React, TypeScript e Vite no admin em `artifacts/lupp`.
- Supabase Auth, Postgres, Edge Functions e metadados operacionais.
- Bunny Stream/CDN como provider principal de video.
- Scripts publicos em `artifacts/lupp/public` para rodar dentro das lojas.
- Edge Functions como fronteira obrigatoria entre navegador e APIs privadas de provedores.

## Principios

- Nenhuma chave privada pode sair do servidor.
- O widget nunca chama APIs administrativas de provedores diretamente.
- Toda integracao precisa ter um contrato separado para conectar, sincronizar catalogo, validar sessao/preco, adicionar ao carrinho e receber webhooks.
- Novas funcionalidades devem passar por `security:scan`, `integration:audit`, typecheck e build antes de deploy.

## Camadas

- `artifacts/lupp/src/lib`: env, constantes e client Supabase do admin.
- `artifacts/lupp/src/types`: contratos de banco e dominio.
- `artifacts/lupp/src/services`: operacoes de auth, lojas, videos, produtos, analytics, billing e integracoes.
- `artifacts/lupp/src/hooks`: hooks React que ligam services as paginas.
- `artifacts/lupp/public/widget.js`: runtime publico do widget.
- `artifacts/lupp/public/nuvemshop-*.js`: scripts aprovados/auxiliares da Nuvemshop.
- `supabase/functions`: fronteira server-side para providers, billing, widgets e integracoes.
- `supabase/migrations`: schema, RLS, storage e seeds.

## Widget Publico

O `widget.js` deve ser tratado como codigo publico e nao confiavel. Ele pode:

- Ler atributos publicos do script, como `data-store-id`, `data-store` e `data-store-url`.
- Chamar `lupp-widget-bootstrap` para carregar configuracao publica da loja, videos ativos e widgets liberados.
- Chamar `upzero-storefront-proxy` para fluxos UP Zero que exigem credenciais ou normalizacao de sessao.
- Registrar eventos publicos de analytics por fronteiras controladas.

O `widget.js` nao pode:

- Receber `data-supabase-key`.
- Montar `X-API-Key` de provedores.
- Ler `integration_secrets`.
- Chamar Supabase REST diretamente.
- Conter tokens Shopify, Asaas, Bunny, UP Zero ou service role.

## Videos

Bunny Stream/CDN e o provider principal para upload, processamento e playback.

Supabase armazena metadados, relacionamentos, status, produtos vinculados, metricas e configuracoes. Videos antigos em Supabase Storage devem ser migrados/removidos com Storage API, nunca por delete direto nas tabelas internas do storage.

Funcoes relevantes:

- `bunny-upload-video`
- `bunny-video-status`
- `bunny-delete-video`

## Integracoes

Cada integracao tem um adapter com responsabilidades explicitas:

- Conexao: OAuth, token manual, app personalizado ou API key.
- Sync: produtos, imagens, variantes, estoque, URLs canonicas e dados comerciais permitidos.
- Runtime: status de login, visibilidade de preco, carrinho e redirecionamentos.
- Webhooks: privacidade, produto, estoque, preco, pedido e billing quando aplicavel.

Integracoes ativas:

- UP Zero: B2B, preco condicionado a login/aprovacao e carrinho via proxy Luup.
- Nuvemshop: B2C, script oficial aprovado e carrinho pela camada publica/NubeSDK.
- Shopify: B2C, OAuth publico ou app customizado, sync server-side e carrinho via storefront/theme.
- Asaas: billing da Luup, sempre server-side.
- Bunny: videos, sempre server-side para escrita e CDN publico para leitura.

## Analytics

Eventos sao registrados em `analytics_events` e agregados no dashboard. Metricas principais:

- impressoes da bolinha;
- aberturas do feed;
- views de video;
- cliques em produto;
- adicoes ao carrinho;
- checkout iniciado quando a integracao permitir;
- tempo medio na experiencia;
- feedbacks, estrelas e comentarios.

Conversoes finais so devem aparecer como metrica ativa quando a integracao realmente permitir atribuicao de compra.

## Planos

Os limites devem ser validados por uso real da loja:

- videos ativos;
- views mensais;
- widgets ativos;
- funcionalidades avancadas.

O plano Starter permite 1 widget ativo. Usar bolinha flutuante e carrossel horizontal simultaneamente exige Growth ou superior.

## Billing

Asaas e a fonte de cobranca da Luup. Criacao, troca, downgrade, cancelamento e webhooks devem ficar centralizados nas Edge Functions de billing.

Funcoes relevantes:

- `asaas-create-subscription`
- `asaas-change-plan`
- `asaas-cancel-subscription`
- `asaas-webhook`

O webhook do Asaas deve exigir `ASAAS_WEBHOOK_TOKEN`.

## Guardrails

Comandos locais:

```bash
pnpm run security:scan
pnpm run integration:audit
pnpm run quality:check
pnpm run build
```

GitHub Actions:

- `Quality Gates`: roda em push/PR para `main`.
- `Integration Audit`: roda manualmente e a cada 6 horas.
- `Production Smoke`: monitora landing, widget e rotas publicas em producao.

Quando uma integracao falhar, a primeira pergunta deve ser: o contrato dela quebrou ou o provider mudou comportamento?
