FROM node:20-slim

# Instala dependências do Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configura o Puppeteer para usar o Chrome instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY index.js .
# Templates do carousel (obrigatório — loadTemplates() falha sem eles)
COPY templates ./templates

# Imagens fixas (noiva, fornecedores) — sempre presentes na imagem Docker
COPY public/storage ./public/storage

# Cria diretórios de saída para que o volume seja montável sobre eles
# public/images → imagens geradas dinamicamente (pode ser volume)
# output        → carrosséis gerados
RUN mkdir -p public/images output

EXPOSE 3000

CMD ["node", "index.js"]
