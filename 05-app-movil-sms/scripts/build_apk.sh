#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build_apk.sh — Construye el APK y lo copia a la carpeta APKs/ del proyecto
#
# Uso:
#   ./scripts/build_apk.sh              → release (por defecto)
#   ./scripts/build_apk.sh debug        → debug
#   ./scripts/build_apk.sh release open → abre la carpeta al terminar (macOS)
#
# Ejecutar desde la raíz del proyecto (donde está pubspec.yaml).
# Compatible con Linux, macOS y Git Bash en Windows.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail   # salir ante cualquier error, variable no definida o pipe fallida

MODE="${1:-release}"    # primer argumento o "release" por defecto
OPEN="${2:-}"           # "open" para abrir la carpeta al terminar (macOS/Linux)

# ── 1. Validar modo ───────────────────────────────────────────────────────────

if [[ "$MODE" != "release" && "$MODE" != "debug" ]]; then
    echo "❌  Modo inválido: '$MODE'. Usa 'release' o 'debug'."
    exit 1
fi

# ── 2. Detectar la raíz del proyecto ─────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [[ ! -f "$PROJECT_ROOT/pubspec.yaml" ]]; then
    echo "❌  No se encontró pubspec.yaml en: $PROJECT_ROOT"
    echo "    Ejecuta el script desde la raíz del proyecto."
    exit 1
fi

# ── 3. Leer la versión desde pubspec.yaml ─────────────────────────────────────

# Línea: "version: 1.0.0+1" → extraer "1.0.0" (sin el build number)
FULL_VERSION=$(grep "^version:" "$PROJECT_ROOT/pubspec.yaml" | head -1 | cut -d: -f2 | tr -d ' ')
SEMVER="${FULL_VERSION%%+*}"    # todo lo que está antes del "+"

# ── 4. Construir el APK ───────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Construyendo APK — modo: $MODE  |  versión: $SEMVER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$PROJECT_ROOT"
flutter build apk --"$MODE"

# ── 5. Localizar el APK generado ─────────────────────────────────────────────

SOURCE_APK="$PROJECT_ROOT/build/app/outputs/flutter-apk/app-${MODE}.apk"

if [[ ! -f "$SOURCE_APK" ]]; then
    echo "❌  No se encontró el APK en: $SOURCE_APK"
    exit 1
fi

# ── 6. Crear carpeta APKs/ y definir nombre de destino ───────────────────────

APKS_DIR="$PROJECT_ROOT/APKs"
mkdir -p "$APKS_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M")
APK_NAME="acta_electoral_v${SEMVER}_${MODE}_${TIMESTAMP}.apk"
DEST_APK="$APKS_DIR/$APK_NAME"

# ── 7. Copiar el APK ─────────────────────────────────────────────────────────

cp "$SOURCE_APK" "$DEST_APK"

# ── 8. Resumen final ─────────────────────────────────────────────────────────

# Tamaño en MB compatible con Linux y macOS
if command -v stat &>/dev/null; then
    if stat --version 2>/dev/null | grep -q GNU; then
        SIZE_BYTES=$(stat -c%s "$DEST_APK")    # Linux
    else
        SIZE_BYTES=$(stat -f%z "$DEST_APK")    # macOS
    fi
    SIZE_MB=$(echo "scale=2; $SIZE_BYTES / 1048576" | bc)
    SIZE_STR="${SIZE_MB} MB"
else
    SIZE_STR="(tamaño no disponible)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  APK generado correctamente"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Archivo : $APK_NAME"
echo "  Tamaño  : $SIZE_STR"
echo "  Ruta    : $DEST_APK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 9. Abrir carpeta si se pidió ─────────────────────────────────────────────

if [[ "$OPEN" == "open" ]]; then
    if command -v xdg-open &>/dev/null; then
        xdg-open "$APKS_DIR"    # Linux
    elif command -v open &>/dev/null; then
        open "$APKS_DIR"        # macOS
    fi
fi
