# ImageMaker — imagemaker.seucasorio.com

Serviço Express + Puppeteer + Sharp que gera imagens de posts e stories para o seuCasório.  
Deploy gerenciado via **Coolify**.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/healthz` | Health check — retorna `{ status: "ok", version }` |
| `GET` | `/images/:filename` | Serve imagens de posts/stories geradas |
| `GET` | `/storage/:filename` | Serve imagens fixas (nova.png, fornecedores.jpg) |
| `GET` | `/output/:artigo_id/:filename` | Serve slides de carousel |
| `POST` | `/generate` | Gera imagem de post + story via Puppeteer |
| `POST` | `/carousel` | Gera slides de carousel (série 01 ou 02) |
| `POST` | `/upload/video` | Recebe e publica um vídeo MP4 autenticado |

---

## POST /upload/video

Recebe um único arquivo `multipart/form-data` no campo `video`. O endpoint exige
a chave configurada em `VIDEO_UPLOAD_API_KEY`, aceita o cabeçalho `X-API-Key`
ou `Authorization: Bearer`, valida extensão, MIME, tamanho e assinatura do MP4,
e publica o arquivo em `/output/videos/`.

```bash
curl -X POST https://imagemaker.seucasorio.com/upload/video \
  -H "X-API-Key: SUA_CHAVE" \
  -F "video=@video-123.mp4;type=video/mp4"
```

Resposta (`201 Created`):

```json
{
  "url": "https://imagemaker.seucasorio.com/output/videos/video-123.mp4",
  "filename": "video-123.mp4",
  "size": 12345678,
  "mime_type": "video/mp4"
}
```

O nome real é gerado com UUID pelo servidor. O limite padrão é 100 MB e pode
ser alterado por `VIDEO_UPLOAD_MAX_BYTES`.

---

## POST /carousel

### Campos do body

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `artigo_id` | string | ✅ | ID único do artigo (usado como nome da pasta de output) |
| `serie` | `"01"` \| `"02"` | ✅ | Série de templates a usar |
| `slides` | array | ✅ | Lista de slides (mínimo 1) |

Cada slide também pode receber `video_url` (ou `videoUrl`). Quando informado, o
resultado desse slide terá `media_type: "VIDEO"`; a imagem continuará sendo
gerada e retornada em `imagem_url` como capa/fallback. Sem vídeo, o resultado
terá `media_type: "IMAGE"` e `video_url: null`.

> ⚠️ **Sempre passe `serie`** — identifica qual conjunto visual usar.

---

## Série 01 — Paleta preta/amarela (padrão editorial)

### Tipos de slide

| `tipo` | Template | Campos obrigatórios |
|--------|----------|---------------------|
| `"capa"` | Capa com imagem | `titulo`, `texto`, `imagem_url` (opcional) |
| `"conteudo"` | Slide de conteúdo dark ou cream | `titulo`, `texto`, `etiqueta` |
| `"resumo"` | Lista de bullets — fundo preto | `texto` (linhas separadas por `\n`) |
| `"cta"` | Slide final noiva + fornecedor | `titulo`, `texto` |

> Para `"conteudo"`: `etiqueta` pode ser `"Tendência"`, `"Mercado"` ou `"Inspiração"`.  
> Slides pares ficam dark, ímpares ficam cream.

### Exemplo

```json
{
  "artigo_id": "meu-artigo-01",
  "serie": "01",
  "slides": [
    {
      "tipo": "capa",
      "numero": 1,
      "titulo": "5 tendências para 2026",
      "texto": "O que vai dominar os casamentos",
      "imagem_url": "https://..."
    },
    {
      "tipo": "conteudo",
      "numero": 2,
      "titulo": "Corsets modernos",
      "texto": "Voltam com força para os vestidos de noiva em 2026.",
      "etiqueta": "Tendência",
      "video_url": "https://servidor.com/videos/corsets-modernos.mp4"
    },
    {
      "tipo": "resumo",
      "numero": 6,
      "texto": "Corsets modernos voltam com força\nTransparências trazem sofisticação\nEstilo leve é o futuro"
    },
    {
      "tipo": "cta",
      "numero": 7,
      "titulo": "Quer saber mais sobre 2027?",
      "texto": "Manda uma DM com 'tendência 2027'!"
    }
  ]
}
```

Para o slide acima, a resposta inclui:

```json
{
  "numero": 2,
  "tipo": "conteudo",
  "url": "https://imagemaker.seucasorio.com/output/meu-artigo-01/slide-2.png",
  "media_type": "VIDEO",
  "imagem_url": "https://imagemaker.seucasorio.com/output/meu-artigo-01/slide-2.png",
  "video_url": "https://servidor.com/videos/corsets-modernos.mp4"
}
```

---

## Série 02 — Paleta editorial cream/tan/brown

### Tipos de slide

| `tipo` | Template | Campos obrigatórios |
|--------|----------|---------------------|
| `"capa"` | Cream + imagem grande | `titulo`, `etiqueta`, `imagem_url` (opcional) |
| `"conteudo"` | Marrom escuro + título + item | `titulo`, `etiqueta`, `subtitulo`, `texto` |
| `"conteudo-02"` | Tan + texto outline/solid | `titulo`, `titulo_2` |
| `"conteudo-03"` | 3 bandas (cream/tan/brown) | `titulo`, `titulo_2`, `titulo_3` |
| `"conteudo-04"` | Cream + logo topbar | `titulo`, `etiqueta`, `subtitulo`, `texto` |
| `"conteudo-05"` | Marrom + logo topbar | `titulo`, `etiqueta`, `subtitulo`, `texto` |
| `"conteudo-06"` | Resumo (cream/brown) | `texto` (linhas separadas por `\n`) |
| `"cta"` | CTA noiva + fornecedor (brown) | `titulo`, `texto` |

### Exemplo

```json
{
  "artigo_id": "meu-artigo-02",
  "serie": "02",
  "slides": [
    {
      "tipo": "capa",
      "numero": 1,
      "titulo": "O detalhe que vai transformar seu casamento em 2026",
      "etiqueta": "imperdível",
      "imagem_url": "https://..."
    },
    {
      "tipo": "conteudo",
      "numero": 2,
      "titulo": "O detalhe que muda tudo em 2026",
      "etiqueta": "tendência",
      "subtitulo": "Personalização sensorial",
      "texto": "Aromas autorais, trilha sonora ao vivo e iluminação pensada por hora."
    },
    {
      "tipo": "conteudo-02",
      "numero": 3,
      "titulo": "Detalhes que",
      "titulo_2": "contam histórias."
    },
    {
      "tipo": "conteudo-03",
      "numero": 4,
      "titulo": "A iluminação",
      "titulo_2": "muda tudo,",
      "titulo_3": "muda mesmo."
    },
    {
      "tipo": "conteudo-04",
      "numero": 5,
      "etiqueta": "Tendência",
      "titulo": "Estilo leve e fluido",
      "subtitulo": "Estilo leve e fluido",
      "texto": "Vestidos mais leves garantem conforto e liberdade de movimentos."
    },
    {
      "tipo": "conteudo-05",
      "numero": 6,
      "etiqueta": "Tendência",
      "titulo": "Cores terrosas",
      "subtitulo": "Cores terrosas e atmosferas quentes",
      "texto": "Tons amadeirados, ocres e terracota criam ambientes cinematográficos."
    },
    {
      "tipo": "conteudo-06",
      "numero": 7,
      "texto": "Corsets modernos voltam com força\nTransparências delicadas trazem sofisticação\nEstilo leve e cores variadas são o futuro"
    },
    {
      "tipo": "cta",
      "numero": 8,
      "titulo": "Quer saber mais sobre 2027?",
      "texto": "Manda uma DM com 'tendência 2027' e descubra todos os detalhes!"
    }
  ]
}
```

---

## Deploy no Coolify

### 1. Environment Variables

Configurar no painel **Environment Variables**:

| Variável | Valor |
|----------|-------|
| `BASE_URL` | `https://imagemaker.seucasorio.com` |
| `PORT` | `3000` |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | `true` |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` |
| `VIDEO_UPLOAD_API_KEY` | Chave longa e aleatória usada pelo CasorioHub |
| `VIDEO_UPLOAD_MAX_BYTES` | `104857600` (opcional; padrão de 100 MB) |

> ⚠️ `BASE_URL` é crítico — define o domínio das URLs retornadas pela API e salvas no banco.

### 2. Persistent Storage

Configurar no painel **Storages** (sem isso, imagens somem a cada restart):

| Volume Name | Container Path |
|-------------|---------------|
| `imagemaker-images` | `/app/public/images` |
| `imagemaker-output` | `/app/output` |

Os vídeos usam o volume `imagemaker-output`, portanto não exigem um terceiro
volume. Sem esse volume, eles serão apagados quando o container for recriado.

### 3. Build

O Coolify usa o `Dockerfile` diretamente. Após push, fazer redeploy pelo painel.

---

## ⚠️ Problemas comuns

### `/images/xxx.jpg` retorna 404

**Causa:** container reiniciado sem Persistent Storage configurado — imagens apagadas.

**Solução:**
1. Adicionar os volumes em **Storages** no Coolify (ver acima)
2. Reimplantar
3. Imagens antigas precisam ser regeneradas (disparar workflow n8n novamente)

### `ERR_BLOCKED_BY_ORB` no Chrome

Chrome bloqueia `X-Content-Type-Options: nosniff` em respostas 404 de imagens.  
A raiz é o 404 em si — resolvendo o volume, resolve o ORB.

### `BASE_URL` errado no banco

Se as URLs salvas são `http://localhost:3000/...`, corrigir no banco:

