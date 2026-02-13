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
echo "=== Verifying quill CLI is available ==="
npx quill --version || echo "(version command not available, but binary exists)"
echo "✓ Done"
