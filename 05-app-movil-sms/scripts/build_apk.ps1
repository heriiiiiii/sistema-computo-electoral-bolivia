# ─────────────────────────────────────────────────────────────────────────────
# build_apk.ps1 — Construye el APK y lo copia a la carpeta APKs/ del proyecto
#
# Uso:
#   .\scripts\build_apk.ps1               → release (por defecto)
#   .\scripts\build_apk.ps1 -Mode debug   → debug
#   .\scripts\build_apk.ps1 -Mode release -Open → abre la carpeta al terminar
#
# Ejecutar desde la raíz del proyecto (donde está pubspec.yaml).
# ─────────────────────────────────────────────────────────────────────────────

param (
    [ValidateSet("release", "debug")]
    [string]$Mode = "release",

    [switch]$Open   # Si se pasa -Open, abre la carpeta APKs/ al terminar
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── 1. Leer versión desde pubspec.yaml ───────────────────────────────────────

$pubspecPath = Join-Path $PSScriptRoot "..\pubspec.yaml"
if (-not (Test-Path $pubspecPath)) {
    Write-Error "No se encontró pubspec.yaml. Ejecuta el script desde la raíz del proyecto."
    exit 1
}

$versionLine = Select-String -Path $pubspecPath -Pattern "^version:" | Select-Object -First 1
if (-not $versionLine) {
    Write-Error "No se encontró la línea 'version:' en pubspec.yaml."
    exit 1
}

# "version: 1.0.0+1" → "1.0.0"
$fullVersion = $versionLine.Line.Split(":")[1].Trim()
$semver = $fullVersion.Split("+")[0]   # solo el nombre, sin el build number

# ── 2. Construir el APK ───────────────────────────────────────────────────────

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  Construyendo APK — modo: $Mode  |  versión: $semver" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$flutterArgs = @("build", "apk", "--$Mode")
& flutter @flutterArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Error "flutter build falló con código $LASTEXITCODE. Revisa los errores anteriores."
    exit $LASTEXITCODE
}

# ── 3. Localizar el APK generado ─────────────────────────────────────────────

$projectRoot  = Split-Path $PSScriptRoot -Parent
$sourceApk    = Join-Path $projectRoot "build\app\outputs\flutter-apk\app-$Mode.apk"

if (-not (Test-Path $sourceApk)) {
    Write-Error "No se encontró el APK en: $sourceApk"
    exit 1
}

# ── 4. Crear carpeta APKs/ y definir nombre de destino ───────────────────────

$apksDir = Join-Path $projectRoot "APKs"
New-Item -ItemType Directory -Force -Path $apksDir | Out-Null

# Nombre con versión + modo + timestamp para no sobreescribir builds anteriores
$timestamp  = Get-Date -Format "yyyyMMdd_HHmm"
$apkName    = "acta_electoral_v${semver}_${Mode}_${timestamp}.apk"
$destApk    = Join-Path $apksDir $apkName

# ── 5. Copiar el APK ─────────────────────────────────────────────────────────

Copy-Item -Path $sourceApk -Destination $destApk -Force

# ── 6. Resumen final ─────────────────────────────────────────────────────────

$sizeMB = [math]::Round((Get-Item $destApk).Length / 1MB, 2)

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  ✅  APK generado correctamente" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  Archivo : $apkName" -ForegroundColor White
Write-Host "  Tamaño  : ${sizeMB} MB" -ForegroundColor White
Write-Host "  Ruta    : $destApk" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""

# ── 7. Abrir carpeta en el Explorador si se pidió ────────────────────────────

if ($Open) {
    Start-Process "explorer.exe" -ArgumentList $apksDir
}
