// Plain vanilla JS — no framework, no build step. Mutates a local copy of game.config.json and
// saves it back via /api/config for anything that's a pure data edit (toggles, settings, removing
// a reference); scaffolding/deleting a minigame file or uploading an asset go through their own
// endpoints since those touch the filesystem, then reload the config from the server afterward.

const state = { config: null, discovered: null, schemas: null };

// Grouped into named categories (rendered as one heading + form-grid per group) purely so the
// Settings tab is scannable — settings.json itself stays flat, this grouping is presentation only.
const SETTINGS_CATEGORIES = [
  {
    label: 'Match Timing',
    fields: [
      { path: 'settings.matchDurationDefault', label: 'Match duration default (s)', type: 'number' },
      { path: 'settings.personalTimerSeconds', label: 'Personal fuse (s)', type: 'number' },
      { path: 'settings.streakTarget', label: 'Streak target', type: 'number' },
      { path: 'settings.turnTransitionSeconds', label: 'Bomb-handoff pause (s)', type: 'number' },
    ],
  },
  {
    label: 'Tomato Sabotage',
    fields: [
      { path: 'settings.zipEnabledDefault', label: 'Zip sabotage default on', type: 'checkbox' },
      { path: 'settings.zipStainSecondsDefault', label: 'Tomato stain duration (s)', type: 'number' },
      { path: 'settings.tomatoStainSizePx', label: 'Tomato stain size (px)', type: 'number' },
    ],
  },
  {
    label: 'Background Effects',
    fields: [
      { path: 'settings.bgDotsDriftSeconds', label: 'Background dots drift speed (s per loop)', type: 'number' },
      {
        path: 'settings.bgDotsDriftDirection',
        label: 'Background dots drift direction',
        type: 'select',
        options: [
          { value: 'down-right', label: 'Down-Right ↘' },
          { value: 'down-left', label: 'Down-Left ↙' },
          { value: 'up-right', label: 'Up-Right ↗' },
          { value: 'up-left', label: 'Up-Left ↖' },
        ],
      },
      { path: 'settings.bgLinesDriftSeconds', label: 'Background lines drift speed (s per loop)', type: 'number' },
      {
        path: 'settings.bgLinesDriftDirection',
        label: 'Background lines drift direction',
        type: 'select',
        // The crosshatch lines are two crossing diagonal gradients, each of which only loops
        // seamlessly along its own axis. Up/Down/Left/Right move both line layers together (one of
        // the 4 valid sign combinations between them, netting a cardinal drift rather than a true
        // diagonal); the 4 diagonal options instead move only the one layer whose own axis already
        // points that exact diagonal, leaving the other layer still. See the comment above
        // @keyframes bg-lines-drift-down in index.html for the full explanation.
        options: [
          { value: 'up', label: 'Up ↑' },
          { value: 'down', label: 'Down ↓' },
          { value: 'left', label: 'Left ←' },
          { value: 'right', label: 'Right →' },
          { value: 'up-right', label: 'Up-Right ↗' },
          { value: 'down-right', label: 'Down-Right ↘' },
          { value: 'down-left', label: 'Down-Left ↙' },
          { value: 'up-left', label: 'Up-Left ↖' },
        ],
      },
    ],
  },
  {
    label: 'Points & Shop',
    fields: [
      { path: 'settings.points.perSecondRemaining', label: 'Points per fuse-second remaining', type: 'number' },
      { path: 'settings.points.zipSolveBonus', label: 'Zip solve bonus points', type: 'number' },
      { path: 'settings.points.fuseBonusSeconds', label: 'Shop: fuse bonus seconds', type: 'number' },
      { path: 'settings.points.antiTomatoShieldCharges', label: 'Shield charges per purchase', type: 'number' },
      { path: 'settings.points.prices.fuseTime', label: 'Shop price: fuse time', type: 'number' },
      { path: 'settings.points.prices.throwTomato', label: 'Shop price: throw tomato', type: 'number' },
      { path: 'settings.points.prices.antiTomatoShield', label: 'Shop price: anti-tomato shield', type: 'number' },
      { path: 'settings.points.prices.skipPass', label: 'Shop price: skip pass', type: 'number' },
    ],
  },
];
// Flat view of every field across categories — the save handler and anything else that just
// needs "every settings field" iterates this instead of nesting a second loop everywhere.
const SETTINGS_FIELDS = SETTINGS_CATEGORIES.flatMap((c) => c.fields);

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

