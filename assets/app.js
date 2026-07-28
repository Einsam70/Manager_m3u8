const state = {
    entries: [],
    activeId: null,
    sourceName: '',
    draggedId: null,
    lastCheckedIndex: null,
    checkAbortController: null,
    isChecking: false,
};

const els = {
    serverFile: document.querySelector('#serverFile'),
    loadServerFile: document.querySelector('#loadServerFile'),
    localFile: document.querySelector('#localFile'),
    importStatus: document.querySelector('#importStatus'),
    channelList: document.querySelector('#channelList'),
    rowTemplate: document.querySelector('#rowTemplate'),
    totalCount: document.querySelector('#totalCount'),
    selectedCount: document.querySelector('#selectedCount'),
    search: document.querySelector('#search'),
    selectAll: document.querySelector('#selectAll'),
    addEntry: document.querySelector('#addEntry'),
    removeSelected: document.querySelector('#removeSelected'),
    moveUp: document.querySelector('#moveUp'),
    moveDown: document.querySelector('#moveDown'),
    sortByName: document.querySelector('#sortByName'),
    dedupe: document.querySelector('#dedupe'),
    nameInput: document.querySelector('#nameInput'),
    groupInput: document.querySelector('#groupInput'),
    urlInput: document.querySelector('#urlInput'),
    logoInput: document.querySelector('#logoInput'),
    metaInput: document.querySelector('#metaInput'),
    applyEdit: document.querySelector('#applyEdit'),
    copyUrl: document.querySelector('#copyUrl'),
    player: document.querySelector('#player'),
    useProxy: document.querySelector('#useProxy'),
    playSelected: document.querySelector('#playSelected'),
    checkSelected: document.querySelector('#checkSelected'),
    checkSelectedBatch: document.querySelector('#checkSelectedBatch'),
    checkVisible: document.querySelector('#checkVisible'),
    cancelCheck: document.querySelector('#cancelCheck'),
    testLog: document.querySelector('#testLog'),
    outputName: document.querySelector('#outputName'),
    splitSize: document.querySelector('#splitSize'),
    saveFile: document.querySelector('#saveFile'),
    downloadFile: document.querySelector('#downloadFile'),
    preview: document.querySelector('#preview'),
};

const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function parseAttributes(text) {
    const attrs = {};
    text.replace(/([\w-]+)="([^"]*)"/g, (_, key, value) => {
        attrs[key] = value;
        return '';
    });
    return attrs;
}

function setAttribute(meta, key, value) {
    let next = meta || '-1';
    const escaped = String(value || '').replaceAll('"', "'");
    const pattern = new RegExp(`\\s${key}="[^"]*"`, 'i');

    if (!escaped) {
        return next.replace(pattern, '').trim() || '-1';
    }

    if (pattern.test(next)) {
        next = next.replace(pattern, ` ${key}="${escaped}"`);
    } else {
        next = `${next} ${key}="${escaped}"`;
    }

    return next.trim();
}

function parseM3u(content) {
    const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
    const entries = [];
    let pending = null;
    let extras = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.toUpperCase() === '#EXTM3U') {
            continue;
        }

        if (line.startsWith('#EXTINF')) {
            const comma = line.indexOf(',');
            const meta = comma >= 0 ? line.slice(8, comma).trim() : line.slice(8).trim();
            const name = comma >= 0 ? line.slice(comma + 1).trim() : 'Canal sin nombre';
            const attrs = parseAttributes(meta);
            pending = {
                id: uid(),
                name: name || 'Canal sin nombre',
                url: '',
                group: attrs['group-title'] || '',
                logo: attrs['tvg-logo'] || '',
                meta: meta || '-1',
                extras: [...extras],
                selected: false,
                status: '',
            };
            extras = [];
            continue;
        }

        if (line.startsWith('#')) {
            extras.push(line);
            continue;
        }

        if (pending) {
            pending.url = line;
            entries.push(pending);
            pending = null;
        } else {
            entries.push({
                id: uid(),
                name: line.split('/').filter(Boolean).pop() || 'Canal sin nombre',
                url: line,
                group: '',
                logo: '',
                meta: '-1',
                extras: [...extras],
                selected: false,
                status: '',
            });
            extras = [];
        }
    }

    if (pending) {
        entries.push(pending);
    }

    return entries;
}

function serializeM3u(entries) {
    const lines = ['#EXTM3U', ''];

    entries.forEach((entry) => {
        let meta = entry.meta || '-1';
        meta = setAttribute(meta, 'group-title', entry.group);
        meta = setAttribute(meta, 'tvg-logo', entry.logo);
        (entry.extras || []).forEach((extra) => lines.push(extra));
        lines.push(`#EXTINF:${meta},${entry.name || 'Canal sin nombre'}`);
        lines.push(entry.url || '');
    });

    return `${lines.join('\n')}\n`;
}

