const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { loadEnv } = require('../env');

let tmpDir;
const KEYS = ['SUSHI_TEST_FROM_FILE', 'SUSHI_TEST_OVERRIDE'];

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sushi-env-'));
});

afterEach(() => KEYS.forEach((key) => delete process.env[key]));

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function writeEnv(name, content) {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, content);
  return file;
}

test('carica le variabili dal file .env', () => {
  const file = writeEnv('carica.env', '# commento\nSUSHI_TEST_FROM_FILE="valore dal file"\n');
  assert.equal(loadEnv(file), file);
  assert.equal(process.env.SUSHI_TEST_FROM_FILE, 'valore dal file');
});

test("le variabili già impostate nell'ambiente hanno la precedenza sul file", () => {
  process.env.SUSHI_TEST_OVERRIDE = 'da PM2';
  const file = writeEnv('precedenza.env', 'SUSHI_TEST_OVERRIDE=dal file\nSUSHI_TEST_FROM_FILE=nuovo\n');
  loadEnv(file);
  assert.equal(process.env.SUSHI_TEST_OVERRIDE, 'da PM2');
  assert.equal(process.env.SUSHI_TEST_FROM_FILE, 'nuovo');
});

test('senza file .env non succede nulla', () => {
  assert.equal(loadEnv(path.join(tmpDir, 'inesistente.env')), null);
  assert.equal(process.env.SUSHI_TEST_FROM_FILE, undefined);
});

test('il server avviato legge la configurazione dal file .env', async () => {
  const file = writeEnv(
    'server.env',
    [
      'PORT=0',
      'HOST=127.0.0.1',
      `DB_PATH=${path.join(tmpDir, 'server.db')}`,
      'PRIVACY_CONTACT=privacy@example.com',
      'LOG_LEVEL=info',
    ].join('\n')
  );
  const env = { ...process.env, ENV_FILE: file };
  ['PORT', 'HOST', 'DB_PATH', 'PRIVACY_CONTACT', 'LOG_LEVEL', 'NODE_ENV'].forEach((key) => delete env[key]);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const line = output.split('\n').find((l) => l.includes('Server in ascolto'));
        if (line) resolve(JSON.parse(line).port);
      });
      child.on('exit', (code) => reject(new Error(`Server terminato (${code}): ${output}`)));
    });
    const html = await (await fetch(`http://127.0.0.1:${port}/privacy`)).text();
    assert.ok(html.includes('privacy@example.com'));
  } finally {
    child.kill();
    await exited;
  }
});
