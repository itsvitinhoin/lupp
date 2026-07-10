# Mapeamento Técnico Inicial do Projeto

Data da auditoria: 2026-07-09
Escopo: leitura estática do repositório, mapeamento de arquitetura, segurança, integrações, banco, deploy e testes.
Status da fase: mapeamento inicial concluído e hardening inicial aplicado em pontos críticos de segredo no navegador, webhook financeiro e gates automatizados.

## 1. Resumo executivo

A Luup está organizada como um monorepo `pnpm`, com o produto principal em `artifacts/lupp`, funções Supabase em `supabase/functions`, migrações em `supabase/migrations` e documentação em `docs`. O runtime mais sensível do negócio é o widget público em `artifacts/lupp/public/widget.js`, pois ele roda dentro das lojas dos clientes e concentra lógica de vídeo, feed, métricas, carrossel, carrinho e integrações.

O produto já possui integração ativa com Supabase, Bunny Stream/CDN, Asaas, UP Zero, Nuvemshop e Shopify. A arquitetura está funcional, mas ainda mistura muitas responsabilidades em poucos pontos críticos, especialmente no widget e nas Edge Functions por integração. Isso aumenta risco de regressões quando uma integração muda.

O principal risco confirmado era de segurança: a integração UP Zero expunha uma chave de API no navegador e a usava em chamadas client-side. Nesta rodada, esse fluxo foi movido para uma Edge Function server-side (`upzero-storefront-proxy`) e o bootstrap/widget deixaram de retornar ou aceitar a chave no HTML. Também foi corrigido o comportamento fail-open do webhook Asaas quando o token de autenticação não está configurado.

O projeto tem boa base para produção, mas ainda não tem suíte automatizada de testes, CI/CD visível no repositório nem auditoria automatizada de RLS, secrets, webhooks e fluxos de carrinho por integração. Antes de escalar, a recomendação é estabilizar segurança, contratos de integração, testes de regressão e documentação operacional.

Validação executada nesta fase:

- `pnpm run security:scan`: passou.
- `pnpm run integration:audit`: adicionado como gate permanente para contratos de integracao.
- `pnpm run typecheck`: passou.
- `PORT=3000 BASE_PATH=/ pnpm run build`: passou.
- `node scripts/production-smoke.mjs`: passou contra produção com acesso de rede liberado.

## 2. Stack identificada

| Área | Stack/serviço identificado | Status | Observações |
| --- | --- | --- | --- |
| Frontend admin | React 19, TypeScript, Vite | Confirmado | Aplicação principal em `artifacts/lupp`. |
| UI | Tailwind, Radix UI, Lucide, Recharts | Confirmado | Componentes de admin, dashboard e formulários. |
| Estado/dados | TanStack Query, Supabase JS | Confirmado | Consumo do banco e Edge Functions. |
| Widget externo | JavaScript puro em `artifacts/lupp/public/widget.js` | Confirmado | Runtime instalado nas lojas. É o ponto mais crítico. |
| Vídeo | Bunny Stream/CDN, HLS.js, tus-js-client | Confirmado | Upload e playback via Edge Functions e CDN. |
| Backend | Supabase Edge Functions | Confirmado | Integrações, webhooks, upload, billing e bootstrap do widget. |
| Banco | Supabase Postgres, RLS, Storage | Confirmado | Migrações versionadas em `supabase/migrations`. |
| Billing | Asaas | Confirmado | Checkout, assinatura, mudança/cancelamento de plano e webhook. |
| Integrações e-commerce | UP Zero, Nuvemshop, Shopify | Confirmado | Fluxos ativos com diferenças importantes por plataforma. |
| Deploy | Vercel, Supabase CLI | Confirmado | Configuração local presente; CI remoto não identificado no repositório. |
| Analytics públicos | GA4, Meta Pixel, TikTok Pixel | Confirmado | Variáveis públicas aparecem no ambiente/example. |
| Possíveis legados | Stripe, Mercado Pago, Cloudflare Stream | Suspeito | Variáveis/nomes existem, mas uso ativo não foi confirmado nesta fase. |

## 3. Mapa do repositório

