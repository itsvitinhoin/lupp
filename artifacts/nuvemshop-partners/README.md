# Luup para Nuvemshop Partners

Este pacote gera o unico arquivo que deve ser enviado ao script do app no
Partners da Nuvemshop.

## Arquivo para upload

`dist/luup-nuvemshop-partners.js`

Gere novamente com:

```bash
pnpm --filter @workspace/nuvemshop-partners run test
```

## Configuracao do script no Partners

- Local de ativacao: `Store`
- Evento: `onload`
- Use NubeSDK: ativado
- Instalacao automatica: ativada
- Arquivo: `dist/luup-nuvemshop-partners.js`

O bundle nao recebe dados de uma loja especifica e nao contem chaves. O ID, o
dominio, a pagina e o dispositivo sao obtidos do estado oficial do NubeSDK.

## Responsabilidades

- Renderiza a miniatura flutuante em `corner_bottom_left`.
- Renderiza o carrossel da Home em `before_section_products_sale`.
- Abre o feed vertical em `modal_content`.
- Adiciona variantes pelo evento oficial `cart:add`.
- Atualiza os widgets quando a navegacao da loja muda.

Os scripts legados permanecem no repositorio apenas durante a validacao desta
versao. Eles nao devem ser enviados junto com este bundle.

## Fallback temporario durante a homologacao

Enquanto o app estiver `Em aprovacao`, o rollout NubeSDK ainda nao alcanca as
lojas reais. Para manter as instalacoes existentes funcionando, crie um segundo
script no Partners usando:

- Nome: `Luup Transition Fallback`
- Local de ativacao: `Store`
- Evento: `onload`
- Use NubeSDK: desativado
- Instalacao automatica: ativada
- Arquivo: `dist/luup-nuvemshop-transition.js`

O fallback nao contem configuracao ou credencial de loja. Ele aguarda o iframe
oficial do NubeSDK e so carrega o widget classico quando o SDK ainda nao foi
liberado para aquela loja. Remova esse segundo script depois que a Nuvemshop
confirmar o rollout NubeSDK em producao.
