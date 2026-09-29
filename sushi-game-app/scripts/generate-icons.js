#!/usr/bin/env node
// Genera icona, icona adattiva, splash e grafica per Google Play dagli SVG in assets/source/.
// Uso: npm run icons   (scarica sharp al volo con npx: nessuna dipendenza aggiunta al progetto)
//
// Gli SVG sono le sorgenti da modificare. I testi sono già convertiti in tracciati, quindi il risultato
// non dipende dai font installati: 寿 da Noto Sans JP Bold e i testi della grafica da Outfit
// (entrambi con licenza SIL Open Font License).

const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');
const SOURCE = path.join(APP_DIR, 'assets', 'source');
const PLAY_STORE = path.join(APP_DIR, '..', 'docs', 'play-store');
const BRAND_COLOR = '#3E2843'; // come in app.config.ts

// sharp non è una dipendenza del progetto: con `npx --package=sharp` si trova accanto a node_modules/.bin nel PATH
function loadSharp() {
  const candidates = [
    'sharp',
    ...(process.env.PATH || '')
      .split(path.delimiter)
      .filter((dir) => /node_modules[\\/]\.bin$/.test(dir))
      .map((dir) => path.join(dir, '..', 'sharp')),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // prova il successivo
    }
  }
  console.error('sharp non trovato. Esegui: npm run icons');
  process.exit(1);
}

const outputs = [
  // App Store: 1024x1024 senza canale alfa
  { source: 'icon.svg', file: path.join(APP_DIR, 'assets', 'icon.png'), size: 1024, opaque: true },
  // Android: primo piano trasparente (soggetto nella safe zone) e sfondo con le onde seigaiha
  { source: 'adaptive-icon.svg', file: path.join(APP_DIR, 'assets', 'adaptive-icon.png'), size: 1024 },
  {
    source: 'adaptive-icon-background.svg',
    file: path.join(APP_DIR, 'assets', 'adaptive-icon-background.png'),
    size: 1024,
    opaque: true,
  },
  { source: 'splash-icon.svg', file: path.join(APP_DIR, 'assets', 'splash-icon.png'), size: 1024 },
  // Google Play: icona 512x512 e grafica in primo piano 1024x500 (PNG a 24 bit, senza alfa)
  { source: 'icon.svg', file: path.join(PLAY_STORE, 'play-store-icon-512.png'), size: 512, opaque: true },
  {
    source: 'feature-graphic.svg',
    file: path.join(PLAY_STORE, 'feature-graphic.png'),
    size: [1024, 500],
    opaque: true,
  },
];

async function main() {
  const sharp = loadSharp();
  for (const { source, file, size, opaque } of outputs) {
    let image = sharp(fs.readFileSync(path.join(SOURCE, source)), { density: 144 });
    const [width, height] = Array.isArray(size) ? size : [size, size];
    // Rendering a densità doppia e riduzione: bordi più puliti
    image = image.resize(width, height);
    if (opaque) image = image.flatten({ background: BRAND_COLOR });
    await image.png({ compressionLevel: 9 }).toFile(file);
    const meta = await sharp(file).metadata();
    console.log(
      `${path.relative(path.join(APP_DIR, '..'), file)}: ${meta.width}x${meta.height}, ${meta.channels} canali`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