function showStatus(message, isError = false) {
  const el = document.getElementById('status-banner');
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.toggle('error', isError);
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

async function loadConfig() {
  const { config, discovered, schemas } = await api('GET', '/api/config');
  state.config = config;
  state.discovered = discovered;
  state.schemas = schemas;
  renderSettings();
  renderMinigames();
  renderMinigameSettings();
  renderSounds();
  renderAvatars();
  renderDebugMinigameOptions();
}

async function saveConfig(successMessage) {
  await api('POST', '/api/config', state.config);
  showStatus(successMessage || 'Saved.');
}

// --- tabs ---

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document
      .querySelectorAll('.tab-panel')
      .forEach((p) => p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`));
  });
});

// --- settings ---

function renderSettings() {
  const container = document.getElementById('settings-form');
  container.innerHTML = '';
  SETTINGS_CATEGORIES.forEach((category) => {
    const heading = document.createElement('h3');
    heading.className = 'settings-category-heading';
    heading.textContent = category.label;
    container.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'form-grid';
    category.fields.forEach((field) => {
      const label = document.createElement('label');
      label.textContent = field.label;
      label.htmlFor = field.path;

      let input;
      if (field.type === 'select') {
        input = document.createElement('select');
        field.options.forEach((opt) => {
          const optionEl = document.createElement('option');
          optionEl.value = opt.value;
          optionEl.textContent = opt.label;
          input.appendChild(optionEl);
        });
        input.value = getPath(state.config, field.path);
      } else {
        input = document.createElement('input');
        input.type = field.type;
        if (field.type === 'checkbox') input.checked = !!getPath(state.config, field.path);
        else input.value = getPath(state.config, field.path);
        if (field.type === 'number') input.step = 'any';
      }
      input.id = field.path;

      grid.appendChild(label);
      grid.appendChild(input);
    });
    container.appendChild(grid);
  });
}

document.getElementById('settings-save-btn').addEventListener('click', async () => {
  SETTINGS_FIELDS.forEach((field) => {
    const input = document.getElementById(field.path);
    const value = field.type === 'checkbox' ? input.checked : field.type === 'select' ? input.value : Number(input.value);
    setPath(state.config, field.path, value);
  });
  try {
    await saveConfig('Settings saved.');
  } catch (err) {
    showStatus(err.message, true);
  }
});

// --- minigames ---

function renderMinigames() {
  const list = document.getElementById('minigame-list');
  list.innerHTML = '';
  state.config.minigames.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'item-row';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = entry.enabled;
    toggle.addEventListener('change', async () => {
      entry.enabled = toggle.checked;
      try {
        await saveConfig(`"${entry.id}" ${toggle.checked ? 'enabled' : 'disabled'}.`);
      } catch (err) {
        showStatus(err.message, true);
      }
    });

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = entry.id;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Delete file';
    removeBtn.title = 'Removes the file and the registry entry permanently';
    removeBtn.addEventListener('click', async () => {
      if (!confirm(`Permanently delete the "${entry.id}" minigame file? This can't be undone here.`)) return;
      try {
        await api('POST', '/api/minigame/remove', { id: entry.id, deleteFile: true });
        showStatus(`Deleted "${entry.id}".`);
        await loadConfig();
      } catch (err) {
        showStatus(err.message, true);
      }
    });

    li.append(toggle, name, removeBtn);
    list.appendChild(li);
  });

  // Compared by the id each file's default export actually declares — not by guessing an id from
  // the filename — so a config entry that no longer matches any real file (e.g. the file's `id`
  // was edited/renamed without updating game.config.json, or vice versa) gets caught here instead
  // of silently sitting in config as a puzzle that can never actually be picked.
  const realIds = new Set(state.discovered.minigameFiles.map((m) => m.id));
  const configuredIds = new Set(state.config.minigames.map((m) => m.id));

  const unregistered = state.discovered.minigameFiles.filter((m) => !configuredIds.has(m.id));
  const orphanedConfigEntries = state.config.minigames.filter((m) => !realIds.has(m.id));

  const messages = [];
  if (unregistered.length > 0) {
    messages.push(`File(s) with no config entry: ${unregistered.map((m) => `${m.file} (id "${m.id}")`).join(', ')}`);
  }
  if (orphanedConfigEntries.length > 0) {
    messages.push(
      `Config id(s) matching no real file's id — dead, can never be picked: ${orphanedConfigEntries.map((m) => `"${m.id}"`).join(', ')}`
    );
  }
  if (messages.length > 0) showStatus(messages.join(' | '), true);
}

