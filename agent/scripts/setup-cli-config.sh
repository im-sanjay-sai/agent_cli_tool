#!/usr/bin/env bash
#
# Sets up the Quill CLI global config to point at the local agent proxy.
#
# Usage:
#   ./scripts/setup-cli-config.sh
#   ./scripts/setup-cli-config.sh --client-id YOUR_PUBLIC_KEY
#
# This creates ~/.quill/config.json so the `quill` CLI sends all requests
# to http://localhost:3000/api/quill (the agent's built-in Quill Server SDK proxy).
#

set -euo pipefail

CLIENT_ID="${1:-YOUR_QUILL_PUBLIC_KEY}"

# Strip --client-id flag if present
if [[ "$CLIENT_ID" == "--client-id" ]]; then
  CLIENT_ID="${2:-YOUR_QUILL_PUBLIC_KEY}"
fi

GLOBAL_DIR="$HOME/.quill"
GLOBAL_CONFIG="$GLOBAL_DIR/config.json"

echo "Setting up Quill CLI global config..."
echo "  Global config: $GLOBAL_CONFIG"

mkdir -p "$GLOBAL_DIR"

cat > "$GLOBAL_CONFIG" << EOF
{
  "token": "local-dev-proxy",
  "defaultEnv": "staging",
  "queryEndpoint": "http://localhost:3000/api/quill"
}
EOF

echo "  Created $GLOBAL_CONFIG"
echo ""
echo "Done! The CLI will now route all requests through http://localhost:3000/api/quill"
echo ""
echo "Make sure to also update agent/.quill/config.json with your real clientId."
echo "Current project config:"
cat "$(dirname "$0")/../.quill/config.json" 2>/dev/null || echo "  (not found)"