| Caminho | Papel aparente | Classificação | Observações |
| --- | --- | --- | --- |
| `artifacts/lupp` | Aplicação SaaS/admin, landing, rotas protegidas e assets públicos | Ativo crítico | Produto principal. |
| `artifacts/lupp/public/widget.js` | Widget instalado nas lojas | Ativo crítico | Concentra feed vertical, bolinha, carrossel, carrinho e tracking. |
| `artifacts/lupp/public/nuvemshop-loader.js` | Loader específico Nuvemshop | Ativo/sensível | Encaminha atributos para o widget. |
| `artifacts/lupp/src/pages` | Páginas do admin, landing, master, preview, integrações | Ativo | Rotas mapeadas via `AppRoutes.tsx`. |
| `artifacts/lupp/src/routes` | Proteção de rotas e roteamento | Ativo crítico | Contém tratamento específico para Shopify embedded. |
| `artifacts/lupp/src/lib` | Clientes, env, helpers e lógica Shopify embedded | Ativo crítico | Inclui App Bridge e Supabase client. |
| `artifacts/lupp/src/services` | Serviços de dados e integração | Ativo | Contém abstrações e placeholders. |
| `supabase/functions` | Edge Functions de integração, billing, Bunny, master e widget | Ativo crítico | Superfície server-side principal. |
| `supabase/migrations` | Schema, RLS, policies, seeds e alterações de billing/uso | Ativo crítico | Fonte de verdade do banco. |
| `supabase/config.toml` | Config local das Edge Functions | Ativo crítico | Define `verify_jwt` por função. |
| `docs` | Documentação de setup, arquitetura e Bunny | Ativo/desatualizado | Há divergência entre docs antigas e estado atual. |
| `artifacts/api-server` | Servidor Express separado | Suspeito | Parece scaffold/legado; uso em produção não confirmado. |
| `artifacts/mockup-sandbox` | Sandbox visual/protótipo | Suspeito | Pode pesar workspace/build sem ser produto. |
| `lib/*` | Pacotes compartilhados/API scaffold | Suspeito/parcial | Usados por `api-server`; uso pelo app principal não confirmado. |
| `scripts` | Utilitários locais | Ativo auxiliar | Requer revisão para separar scripts operacionais e experimentais. |
| `output` | Artefatos gerados | Suspeito | Contém JS/PDF gerados versionados. |
| `shopify.app.toml` | Config do app Shopify público | Ativo/sensível | Pode coexistir com fluxo custom/manual. |
| `vercel.json` | Config de deploy | Ativo | Deploy principal via Vercel. |

## 4. Mapa de serviços externos

| Serviço | Uso identificado | Arquivos/áreas relacionadas | Risco principal |
| --- | --- | --- | --- |
| Supabase | Auth, Postgres, RLS, Storage, Edge Functions | `artifacts/lupp/src/lib/supabase.ts`, `supabase/functions`, `supabase/migrations` | RLS, egress, chaves públicas e endpoints sem JWT. |
| Bunny Stream/CDN | Upload, processamento e entrega de vídeo | `bunny-upload-video`, `bunny-video-status`, `bunny-delete-video`, `docs/bunny-stream.md` | Secrets devem permanecer apenas server-side; status/processamento precisa fallback. |
| Asaas | Checkout, assinatura, mudança/cancelamento e webhook | Funções `asaas-*` | Webhook financeiro fail-open se token estiver ausente. |
| UP Zero | Produtos, variantes, login B2B, carrinho e preço | `upzero-connect`, `upzero-sync-products`, `lupp-widget-bootstrap`, `widget.js` | Chave de API exposta no browser e chamadas sensíveis client-side. |
| Nuvemshop | OAuth, sync de produtos, script install, LGPD/webhooks | Funções `nuvemshop-*`, `nuvemshop-loader.js` | Dependência de aprovação/ativação de script e compatibilidade onload/OFI. |
| Shopify | OAuth, sync, compliance webhooks, embedded app, custom app | Funções `shopify-*`, `shopify.app.toml`, `shopify-embedded.ts` | Diferença entre app público, custom app e instalação manual. |
| Vercel | Hosting da aplicação e widget | `.vercel`, `vercel.json` | Garantir que produção reflita Git e envs corretas. |
| GA4/Meta/TikTok | Tracking público | Env/public config | Baixo risco, desde que só IDs públicos sejam usados. |
| Stripe/MercadoPago/Cloudflare | Variáveis ou placeholders | `.env.local`, `.env.example` | Possível legado; validar antes de manter. |

