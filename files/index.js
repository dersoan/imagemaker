const express = require('express');
const multer = require('multer');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
app.use(express.json({ limit: '10mb' }));

const IMAGES_DIR = path.join(__dirname, 'public', 'images');
const STORAGE_DIR = path.join(__dirname, 'public', 'storage');
const APP_VERSION = process.env.APP_VERSION || '2026-07-22-video-compose-v1';
const DEFAULT_STORY_TEXT =
  process.env.DEFAULT_STORY_TEXT || 'Para ler a noticia digite news na DM que enviaremos para voce';
const DEFAULT_CAROUSEL_STORY_TEXT =
  process.env.DEFAULT_CAROUSEL_STORY_TEXT || 'Siga a gente para mais';

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Imagens geradas dinamicamente
app.use('/images', express.static(IMAGES_DIR));
// Imagens fixas (noiva, fornecedores) — nunca sobrescritas por volume
app.use('/storage', express.static(STORAGE_DIR));

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

  return DEFAULT_STORY_TEXT;
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function resolveVideoUrl(slide = {}) {
  const candidate = slide.video_url || slide.videoUrl;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function isHttpUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
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
    const linuxArgs = process.platform !== 'win32' ? ['--no-zygote', '--single-process'] : [];
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        ...linuxArgs,
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

// ============================================================
// CAROUSEL ENDPOINT
// ============================================================

// --- output directory (served at /output) ---
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
app.use('/output', express.static(OUTPUT_DIR));

// --- authenticated MP4 upload ---
const VIDEOS_DIR = path.join(OUTPUT_DIR, 'videos');
const VIDEO_UPLOADS_TMP_DIR = path.join(OUTPUT_DIR, '.video-uploads');
const VIDEO_UPLOAD_API_KEY = process.env.VIDEO_UPLOAD_API_KEY || '';
const parsedVideoUploadMaxBytes = Number.parseInt(process.env.VIDEO_UPLOAD_MAX_BYTES || '', 10);
const VIDEO_UPLOAD_MAX_BYTES = Number.isSafeInteger(parsedVideoUploadMaxBytes) && parsedVideoUploadMaxBytes > 0
  ? parsedVideoUploadMaxBytes
  : 100 * 1024 * 1024;

fs.mkdirSync(VIDEOS_DIR, { recursive: true });
fs.mkdirSync(VIDEO_UPLOADS_TMP_DIR, { recursive: true });

function safeKeyMatches(receivedKey, expectedKey) {
  if (!receivedKey || !expectedKey) return false;

  const received = Buffer.from(receivedKey);
  const expected = Buffer.from(expectedKey);

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function requireVideoUploadApiKey(req, res, next) {
  if (!VIDEO_UPLOAD_API_KEY) {
    return res.status(503).json({
      error: 'upload_not_configured',
      message: 'O upload de vídeos não está configurado no servidor',
    });
  }

  const authorization = req.get('authorization') || '';
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const receivedKey = req.get('x-api-key') || (bearerMatch ? bearerMatch[1].trim() : '');

  if (!safeKeyMatches(receivedKey, VIDEO_UPLOAD_API_KEY)) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Chave de autenticação inválida ou ausente',
    });
  }

  return next();
}

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, VIDEO_UPLOADS_TMP_DIR),
    filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}.upload`),
  }),
  limits: {
    fileSize: VIDEO_UPLOAD_MAX_BYTES,
    files: 1,
    fields: 0,
  },
  fileFilter: (req, file, callback) => {
    const extensionIsMp4 = path.extname(file.originalname || '').toLowerCase() === '.mp4';
    const acceptedMimeTypes = new Set(['video/mp4', 'application/mp4', 'application/octet-stream']);

    if (!extensionIsMp4 || !acceptedMimeTypes.has((file.mimetype || '').toLowerCase())) {
      const error = new Error('Apenas arquivos MP4 são aceitos');
      error.code = 'INVALID_VIDEO_TYPE';
      return callback(error);
    }

    return callback(null, true);
  },
});

async function removeFileIfPresent(filePath) {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(() => {});
}

async function hasMp4Signature(filePath) {
  const fileHandle = await fs.promises.open(filePath, 'r');

  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await fileHandle.read(header, 0, header.length, 0);
    return bytesRead === header.length && header.toString('ascii', 4, 8) === 'ftyp';
  } finally {
    await fileHandle.close();
  }
}

app.post('/upload/video', requireVideoUploadApiKey, (req, res) => {
  videoUpload.single('video')(req, res, async (uploadError) => {
    if (uploadError) {
      await removeFileIfPresent(req.file && req.file.path);

      if (uploadError.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'file_too_large',
          message: `O vídeo excede o limite de ${VIDEO_UPLOAD_MAX_BYTES} bytes`,
          max_size_bytes: VIDEO_UPLOAD_MAX_BYTES,
        });
      }

      if (uploadError.code === 'INVALID_VIDEO_TYPE') {
        return res.status(415).json({
          error: 'invalid_video_type',
          message: uploadError.message,
        });
      }

      return res.status(400).json({
        error: 'invalid_upload',
        message: uploadError.message,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'video_required',
        message: 'Envie o arquivo MP4 no campo "video"',
      });
    }

    try {
      if (!(await hasMp4Signature(req.file.path))) {
        await removeFileIfPresent(req.file.path);
        return res.status(415).json({
          error: 'invalid_mp4',
          message: 'O conteúdo enviado não é um arquivo MP4 válido',
        });
      }

      const filename = `video-${crypto.randomUUID()}.mp4`;
      const finalPath = path.join(VIDEOS_DIR, filename);
      await fs.promises.rename(req.file.path, finalPath);

      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const url = `${baseUrl}/output/videos/${filename}`;

      console.log(JSON.stringify({
        event: 'video_upload_done',
        filename,
        size: req.file.size,
      }));

      return res.status(201).json({
        url,
        filename,
        size: req.file.size,
        mime_type: 'video/mp4',
      });
    } catch (err) {
      await removeFileIfPresent(req.file.path);
      console.error(JSON.stringify({ event: 'video_upload_error', message: err.message }));
      return res.status(500).json({
        error: 'video_upload_failed',
        message: 'Não foi possível salvar o vídeo',
      });
    }
  });
});

// --- singleton browser for carousel ---
let carouselBrowser = null;

async function getCarouselBrowser() {
  if (carouselBrowser && carouselBrowser.isConnected()) return carouselBrowser;
  const linuxArgs = process.platform !== 'win32' ? ['--no-zygote', '--single-process'] : [];
  carouselBrowser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    protocolTimeout: 120000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      ...linuxArgs,
    ],
  });
  carouselBrowser.on('disconnected', () => { carouselBrowser = null; });
  return carouselBrowser;
}

// --- template cache (loaded once at boot) ---
const TEMPLATES_DIR = path.join(__dirname, 'templates', 'carousel');
const SERIE2_DIR   = path.join(__dirname, 'templates', 'serie-02');
const templateCache = {};

function loadTemplates() {
  // Serie 01 (carousel padrão)
  const names = ['slide-capa', 'slide-conteudo', 'slide-resumo', 'slide-cta'];
  for (const name of names) {
    templateCache[name] = fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.html`), 'utf8');
  }

  // Serie 02 (paleta editorial cream/tan/brown)
  const serie2names = ['capa', 'conteudo', 'conteudo-02', 'conteudo-03', 'conteudo-04', 'conteudo-05', 'conteudo-06', 'cta'];
  for (const name of serie2names) {
    templateCache[`s2-${name}`] = fs.readFileSync(path.join(SERIE2_DIR, `slide-${name}.html`), 'utf8');
  }

  console.log(JSON.stringify({ event: 'carousel_templates_loaded', templates: Object.keys(templateCache) }));
}

