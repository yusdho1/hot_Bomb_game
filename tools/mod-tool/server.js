// Standalone game-config editor. Plain Node http/fs, no framework — the one exception is `canvas`
// (see renderTitle.js), needed to render title banner PNGs server-side. Run with
// `npm run mod-tool` from the project root. Serves its own admin UI on a separate port from the
// game's own dev server (npm run dev), and only ever talks to itself over 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTitlePng, fontAvailable } from './renderTitle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5175;
const HOST = '127.0.0.1'; // never bind wider than loopback — this server can write files

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'src', 'config', 'game.config.json');
const REGISTRY_DIR = path.join(PROJECT_ROOT, 'src', 'render', 'puzzles', 'registry');
const REGISTRY_INDEX = path.join(REGISTRY_DIR, 'index.js');
// Zip and GoldRushTomato (the two sabotage-puzzle alternatives, picked randomly by main.js's
// openZipPuzzle) deliberately live outside registry/ — neither is part of the pass-the-bomb
// rotation, so they must never appear in discovered.minigameFiles (that list drives the "file
// exists but has no config.minigames entry" warning, which would be a false positive for both).
// They still get their own settingsSchema picked up below, just merged in separately.
const EXTRA_SCHEMA_FILES = [
  { id: 'zip', path: path.join(PROJECT_ROOT, 'src', 'render', 'puzzles', 'ZipPuzzle.js') },
  { id: 'goldrush', path: path.join(PROJECT_ROOT, 'src', 'render', 'puzzles', 'GoldRushTomato.js') },
];
const SOUNDS_DIR = path.join(PROJECT_ROOT, 'public', 'Sounds');
const AVATARS_DIR = path.join(PROJECT_ROOT, 'public', 'UI', 'Avatars');
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'minigame.template.js');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DESIGN_GUIDELINES_PATH = path.join(__dirname, 'DESIGN_GUIDELINES.md');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// --- filesystem helpers ---

// Reduces any client-supplied name to its basename and rejects traversal attempts before it's
// ever joined into a real path — this server has file-write endpoints, so this is load-bearing,
// not decorative.
function safeFilename(name) {
  const base = path.basename(String(name || ''));
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
    throw new Error(`Invalid filename: ${name}`);
  }
  return base;
}

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// Write-temp-then-rename so a crash or overlapping request never leaves game.config.json
// half-written. Handlers use synchronous fs calls throughout, which is enough to serialize
// concurrent requests safely on Node's single-threaded event loop for a single-user local tool.
function writeConfig(config) {
  const tmp = `${CONFIG_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, CONFIG_PATH);
}

function scanDir(dir, extFilter) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => (extFilter ? extFilter.test(f) : true));
}

function pascalCase(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// Text-based extraction, not `import()` — a dynamic import of a registry file would transitively
// hit its `import gameConfig from '.../game.config.json'`, which Vite resolves natively but
// Node's own ESM loader refuses without an import-attribute clause. Regex + Function() over just
// the isolated array literal sidesteps that entirely, needs no cache-busting, and never executes
// any of the puzzle's actual game logic — just reads its declared schema/id as data.
function extractSettingsSchema(fileContent) {
  const match = fileContent.match(/export\s+const\s+settingsSchema\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!match) return [];
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return (${match[1]});`)();
  } catch {
    return [];
  }
}

