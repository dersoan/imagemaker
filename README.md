# Puppeter

Repositorio com uma aplicacao Node.js que gera imagens usando Puppeteer e Chrome
e compõe vídeos de carrossel com FFmpeg.

## Estrutura

- `files/Dockerfile` - imagem Docker baseada em `node:20-slim` com Chromium instalado.
- `files/package.json` - dependencias `express`, `puppeteer` e `sharp`.
- `files/index.js` - servidor Express com rota `/generate` para gerar imagens a partir de HTML/CSS e criar a versao de story.

## Como usar

1. `cd files`
2. `npm install`
3. `npm start`
4. Acesse `http://localhost:3000`

## Texto no story

O endpoint `POST /generate` aceita o campo opcional `story_text` ou `storyText`. Quando enviado, ele adiciona uma caixa escura com o texto abaixo do `@seucasorio.ofc` no story.

Se nenhum texto for enviado, o backend usa este texto padrao:

```text
Para ler a noticia digite news na DM que enviaremos para voce
```

Exemplo de payload:

```json
{
  "html": "<div>Seu layout aqui</div>",
  "css": "body { margin: 0; }",
  "width": 1080,
  "height": 1350,
  "generate_story": true,
  "story_width": 1080,
  "story_height": 1920,
  "story_text": "Para ler a noticia digite news na DM que enviaremos para voce"
}
```