// --- semaphore: max 3 concurrent Puppeteer pages ---
function createSemaphore(limit) {
  let active = 0;
  const queue = [];
  function release() {
    active--;
    if (queue.length) queue.shift()();
  }
  return async function acquire() {
    if (active < limit) { active++; return release; }
    return new Promise(resolve => queue.push(() => { active++; resolve(release); }));
  };
}
const carouselSemaphore = createSemaphore(3);
const videoRenderSemaphore = createSemaphore(1);
const parsedVideoRenderTimeoutMs = Number.parseInt(process.env.VIDEO_RENDER_TIMEOUT_MS || '', 10);
const VIDEO_RENDER_TIMEOUT_MS = Number.isSafeInteger(parsedVideoRenderTimeoutMs) && parsedVideoRenderTimeoutMs > 0
  ? parsedVideoRenderTimeoutMs
  : 15 * 60 * 1000;

function runFfmpeg(args) {
  const executable = process.env.FFMPEG_EXECUTABLE_PATH || 'ffmpeg';

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      if (!settled) {
        settled = true;
        reject(new Error(`FFmpeg excedeu o tempo limite de ${VIDEO_RENDER_TIMEOUT_MS} ms`));
      }
    }, VIDEO_RENDER_TIMEOUT_MS);

    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-12000);
    });

    child.once('error', (err) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(new Error(`Não foi possível executar FFmpeg: ${err.message}`));
      }
    });

    child.once('close', (code) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`FFmpeg encerrou com código ${code}: ${stderr.trim()}`));
    });
  });
}

