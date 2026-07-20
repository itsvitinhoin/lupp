# Onboarding do Widget Luup

Guia de instalação do widget de vídeo shoppable em cada plataforma suportada.
Público: time de suporte/implantação e lojistas técnicos.

## Como o widget funciona (leia antes de instalar)

Uma única tag `<script>` (ou o app da plataforma) carrega o `widget.js` na
vitrine. A cada página ele faz **um** request — `GET /api/widget/bootstrap` —
enviando a URL da página e a identidade da loja; o servidor responde com as
regras de exibição, a configuração resolvida (aparência, carrossel) e os
cards de vídeo prontos para renderizar. Depois que a plataforma da loja é
identificada, o adaptador dela (`widget-nuvemshop.js`, `widget-shopify.js`
ou `widget-upzero.js`) é carregado para habilitar o add-to-cart nativo.

Três consequências práticas:

1. **Aparência é configurada no painel** (`/app/widgets`), nunca no snippet.
   Atributos `data-*` extras no snippet **sobrescrevem** o painel para sempre
   — só use se quiser fixar um valor.
2. **A loja precisa ser resolvível**: o bootstrap identifica a loja por
   `store_id` → id externo da integração → slug → domínio (tabela
   `store_domains`). Domínio novo/custom que não resolve = widget invisível.
3. **Billing gate**: trial expirado e sem assinatura ativa = bootstrap
   responde `trial_expired` com zero vídeos. O widget some silenciosamente.

## Pré-requisitos (todas as integrações)

- [ ] Conta Luup criada e loja cadastrada (slug definido).
- [ ] Trial ativo ou assinatura vigente.
- [ ] Pelo menos 1 vídeo publicado (`status: active`, feed habilitado).
- [ ] Widget flutuante ativo e personalizado em **`/app/widgets`**.
- [ ] Produtos sincronizados (para add-to-cart e vínculo vídeo↔produto).

Validação rápida em qualquer etapa: abra
`/test-store/{slug}` no painel — é o widget real contra os vídeos reais da
loja.

---

## 1. Nuvemshop (app oficial — recomendado)

A instalação é automatizada pelo app do partner portal (app id **36726**).

**Passos do lojista:**

1. No painel Luup: **Integrações → Nuvemshop → Conectar**. O fluxo OAuth abre
   a autorização da Nuvemshop; ao aceitar, a loja volta conectada
   (`connected=nuvemshop`).
2. **Sincronizar produtos** (botão na página de integrações). Até 10 páginas
   de 100 produtos por execução.
3. **Instalar widget** — verifica na Scripts API se o script auto-instalado
   do app está ativo na loja. Com "Instalação automática" ligada no portal,
   um script ativo já é sucesso terminal (`AUTO_INSTALL_VERIFIED`): a
   Nuvemshop injeta o script sozinha em toda loja com o app instalado.

**O que NÃO fazer:**

- Não colar o snippet manual em lojas com o app instalado — o widget
  carregaria duas vezes.
- Não ligar "Use NubeSDK" no script do portal: nosso loader precisa do DOM e
  em modo NubeSDK (web worker) ele não executa. Atenção: NubeSDK passa a ser
  obrigatório para **novas instalações** em 30/08/2026 — o port está no
  roadmap.

**Verificação:** na vitrine, DevTools → Network:
`apps-scripts.tiendanube.com/.../luup-video-experience/...js` →
`nuvemshop-script.js` → `widget.js` → `bootstrap` 200 com vídeos. O
add-to-cart usa `window.LuupNuvemshopCart` (bridge) com fallback de POST para
`/comprar/`.

---

## 2. Shopify

1. **Integrações → Shopify → Conectar** (OAuth; para lojas com app custom,
   usar o fluxo "connect custom app" com as credenciais do app).
2. **Sincronizar produtos** após conectar.
3. **Instalar o snippet no tema** — não há injeção automática de script:
   Admin Shopify → Online Store → Themes → Edit code → `theme.liquid`, colar
   o snippet copiado de `/app/widgets` antes de `</body>`.

O adaptador `widget-shopify.js` carrega sozinho após o bootstrap identificar
`store.platform = "shopify"`.

---

## 3. Upzero