## 5. Mapa de código morto ou suspeito

| Item | Classificação | Evidência | Recomendação futura |
| --- | --- | --- | --- |
| `artifacts/api-server` | Suspeito | App Express separado, não aparece como runtime principal. | Confirmar se existe deploy ativo; se não, remover ou arquivar. |
| `artifacts/mockup-sandbox` | Suspeito | App Vite de sandbox/protótipo dentro de `artifacts/*`. | Separar do workspace produtivo ou documentar finalidade. |
| `lib/api-spec`, `lib/api-client-react`, `lib/api-zod`, `lib/db` | Suspeito/parcial | Parecem scaffolds usados pelo `api-server`, não pelo app principal. | Mapear consumidores reais antes de excluir. |
| `output/luup-nuvemshop-script-v2.js` | Suspeito | Artefato gerado versionado. | Mover para release artifacts ou documentar origem. |
| `output/pdf/lupp-analise-custos-unit-economics.pdf` | Suspeito | PDF gerado versionado. | Avaliar se deve ficar em docs ou fora do repo. |
| `docs/architecture.md` | Atualizado nesta fase | Agora descreve Bunny como provider principal, widget via Edge Functions e contratos de seguranca. | Manter junto com alteracoes de arquitetura. |
| Variáveis `VITE_BUNNY_API_KEY` e `VITE_CLOUDFLARE_STREAM_TOKEN` | Suspeito de configuração perigosa | Nomes `VITE_` indicam exposição pública se importados no frontend. | Renomear secrets para variáveis server-side quando aplicável. |
| Páginas `test-store` | Demo/QA | Rotas públicas de teste existem. | Confirmar se devem existir em produção e proteger quando necessário. |

## 6. Mapa de segurança

| Prioridade | Achado | Evidência | Impacto | Recomendação |
| --- | --- | --- | --- | --- |
| P0 | Chave UP Zero exposta ao navegador | Corrigido no código: `lupp-widget-bootstrap` não retorna mais a chave e `widget.js` não aceita mais `data-supabase-key`/chave UP Zero para esse fluxo. | Chaves já expostas anteriormente ainda podem ter sido copiadas. | Rotacionar chaves UP Zero já expostas e manter carrinho/status via `upzero-storefront-proxy`. |
| P1 | Chamadas sensíveis UP Zero client-side | Corrigido no código: `/v1/clients/me` e `/v1/cart/batch` passaram a usar `upzero-storefront-proxy`. | Reduz exposição de credenciais e centraliza controle por loja. | Monitorar logs por loja e endurecer allowlist de origem depois da estabilização. |
| P1 | Webhook Asaas podia aceitar eventos sem token se env não existisse | Corrigido no código: `ASAAS_WEBHOOK_TOKEN` agora é obrigatório. | Se a secret não estiver configurada em produção, o webhook retorna 500 em vez de aceitar evento sem validação. | Confirmar secret no Supabase antes do deploy. |
| P1 | RLS e policies públicas precisam teste automatizado | Migrações expõem políticas anon/auth para widget, analytics e leitura pública. | Risco de leitura/escrita indevida e abuso de eventos. | Criar testes de RLS e limites por rota/tabela. |
| P1 | Ausência de testes de regressão para integrações críticas | Nenhuma suíte automatizada encontrada. | Correções em uma integração podem quebrar outra. | Criar smoke tests por provider: UP Zero, Nuvemshop, Shopify. |
| P2 | Supabase anon key aparece em snippets/loader | `nuvemshop-install-script`, `nuvemshop-loader.js`, `docs/setup.md`. | Anon key não é segredo, mas aumenta superfície e exige RLS impecável. | Remover de snippets quando possível e resolver via bootstrap público com allowlist por loja. |
| P2 | Endpoints `verify_jwt=false` dependem de validação própria | `supabase/config.toml` lista OAuth/webhook/bootstrap públicos. | Se uma função falhar validação manual, vira endpoint aberto. | Auditar função por função e padronizar validação HMAC/state/token. |
| P2 | CORS aberto em Edge Functions públicas | Funções de widget/webhook e upload usam CORS permissivo conforme necessidade. | Aceitável para widget, perigoso se combinado com auth fraca. | Manter apenas onde necessário e exigir autenticação/assinatura. |
| P2 | Email master default hardcoded | `master-console` usa fallback para `playluup@gmail.com`. | Baixo risco se env estiver correto, mas ruim para governança. | Exigir env explícita em produção. |
| Info | Shopify/Nuvemshop têm validações específicas | HMAC/state identificados em funções OAuth/compliance. | Boa prática presente. | Manter testes automatizados para não regredir. |