async function composeCarouselVideo({ sourceUrl, templatePath, outputPath, slot }) {
  const release = await videoRenderSemaphore();

  try {
    if (
      !slot ||
      slot.width < 2 ||
      slot.height < 2 ||
      slot.x < 0 ||
      slot.y < 0 ||
      slot.x + slot.width > 1080 ||
      slot.y + slot.height > 1440
    ) {
      throw new Error('Área de vídeo inválida ou ausente no template');
    }

    await removeFileIfPresent(outputPath);

    const filter =
      `[0:v]scale=${slot.width}:${slot.height}:force_original_aspect_ratio=increase,` +
      `crop=${slot.width}:${slot.height},fps=30,setsar=1[video];` +
      `[1:v]fps=30[template];` +
      `[template][video]overlay=${slot.x}:${slot.y}:shortest=1,format=yuv420p[outv]`;

    await runFfmpeg([
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', sourceUrl,
      '-loop', '1',
      '-framerate', '30',
      '-i', templatePath,
      '-filter_complex', filter,
      '-map', '[outv]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-movflags', '+faststart',
      '-shortest',
      outputPath,
    ]);
  } catch (err) {
    await removeFileIfPresent(outputPath);
    throw err;
  } finally {
    release();
  }
}

// --- render a single slide HTML → PNG buffer ---
async function renderSlide(htmlContent) {
  const release = await carouselSemaphore();
  const browser = await getCarouselBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);
    await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    }).catch(() => {});
    await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
      }));
    }).catch(() => {});
    const videoSlot = await page.evaluate(() => {
      const element = document.querySelector('[data-video-slot]');
      if (!element) return null;

      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });

    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1080, height: 1440 },
    });

    return { screenshot, videoSlot };
  } finally {
    await page.close().catch(() => {});
    release();
  }
}

const ETIQUETA_VALUES = new Set(['Tendência', 'Mercado', 'Inspiração']);

// --- serie 02: fill template placeholders ---
function buildSerie2Html(slide, total) {
  const tipo = slide.tipo;
  const cacheKey = `s2-${tipo}`;
  const template = templateCache[cacheKey];
  if (!template) throw new Error(`template série 2 "${tipo}" não encontrado`);

  // Defaults para o CTA (campos opcionais)
  const ctaDefaults = tipo === 'cta' ? {
    titulo: 'Encontre os melhores fornecedores para o seu casamento.',
    texto:  'Acesse o guia mais completo de casamentos do Brasil.',
  } : {};
  const { titulo, texto, etiqueta, subtitulo } = { ...ctaDefaults, ...slide };
  const textoLines = String(texto || '').split('\n').map(l => l.trim()).filter(Boolean);
  const titulo2 = slide.titulo_2 || slide.titulo2 || subtitulo || '';
  const titulo3 = slide.titulo_3 || slide.titulo3 || (tipo === 'conteudo-03' ? textoLines.pop() || '' : '');
  const numLabel = `${slide.numero}/${total}`;
  const imagemUrl = slide.imagem_url || slide.imagemUrl || slide.image_url || '';
  const videoSlotAttribute = resolveVideoUrl(slide) ? ' data-video-slot="true"' : '';
  const imagemHtml = imagemUrl
    ? `<img src="${escapeXml(imagemUrl)}" alt=""${videoSlotAttribute} />`
    : `<div class="ph" data-label="[ FOTO ]"${videoSlotAttribute}></div>`;
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  // conteudo-06 = resumo: converte texto (linhas) em <li>
  const bullets = tipo === 'conteudo-06'
    ? String(texto || '').split('\n').map(l => l.trim()).filter(Boolean)
        .map(l => `<li class="item"><p class="item__body">${escapeXml(l)}</p></li>`).join('\n')
    : '';

  return template
    .replace(/\{\{TITULO\}\}/g,      escapeXml(titulo || ''))
    .replace(/\{\{TITULO_2\}\}/g,    escapeXml(titulo2))
    .replace(/\{\{TITULO_3\}\}/g,    escapeXml(titulo3))
    .replace(/\{\{SUBTITULO\}\}/g,   escapeXml(subtitulo || titulo || ''))
    .replace(/\{\{TEXTO\}\}/g,       escapeXml(texto || ''))
    .replace(/\{\{ETIQUETA\}\}/g,    escapeXml(etiqueta || ''))
    .replace(/\{\{NUMERO\}\}/g,      escapeXml(numLabel))
    .replace(/\{\{IMAGEM_HTML\}\}/g, imagemHtml)
    .replace(/\{\{BULLETS\}\}/g,     bullets)
    .replace(/\{\{BASE_URL\}\}/g,    baseUrl);
}

