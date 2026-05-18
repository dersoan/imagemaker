const express = require('express');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const IMAGES_DIR = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

app.use('/images', express.static(IMAGES_DIR));

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

async function createStoryFromPost(postFilepath, storyFilepath) {
  const storyWidth = 1080;
  const storyHeight = 1920;
  const storyPaddingX = 88;
  const storyTop = 120;
  const storyBottomReserved = 210;
  const cardRadius = 34;
  const storyHandle = '@seucasorio.ofc';
  const handleGap = 34;
  const handleHeight = 70;

  const backgroundBuffer = await sharp(postFilepath)
    .resize(storyWidth, storyHeight, { fit: 'cover', position: 'centre' })
    .blur(40)
    .modulate({ brightness: 0.5, saturation: 0.95 })
    .jpeg({ quality: 90 })
    .toBuffer();

  const maxCardWidth = storyWidth - storyPaddingX * 2;
  const maxCardHeight = storyHeight - storyTop - storyBottomReserved;

  const resizedCardBuffer = await sharp(postFilepath)
    .resize(maxCardWidth, maxCardHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const foregroundMetadata = await sharp(resizedCardBuffer).metadata();
  const foregroundWidth = foregroundMetadata.width || storyWidth;
  const foregroundHeight = foregroundMetadata.height || storyHeight;
  const foregroundLeft = Math.round((storyWidth - foregroundWidth) / 2) - 6;
  const foregroundTop = storyTop;
  const handleTop = foregroundTop + foregroundHeight + handleGap;
  const handleWidth = 420;
  const handleLeft = foregroundLeft + 4;

  const roundedCardBuffer = await sharp(resizedCardBuffer)
    .composite([
      {
        input: Buffer.from(`
          <svg width="${foregroundWidth}" height="${foregroundHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="${foregroundWidth}" height="${foregroundHeight}" rx="${cardRadius}" ry="${cardRadius}" fill="#ffffff"/>
          </svg>
        `),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  const shadowBuffer = await sharp({
    create: {
      width: foregroundWidth + 48,
      height: foregroundHeight + 48,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: Buffer.from(`
          <svg width="${foregroundWidth}" height="${foregroundHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="${foregroundWidth}" height="${foregroundHeight}" rx="${cardRadius}" ry="${cardRadius}" fill="rgba(0,0,0,0.38)"/>
          </svg>
        `),
        left: 24,
        top: 20,
      },
    ])
    .blur(18)
    .png()
    .toBuffer();

  const handleSvg = Buffer.from(`
    <svg width="${handleWidth}" height="${handleHeight}" viewBox="0 0 ${handleWidth} ${handleHeight}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="0"
        y="50"
        font-family="Arial, Helvetica, sans-serif"
        font-size="42"
        font-weight="700"
        fill="#ffffff"
      >${storyHandle}</text>
    </svg>
  `);

  await sharp(backgroundBuffer)
    .composite([
      {
        input: shadowBuffer,
        left: foregroundLeft - 24,
        top: foregroundTop - 18,
      },
      {
        input: roundedCardBuffer,
        left: foregroundLeft,
        top: foregroundTop,
      },
      {
        input: handleSvg,
        left: handleLeft,
        top: handleTop,
      },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(storyFilepath);
}

app.post('/generate', async (req, res) => {
  const {
    html,
    css,
    width = 1080,
    height = 1440,
    google_fonts,
    output_format,
  } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'html is required' });
  }

  const isStory = output_format === 'story';
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
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
    await page.evaluateHandle('document.fonts.ready');

    const baseId = crypto.randomUUID();
    const postFilename = `${baseId}.jpg`;
    const postFilepath = path.join(IMAGES_DIR, postFilename);

    await page.screenshot({
      type: 'jpeg',
      quality: 92,
      clip: { x: 0, y: 0, width, height },
      path: postFilepath,
    });

    await browser.close();
    browser = null;

    let finalFilename = postFilename;

    if (isStory) {
      finalFilename = `${baseId}-story.jpg`;
      const storyFilepath = path.join(IMAGES_DIR, finalFilename);

      await createStoryFromPost(postFilepath, storyFilepath);
      await fs.promises.unlink(postFilepath);
    }

    const PORT = process.env.PORT || 3000;
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const url = `${baseUrl}/images/${finalFilename}`;

    return res.json({
      url,
      id: finalFilename.replace('.jpg', ''),
      format: isStory ? 'story' : 'post',
    });

  } catch (err) {
    if (browser) await browser.close();
    console.error('Erro ao gerar imagem:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ImageMaker rodando na porta ${PORT}`);
});