```sql
UPDATE posts
SET image_url = REPLACE(image_url, 'http://localhost:3000', 'https://imagemaker.seucasorio.com')
WHERE image_url LIKE 'http://localhost:3000%';
```

### Carousel quebrado ao iniciar

O `Dockerfile` precisa ter `COPY templates ./templates`. Sem isso, `loadTemplates()` joga exceção e o processo encerra antes de ouvir conexões.

---

## Estrutura

```
├── index.js              # Servidor Express
├── Dockerfile            # Imagem Docker (usado pelo Coolify)
├── templates/
│   ├── carousel/         # Série 01 — paleta preta/amarela
│   │   ├── slide-capa.html
│   │   ├── slide-conteudo.html
│   │   ├── slide-resumo.html
│   │   └── slide-cta.html
│   └── serie-02/         # Série 02 — paleta cream/tan/brown
│       ├── slide-capa.html
│       ├── slide-conteudo.html
│       ├── slide-conteudo-02.html
│       ├── slide-conteudo-03.html
│       ├── slide-conteudo-04.html
│       ├── slide-conteudo-05.html
│       ├── slide-conteudo-06.html
│       └── slide-cta.html
├── public/
│   ├── images/           # Volume persistente montado pelo Coolify (imagens geradas)
│   └── storage/          # Imagens fixas baked na imagem Docker (nova.png, fornecedores.jpg)
└── output/               # Volume persistente montado pelo Coolify
```