// --- fill template placeholders with escaped slide data ---
function buildSlideHtml(slide, total, serie = '01') {
  if (serie === '02') return buildSerie2Html(slide, total);

  // normalize: if tipo is actually an etiqueta value, treat slide as 'conteudo'
  const tipoRaw = slide.tipo;
  const tipo = ETIQUETA_VALUES.has(tipoRaw) ? 'conteudo' : tipoRaw;
  const etiquetaResolved = ETIQUETA_VALUES.has(tipoRaw) ? tipoRaw : (slide.etiqueta || '');

  const { numero, titulo, subtitulo, texto } = slide;
  const numLabel = `${numero}/${total}`;

  if (tipo === 'capa') {
    const imagemUrl = slide.imagem_url || slide.imagemUrl || slide.image_url || '';
    const imagemHtml = imagemUrl
      ? `<img src="${escapeXml(imagemUrl)}" alt="" />`
      : `<div class="placeholder">[ FOTO ]</div>`;

    return templateCache['slide-capa']
      .replace(/\{\{TITULO\}\}/g, escapeXml(titulo))
      .replace(/\{\{TEXTO\}\}/g, escapeXml(texto))
      .replace(/\{\{NUMERO\}\}/g, escapeXml(numLabel))
      .replace(/\{\{IMAGEM_HTML\}\}/g, imagemHtml);
  }

  if (tipo === 'conteudo') {
    // even slide numbers (2, 4) → dark; odd (3, 5) → cream
    const classeBg = numero % 2 === 0 ? 'dark' : 'cream';

    const etiquetaMap = {
      'Tendência':  'label--tendencia',
      'Mercado':    'label--mercado',
      'Inspiração': 'label--inspiracao',
    };
    const etiqueta    = etiquetaResolved;
    const etiquetaCor = etiquetaMap[etiqueta] || 'label--tendencia';

    return templateCache['slide-conteudo']
      .replace(/\{\{TITULO\}\}/g,      escapeXml(titulo))
      .replace(/\{\{SUBTITULO\}\}/g,   escapeXml(subtitulo || ''))
      .replace(/\{\{TEXTO\}\}/g,       escapeXml(texto))
      .replace(/\{\{NUMERO\}\}/g,      escapeXml(numLabel))
      .replace(/\{\{CLASSE_BG\}\}/g,   classeBg)
      .replace(/\{\{ETIQUETA\}\}/g,    escapeXml(etiqueta))
      .replace(/\{\{ETIQUETA_COR\}\}/g, etiquetaCor);
  }

  if (tipo === 'resumo') {
    const bullets = String(texto || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => `<li class="item"><p class="item__body">${escapeXml(l)}</p></li>`)
      .join('\n');
    return templateCache['slide-resumo'].replace(/\{\{BULLETS\}\}/g, bullets);
  }

  if (tipo === 'cta') {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    return templateCache['slide-cta']
      .replace(/\{\{TITULO\}\}/g,   escapeXml(titulo))
      .replace(/\{\{TEXTO\}\}/g,    escapeXml(texto))
      .replace(/\{\{BASE_URL\}\}/g, baseUrl);
  }

  throw new Error(`tipo de slide desconhecido: ${tipo}`);
}