Observação: nenhum valor real de secret foi incluído neste relatório. Nomes de variáveis e caminhos foram preservados para rastreabilidade.

## 7. Mapa de arquitetura e organização

A arquitetura atual é uma combinação de SPA/admin, widget público e Edge Functions. Isso é coerente com o produto, mas a separação de responsabilidades ainda está frágil.

Pontos confirmados:

- O app principal usa rotas protegidas em `artifacts/lupp/src/routes`.
- O widget público é o principal runtime multi-loja.
- As integrações são implementadas principalmente em Edge Functions por provider.
- O banco Supabase é o centro de dados de lojas, produtos, vídeos, métricas, planos e integrações.

Pontos de atenção:

- O `widget.js` concentra lógica de UI, tracking, player, produto, carrinho, login B2B, carrossel e diferenças por plataforma.
- A lógica de integração parece crescer por exceção, com risco de branches específicos por loja/plataforma.
- O fluxo Shopify tem três caminhos coexistindo: app público, custom app e script manual.
- Billing e trial aparecem distribuídos entre frontend, banco e Edge Functions.
- Documentação de arquitetura não reflete completamente Bunny, planos e integrações atuais.

Recomendação futura: evoluir para contratos explícitos por integração, por exemplo `capabilities` por provider: `canShowPrice`, `canAddToCart`, `requiresLogin`, `supportsHorizontalCarousel`, `supportsVariants`, `supportsInVideoCheckout`.

## 8. Mapa de banco de dados

Migrações identificadas em `supabase/migrations` cobrem:

- Schema remoto inicial.
- Perfis e triggers.
- Buckets/policies de Storage.
- OAuth Nuvemshop e eventos LGPD.
- Produtos, IDs externos, variantes e múltiplos produtos por vídeo.
- Visibilidade por produto/cor.
- Billing Asaas, trial e cupons.
- Bunny metadata.
- Status `deleted` para vídeos.
- Master Console/audit logs.
- Métricas mensais e eventos de impressão/fechamento.
- Cancelamento de assinatura e acesso.

Pontos positivos:

- Há migrações versionadas.
- `integration_secrets` aparece como área sensível com RLS/revokes nas migrações.
- Storage e políticas foram pensados desde o início.

Riscos e lacunas:

- É necessário auditar todas as policies anon/auth, especialmente as usadas pelo widget.
- Funções `SECURITY DEFINER`, se existentes nas migrações, precisam revisão de `search_path`, permissões e `EXECUTE`.
- Cupons de teste foram semeados por migração; validar se ainda existem ativos em produção.
- Vídeos antigos podem continuar em Supabase Storage se metadados ainda apontam para URLs Supabase. A exclusão em massa deve ser feita pela Storage API, não por delete direto em `storage.objects`.
- Métricas de impressão, abertura, view e tempo médio precisam agregação com custo controlado para não gerar egress/cache excessivo.

## 9. Mapa de CI/CD e deploy

Itens confirmados:

- Vercel é o hosting principal.
- Supabase Edge Functions e migrations são deployadas via Supabase CLI.
- `shopify.app.toml` existe para o app Shopify.
- `pnpm-workspace.yaml` organiza o monorepo.
- `package.json` raiz tem `build` e `typecheck`.