document.getElementById('scaffold-btn').addEventListener('click', async () => {
  const id = document.getElementById('new-minigame-id').value.trim();
  const title = document.getElementById('new-minigame-title').value.trim();
  if (!id) {
    showStatus('Enter an id first.', true);
    return;
  }
  try {
    const result = await api('POST', '/api/minigame/scaffold', { id, title });
    const base = `Scaffolded ${id} — open src/render/puzzles/registry/${id[0].toUpperCase()}${id.slice(1)}.js to write it.`;
    showStatus(result.titleWarning ? `${base} ${result.titleWarning}` : base, !!result.titleWarning);
    document.getElementById('new-minigame-id').value = '';
    document.getElementById('new-minigame-title').value = '';
    await loadConfig();
  } catch (err) {
    showStatus(err.message, true);
  }
});

document.getElementById('title-gen-btn').addEventListener('click', async () => {
  const text = document.getElementById('title-gen-text').value.trim();
  if (!text) {
    showStatus('Enter some title text first.', true);
    return;
  }
  try {
    const result = await api('POST', '/api/title/generate', { text });
    showStatus(`Saved public${result.path} — reload the Preview tab or your puzzle file's titleImg to see it.`);
    const preview = document.getElementById('title-gen-preview');
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = result.path + '?t=' + Date.now();
    img.alt = text;
    img.style.maxWidth = '300px';
    img.style.marginTop = '10px';
    preview.appendChild(img);
  } catch (err) {
    showStatus(err.message, true);
  }
});

// --- per-game settings ---

const DIFFICULTY_LEVELS = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
];

function minigameSettingsInputId(gameId, key) {
  return `mgset-${gameId}-${key}`;
}

function minigameDifficultyInputId(gameId, level, key) {
  return `mgset-${gameId}-${level}-${key}`;
}

function buildSettingsForm(schema, getValue) {
  const form = document.createElement('div');
  form.className = 'form-grid';
  schema.forEach((field) => {
    const label = document.createElement('label');
    label.textContent = field.label || field.key;

    const input = document.createElement('input');
    input.type = field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : 'text';
    if (field.type === 'number') input.step = 'any';
    label.htmlFor = getValue.id(field);
    input.id = getValue.id(field);
    const value = getValue.value(field);
    input.value = value !== undefined && value !== null ? value : '';

    form.appendChild(label);
    form.appendChild(input);
  });
  return form;
}

function renderMinigameSettings() {
  const container = document.getElementById('minigame-settings');
  container.innerHTML = '';

  if (!state.config.minigameSettings) state.config.minigameSettings = {};

  const ids = Object.keys(state.schemas).sort();
  if (ids.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'No minigame currently exports a settingsSchema.';
    container.appendChild(hint);
    return;
  }

  ids.forEach((gameId) => {
    const schema = state.schemas[gameId];
    if (!state.config.minigameSettings[gameId]) state.config.minigameSettings[gameId] = {};
    const saved = state.config.minigameSettings[gameId];
    if (!saved.difficultyPresets) saved.difficultyPresets = {};

    // Collapsed by default (native <details>, no custom JS state needed) — with every game's
    // full settings *and* all three difficulty presets always expanded, this section was a very
    // long flat scroll. One folder per game, one nested folder per difficulty level.
    const block = document.createElement('details');
    block.className = 'category-block';

    const heading = document.createElement('summary');
    heading.textContent = gameId;
    block.appendChild(heading);

    const baseForm = buildSettingsForm(schema, {
      id: (field) => minigameSettingsInputId(gameId, field.key),
      value: (field) => (saved[field.key] !== undefined ? saved[field.key] : field.default),
    });
    block.appendChild(baseForm);

    // Color swatches aren't difficulty-tunable (a native color input can't represent "blank" —
    // it always resolves to a real hex value — so "leave it blank to inherit" can't work for
    // them). Only number/string fields get a per-difficulty override.
    const tunableSchema = schema.filter((field) => field.type !== 'color');

    if (tunableSchema.length > 0) {
      DIFFICULTY_LEVELS.forEach(({ key: level, label: levelLabel }) => {
        if (!saved.difficultyPresets[level]) saved.difficultyPresets[level] = {};
        const preset = saved.difficultyPresets[level];

        const levelDetails = document.createElement('details');
        levelDetails.className = 'difficulty-block';

        const subHeading = document.createElement('summary');
        subHeading.className = 'difficulty-subheading';
        subHeading.textContent = levelLabel;
        levelDetails.appendChild(subHeading);

        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = 'Leave a field blank to inherit the base value above.';
        levelDetails.appendChild(hint);

        const presetForm = buildSettingsForm(tunableSchema, {
          id: (field) => minigameDifficultyInputId(gameId, level, field.key),
          value: (field) => preset[field.key],
        });
        levelDetails.appendChild(presetForm);

        block.appendChild(levelDetails);
      });
    }

    container.appendChild(block);
  });
}