function visibleEntries() {
    const query = els.search.value.trim().toLowerCase();
    if (!query) {
        return state.entries;
    }

    return state.entries.filter((entry) => {
        return [entry.name, entry.group, entry.url].some((value) => String(value || '').toLowerCase().includes(query));
    });
}

function activeEntry() {
    return state.entries.find((entry) => entry.id === state.activeId) || null;
}

function selectEntry(id) {
    state.activeId = id;
    fillEditor();
    render();
}

function render() {
    const visible = visibleEntries();
    els.channelList.innerHTML = '';

    visible.forEach((entry) => {
        const row = els.rowTemplate.content.firstElementChild.cloneNode(true);
        row.dataset.id = entry.id;
        row.classList.toggle('active', entry.id === state.activeId);
        row.querySelector('.row-check').checked = entry.selected;
        row.querySelector('.row-name').textContent = entry.name || 'Canal sin nombre';
        row.querySelector('.row-url').textContent = entry.url || 'Sin URL';
        row.querySelector('.row-group').textContent = entry.group || 'Sin grupo';

        const status = row.querySelector('.row-status');
        status.textContent = entry.status || 'sin probar';
        status.classList.toggle('ok', entry.status.startsWith('OK'));
        status.classList.toggle('bad', entry.status.startsWith('ERROR'));
        status.classList.toggle('wait', entry.status === 'probando');

        row.addEventListener('click', (event) => {
            if (!event.target.classList.contains('row-check')) {
                selectEntry(entry.id);
            }
        });

        row.querySelector('.row-check').addEventListener('change', (event) => {
            const currentIndex = state.entries.findIndex((item) => item.id === entry.id);
            if (event.shiftKey && state.lastCheckedIndex !== null && currentIndex >= 0) {
                const start = Math.min(state.lastCheckedIndex, currentIndex);
                const end = Math.max(state.lastCheckedIndex, currentIndex);
                for (let index = start; index <= end; index += 1) {
                    state.entries[index].selected = event.target.checked;
                }
            } else {
                entry.selected = event.target.checked;
            }
            state.lastCheckedIndex = currentIndex;
            render();
        });

        row.querySelector('.top-button').addEventListener('click', (event) => {
            event.stopPropagation();
            moveEntryToTop(entry.id);
        });

        row.addEventListener('dragstart', () => {
            state.draggedId = entry.id;
            row.classList.add('dragging');
        });

        row.addEventListener('dragend', () => {
            state.draggedId = null;
            row.classList.remove('dragging');
        });

        row.addEventListener('dragover', (event) => event.preventDefault());
        row.addEventListener('drop', () => {
            if (state.draggedId && state.draggedId !== entry.id) {
                moveEntryTo(state.draggedId, entry.id);
            }
        });

        els.channelList.append(row);
    });

    updateCounts();
    updatePreview();
}

function updateCounts() {
    const selected = state.entries.filter((entry) => entry.selected).length;
    els.totalCount.textContent = `${state.entries.length} ${state.entries.length === 1 ? 'canal' : 'canales'}`;
    els.selectedCount.textContent = `${selected} seleccionados`;
    els.selectAll.checked = state.entries.length > 0 && selected === state.entries.length;
}

function fillEditor() {
    const entry = activeEntry();
    els.nameInput.value = entry?.name || '';
    els.groupInput.value = entry?.group || '';
    els.urlInput.value = entry?.url || '';
    els.logoInput.value = entry?.logo || '';
    els.metaInput.value = entry?.meta || '-1';
}

function loadContent(content, name = '') {
    state.entries = parseM3u(content);
    state.sourceName = name;
    state.activeId = state.entries[0]?.id || null;
    state.lastCheckedIndex = null;
    els.outputName.value = name ? name.replace(/\.(txt)$/i, '.m3u') : 'lista_limpia.m3u';
    fillEditor();
    log(`Cargados ${state.entries.length} canales${name ? ` desde ${name}` : ''}.`);
    render();
}

function applyEditor() {
    const entry = activeEntry();
    if (!entry) {
        return;
    }
    entry.name = els.nameInput.value.trim() || 'Canal sin nombre';
    entry.group = els.groupInput.value.trim();
    entry.url = els.urlInput.value.trim();
    entry.logo = els.logoInput.value.trim();
    entry.meta = els.metaInput.value.trim() || '-1';
    render();
}