Itens adicionados nesta fase:

- `.github/workflows/quality-gates.yml` com security scan, integration audit, typecheck e build em push/PR.
- `.github/workflows/integration-audit.yml` com auditoria recorrente a cada 6 horas.
- `.github/workflows/production-smoke.yml` para smoke de producao.
- `scripts/security-secret-scan.mjs` para bloquear secrets e chaves em codigo.
- `scripts/integration-audit.mjs` para bloquear regressao nos contratos UP Zero, Nuvemshop, Shopify, Asaas e Bunny.

Itens ainda pendentes:

- Testes automatizados de Edge Functions com fixtures por provider.
- Testes E2E reais de widget/carrinho por integracao.
- Deploy checklist versionado.

Risco: produção depende muito de execução manual e memória operacional. Isso aumenta chance de publicar widget, Supabase Function ou Vercel em versões divergentes.

## 10. Mapa de dependências

Pontos positivos:

- Uso de `pnpm`.
- `pnpm-workspace.yaml` define `minimumReleaseAge: 1440`, ajudando contra supply-chain attacks recentes.
- `preinstall` evita lockfiles conflitantes.
- Dependências principais são coerentes com o produto: Supabase, HLS, TUS, React, Vite, Radix, Recharts.

Pontos de atenção:

- Não foi identificado runner de testes.
- Não foi identificado script de lint consistente.
- Dependências do `artifacts/api-server` e `artifacts/mockup-sandbox` podem inflar workspace se não forem parte ativa do produto.
- Variáveis com prefixo `VITE_` devem ser tratadas como públicas. Qualquer secret com esse prefixo é risco.

## 11. Mapa de testes

Teste executado:

- `pnpm --filter @workspace/lupp run typecheck`: passou.

Testes não identificados:

- Unit tests.
- Integration tests.
- E2E tests.
- Testes de RLS.
- Testes de webhook HMAC.
- Testes de widget em lojas simuladas.
- Testes de carrinho por plataforma.

Cobertura mínima recomendada para escalar:

- Widget bootstrap: loja ativa/inativa, plano expirado, sem vídeo, com feed vertical e horizontal.
- UP Zero: login/logout, preço oculto/exibido, variantes, carrinho batch, URL correta de produto/cor.
- Nuvemshop: script onload, carrinho, variantes, produto sem variação, mobile/desktop.
- Shopify: sync de produtos/variantes, cart add, app público/custom/manual.
- Asaas: checkout, upgrade, downgrade, cancelamento, webhook idempotente e assinatura inválida.
- Bunny: upload, erro de rede, status processing/ready, fallback de playback.
- Segurança: RLS anon/auth, endpoints públicos sem token, secret scanning.

## 12. Documentação e onboarding

Documentação existente:

- `docs/setup.md`
- `docs/architecture.md`
- `docs/bunny-stream.md`

Lacunas:

- Guia de deploy produção: Vercel, Supabase Functions, migrations e validação pós-deploy.
- Inventário de variáveis de ambiente: público vs secreto vs legado.
- Playbook por integração: UP Zero, Nuvemshop, Shopify, Asaas, Bunny.
- Guia de segurança/RLS.
- Guia de rotação de chaves.
- Guia de incidentes: egress Supabase, webhook interrompido, upload Bunny, carrinho com erro.
- Guia de testes manuais por release.
- Documento de arquitetura atualizado para Bunny, carrossel horizontal, planos/widgets e Shopify custom/public.

## 13. Priorização por fases

### Fase 2: Segurança crítica

- Remover exposição da chave UP Zero no widget.
- Rotacionar chaves UP Zero já expostas.
- Tornar webhook Asaas fail-closed.
- Auditar endpoints `verify_jwt=false`.
- Classificar todas as envs como públicas ou secretas.

### Fase 3: Integrações e contratos

- Definir contrato de capabilities por plataforma.
- Criar proxy server-side para ações sensíveis.
- Estabilizar UP Zero em todas as lojas atuais e futuras.
- Padronizar Nuvemshop e Shopify em fluxos separados e documentados.

### Fase 4: Código morto e organização

