FROM node:20-slim

# Instala dependências do Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configura o Puppeteer para usar o Chrome instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY files/package.json .
RUN npm install --production

COPY files/index.js .
COPY files/templates/ ./templates/
COPY files/public/ ./public/

EXPOSE 3000

CMD ["node", "index.js"]