Integração de plataforma parceira — a conexão é feita em
**Integrações → Upzero** e o carregamento na vitrine é gerenciado pela
própria plataforma (storefront proxy + descoberta de contexto de carrinho).
Checklist do lado Luup: conectar, sincronizar produtos e confirmar que o
domínio da loja resolve no bootstrap. O adaptador `widget-upzero.js` cuida do
add-to-cart.

---

## 4. Google Tag Manager (qualquer plataforma)

Use quando a plataforma não tem app oficial e o lojista já usa GTM.

1. Copie o snippet de instalação em **`/app/widgets` → Copiar código
   manual** (ele já contém `data-store-id`, `data-store` e
   `data-store-domain` da loja — não edite).
2. No GTM: **Tags → New → Custom HTML**, cole o snippet inteiro (com as tags
   `<script>`).
3. Trigger: **All Pages** (Page View). O widget mesmo decide onde aparecer
   (as regras de exibição — modo, include/exclude paths — vêm do painel).
4. Em "Advanced settings", marque *Once per page*. Publique o container.

**Ressalvas do GTM:**

- **Uma origem de instalação só**: se a loja depois instalar o app Nuvemshop
  (ou o snippet no tema), pause a tag do GTM — instalação dupla = widget
  duplo.
- Se o consentimento de cookies do lojista bloquear tags até o aceite, o
  widget só aparece após o consentimento — comportamento esperado, mas vale
  avisar o lojista.
- Em SPAs/temas com navegação sem reload, o widget já refaz o bootstrap por
  conta própria; não crie triggers de History Change.

---

## 5. Instalação manual (outras plataformas: WooCommerce, Tray, VTEX, …)

Qualquer plataforma que aceite HTML custom no tema funciona com o mesmo
snippet de `/app/widgets` (Custom HTML do tema, rodapé, ou campo de scripts
da plataforma). Nessas plataformas o add-to-cart nativo não tem adaptador
dedicado — o card do produto leva o comprador para a página do produto.

Snippet (formato gerado pelo painel — sempre copie do painel, que preenche a
identidade da loja):

```html
<script>
(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://luup.dzns.com.br/widget.js';
  s.setAttribute('data-store-id', '<id da loja>');
  s.setAttribute('data-store', '<slug>');
  s.setAttribute('data-store-domain', '<dominio-da-loja>');
  s.setAttribute('data-widget', 'floating_video');
  s.setAttribute('data-require-active', 'true');
  s.setAttribute('data-lupp-url', 'https://luup.dzns.com.br');
  s.setAttribute('data-api-url', 'https://luup.dzns.net');
  var f = document.getElementsByTagName('script')[0];
  f.parentNode.insertBefore(s, f);
})();
</script>
```

Para o carrossel da Home existe um snippet separado (`data-widget:
home_carousel`) — disponível no editor do feed horizontal (planos
growth/pro/scale).

---

## Checklist de verificação (todas as integrações)

1. DevTools → Network: `widget.js` responde `200 application/javascript`.
2. `GET /api/widget/bootstrap` responde 200 com `"active": true` e
   `videos: [...]` não vazio.
3. Launcher aparece na posição configurada; clique abre o feed.
4. Página de produto vinculado mostra o vídeo do produto primeiro.
5. Add-to-cart funciona (Nuvemshop/Shopify/Upzero) ou leva ao produto.

## Troubleshooting rápido

| Sintoma | Causa provável | Ação |
|---|---|---|
| Widget não aparece, bootstrap `trial_expired` | Trial vencido sem assinatura | Estender trial (master console) ou assinar plano |
| Bootstrap `store_not_found` | Domínio da vitrine não resolve | Conferir `store_domains`/URL da loja; reconectar a integração (persiste domínios) |
| Widget não aparece só em algumas páginas | `exclude_paths`/modo de exibição | Revisar "Experiência na loja" em `/app/widgets` |
| Aparência não muda ao salvar | Snippet com `data-*` de aparência fixado | Remover atributos extras do snippet (precedência: atributo > painel) |
| Widget duplicado | Duas origens de instalação | Manter uma só (app OU snippet OU GTM) |
| Nuvemshop: instalado mas não aparece | Script/app não servido pela vitrine | Ver estado da versão do script no portal e status de publicação do app |
| Add-to-cart falha na Nuvemshop | Bridge indisponível | Fallback de POST `/comprar/` age sozinho; conferir console |