- Validar uso real de `artifacts/api-server`, `artifacts/mockup-sandbox`, `lib/*` e `output/*`.
- Remover ou arquivar artefatos sem uso.
- Manter `docs/integration-contracts.md` como fonte de verdade para novas features.
- Separar responsabilidades do widget em módulos testáveis.

### Fase 5: Arquitetura de escala

- Criar camada de adapters por integração.
- Criar camada comum para Edge Functions: auth, CORS, logs, erros, idempotência.
- Revisar métricas para reduzir custo Supabase e egress.

### Fase 6: Testes e CI/CD

- Adicionar CI com typecheck, build, lint, secret scan e testes.
- Criar smoke tests por integração.
- Criar testes de RLS e webhooks.
- Criar checklist de release.

### Fase 7: Documentação e operação

- Atualizar docs técnicas.
- Criar playbooks de suporte.
- Documentar onboarding de novas lojas.
- Documentar processo de deploy e rollback.

## 14. Lista recomendada de Issues futuras

1. [P0][Segurança] Remover chave UP Zero do widget e rotacionar chaves expostas.
   - Arquivos prováveis: `supabase/functions/lupp-widget-bootstrap/index.ts`, `artifacts/lupp/public/widget.js`.
   - Impacto: exposição de credencial e chamadas sensíveis client-side.

2. [P1][Segurança] Criar proxy server-side para UP Zero cliente, preço, variantes e carrinho.
   - Arquivos prováveis: nova Edge Function ou funções `upzero-*`, `widget.js`.
   - Impacto: estabiliza login B2B, carrinho e evita vazamento de API key.

3. [P1][Billing] Tornar webhook Asaas fail-closed e idempotente.
   - Arquivo provável: `supabase/functions/asaas-webhook/index.ts`.
   - Impacto: evita atualização indevida de assinaturas.

4. [P1][Segurança] Auditar RLS e policies públicas usadas pelo widget.
   - Arquivos prováveis: `supabase/migrations/*`.
   - Impacto: reduz risco de leitura/escrita indevida via anon key.

5. [P1][Integrações] Criar smoke tests multi-provider para UP Zero, Nuvemshop e Shopify.
   - Impacto: evita regressão cruzada ao corrigir uma integração.

6. [P2][Segurança] Remover Supabase anon key dos snippets de instalação quando possível.
   - Arquivos prováveis: `nuvemshop-install-script`, `nuvemshop-loader.js`, `docs/setup.md`.
   - Impacto: reduz superfície pública e simplifica instalação.

7. [P2][Config] Renomear variáveis secretas com prefixo `VITE_`.
   - Arquivos prováveis: `.env.example`, docs e configuração de ambientes.
   - Impacto: evita exposição acidental em bundle frontend.

8. [P2][Arquitetura] Modularizar `widget.js` por domínios.
   - Domínios sugeridos: bootstrap, player, tracking, cards, providers, cart, carousel.
   - Impacto: reduz regressões e facilita testes.

9. [P2][CI/CD] Criar GitHub Actions com typecheck, build, lint e secret scan.
   - Impacto: cria gate antes de produção.

10. [P2][Código morto] Revisar e classificar `artifacts/api-server`, `mockup-sandbox`, `lib/*` e `output/*`.
    - Impacto: reduz ruído, risco e custo de manutenção.

11. [P2][Banco] Criar testes de policies RLS e funções `SECURITY DEFINER`.
    - Impacto: melhora segurança do Supabase.

12. [P2][Billing] Revisar regras de upgrade, downgrade, cancelamento e trial.
    - Impacto: evita cobranças duplicadas, plano incorreto e inconsistência de acesso.

13. [P3][Docs] Atualizar `docs/architecture.md` para o estado atual.
    - Impacto: onboarding técnico mais confiável.

14. [P3][Operação] Criar playbooks de incidentes.
    - Casos: webhook Asaas interrompido, Supabase egress alto, Bunny processing, Nuvemshop script inativo, UP Zero carrinho falhando.

15. [P3][Observabilidade] Padronizar logs estruturados e alertas nas Edge Functions.
    - Impacto: reduz tempo de diagnóstico em produção.
