const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// Gera imagem a partir de HTML e CSS
app.post('/generate', async (req, res) => {
  const { html, css, width = 1080, height = 1440, google_fonts } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'html is required' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    // Monta fontes do Google
    const fontLink = google_fonts
      ? `<link rel="preconnect" href="https://fonts.googleapis.com" />
         <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
         <link href="https://fonts.googleapis.com/css2?family=${google_fonts}&display=swap" rel="stylesheet" />`
      : '';

    const fullHtml = `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  ${fontLink}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: transparent; }
    ${css || ''}
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });

    // Aguarda fontes carregarem
    await page.evaluateHandle('document.fonts.ready');

    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 92,
      clip: { x: 0, y: 0, width, height },
    });

    await browser.close();

    // Retorna imagem em base64 e também como buffer
    const base64 = screenshot.toString('base64');
    const url = `data:image/jpeg;base64,${base64}`;

    res.json({
      url,
      base64,
      width,
      height,
      format: 'jpeg',
    });

  } catch (err) {
    if (browser) await browser.close();
    console.error('Erro ao gerar imagem:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ImageMaker rodando na porta ${PORT}`);
});
