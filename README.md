# Puppeter

Repositório com uma aplicação Node.js que gera imagens usando Puppeteer e Chrome.

## Estrutura

- `files/Dockerfile` - imagem Docker baseada em `node:20-slim` com Chromium instalado.
- `files/package.json` - dependências `express` e `puppeteer`.
- `files/index.js` - servidor Express com rota `/generate` para gerar imagens a partir de HTML/CSS.

## Como usar

1. `npm install`
2. `npm start`
3. Acesse `http://localhost:3000`
