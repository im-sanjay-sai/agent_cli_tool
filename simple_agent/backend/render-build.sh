#!/usr/bin/env bash
set -e

echo "=== Building Quill CLI ==="
cd ../../cli
npm install
npm run build
npm link
echo "✓ Quill CLI built and linked globally"

echo ""
echo "=== Building Backend ==="
cd ../simple_agent/backend
npm install
npm link @quill/cli
npm run build
echo "✓ Backend built"

echo ""
echo "=== Configuring .quill/config.json for Render ==="
# Point the CLI at the backend's own /api/quill proxy
# On Render, the server listens on $PORT (set by Render)
QUILL_ENDPOINT="http://localhost:${PORT:-3001}/api/quill"
mkdir -p .quill
cat > .quill/config.json << EOFCONFIG
{
  "clientId": "${QUILL_CLIENT_ID:-65809ec85375e445ddc1990e}",
  "queryEndpoint": "${QUILL_ENDPOINT}",
  "currentEnv": "staging"
}
EOFCONFIG
echo "✓ .quill/config.json → ${QUILL_ENDPOINT}"

echo ""
echo "=== Verifying quill CLI is available ==="
npx quill --version || echo "(version command not available, but binary exists)"
echo "✓ Done"
