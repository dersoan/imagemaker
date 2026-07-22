const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');

const API_KEY = 'integration-test-video-key';
process.env.VIDEO_UPLOAD_API_KEY = API_KEY;
process.env.VIDEO_UPLOAD_MAX_BYTES = '32';

const { app } = require('../index');

const videosDir = path.join(__dirname, '..', 'output', 'videos');
const uploadsTmpDir = path.join(__dirname, '..', 'output', '.video-uploads');
let baseUrl;
let server;
let uploadedFilePath;

function makeForm(data, filename, type = 'video/mp4') {
  const form = new FormData();
  form.append('video', new Blob([data], { type }), filename);
  return form;
}

function makeMinimalMp4() {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d,
    0x6d, 0x70, 0x34, 0x32,
  ]);
}

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.BASE_URL = baseUrl;
});

after(async () => {
  if (uploadedFilePath) {
    await fs.promises.unlink(uploadedFilePath).catch(() => {});
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('recusa upload sem chave', async () => {
  const response = await fetch(`${baseUrl}/upload/video`, {
    method: 'POST',
    body: makeForm(makeMinimalMp4(), 'video.mp4'),
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'unauthorized');
});

test('recusa upload com chave incorreta', async () => {
  const response = await fetch(`${baseUrl}/upload/video`, {
    method: 'POST',
    headers: { 'X-API-Key': 'wrong-key' },
    body: makeForm(makeMinimalMp4(), 'video.mp4'),
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'unauthorized');
});

test('recusa arquivo sem assinatura MP4 e remove o temporário', async () => {
  const uploadsBefore = await fs.promises.readdir(uploadsTmpDir);
  const response = await fetch(`${baseUrl}/upload/video`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY },
    body: makeForm(Buffer.from('not an mp4 file'), 'fake.mp4'),
  });
  const uploadsAfter = await fs.promises.readdir(uploadsTmpDir);

  assert.equal(response.status, 415);
  assert.equal((await response.json()).error, 'invalid_mp4');
  assert.deepEqual(uploadsAfter, uploadsBefore);
});

test('recusa vídeo acima do limite configurado', async () => {
  const response = await fetch(`${baseUrl}/upload/video`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY },
    body: makeForm(Buffer.alloc(64), 'large.mp4'),
  });
  const result = await response.json();

  assert.equal(response.status, 413);
  assert.equal(result.error, 'file_too_large');
  assert.equal(result.max_size_bytes, 32);
});

test('salva MP4 válido e o disponibiliza pela URL pública', async () => {
  const mp4 = makeMinimalMp4();
  const response = await fetch(`${baseUrl}/upload/video`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: makeForm(mp4, 'casamento.mp4'),
  });
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.match(result.filename, /^video-[0-9a-f-]+\.mp4$/);
  assert.equal(result.url, `${baseUrl}/output/videos/${result.filename}`);
  assert.equal(result.size, mp4.length);

  uploadedFilePath = path.join(videosDir, result.filename);
  const publicResponse = await fetch(result.url);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('content-type'), 'video/mp4');
  assert.deepEqual(Buffer.from(await publicResponse.arrayBuffer()), mp4);

  const rangeResponse = await fetch(result.url, { headers: { Range: 'bytes=4-7' } });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get('content-range'), `bytes 4-7/${mp4.length}`);
  assert.equal(Buffer.from(await rangeResponse.arrayBuffer()).toString('ascii'), 'ftyp');
});
