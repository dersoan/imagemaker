const express = require('express');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const IMAGES_DIR = path.join(__dirname, 'public', 'images');
const APP_VERSION = process.env.APP_VERSION || '2026-05-20-story-text-v3';

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

app.use('/images', express.static(IMAGES_DIR));

app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    version: APP_VERSION,
  });
});

function resolveStoryText(body = {}) {
  const candidates = [
    body.story_text,
    body.storyText,
    body.story_message,
    body.storyMessage,
    body.texto_story,
    body.textoStory,
    body.texto,
    body.text,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapStoryText(text, maxCharsPerLine = 28, maxLines = 3) {
  const normalizedText = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalizedText) {
    return [];
  }

  const words = normalizedText.split(' ');
  const lines = [];
  let currentLine = '';
  let wasTruncated = false;

  for (const word of words) {
    const candidateLine = currentLine ? `${currentLine} ${word}` : word;

    if (candidateLine.length <= maxCharsPerLine) {
      currentLine = candidateLine;
      continue;
    }

    if (currentLine && lines.length < maxLines - 1) {
      lines.push(currentLine);
      currentLine = word;
      continue;
    }

    const sourceLine = currentLine || word;
    const trimmedLine = sourceLine.length > maxCharsPerLine
      ? sourceLine.slice(0, Math.max(0, maxCharsPerLine - 3)).trimEnd()
      : sourceLine;

    lines.push(trimmedLine);
    wasTruncated = true;
    currentLine = '';
    break;
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  if (wasTruncated && lines.length) {
    const lastIndex = lines.length - 1;
    if (!lines[lastIndex].endsWith('...')) {
      const safeLine = lines[lastIndex].slice(0, Math.max(0, maxCharsPerLine - 3)).trimEnd();
      lines[lastIndex] = `${safeLine}...`;
    }
  }

  return lines;
}

async function createStoryFromPost(
  postPath,
  storyPath,
  storyWidth = 1080,
  storyHeight = 1920,
  storyText = ''
) {
  const storyHandle = '@seucasorio.ofc';
  const handleGap = 28;
  const postMaxWidth = Math.round(storyWidth * 0.8);
  const postMaxHeight = Math.round(storyHeight * 0.76);
  const postBorderRadius = 32;

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
    .resize(postMaxWidth, postMaxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const foregroundMetadata = await sharp(foregroundBuffer).metadata();
  const foregroundWidth = foregroundMetadata.width || storyWidth;
  const foregroundHeight = foregroundMetadata.height || storyHeight;
  const foregroundLeft = Math.round((storyWidth - foregroundWidth) / 2);
  const foregroundTop = Math.round((storyHeight - foregroundHeight) / 2) - 90;
  const handleTop = foregroundTop + foregroundHeight + handleGap;
  const handleLeft = foregroundLeft + 6;
  const handleWidth = Math.min(520, storyWidth - handleLeft - 48);
  const storyTextLines = wrapStoryText(storyText, 30, 3);
  const shadowOffsetX = 0;
  const shadowOffsetY = 16;
  const shadowPadding = 28;

  const roundedForegroundBuffer = await sharp(foregroundBuffer)
    .composite([
      {
        input: Buffer.from(`
          <svg width="${foregroundWidth}" height="${foregroundHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect
              x="0"
              y="0"
              width="${foregroundWidth}"
              height="${foregroundHeight}"
              rx="${postBorderRadius}"
              ry="${postBorderRadius}"
              fill="#ffffff"
            />
          </svg>
        `),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  const shadowBuffer = await sharp({
    create: {
      width: foregroundWidth + shadowPadding * 2,
      height: foregroundHeight + shadowPadding * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: Buffer.from(`
          <svg width="${foregroundWidth}" height="${foregroundHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect
              x="0"
              y="0"
              width="${foregroundWidth}"
              height="${foregroundHeight}"
              rx="${postBorderRadius}"
              ry="${postBorderRadius}"
              fill="rgba(0, 0, 0, 0.22)"
            />
          </svg>
        `),
        left: shadowPadding + shadowOffsetX,
        top: shadowPadding + shadowOffsetY,
      },
    ])
    .blur(18)
    .png()
    .toBuffer();

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

  const storyTextFontSize = 28;
  const storyTextLineHeight = 38;
  const storyTextPaddingY = 18;
  const storyTextBoxWidth = Math.min(760, storyWidth - 160);
  const storyTextBoxHeight = storyTextLines.length
    ? storyTextPaddingY * 2 + storyTextLines.length * storyTextLineHeight
    : 0;
  const storyTextBoxLeft = Math.round((storyWidth - storyTextBoxWidth) / 2);
  const preferredStoryTextBoxTop = handleTop + 88;
  const maxStoryTextBoxTop = storyHeight - storyTextBoxHeight - 80;
  const storyTextBoxTop = Math.max(0, Math.min(preferredStoryTextBoxTop, maxStoryTextBoxTop));
  const storyTextSvg = storyTextLines.length
    ? Buffer.from(`
      <svg width="${storyTextBoxWidth}" height="${storyTextBoxHeight}" viewBox="0 0 ${storyTextBoxWidth} ${storyTextBoxHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect
          x="0"
          y="0"
          width="${storyTextBoxWidth}"
          height="${storyTextBoxHeight}"
          rx="12"
          ry="12"
          fill="rgba(0, 0, 0, 0.86)"
        />
        <text
          x="${storyTextBoxWidth / 2}"
          y="${storyTextPaddingY + storyTextFontSize}"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${storyTextFontSize}"
          font-weight="700"
          text-anchor="middle"
          fill="#ffffff"
        >${storyTextLines
          .map(
            (line, index) =>
              `<tspan x="${storyTextBoxWidth / 2}" dy="${index === 0 ? 0 : storyTextLineHeight}">${escapeXml(line)}</tspan>`
          )
          .join('')}</text>
      </svg>
    `)
    : null;

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
        input: shadowBuffer,
        left: foregroundLeft - shadowPadding,
        top: foregroundTop - shadowPadding,
      },
      {
        input: roundedForegroundBuffer,
        left: foregroundLeft,
        top: foregroundTop,
      },
      {
        input: handleSvg,
        left: handleLeft,
        top: handleTop,
      },
      ...(storyTextSvg
        ? [
            {
              input: storyTextSvg,
              left: storyTextBoxLeft,
              top: storyTextBoxTop,
            },
          ]
        : []),
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
  const storyText = resolveStoryText(req.body);

  console.log(
    JSON.stringify({
      event: 'generate_request',
      version: APP_VERSION,
      generate_story,
      story_text_received: storyText,
      story_text_length: storyText.length,
      body_story_fields: {
        story_text: req.body.story_text || null,
        storyText: req.body.storyText || null,
        story_message: req.body.story_message || null,
        storyMessage: req.body.storyMessage || null,
        texto_story: req.body.texto_story || null,
        textoStory: req.body.textoStory || null,
        texto: req.body.texto || null,
        text: req.body.text || null,
      },
    })
  );

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
        Number(story_height),
        storyText
      );

      storyUrl = `${baseUrl}/images/${storyFilename}`;
    }

    return res.json({
      version: APP_VERSION,
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
            text: storyText || null,
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