function moveSelection(direction) {
    const selectedIds = new Set(state.entries.filter((entry) => entry.selected).map((entry) => entry.id));
    if (selectedIds.size === 0 && state.activeId) {
        selectedIds.add(state.activeId);
    }

    const indexes = state.entries.map((entry, index) => selectedIds.has(entry.id) ? index : -1).filter((index) => index >= 0);
    const ordered = direction < 0 ? indexes : indexes.reverse();

    ordered.forEach((index) => {
        const target = index + direction;
        if (target < 0 || target >= state.entries.length || selectedIds.has(state.entries[target].id)) {
            return;
        }
        [state.entries[index], state.entries[target]] = [state.entries[target], state.entries[index]];
    });

    render();
}

function moveEntryTo(draggedId, targetId) {
    const from = state.entries.findIndex((entry) => entry.id === draggedId);
    const to = state.entries.findIndex((entry) => entry.id === targetId);
    if (from < 0 || to < 0) {
        return;
    }
    const [entry] = state.entries.splice(from, 1);
    state.entries.splice(to, 0, entry);
    render();
}

function moveEntryToTop(id) {
    const from = state.entries.findIndex((entry) => entry.id === id);
    if (from <= 0) {
        return;
    }

    const [entry] = state.entries.splice(from, 1);
    state.entries.unshift(entry);
    state.activeId = entry.id;
    fillEditor();
    render();
}

function sortEntriesByName() {
    state.entries.sort((a, b) => {
        return (a.name || '').localeCompare(b.name || '', undefined, {
            sensitivity: 'base',
            numeric: true,
        });
    });
    state.lastCheckedIndex = null;
    render();
}

function removeSelected() {
    const selected = state.entries.filter((entry) => entry.selected);
    const ids = new Set(selected.length ? selected.map((entry) => entry.id) : [state.activeId]);
    state.entries = state.entries.filter((entry) => !ids.has(entry.id));
    state.activeId = state.entries[0]?.id || null;
    fillEditor();
    render();
}

function addEntry() {
    const entry = {
        id: uid(),
        name: 'Nuevo canal',
        group: '',
        url: '',
        logo: '',
        meta: '-1',
        extras: [],
        selected: false,
        status: '',
    };
    const activeIndex = state.entries.findIndex((item) => item.id === state.activeId);
    state.entries.splice(activeIndex >= 0 ? activeIndex + 1 : state.entries.length, 0, entry);
    selectEntry(entry.id);
}

function removeDuplicates() {
    const seen = new Set();
    const before = state.entries.length;
    state.entries = state.entries.filter((entry) => {
        const key = entry.url.trim().toLowerCase();
        if (!key || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    log(`Duplicados eliminados: ${before - state.entries.length}.`);
    render();
}

function setCheckingState(isChecking) {
    state.isChecking = isChecking;
    els.checkSelected.disabled = isChecking;
    els.checkSelectedBatch.disabled = isChecking;
    els.checkVisible.disabled = isChecking;
    els.cancelCheck.disabled = !isChecking;
}

function selectedEntries() {
    return state.entries.filter((entry) => entry.selected);
}

async function checkEntry(entry, signal = null) {
    if (!entry?.url) {
        return;
    }

    entry.status = 'probando';
    render();

    try {
        const response = await fetch('api.php?action=check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: entry.url }),
            signal,
        });
        const data = await response.json();
        entry.status = data.ok ? `OK ${data.code || ''}`.trim() : `ERROR ${data.code || ''}`.trim();
        log(`${entry.name}: ${data.message || entry.status}`);
    } catch (error) {
        if (error.name === 'AbortError') {
            entry.status = 'cancelado';
            log(`${entry.name}: comprobación cancelada.`);
        } else {
            entry.status = 'ERROR';
            log(`${entry.name}: no se pudo comprobar.`);
        }
    }

    render();
}

async function checkEntries(entries, label = 'canales') {
    if (state.isChecking) {
        log('Ya hay una comprobación en marcha.');
        return;
    }

    if (!entries.length) {
        log('No hay canales para comprobar.');
        return;
    }

    state.checkAbortController = new AbortController();
    const signal = state.checkAbortController.signal;
    setCheckingState(true);
    log(`Comprobando ${entries.length} ${label}...`);

    let checked = 0;
    for (const entry of entries) {
        if (signal.aborted) {
            break;
        }
        await checkEntry(entry, signal);
        checked += 1;
    }

    if (signal.aborted) {
        log(`Comprobación cancelada tras ${checked} de ${entries.length}.`);
    } else {
        log(`Comprobación terminada: ${checked} de ${entries.length}.`);
    }

    state.checkAbortController = null;
    setCheckingState(false);
}

function playEntry(entry) {
    if (!entry?.url) {
        log('Selecciona un canal con URL.');
        return;
    }

    const sourceUrl = els.useProxy.checked
        ? `api.php?action=proxy&url=${encodeURIComponent(entry.url)}`
        : entry.url;

    els.player.pause();
    els.player.removeAttribute('src');
    els.player.load();
    els.player.src = sourceUrl;
    els.player.play().catch(() => {
        log('El navegador no pudo iniciar el vídeo. Puede ser por HLS, CORS o porque el enlace no responde.');
    });

    if (els.useProxy.checked) {
        log(`Reproduciendo ${entry.name} mediante proxy PHP.`);
    }
}

function log(message) {
    const stamp = new Date().toLocaleTimeString();
    els.testLog.textContent = `[${stamp}] ${message}\n${els.testLog.textContent}`.slice(0, 5000);
}

function updatePreview() {
    els.preview.textContent = serializeM3u(state.entries).slice(0, 5000);
}

function buildSplitParts(size) {
    if (!size || size <= 0) {
        return null;
    }

    const parts = [];
    for (let index = 0; index < state.entries.length; index += size) {
        parts.push(serializeM3u(state.entries.slice(index, index + size)));
    }
    return parts;
}

async function saveFile() {
    applyEditor();
    const filename = els.outputName.value.trim() || 'lista_limpia.m3u';
    const splitSize = Number.parseInt(els.splitSize.value, 10) || 0;
    const payload = {
        filename,
        content: serializeM3u(state.entries),
        parts: buildSplitParts(splitSize),
    };

    const response = await fetch('api.php?action=save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!data.ok) {
        log(data.error || 'No se pudo guardar.');
        return;
    }

    log(`Guardado en files_out: ${data.files.join(', ')}.`);
}

function downloadFile() {
    applyEditor();
    const blob = new Blob([serializeM3u(state.entries)], { type: 'audio/x-mpegurl;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = els.outputName.value.trim() || 'lista_limpia.m3u';
    link.click();
    URL.revokeObjectURL(link.href);
}

document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((item) => item.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`#tab-${tab.dataset.tab}`).classList.add('active');
    });
});