app.post('/carousel', async (req, res) => {
  const {
    artigo_id,
    slides,
    serie = '01',
    generate_story = false,
    story_slide = 1,
    story_width = 1080,
    story_height = 1920,
  } = req.body;
  const storyText = resolveStoryText(req.body) || DEFAULT_CAROUSEL_STORY_TEXT;

  if (!artigo_id || typeof artigo_id !== 'string') {
    return res.status(400).json({ error: 'artigo_id é obrigatório' });
  }
  if (!Array.isArray(slides) || slides.length < 1) {
    return res.status(400).json({ error: 'ao menos 1 slide é obrigatório' });
  }

  for (const slide of slides) {
    const sourceVideoUrl = resolveVideoUrl(slide);
    if (!sourceVideoUrl) continue;

    if (!isHttpUrl(sourceVideoUrl)) {
      return res.status(400).json({
        error: 'video_url inválida',
        slide: slide.numero,
        detail: 'video_url deve usar http ou https',
      });
    }

    if (serie !== '02' || slide.tipo !== 'capa') {
      return res.status(400).json({
        error: 'template de vídeo não suportado',
        slide: slide.numero,
        detail: 'video_url é suportada apenas no slide capa da série 02',
      });
    }
  }

  // Sanitize artigo_id to prevent path traversal
  const safeId = artigo_id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) {
    return res.status(400).json({ error: 'artigo_id inválido' });
  }

  const outDir = path.join(OUTPUT_DIR, safeId);
  fs.mkdirSync(outDir, { recursive: true });

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  console.log(JSON.stringify({ event: 'carousel_request', artigo_id: safeId, serie, slides: slides.length, generate_story }));

  try {
    const images = await Promise.all(
      slides.map(async (slide) => {
        let html;
        try {
          html = buildSlideHtml(slide, slides.length, serie);
        } catch (buildErr) {
          const e = new Error(buildErr.message);
          e.slideNum = slide.numero;
          throw e;
        }

        let renderedSlide;
        try {
          renderedSlide = await renderSlide(html);
        } catch (renderErr) {
          const e = new Error(renderErr.message);
          e.slideNum = slide.numero;
          throw e;
        }

        const filename = `slide-${slide.numero}.png`;
        const imagePath = path.join(outDir, filename);
        fs.writeFileSync(imagePath, renderedSlide.screenshot);

        const imagemUrl = `${baseUrl}/output/${safeId}/${filename}`;
        const sourceVideoUrl = resolveVideoUrl(slide);
        let videoUrl = null;

        if (sourceVideoUrl) {
          const videoFilename = `slide-${slide.numero}.mp4`;
          const videoPath = path.join(outDir, videoFilename);

          console.log(JSON.stringify({
            event: 'carousel_video_render_start',
            artigo_id: safeId,
            slide: slide.numero,
            slot: renderedSlide.videoSlot,
          }));

          try {
            await composeCarouselVideo({
              sourceUrl: sourceVideoUrl,
              templatePath: imagePath,
              outputPath: videoPath,
              slot: renderedSlide.videoSlot,
            });
          } catch (videoErr) {
            const e = new Error(videoErr.message);
            e.slideNum = slide.numero;
            throw e;
          }

          videoUrl = `${baseUrl}/output/${safeId}/${videoFilename}`;
          console.log(JSON.stringify({
            event: 'carousel_video_render_done',
            artigo_id: safeId,
            slide: slide.numero,
            video_url: videoUrl,
          }));
        }

        return {
          numero: slide.numero,
          tipo: slide.tipo,
          // `url` is kept for backwards compatibility with existing consumers.
          url: imagemUrl,
          media_type: videoUrl ? 'VIDEO' : 'IMAGE',
          imagem_url: imagemUrl,
          video_url: videoUrl,
        };
      })
    );

    let story = null;

    if (generate_story) {
      const targetSlide = images.find(img => img.numero === story_slide) || images[0];
      const sourceFilename = `slide-${targetSlide.numero}.png`;
      const sourcePath = path.join(outDir, sourceFilename);
      const storyFilename = `story-slide-${targetSlide.numero}.jpg`;
      const storyPath = path.join(outDir, storyFilename);

      await createStoryFromPost(sourcePath, storyPath, Number(story_width), Number(story_height), storyText);

      story = {
        url: `${baseUrl}/output/${safeId}/${storyFilename}`,
        source_slide: targetSlide.numero,
        width: Number(story_width),
        height: Number(story_height),
        text: storyText || null,
      };

      console.log(JSON.stringify({ event: 'carousel_story_done', artigo_id: safeId, source_slide: targetSlide.numero }));
    }

    console.log(JSON.stringify({ event: 'carousel_done', artigo_id: safeId }));
    return res.json({ artigo_id: safeId, images, story });
  } catch (err) {
    console.error(JSON.stringify({ event: 'carousel_error', artigo_id: safeId, slide: err.slideNum, message: err.message }));
    return res.status(500).json({ error: `slide ${err.slideNum} falhou`, detail: err.message });
  }
});

// ============================================================
// BOOT
// ============================================================

loadTemplates();

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ImageMaker rodando na porta ${PORT}`);
  });
}

module.exports = { app };
