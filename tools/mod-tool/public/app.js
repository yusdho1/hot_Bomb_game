// Plain vanilla JS — no framework, no build step. Mutates a local copy of game.config.json and
// saves it back via /api/config for anything that's a pure data edit (toggles, settings, removing
// a reference); scaffolding/deleting a minigame file or uploading an asset go through their own
// endpoints since those touch the filesystem, then reload the config from the server afterward.

const state = { config: null, discovered: null };

const SETTINGS_FIELDS = [
  { path: 'settings.matchDurationDefault', label: 'Match duration default (s)', type: 'number' },
  { path: 'settings.personalTimerSeconds', label: 'Personal fuse (s)', type: 'number' },
  { path: 'settings.streakTarget', label: 'Streak target', type: 'number' },
  { path: 'settings.zipEnabledDefault', label: 'Zip sabotage default on', type: 'checkbox' },
  { path: 'settings.zipStainSecondsDefault', label: 'Tomato stain duration (s)', type: 'number' },
  { path: 'settings.zipGridSize', label: 'Zip grid size', type: 'number' },
  { path: 'settings.zipCheckpoints', label: 'Zip checkpoints', type: 'number' },
  { path: 'settings.points.perSecondRemaining', label: 'Points per fuse-second remaining', type: 'number' },
  { path: 'settings.points.zipSolveBonus', label: 'Zip solve bonus points', type: 'number' },
  { path: 'settings.points.fuseBonusSeconds', label: 'Shop: fuse bonus seconds', type: 'number' },
  { path: 'settings.points.prices.fuseTime', label: 'Shop price: fuse time', type: 'number' },
  { path: 'settings.points.prices.throwTomato', label: 'Shop price: throw tomato', type: 'number' },
  { path: 'settings.points.prices.skipPass', label: 'Shop price: skip pass', type: 'number' },
];

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
  const { config, discovered } = await api('GET', '/api/config');
  state.config = config;
  state.discovered = discovered;
  renderSettings();
  renderMinigames();
  renderSounds();
  renderAvatars();
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
  SETTINGS_FIELDS.forEach((field) => {
    const label = document.createElement('label');
    label.textContent = field.label;
    label.htmlFor = field.path;

    const input = document.createElement('input');
    input.id = field.path;
    input.type = field.type;
    if (field.type === 'checkbox') input.checked = !!getPath(state.config, field.path);
    else input.value = getPath(state.config, field.path);
    if (field.type === 'number') input.step = 'any';

    container.appendChild(label);
    container.appendChild(input);
  });
}

document.getElementById('settings-save-btn').addEventListener('click', async () => {
  SETTINGS_FIELDS.forEach((field) => {
    const input = document.getElementById(field.path);
    const value = field.type === 'checkbox' ? input.checked : Number(input.value);
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

  const registered = new Set(state.config.minigames.map((m) => m.id.toLowerCase()));
  const unregistered = state.discovered.minigameFiles.filter(
    (f) => !registered.has(f.replace(/\.js$/, '').toLowerCase())
  );
  if (unregistered.length > 0) {
    showStatus(`Found file(s) in registry/ with no config entry: ${unregistered.join(', ')}`);
  }
}

document.getElementById('scaffold-btn').addEventListener('click', async () => {
  const id = document.getElementById('new-minigame-id').value.trim();
  const title = document.getElementById('new-minigame-title').value.trim();
  if (!id) {
    showStatus('Enter an id first.', true);
    return;
  }
  try {
    await api('POST', '/api/minigame/scaffold', { id, title });
    showStatus(`Scaffolded ${id} — open src/render/puzzles/registry/${id[0].toUpperCase()}${id.slice(1)}.js to write it.`);
    document.getElementById('new-minigame-id').value = '';
    document.getElementById('new-minigame-title').value = '';
    await loadConfig();
  } catch (err) {
    showStatus(err.message, true);
  }
});

// --- sounds ---

function renderSounds() {
  const container = document.getElementById('sound-list');
  container.innerHTML = '';
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

      row.append(label, removeBtn);
      list.appendChild(row);
    });
    block.appendChild(list);
    container.appendChild(block);
  });
}

document.getElementById('sound-upload-btn').addEventListener('click', async () => {
  const key = document.getElementById('sound-key').value.trim();
  const fileInput = document.getElementById('sound-file');
  const file = fileInput.files[0];
  if (!key || !file) {
    showStatus('Enter a cue key and choose a file first.', true);
    return;
  }
  try {
    const dataBase64 = await fileToBase64(file);
    await api('POST', '/api/sound/upload', { key, filename: file.name, dataBase64 });
    showStatus(`Uploaded ${file.name} to "${key}".`);
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

    const heading = document.createElement('h4');
    heading.textContent = `${cat.label} (${cat.key})`;
    block.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'thumb-grid';
    cat.options.forEach((optionPath) => {
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.title = `Click to remove ${optionPath}`;

      const img = document.createElement('img');
      img.src = optionPath;
      thumb.appendChild(img);

      thumb.addEventListener('click', async () => {
        if (!confirm(`Remove ${optionPath} from "${cat.key}"? (leaves the file on disk)`)) return;
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
  const file = fileInput.files[0];
  if (!category || !file) {
    showStatus('Choose a category and a file first.', true);
    return;
  }
  try {
    const dataBase64 = await fileToBase64(file);
    await api('POST', '/api/avatar/upload', { category, filename: file.name, dataBase64 });
    showStatus(`Uploaded ${file.name} to "${category}".`);
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

loadConfig().catch((err) => showStatus(err.message, true));
