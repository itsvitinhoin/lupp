# Contratos de Integracao

Este documento define como novas features devem ser implementadas sem quebrar UP Zero, Nuvemshop, Shopify, Asaas ou Bunny.

## Regra Principal

Toda integracao deve preservar estas fronteiras:

- Browser: somente configuracao publica, UI, eventos publicos e APIs publicas da propria loja.
- Luup Edge Functions: credenciais, normalizacao de dados, proxy, webhooks e chamadas administrativas.
- Banco: metadados, relacionamentos, planos, limites, logs e status.
- Provider: fonte original de catalogo, estoque, login, carrinho, cobranca ou video.

Se uma feature precisar de chave privada, ela pertence a uma Edge Function.

## Checklist Para Nova Feature

Antes de publicar uma alteracao que toque integracoes:

1. Identifique quais providers sao afetados.
2. Confirme se a feature roda no navegador ou no servidor.
3. Garanta que nenhum token novo foi adicionado ao bundle publico.
4. Preserve variantes, estoque e URLs canonicas no sync de produtos.
5. Teste carrinho com produto simples e produto com variantes.
6. Teste usuario logado e deslogado nas plataformas B2B.
7. Rode `pnpm run security:scan`.
8. Rode `pnpm run integration:audit`.
9. Rode `pnpm run typecheck`.
10. Rode smoke test de producao depois do deploy.

## UP Zero

Tipo: B2B.

Responsabilidades:

- `upzero-connect`: salvar credenciais e dados da loja.
- `upzero-sync-products`: sincronizar produtos, imagens, variantes, cores, tamanhos, estoque e URLs.
- `upzero-storefront-proxy`: validar origem, checar status do cliente, esconder/liberar preco e enviar carrinho.

Regras:

- O widget nunca deve chamar a API da UP Zero diretamente com `X-API-Key`.
- Preco e CTA dependem do status real do usuario na vitrine.
- Logout precisa esconder preco novamente.
- Links de produto devem usar a URL canonica sincronizada ou a variante correta, nunca montar slug a partir do titulo bruto.
- O carrinho rapido deve refletir grade real de cor/tamanho/estoque.

Testes obrigatorios:

- Loja Phize.
- Loja Celeb.
- Loja Lipcem.
- Nova loja UP Zero sem tratamento especial.

## Nuvemshop

Tipo: B2C.

Responsabilidades:

- `nuvemshop-oauth-start` e `nuvemshop-oauth-callback`: conexao.
- `nuvemshop-sync-products`: catalogo e variantes.
- `nuvemshop-install-script`: instalacao/reativacao do script aprovado.
- `nuvemshop-lgpd-webhooks`: privacidade e compliance.
- Scripts `nuvemshop-*.js`: runtime aprovado pela Nuvemshop.

Regras:

- O script aprovado deve carregar `widget.js` sem chaves privadas.
- A bolinha e o carrossel horizontal devem funcionar com o mesmo bootstrap publico.
- O carrinho deve usar recursos publicos da loja/NubeSDK, nunca token admin.
- Se a Nuvemshop retornar script pendente ou bloqueado, o admin deve orientar ativacao/aprovacao sem prometer instalacao concluida.

Testes obrigatorios:

- Loja dev.
- Benj.
- Uma loja nova instalada via OAuth.

## Shopify

Tipo: B2C.

Responsabilidades:

- `shopify-oauth-start` e `shopify-oauth-callback`: app publico.
- `shopify-connect-custom-app`: conexao custom/manual quando necessario.
- `shopify-sync-products`: catalogo, imagens, variantes e estoque.
- `shopify-compliance-webhooks`: webhooks obrigatorios de privacidade.
- `shopify-embedded-session` e `shopify-session-token-ping`: fluxo embedded.

Regras:

- Sync de produtos sempre server-side.
- O tema pode carregar `widget.js`, mas nunca receber token Admin.
- Carrinho no storefront deve usar endpoint publico da loja, como `/cart/add.js`, quando aplicavel.
- App publico e app customizado nao devem compartilhar segredo por codigo hardcoded.

Testes obrigatorios:

- Loja teste do app publico.
- Osang com instalacao manual/custom.
- Produto sem variante explicita.
- Produto com variantes de cor/tamanho.

## Asaas

Tipo: billing Luup.

Responsabilidades:

- Criar assinatura.
- Trocar plano.
- Cancelar plano respeitando ciclo pago.
- Aplicar trial.
- Processar webhooks autenticados.

Regras:

- Nao criar duas assinaturas ativas para a mesma loja.
- Upgrade/downgrade deve registrar data efetiva e tratamento proporcional.
- Cancelamento deve manter acesso ate o fim do periodo ja pago, quando aplicavel.
- Webhook exige token e deve ser idempotente.

## Bunny

Tipo: video/stream.

Responsabilidades:

- Upload server-side.
- Status de processamento.
- Delete server-side.
- Playback por CDN publico.

Regras:

- Supabase nao deve servir streaming dos videos novos.
- Widget deve priorizar URL Bunny processada.
- Ao excluir video no admin, remover tambem do provider quando houver `bunny_video_id`.
- Falha de upload precisa ser clara e recuperavel, sem salvar video parcial como publicado.

## Indicadores de Regressao

Sinais de que uma integracao quebrou:

- Produto aparece sem imagem.
- Variantes somem no pedido rapido.
- CTA leva para slug gerado incorretamente.
- Usuario deslogado ve preco B2B.
- Usuario logado continua sem preco.
- Carrinho exige refresh para refletir itens.
- Widget pede chave no snippet.
- Script publico chama API privada do provider.
- Upload salva no Supabase em vez de Bunny.

Quando qualquer sinal aparecer, abra issue com:

- loja afetada;
- integracao;
- produto/video de exemplo;
- URL da vitrine;
- console/network relevante;
- ultimo commit/deploy.