els.loadServerFile.addEventListener('click', async () => {
    if (!els.serverFile.value) {
        return;
    }
    const response = await fetch(`api.php?action=load&file=${encodeURIComponent(els.serverFile.value)}`);
    const data = await response.json();
    if (data.ok) {
        loadContent(data.content, data.filename);
    } else {
        log(data.error || 'No se pudo cargar.');
    }
});

els.localFile.addEventListener('change', async () => {
    const file = els.localFile.files[0];
    if (!file) {
        els.importStatus.textContent = 'Sin archivo importado';
        return;
    }

    try {
        const content = await file.text();
        els.importStatus.textContent = file.name;
        loadContent(content, file.name);
    } catch (error) {
        els.importStatus.textContent = 'No se pudo importar';
        log(`No se pudo importar ${file.name}.`);
    }
});

els.search.addEventListener('input', render);
els.selectAll.addEventListener('change', () => {
    state.entries.forEach((entry) => {
        entry.selected = els.selectAll.checked;
    });
    render();
});
els.addEntry.addEventListener('click', addEntry);
els.removeSelected.addEventListener('click', removeSelected);
els.moveUp.addEventListener('click', () => moveSelection(-1));
els.moveDown.addEventListener('click', () => moveSelection(1));
els.sortByName.addEventListener('click', sortEntriesByName);
els.dedupe.addEventListener('click', removeDuplicates);
els.applyEdit.addEventListener('click', applyEditor);
els.copyUrl.addEventListener('click', () => navigator.clipboard?.writeText(els.urlInput.value));
els.playSelected.addEventListener('click', () => playEntry(activeEntry()));
els.checkSelected.addEventListener('click', () => checkEntries(activeEntry() ? [activeEntry()] : [], 'canal seleccionado'));
els.checkSelectedBatch.addEventListener('click', () => checkEntries(selectedEntries(), 'canales seleccionados'));
els.checkVisible.addEventListener('click', () => checkEntries(visibleEntries(), 'canales visibles'));
els.cancelCheck.addEventListener('click', () => {
    state.checkAbortController?.abort();
});
els.saveFile.addEventListener('click', saveFile);
els.downloadFile.addEventListener('click', downloadFile);
els.splitSize.addEventListener('input', updatePreview);

['input', 'change'].forEach((eventName) => {
    [els.nameInput, els.groupInput, els.urlInput, els.logoInput, els.metaInput].forEach((input) => {
        input.addEventListener(eventName, updatePreview);
    });
});

render();
