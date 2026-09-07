#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
BUNDLE="$PWD/dist/OPC.app"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources" .local/swift-cache
xcrun swiftc native/Office.swift -o "$BUNDLE/Contents/MacOS/OPC" -framework Cocoa -framework WebKit -module-cache-path "$PWD/.local/swift-cache"
ICONSET=$(mktemp -d "${TMPDIR:-/tmp}/opc-icon.XXXXXX")
trap 'rm -rf "$ICONSET"' EXIT
mkdir -p "$ICONSET/OPC.iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" native/Assets/OPC.png --out "$ICONSET/OPC.iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" native/Assets/OPC.png --out "$ICONSET/OPC.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET/OPC.iconset" -o "$BUNDLE/Contents/Resources/OPC.icns"
echo '../..' > "$BUNDLE/Contents/Resources/project-root.txt"
cat > "$BUNDLE/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>OPC</string><key>CFBundleIdentifier</key><string>local.onepc.office</string><key>CFBundleIconFile</key><string>OPC.icns</string><key>CFBundleName</key><string>OPC</string><key>CFBundleDisplayName</key><string>OPC</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>
PLIST
BUNDLE_ID="local.onepc.office.$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0,12))' "$PWD")"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$BUNDLE/Contents/Info.plist"
codesign --force --sign - "$BUNDLE"
echo "Built: $BUNDLE"
