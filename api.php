<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$baseDir = __DIR__;
$inputDir = $baseDir . DIRECTORY_SEPARATOR . 'files_in';
$outputDir = $baseDir . DIRECTORY_SEPARATOR . 'files_out';

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function clean_filename(string $filename): string
{
    $filename = basename(trim($filename));
    $filename = preg_replace('/[^\pL\pN._ -]+/u', '_', $filename) ?: 'lista.m3u';
    if (!preg_match('/\.(m3u8?|txt)$/i', $filename)) {
        $filename .= '.m3u';
    }
    return $filename;
}

function ensure_inside(string $base, string $path): bool
{
    $realBase = realpath($base);
    $realPath = realpath($path);
    return $realBase !== false && $realPath !== false && str_starts_with($realPath, $realBase);
}

function is_m3u8_response(string $url, string $contentType, string $body): bool
{
    $path = (string)(parse_url($url, PHP_URL_PATH) ?? '');
    return preg_match('/\.m3u8?$/i', $path)
        || str_contains(strtolower($contentType), 'mpegurl')
        || str_starts_with(ltrim($body), '#EXTM3U');
}

function fetch_remote_resource(string $url): array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_USERAGENT => 'ManagerM3U8/1.0',
            CURLOPT_HEADER => false,
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $error = curl_error($ch);
        curl_close($ch);

        return [
            'ok' => $body !== false && $code >= 200 && $code < 400,
            'body' => $body === false ? '' : (string)$body,
            'code' => $code ?: 502,
            'content_type' => $contentType,
            'error' => $error,
        ];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 25,
            'header' => "User-Agent: ManagerM3U8/1.0\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    $headers = $http_response_header ?? [];
    $code = 0;
    $contentType = '';

    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/i', $header, $match)) {
            $code = (int)$match[1];
        }
        if (stripos($header, 'Content-Type:') === 0) {
            $contentType = trim(substr($header, 13));
        }
    }

    return [
        'ok' => $body !== false && $code >= 200 && $code < 400,
        'body' => $body === false ? '' : (string)$body,
        'code' => $code ?: 502,
        'content_type' => $contentType,
        'error' => '',
    ];
}

function resolve_stream_url(string $baseUrl, string $uri): string
{
    $uri = trim($uri);
    if (preg_match('/^https?:\/\//i', $uri)) {
        return $uri;
    }
    if (str_starts_with($uri, '//')) {
        $scheme = parse_url($baseUrl, PHP_URL_SCHEME) ?: 'http';
        return $scheme . ':' . $uri;
    }

    $base = parse_url($baseUrl);
    $scheme = $base['scheme'] ?? 'http';
    $host = $base['host'] ?? '';
    $port = isset($base['port']) ? ':' . $base['port'] : '';
    $basePath = $base['path'] ?? '/';

    if (str_starts_with($uri, '/')) {
        $path = $uri;
    } else {
        $directory = preg_replace('#/[^/]*$#', '/', $basePath) ?: '/';
        $path = $directory . $uri;
    }

    $segments = [];
    foreach (explode('/', $path) as $segment) {
        if ($segment === '' || $segment === '.') {
            continue;
        }
        if ($segment === '..') {
            array_pop($segments);
            continue;
        }
        $segments[] = $segment;
    }

    return $scheme . '://' . $host . $port . '/' . implode('/', $segments);
}

function proxy_link(string $url): string
{
    return 'api.php?action=proxy&url=' . rawurlencode($url);
}