function extractDefaultId(fileContent) {
  const match = fileContent.match(/id\s*:\s*['"]([a-zA-Z0-9_-]+)['"]/);
  return match ? match[1] : null;
}

// Maps every file actually present in REGISTRY_DIR to its declared id + schema by reading its
// content — deliberately not by guessing a filename from the id via pascalCase(), since that only
// works for scaffold-generated files. Hand-named files (WhackAMole.js, WordMatch.js, ...) don't
// follow that pattern, and there's no way to reconstruct their exact capitalization from a
// lowercase id string alone. This is also what makes "delete file" correct for any file
// regardless of how it was named.
function scanRegistryModules() {
  const files = scanDir(REGISTRY_DIR, /\.js$/).filter((f) => f !== 'index.js');
  return files
    .map((f) => {
      const content = fs.readFileSync(path.join(REGISTRY_DIR, f), 'utf8');
      return { file: f, id: extractDefaultId(content), schema: extractSettingsSchema(content) };
    })
    .filter((m) => m.id);
}

// Regenerates the registry barrel from whatever .js files actually exist in REGISTRY_DIR (not
// from the config list) — self-healing if a file is ever added/removed by hand.
function regenerateRegistryIndex() {
  const files = scanDir(REGISTRY_DIR, /\.js$/).filter((f) => f !== 'index.js');
  const entries = files.map((f) => ({
    varName: path.basename(f, '.js').replace(/^./, (c) => c.toLowerCase()),
    file: f,
  }));
  const importLines = entries.map((e) => `import ${e.varName} from './${e.file}';`).join('\n');
  const exportLine = `export const REGISTRY = [${entries.map((e) => e.varName).join(', ')}];`;
  const content =
    `// AUTO-GENERATED by tools/mod-tool — do not hand-edit this file directly. Adding or removing a\n` +
    `// minigame here means running the mod tool (npm run mod-tool), which regenerates this barrel and\n` +
    `// the matching entry in src/config/game.config.json for you. See tools/mod-tool/README.md.\n` +
    `${importLines}\n\n${exportLine}\n`;
  fs.writeFileSync(REGISTRY_INDEX, content);
}

// Renders a title banner PNG in the same style as the existing hand-made ones (Stroop Title.png,
// Swipe.png — see renderTitle.js for where that style comes from) and saves it under
// public/UI/<title>.png. Used both by scaffoldMinigame (auto-generate a new game's banner) and
// the standalone "Generate title" tool for regenerating an existing one.
function generateTitleAsset(titleText) {
  const buffer = renderTitlePng(titleText);
  const safeName = titleText.replace(/[\\/:*?"<>|]/g, '').trim();
  if (!safeName) throw new Error('Title has no usable characters for a filename');
  const filePath = path.join(PROJECT_ROOT, 'public', 'UI', `${safeName}.png`);
  fs.writeFileSync(filePath, buffer);
  return `/UI/${safeName}.png`;
}

function scaffoldMinigame(id, title) {
  if (!/^[a-z][a-zA-Z0-9]*$/.test(id)) {
    throw new Error('id must start with a lowercase letter and contain only letters/numbers');
  }
  const filePath = path.join(REGISTRY_DIR, `${pascalCase(id)}.js`);
  if (fs.existsSync(filePath)) throw new Error(`A minigame file already exists for id "${id}"`);

  const titleText = (title || id).toUpperCase();
  let template = fs.readFileSync(TEMPLATE_PATH, 'utf8').replace(/__ID__/g, id);

  // Auto-generate the banner PNG from the entered title and wire the scaffold to use titleImg
  // instead of the plain titleText fallback — falls back gracefully (plain text banner, same as
  // before this existed) if rendering isn't available on this machine (e.g. the Berlin Sans FB
  // Bold font isn't installed — see renderTitle.js).
  let titleWarning = null;
  let titleImgPath = null;
  if (title) {
    try {
      titleImgPath = generateTitleAsset(titleText);
    } catch (err) {
      titleWarning = `Couldn't auto-generate a title banner (${err.message}) — using plain text instead.`;
    }
  }
  template = titleImgPath
    ? template.replace("titleText: '__TITLE__',", `titleImg: '${titleImgPath}',`)
    : template.replace(/__TITLE__/g, titleText);

  fs.writeFileSync(filePath, template);
  regenerateRegistryIndex();

  const config = readConfig();
  config.minigames.push({ id, enabled: true });
  writeConfig(config);

  return { titleWarning };
}

function removeMinigame(id, deleteFile) {
  const config = readConfig();
  const entry = config.minigames.find((m) => m.id === id);
  if (!entry) throw new Error(`Unknown minigame id "${id}"`);

  if (deleteFile) {
    const found = scanRegistryModules().find((m) => m.id === id);
    if (found) fs.unlinkSync(path.join(REGISTRY_DIR, found.file));
    config.minigames = config.minigames.filter((m) => m.id !== id);
    if (config.minigameSettings) delete config.minigameSettings[id];
    regenerateRegistryIndex();
  } else {
    entry.enabled = false;
  }
  writeConfig(config);
}

// --- request body / response helpers ---

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

const GAME_PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

// Serves the tool's own admin UI first; anything not found there falls back to the game's own
// public/ folder (unmodified — read-only from this route) so the config's asset paths
// (/UI/Avatars/..., /Sounds/...) resolve as-is for thumbnail/preview purposes in the tool UI,
// without needing any path rewriting in app.js.
function serveStatic(req, res, pathname) {
  // pathname comes from URL.pathname, which stays percent-encoded (e.g. a space becomes %20) —
  // decode it before hitting the filesystem, or any asset filename containing a space (or other
  // encoded character) 404s even though the file is right there.
  const decodedPathname = decodeURIComponent(pathname);
  const rel = decodedPathname === '/' ? '/index.html' : decodedPathname;
  const toolPath = path.join(PUBLIC_DIR, rel);
  const gamePath = path.join(GAME_PUBLIC_DIR, rel);
  if (!toolPath.startsWith(PUBLIC_DIR) || !gamePath.startsWith(GAME_PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(toolPath, (toolErr, toolData) => {
    if (!toolErr) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(toolPath)] || 'application/octet-stream' });
      res.end(toolData);
      return;
    }
    fs.readFile(gamePath, (gameErr, gameData) => {
      if (gameErr) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(gamePath)] || 'application/octet-stream' });
      res.end(gameData);
    });
  });
}

