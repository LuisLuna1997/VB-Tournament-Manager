#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_NAME="VB Tournament"
APP_DIR="$PROJECT_DIR/$APP_NAME.app"

echo "Building Vite app..."
cd "$PROJECT_DIR"
npm run build

echo "Creating macOS .app bundle..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources/app"

# Copy built files
cp -r "$PROJECT_DIR/dist/"* "$APP_DIR/Contents/Resources/app/"

# Create Info.plist
cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>VB Tournament</string>
    <key>CFBundleDisplayName</key>
    <string>VB Tournament Manager</string>
    <key>CFBundleIdentifier</key>
    <string>com.vb.tournament</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleExecutable</key>
    <string>launch</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
</dict>
</plist>
PLIST

# Create launcher script
cat > "$APP_DIR/Contents/MacOS/launch" << 'LAUNCHER'
#!/bin/bash

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$APP_DIR/Resources/app"
PID_FILE="$APP_DIR/.server.pid"
PORT_FILE="$APP_DIR/.server.port"

# Kill any previous server
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  kill "$OLD_PID" 2>/dev/null
  rm -f "$PID_FILE" "$PORT_FILE"
fi

# Find a free port
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")

# Start HTTP server (detached, survives launcher exit)
cd "$WEB_DIR"
nohup python3 -m http.server "$PORT" --bind 127.0.0.1 &>/dev/null &
echo $! > "$PID_FILE"
echo "$PORT" > "$PORT_FILE"

# Wait briefly for server to start
sleep 0.3

# Open in default browser
open "http://127.0.0.1:$PORT"

# Exit immediately so macOS doesn't think the app is hung
LAUNCHER

chmod +x "$APP_DIR/Contents/MacOS/launch"
xattr -cr "$APP_DIR" 2>/dev/null

# Create zip for easy sharing (preserves permissions)
ZIP_FILE="$PROJECT_DIR/$APP_NAME.zip"
rm -f "$ZIP_FILE"
cd "$PROJECT_DIR"
zip -r -q "$ZIP_FILE" "$APP_NAME.app"

echo ""
echo "Done!"
echo "  App:  $APP_DIR ($(du -sh "$APP_DIR" | cut -f1))"
echo "  Zip:  $ZIP_FILE ($(du -sh "$ZIP_FILE" | cut -f1))"
echo ""
echo "AirDrop the .zip file. On the other Mac: unzip, then double-click the .app"