function rewrite_m3u8_playlist(string $body, string $baseUrl): string
{
    $lines = preg_split('/\r\n|\r|\n/', $body);
    $rewritten = [];

    foreach ($lines as $line) {
        $trimmed = trim($line);

        if ($trimmed === '') {
            $rewritten[] = $line;
            continue;
        }

        if (str_starts_with($trimmed, '#')) {
            $rewritten[] = preg_replace_callback('/URI="([^"]+)"/', function (array $match) use ($baseUrl): string {
                return 'URI="' . proxy_link(resolve_stream_url($baseUrl, $match[1])) . '"';
            }, $line);
            continue;
        }

        $rewritten[] = proxy_link(resolve_stream_url($baseUrl, $trimmed));
    }

    return implode("\n", $rewritten);
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

if ($action === 'proxy') {
    $url = trim((string)($_GET['url'] ?? ''));

    if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('/^https?:\/\//i', $url)) {
        header_remove('Content-Type');
        http_response_code(400);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'URL no válida para proxy.';
        exit;
    }

    $remote = fetch_remote_resource($url);
    if (!$remote['ok']) {
        header_remove('Content-Type');
        http_response_code((int)$remote['code']);
        header('Content-Type: text/plain; charset=utf-8');
        echo $remote['error'] ?: 'No se pudo cargar el recurso remoto.';
        exit;
    }

    $body = (string)$remote['body'];
    $contentType = preg_replace('/[\r\n].*/', '', (string)$remote['content_type']) ?: '';
    header_remove('Content-Type');
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: no-store');

    if (is_m3u8_response($url, $contentType, $body)) {
        header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
        echo rewrite_m3u8_playlist($body, $url);
        exit;
    }

    header('Content-Type: ' . ($contentType ?: 'application/octet-stream'));
    echo $body;
    exit;
}

if ($action === 'load') {
    $file = clean_filename((string)($_GET['file'] ?? ''));
    $path = $inputDir . DIRECTORY_SEPARATOR . $file;

    if (!is_file($path) || !ensure_inside($inputDir, $path)) {
        respond(['ok' => false, 'error' => 'No se ha encontrado el archivo en files_in.'], 404);
    }

    $content = file_get_contents($path);
    if ($content === false) {
        respond(['ok' => false, 'error' => 'No se pudo leer el archivo.'], 500);
    }

    respond(['ok' => true, 'filename' => $file, 'content' => $content]);
}

if ($action === 'save') {
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        respond(['ok' => false, 'error' => 'Datos de guardado no válidos.'], 400);
    }

    $filename = clean_filename((string)($data['filename'] ?? 'lista_limpia.m3u'));
    $content = (string)($data['content'] ?? '');
    $parts = $data['parts'] ?? null;

    if (!is_dir($outputDir) && !mkdir($outputDir, 0775, true)) {
        respond(['ok' => false, 'error' => 'No se pudo crear files_out.'], 500);
    }

    $written = [];

    if (is_array($parts) && count($parts) > 0) {
        $extension = pathinfo($filename, PATHINFO_EXTENSION);
        $baseName = pathinfo($filename, PATHINFO_FILENAME);
        foreach ($parts as $index => $partContent) {
            $partName = clean_filename(sprintf('%s_%02d.%s', $baseName, $index + 1, $extension ?: 'm3u'));
            $partPath = $outputDir . DIRECTORY_SEPARATOR . $partName;
            if (file_put_contents($partPath, (string)$partContent) === false) {
                respond(['ok' => false, 'error' => 'No se pudo guardar una de las partes.'], 500);
            }
            $written[] = $partName;
        }
    } else {
        $path = $outputDir . DIRECTORY_SEPARATOR . $filename;
        if (file_put_contents($path, $content) === false) {
            respond(['ok' => false, 'error' => 'No se pudo guardar el archivo.'], 500);
        }
        $written[] = $filename;
    }

    respond(['ok' => true, 'files' => $written]);
}

if ($action === 'check') {
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    $url = is_array($data) ? trim((string)($data['url'] ?? '')) : '';

    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        respond(['ok' => false, 'status' => 'bad-url', 'message' => 'URL no válida.'], 400);
    }

    $result = ['ok' => false, 'status' => 'unknown', 'code' => null, 'message' => 'No se pudo comprobar.'];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_NOBODY => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'ManagerM3U8/1.0',
        ]);
        curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        $result = [
            'ok' => $code >= 200 && $code < 400,
            'status' => $code > 0 ? 'http' : 'error',
            'code' => $code ?: null,
            'message' => $code > 0 ? "HTTP $code" : ($error ?: 'Sin respuesta'),
        ];
    } else {
        $headers = @get_headers($url, true);
        if (is_array($headers) && isset($headers[0]) && preg_match('/\s(\d{3})\s/', (string)$headers[0], $match)) {
            $code = (int)$match[1];
            $result = [
                'ok' => $code >= 200 && $code < 400,
                'status' => 'http',
                'code' => $code,
                'message' => "HTTP $code",
            ];
        }
    }

    respond($result);
}

respond(['ok' => false, 'error' => 'Acción no reconocida.'], 400);
