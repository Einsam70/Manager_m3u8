<?php
declare(strict_types=1);

$inputDir = __DIR__ . DIRECTORY_SEPARATOR . 'files_in';
$files = [];

if (is_dir($inputDir)) {
    foreach (scandir($inputDir) ?: [] as $file) {
        if ($file === '.' || $file === '..') {
            continue;
        }
        $path = $inputDir . DIRECTORY_SEPARATOR . $file;
        if (is_file($path) && preg_match('/\.(m3u8?|txt)$/i', $file)) {
            $files[] = $file;
        }
    }
}

natcasesort($files);
?>
<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Manager M3U8</title>
    <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
    <header class="topbar">
        <div>
            <h1>Manager M3U8</h1>
            <p>Editor local para limpiar, ordenar, probar y guardar listas IPTV.</p>
        </div>
        <div class="summary" aria-live="polite">
            <span id="totalCount">0 canales</span>
            <span id="selectedCount">0 seleccionados</span>
        </div>
    </header>

    <main class="workspace">
        <section class="panel panel-left" aria-label="Lista de canales">
            <div class="toolbar">
                <label class="field">
                    <span>Archivo en files_in</span>
                    <select id="serverFile">
                        <option value="">Selecciona una lista</option>
                        <?php foreach ($files as $file): ?>
                            <option value="<?= htmlspecialchars($file, ENT_QUOTES, 'UTF-8') ?>">
                                <?= htmlspecialchars($file, ENT_QUOTES, 'UTF-8') ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </label>
                <button id="loadServerFile" type="button">Cargar</button>
                <label class="file-button" for="localFile">Importar</label>
                <input id="localFile" class="file-input" type="file" accept=".m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl">
                <span id="importStatus" class="import-status">Sin archivo importado</span>
            </div>

            <div class="toolbar compact">
                <label class="field search-field">
                    <span>Buscar</span>
                    <input id="search" type="search" placeholder="Nombre, grupo o URL">
                </label>
                <button id="addEntry" type="button">Añadir</button>
                <button id="removeSelected" type="button">Eliminar</button>
            </div>

            <div class="list-head">
                <label><input id="selectAll" type="checkbox"> Todos</label>
                <button id="moveUp" type="button">Subir</button>
                <button id="moveDown" type="button">Bajar</button>
                <button id="sortByName" type="button">Ordenar A-Z</button>
                <button id="dedupe" type="button">Quitar duplicados</button>
            </div>

            <div id="channelList" class="channel-list" tabindex="0" aria-label="Canales"></div>
        </section>

        <section class="panel panel-right" aria-label="Editor">
            <div class="tabs" role="tablist">
                <button class="tab active" data-tab="edit" type="button">Editar</button>
                <button class="tab" data-tab="test" type="button">Probar</button>
                <button class="tab" data-tab="save" type="button">Guardar</button>
            </div>

            <div class="tab-panel active" id="tab-edit">
                <label class="field">
                    <span>Nombre</span>
                    <input id="nameInput" type="text" placeholder="Nombre del canal">
                </label>
                <label class="field">
                    <span>Grupo</span>
                    <input id="groupInput" type="text" placeholder="Películas, Deportes, Noticias...">
                </label>
                <label class="field">
                    <span>URL</span>
                    <input id="urlInput" type="url" placeholder="https://.../index.m3u8">
                </label>
                <label class="field">
                    <span>Logo</span>
                    <input id="logoInput" type="url" placeholder="https://.../logo.png">
                </label>
                <label class="field">
                    <span>Metadatos EXTINF</span>
                    <textarea id="metaInput" rows="5" spellcheck="false"></textarea>
                </label>
                <div class="button-row">
                    <button id="applyEdit" type="button">Aplicar cambios</button>
                    <button id="copyUrl" type="button">Copiar URL</button>
                </div>
            </div>

            <div class="tab-panel" id="tab-test">
                <div class="player-wrap">
                    <video id="player" controls playsinline></video>
                </div>
                <label class="proxy-toggle">
                    <input id="useProxy" type="checkbox">
                    Usar proxy PHP
                </label>
                <div class="button-row">
                    <button id="playSelected" type="button">Reproducir seleccionado</button>
                    <button id="checkSelected" type="button">Comprobar seleccionado</button>
                    <button id="checkSelectedBatch" type="button">Comprobar seleccionados</button>
                    <button id="checkVisible" type="button">Comprobar visibles</button>
                    <button id="cancelCheck" type="button" disabled>Cancelar comprobación</button>
                </div>
                <div id="testLog" class="log" aria-live="polite"></div>
            </div>

            <div class="tab-panel" id="tab-save">
                <label class="field">
                    <span>Nombre de salida</span>
                    <input id="outputName" type="text" value="lista_limpia.m3u">
                </label>
                <label class="field inline">
                    <span>Dividir cada</span>
                    <input id="splitSize" type="number" min="0" step="1" value="0">
                    <small>0 guarda una sola lista.</small>
                </label>
                <div class="button-row">
                    <button id="saveFile" type="button">Guardar en files_out</button>
                    <button id="downloadFile" type="button">Descargar</button>
                </div>
                <pre id="preview" class="preview"></pre>
            </div>
        </section>
    </main>

    <template id="rowTemplate">
        <article class="channel-row" draggable="true">
            <input class="row-check" type="checkbox" aria-label="Seleccionar canal">
            <button class="drag-handle" type="button" title="Arrastrar">≡</button>
            <button class="top-button" type="button" title="Mover arriba">&uarr;</button>
            <div class="row-main">
                <strong class="row-name"></strong>
                <span class="row-url"></span>
            </div>
            <span class="row-group"></span>
            <span class="row-status"></span>
        </article>
    </template>

    <script src="assets/app.js"></script>
</body>
</html>