document.getElementById('minigame-settings-save-btn').addEventListener('click', async () => {
  Object.keys(state.schemas).forEach((gameId) => {
    const schema = state.schemas[gameId];
    if (!state.config.minigameSettings[gameId]) state.config.minigameSettings[gameId] = {};
    const saved = state.config.minigameSettings[gameId];
    if (!saved.difficultyPresets) saved.difficultyPresets = {};

    schema.forEach((field) => {
      const input = document.getElementById(minigameSettingsInputId(gameId, field.key));
      saved[field.key] = field.type === 'number' ? Number(input.value) : input.value;
    });

    const tunableSchema = schema.filter((field) => field.type !== 'color');
    DIFFICULTY_LEVELS.forEach(({ key: level }) => {
      if (!saved.difficultyPresets[level]) saved.difficultyPresets[level] = {};
      const preset = saved.difficultyPresets[level];
      tunableSchema.forEach((field) => {
        const input = document.getElementById(minigameDifficultyInputId(gameId, level, field.key));
        if (input.value === '') {
          delete preset[field.key];
        } else {
          preset[field.key] = field.type === 'number' ? Number(input.value) : input.value;
        }
      });
    });
  });
  try {
    await saveConfig('Minigame settings saved.');
  } catch (err) {
    showStatus(err.message, true);
  }
});

// --- sounds ---

// Which cue keys use each file path — lets the list flag a file that's shared across more than
// one cue (edit/replace it and every cue using it changes too, which is easy to miss otherwise).
function buildSoundFileUsage() {
  const usage = {};
  Object.entries(state.config.sounds).forEach(([key, entry]) => {
    entry.files.forEach((filePath) => {
      if (!usage[filePath]) usage[filePath] = [];
      usage[filePath].push(key);
    });
  });
  return usage;
}

function renderSounds() {
  const container = document.getElementById('sound-list');
  container.innerHTML = '';
  const usage = buildSoundFileUsage();
  Object.entries(state.config.sounds).forEach(([key, entry]) => {
    const block = document.createElement('div');
    block.className = 'category-block';

    const heading = document.createElement('h4');
    heading.textContent = key;
    block.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'thumb-grid';
    entry.files.forEach((filePath) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.style.width = '100%';

      const label = document.createElement('span');
      label.className = 'item-files';
      label.textContent = filePath;

      const sharedWith = usage[filePath].filter((k) => k !== key);
      let badge = null;
      if (sharedWith.length > 0) {
        badge = document.createElement('span');
        badge.className = 'shared-badge';
        badge.textContent = `⚠ also used by ${sharedWith.join(', ')}`;
        badge.title = 'Editing or removing this file affects every cue listed here too';
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove this file from the cue (leaves the file on disk)';
      removeBtn.addEventListener('click', async () => {
        entry.files = entry.files.filter((f) => f !== filePath);
        try {
          await saveConfig(`Removed a file from "${key}".`);
          renderSounds();
        } catch (err) {
          showStatus(err.message, true);
        }
      });

      row.append(label, ...(badge ? [badge] : []), removeBtn);
      list.appendChild(row);
    });
    block.appendChild(list);
    container.appendChild(block);
  });
}

