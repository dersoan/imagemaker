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

async function createStoryFromPost(postPath, storyPath, storyWidth = 1080, storyHeight = 1920) {
  const storyHandle = '@seucasorio.ofc';
  const handleGap = 28;

  const backgroundBuffer = await sharp(postPath)
    .resize(storyWidth, storyHeight, {
      fit: 'cover',
    })
    .blur(20)
    .modulate({
      brightness: 0.75,
    })
    .jpeg({
      quality: 90,
    })
    .toBuffer();

  const foregroundBuffer = await sharp(postPath)
    .resize(storyWidth, storyHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 92,
    })
    .toBuffer();

  const foregroundMetadata = await sharp(foregroundBuffer).metadata();
  const foregroundWidth = foregroundMetadata.width || storyWidth;
  const foregroundHeight = foregroundMetadata.height || storyHeight;
  const foregroundLeft = Math.round((storyWidth - foregroundWidth) / 2);
  const foregroundTop = Math.round((storyHeight - foregroundHeight) / 2) - 40;
  const handleTop = foregroundTop + foregroundHeight + handleGap;
  const handleLeft = foregroundLeft + 6;
  const handleWidth = Math.min(520, storyWidth - handleLeft - 48);
  const handleSvg = Buffer.from(`
    <svg width="${handleWidth}" height="64" viewBox="0 0 ${handleWidth} 64" xmlns="http://www.w3.org/2000/svg">
      <text
        x="0"
        y="46"
        font-family="Arial, Helvetica, sans-serif"
        font-size="42"
        font-weight="700"
        fill="#ffffff"
      >${storyHandle}</text>
    </svg>
  `);

  await sharp({
    create: {
      width: storyWidth,
      height: storyHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: backgroundBuffer,
        top: 0,
        left: 0,
      },
      {
        input: foregroundBuffer,
        left: foregroundLeft,
        top: foregroundTop,
      },
      {
        input: handleSvg,
        left: handleLeft,
        top: handleTop,
      },
    ])
    .jpeg({
      quality: 92,
    })
    .toFile(storyPath);
}

function buildHtmlDocument({ html, css, width, height, google_fonts }) {
  const fontLink = google_fonts
    ? `
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=${google_fonts}&display=swap" rel="stylesheet" />
    `
    : '';

  return `
    <!DOCTYPE html>
    <html lang="pt-br">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        ${fontLink}
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          html,
          body {
            width: ${width}px;
            height: ${height}px;
            overflow: hidden;
            background: transparent;
          }

          ${css || ''}
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;
}

app.post('/generate', async (req, res) => {
  const {
    html,
    css,
    width = 1080,
    height = 1350,
    google_fonts,
    generate_story = true,
    story_width = 1080,
    story_height = 1920,
  } = req.body;

  if (!html) {
    return res.status(400).json({
      error: 'html is required',
    });
  }

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

    await page.setViewport({
      width: Number(width),
      height: Number(height),
      deviceScaleFactor: 1,
    });

    const fullHtml = buildHtmlDocument({
      html,
      css,
      width: Number(width),
      height: Number(height),
      google_fonts,
    });

    await page.setContent(fullHtml, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });

    const imageId = crypto.randomUUID();

    const postFilename = `${imageId}.jpg`;
    const postFilepath = path.join(IMAGES_DIR, postFilename);

    await page.screenshot({
      type: 'jpeg',
      quality: 92,
      clip: {
        x: 0,
        y: 0,
        width: Number(width),
        height: Number(height),
      },
      path: postFilepath,
    });

    await browser.close();
    browser = null;

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    const postUrl = `${baseUrl}/images/${postFilename}`;

    let storyFilename = null;
    let storyUrl = null;

    if (generate_story) {
      storyFilename = `${imageId}-story.jpg`;
      const storyFilepath = path.join(IMAGES_DIR, storyFilename);

      await createStoryFromPost(
        postFilepath,
        storyFilepath,
        Number(story_width),
        Number(story_height)
      );

      storyUrl = `${baseUrl}/images/${storyFilename}`;
    }

    return res.json({
      id: imageId,
      post: {
        url: postUrl,
        width: Number(width),
        height: Number(height),
        format: 'feed',
      },
      story: generate_story
        ? {
            url: storyUrl,
            width: Number(story_width),
            height: Number(story_height),
            format: 'story',
          }
        : null,
    });
  } catch (err) {
    if (browser) {
      await browser.close();
    }

    console.error('Erro ao gerar imagem:', err);

    return res.status(500).json({
      error: true,
      message: 'Erro ao gerar imagem',
      details: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ImageMaker rodando na porta ${PORT}`);
});