// --- routes ---

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    if (req.method === 'GET' && pathname === '/api/config') {
      const config = readConfig();
      if (!config.minigameSettings) config.minigameSettings = {};
      const modules = scanRegistryModules();
      const schemas = {};
      modules.forEach((m) => {
        if (m.schema.length > 0) schemas[m.id] = m.schema;
      });
      EXTRA_SCHEMA_FILES.forEach(({ id, path: filePath }) => {
        if (!fs.existsSync(filePath)) return;
        const schema = extractSettingsSchema(fs.readFileSync(filePath, 'utf8'));
        if (schema.length > 0) schemas[id] = schema;
      });
      sendJson(res, 200, {
        config,
        schemas,
        discovered: {
          // {file, id} per registry module — id comes from the file's actual default export,
          // not guessed from the filename, so the UI can flag a config entry whose id doesn't
          // match what any real file exports (a puzzle can go silently dead in rotation if its
          // file's `id` and its game.config.json entry's `id` ever drift apart).
          minigameFiles: modules.map((m) => ({ file: m.file, id: m.id })),
          soundFiles: scanDir(SOUNDS_DIR, null),
          avatarFiles: scanDir(AVATARS_DIR, /\.png$/),
        },
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/config') {
      const body = await readJsonBody(req);
      if (!body.settings || !body.minigames || !body.sounds || !body.avatarParts) {
        sendJson(res, 400, { error: 'Config is missing one of settings/minigames/sounds/avatarParts' });
        return;
      }
      writeConfig(body);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/minigame/scaffold') {
      const { id, title } = await readJsonBody(req);
      const { titleWarning } = scaffoldMinigame(id, title);
      sendJson(res, 200, { ok: true, titleWarning });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/title/font-available') {
      sendJson(res, 200, { available: fontAvailable() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/title/generate') {
      const { text } = await readJsonBody(req);
      if (!text || !text.trim()) {
        sendJson(res, 400, { error: 'Enter some title text first.' });
        return;
      }
      const path_ = generateTitleAsset(text.trim().toUpperCase());
      sendJson(res, 200, { ok: true, path: path_ });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/minigame/remove') {
      const { id, deleteFile } = await readJsonBody(req);
      removeMinigame(id, !!deleteFile);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/sound/upload') {
      const { key, filename, dataBase64 } = await readJsonBody(req);
      const safeName = safeFilename(filename);
      fs.writeFileSync(path.join(SOUNDS_DIR, safeName), Buffer.from(dataBase64, 'base64'));

      const config = readConfig();
      const urlPath = `/Sounds/${safeName}`;
      if (!config.sounds[key]) config.sounds[key] = { files: [] };
      if (!config.sounds[key].files.includes(urlPath)) config.sounds[key].files.push(urlPath);
      writeConfig(config);
      sendJson(res, 200, { ok: true, urlPath });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/avatar/upload') {
      const { category, filename, dataBase64 } = await readJsonBody(req);
      const safeName = safeFilename(filename);
      fs.writeFileSync(path.join(AVATARS_DIR, safeName), Buffer.from(dataBase64, 'base64'));

      const config = readConfig();
      const urlPath = `/UI/Avatars/${safeName}`;
      const cat = config.avatarParts.categories.find((c) => c.key === category);
      if (!cat) throw new Error(`Unknown avatar category "${category}"`);
      if (!cat.options.includes(urlPath)) cat.options.push(urlPath);
      writeConfig(config);
      sendJson(res, 200, { ok: true, urlPath });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/avatar/category') {
      const { key, label } = await readJsonBody(req);
      if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) throw new Error('category key must be lowercase letters/numbers');
      const config = readConfig();
      if (config.avatarParts.categories.some((c) => c.key === key)) {
        throw new Error(`Category "${key}" already exists`);
      }
      config.avatarParts.categories.push({ key, label: label || key, options: [] });
      writeConfig(config);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/design-guidelines') {
      const md = fs.readFileSync(DESIGN_GUIDELINES_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(md);
      return;
    }

    if (req.method === 'GET') {
      serveStatic(req, res, pathname);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mod tool running at http://${HOST}:${PORT} (project: ${PROJECT_ROOT})`);
});