document.getElementById('sound-upload-btn').addEventListener('click', async () => {
  const key = document.getElementById('sound-key').value.trim();
  const fileInput = document.getElementById('sound-file');
  const files = Array.from(fileInput.files);
  if (!key || files.length === 0) {
    showStatus('Enter a cue key and choose at least one file first.', true);
    return;
  }
  try {
    // One request per file, in order — the server appends each one to the cue's files array, so
    // sequential (not parallel) keeps that order predictable and avoids concurrent writers racing
    // to read-modify-write the same game.config.json.
    for (const file of files) {
      const dataBase64 = await fileToBase64(file);
      await api('POST', '/api/sound/upload', { key, filename: file.name, dataBase64 });
    }
    showStatus(files.length === 1 ? `Uploaded ${files[0].name} to "${key}".` : `Uploaded ${files.length} files to "${key}".`);
    fileInput.value = '';
    await loadConfig();
  } catch (err) {
    showStatus(err.message, true);
  }
});

// --- avatars ---

function renderAvatars() {
  const container = document.getElementById('avatar-categories');
  container.innerHTML = '';
  const select = document.getElementById('avatar-category-select');
  select.innerHTML = '';

  state.config.avatarParts.categories.forEach((cat) => {
    const block = document.createElement('div');
    block.className = 'category-block';

    const headingRow = document.createElement('div');
    headingRow.className = 'category-heading-row';

    const heading = document.createElement('h4');
    heading.textContent = `${cat.label} (${cat.key})`;
    headingRow.appendChild(heading);

    const deleteCategoryBtn = document.createElement('button');
    deleteCategoryBtn.className = 'remove-btn';
    deleteCategoryBtn.textContent = 'Delete category';
    deleteCategoryBtn.title = 'Removes this category entirely (leaves the image files on disk)';
    deleteCategoryBtn.addEventListener('click', async () => {
      if (
        !confirm(
          `Permanently delete the "${cat.label}" (${cat.key}) category? Every player's saved avatar loses this layer. Image files stay on disk.`
        )
      )
        return;
      try {
        await api('POST', '/api/avatar/category/remove', { key: cat.key });
        showStatus(`Deleted category "${cat.key}".`);
        await loadConfig();
      } catch (err) {
        showStatus(err.message, true);
      }
    });
    headingRow.appendChild(deleteCategoryBtn);

    block.appendChild(headingRow);

    const grid = document.createElement('div');
    grid.className = 'thumb-grid';
    cat.options.forEach((optionPath) => {
      const thumb = document.createElement('div');
      thumb.className = 'thumb';

      // null represents "no image for this layer" (e.g. no hair) — a real, player-selectable
      // choice, not a broken entry, so it gets its own plain-CSS tile instead of an <img> (which
      // would 404 trying to load a null src).
      if (optionPath === null) {
        thumb.classList.add('thumb-empty');
        thumb.textContent = 'None';
        thumb.title = 'Click to remove the "None" option';
      } else {
        const img = document.createElement('img');
        img.src = optionPath;
        thumb.appendChild(img);
        thumb.title = `Click to remove ${optionPath}`;
      }

      thumb.addEventListener('click', async () => {
        const label = optionPath === null ? '"None"' : optionPath;
        if (!confirm(`Remove ${label} from "${cat.key}"?${optionPath === null ? '' : ' (leaves the file on disk)'}`)) return;
        cat.options = cat.options.filter((o) => o !== optionPath);
        try {
          await saveConfig('Removed avatar option.');
          renderAvatars();
        } catch (err) {
          showStatus(err.message, true);
        }
      });

      grid.appendChild(thumb);
    });
    block.appendChild(grid);

    const noneRow = document.createElement('label');
    noneRow.className = 'avatar-none-toggle';
    const noneCheckbox = document.createElement('input');
    noneCheckbox.type = 'checkbox';
    noneCheckbox.checked = cat.options.includes(null);
    noneCheckbox.addEventListener('change', async () => {
      if (noneCheckbox.checked) {
        if (!cat.options.includes(null)) cat.options.push(null);
      } else {
        cat.options = cat.options.filter((o) => o !== null);
      }
      try {
        await saveConfig(`"${cat.key}" None option ${noneCheckbox.checked ? 'enabled' : 'disabled'}.`);
        renderAvatars();
      } catch (err) {
        showStatus(err.message, true);
      }
    });
    noneRow.append(noneCheckbox, ` Allow a "None" option (no ${cat.label.toLowerCase()})`);
    block.appendChild(noneRow);

    container.appendChild(block);

    const opt = document.createElement('option');
    opt.value = cat.key;
    opt.textContent = cat.label;
    select.appendChild(opt);
  });
}

