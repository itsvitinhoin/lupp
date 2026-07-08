# Bunny Stream na Luup

Este documento descreve como a Luup usa Bunny Stream/CDN para armazenar,
processar e entregar videos sem usar Supabase Storage para os arquivos de video.

## Objetivo

- Supabase guarda apenas metadados: loja, produto, video, status e analytics.
- Bunny Stream recebe o arquivo de video, processa HLS e entrega pelo CDN.
- O widget externo carrega metadados leves e so inicializa o player quando entra
  na viewport.

## Como configurar na Bunny

1. Crie ou acesse sua conta em https://bunny.net.
2. Abra **Stream** e crie uma **Video Library**.
3. Copie o **Library ID** da biblioteca.
4. Copie a **API Key** da biblioteca ou da conta com permissao para Stream.
5. Configure o hostname de CDN da biblioteca, por exemplo:
   `vz-xxxxxx.b-cdn.net` ou um dominio customizado apontado para a Bunny.

## Variaveis de ambiente

### Supabase Edge Functions

Configure como secrets do Supabase:

```bash
supabase secrets set BUNNY_STREAM_LIBRARY_ID="..."
supabase secrets set BUNNY_STREAM_API_KEY="..."
supabase secrets set BUNNY_STREAM_CDN_HOSTNAME="vz-xxxxxx.b-cdn.net"
```

Essas variaveis nunca devem ir para o frontend.

### Vercel/frontend

Configure no Vercel:

```bash
VITE_VIDEO_PROVIDER=bunny
VITE_BUNNY_LIBRARY_ID=...
VITE_BUNNY_CDN_HOSTNAME=vz-xxxxxx.b-cdn.net
```

`VITE_BUNNY_LIBRARY_ID` e `VITE_BUNNY_CDN_HOSTNAME` sao publicos. A API key
continua apenas no Supabase.

## Fluxo de upload

1. O usuario escolhe um video no Admin.
2. O frontend valida tipo e tamanho.
3. O frontend envia o binario para `bunny-upload-video` com JWT Supabase.
4. A Edge Function valida usuario, loja e limite do plano.
5. A Edge Function cria o video na Bunny Stream.
6. A Edge Function envia o binario para a Bunny usando `AccessKey`.
7. A funcao retorna:
   - `provider = bunny`
   - `provider_video_id`
   - `video_url`
   - `playback_url`
   - `thumbnail_url`
   - `processing_status`
   - `duration_seconds`
   - `file_size`
8. O Admin salva esses metadados na tabela `videos`.

## URLs de playback

Playback HLS:

```text
https://{BUNNY_STREAM_CDN_HOSTNAME}/{provider_video_id}/playlist.m3u8
```

Thumbnail:

```text
https://{BUNNY_STREAM_CDN_HOSTNAME}/{provider_video_id}/thumbnail.jpg
```

## Status

A Luup usa `videos.processing_status` com os valores:

- `uploading`
- `processing`
- `ready`
- `failed`
- `archived`

O feed publico e o bootstrap do widget so entregam videos com
`processing_status = ready`.

## Player e lazy loading

- Safari/iOS usam HLS nativo quando possivel.
- Chrome/Firefox carregam `hls.js` somente quando necessario.
- O player usa `preload="metadata"`, `muted`, `playsInline` e pausa fora da tela.
- O widget externo nao coloca `src` imediato nos videos; usa Intersection Observer
  e so anexa a fonte quando o video entra ou se aproxima da viewport.

## Edge Functions

- `bunny-upload-video`: cria video na Bunny e faz upload do arquivo.
- `bunny-video-status`: consulta status na Bunny e atualiza o registro da Luup.
- `bunny-delete-video`: remove o video da Bunny e arquiva o registro da Luup.

## Como testar localmente

1. Configure `.env.local` com:

```bash
VITE_VIDEO_PROVIDER=bunny
VITE_BUNNY_LIBRARY_ID=...
VITE_BUNNY_CDN_HOSTNAME=...
```

2. Configure os secrets no Supabase remoto ou no ambiente local de Edge
   Functions.
3. Rode o Admin:

```bash
PORT=5173 pnpm --filter @workspace/lupp run dev
```

4. Suba um MP4/MOV/WebM em `/app/videos/new`.
5. Confira se o registro em `videos` ficou com `provider = bunny`.
6. Abra o feed e confirme que o player usa `playlist.m3u8`.

## Como testar em producao

1. Configure os secrets no Supabase.
2. Faça deploy das Edge Functions Bunny.
3. Configure `VITE_VIDEO_PROVIDER=bunny` e os envs publicos no Vercel.
4. Faça deploy do frontend.
5. Suba um video real pelo Admin.
6. Confirme que o widget externo carrega sem `src` imediato e toca via Bunny CDN
   depois de abrir a experiencia.