document.getElementById('avatar-upload-btn').addEventListener('click', async () => {
  const category = document.getElementById('avatar-category-select').value;
  const fileInput = document.getElementById('avatar-file');
  const files = Array.from(fileInput.files);
  if (!category || files.length === 0) {
    showStatus('Choose a category and at least one file first.', true);
    return;
  }
  try {
    // Sequential for the same reason as the sound uploader above — predictable order, no
    // concurrent read-modify-write race on game.config.json.
    for (const file of files) {
      const dataBase64 = await fileToBase64(file);
      await api('POST', '/api/avatar/upload', { category, filename: file.name, dataBase64 });
    }
    showStatus(
      files.length === 1 ? `Uploaded ${files[0].name} to "${category}".` : `Uploaded ${files.length} files to "${category}".`
    );
    fileInput.value = '';
    await loadConfig();
  } catch (err) {
    showStatus(err.message, true);
  }
});

document.getElementById('add-category-btn').addEventListener('click', async () => {
  const key = document.getElementById('new-category-key').value.trim();
  const label = document.getElementById('new-category-label').value.trim();
  if (!key) {
    showStatus('Enter a category key first.', true);
    return;
  }
  try {
    await api('POST', '/api/avatar/category', { key, label });
    showStatus(`Added category "${key}".`);
    document.getElementById('new-category-key').value = '';
    document.getElementById('new-category-label').value = '';
    await loadConfig();
  } catch (err) {
    showStatus(err.message, true);
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- preview ---

// Config edits need a fresh page load in the game to take effect (same as any other config
// change — see README) — re-pointing an iframe's src at itself is the simplest reliable reload,
// simpler than trying to call .contentWindow.location.reload() across the frame boundary.
document.querySelectorAll('.preview-reload-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const frame = document.getElementById(btn.dataset.target);
    if (frame) frame.src = frame.src;
  });
});

function renderDebugMinigameOptions() {
  const select = document.getElementById('debug-minigame-select');
  const current = select.value;
  select.innerHTML = '';
  const ids = [];
  state.config.minigames.forEach((entry) => {
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = entry.id;
    select.appendChild(opt);
    ids.push(entry.id);
  });
  // Sabotage-puzzle alternatives (Zip, Gold Rush — the "Earn Tomato" games) aren't part of the
  // pass-the-bomb rotation, so they're never in state.config.minigames — but they're still real,
  // previewable minigames. They're exactly the schemas discovered from server.js's
  // EXTRA_SCHEMA_FILES rather than the registry/ folder, which state.discovered.minigameFiles
  // already distinguishes for us.
  const registryIds = new Set(state.discovered.minigameFiles.map((m) => m.id));
  Object.keys(state.schemas)
    .filter((id) => !registryIds.has(id))
    .forEach((id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${id} (sabotage)`;
      select.appendChild(opt);
      ids.push(id);
    });
  if (current && ids.includes(current)) select.value = current;
}

// Loads a specific minigame + difficulty directly into both preview frames via the game's own
// ?debugPuzzle=/&difficulty= bootstrap (src/main.js) — no lobby, no hosting, no timer.
document.getElementById('debug-load-btn').addEventListener('click', () => {
  const id = document.getElementById('debug-minigame-select').value;
  const difficulty = document.getElementById('debug-difficulty-select').value;
  if (!id) return;
  const url = `http://localhost:5173/?debugPuzzle=${encodeURIComponent(id)}&difficulty=${encodeURIComponent(difficulty)}`;
  document.getElementById('preview-frame-desktop').src = url;
  document.getElementById('preview-frame-phone').src = url;
});

loadConfig().catch((err) => showStatus(err.message, true));
