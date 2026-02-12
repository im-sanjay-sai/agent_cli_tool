#!/usr/bin/env bash
#
# Sets up the Quill CLI config for the agent.
#
# Creates:
#   ~/.quill/config.json          (global CLI auth + endpoint)
#   agent/.quill/config.json      (project clientId + endpoint)
#
# Usage:
#   ./scripts/setup-cli-config.sh
#   ./scripts/setup-cli-config.sh --client-id YOUR_PUBLIC_KEY
#
# Or set QUILL_CLIENT_ID env var (used by Render/CI):
#   QUILL_CLIENT_ID=abc123 ./scripts/setup-cli-config.sh
#

set -euo pipefail

# Resolve clientId: env var > CLI arg > default
CLIENT_ID="${QUILL_CLIENT_ID:-}"

if [[ -z "$CLIENT_ID" ]]; then
  CLIENT_ID="${1:-}"
  if [[ "$CLIENT_ID" == "--client-id" ]]; then
    CLIENT_ID="${2:-}"
  fi
fi

if [[ -z "$CLIENT_ID" ]]; then
  CLIENT_ID="YOUR_QUILL_PUBLIC_KEY"
  echo "Warning: No clientId provided. Using placeholder."
  echo "  Set QUILL_CLIENT_ID env var or pass --client-id <id>"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$(dirname "$SCRIPT_DIR")"

# Detect port: Render sets PORT env var (usually 10000), default to 3000 for local dev
APP_PORT="${PORT:-3000}"
QUERY_ENDPOINT="http://localhost:${APP_PORT}/api/quill"

# 1. Global config (~/.quill/config.json)
GLOBAL_DIR="$HOME/.quill"
GLOBAL_CONFIG="$GLOBAL_DIR/config.json"

echo "Setting up Quill CLI config..."
echo "  Using endpoint: $QUERY_ENDPOINT"
mkdir -p "$GLOBAL_DIR"

cat > "$GLOBAL_CONFIG" << EOF
{
  "token": "local-dev-proxy",
  "defaultEnv": "staging",
  "queryEndpoint": "$QUERY_ENDPOINT"
}
EOF

echo "  Created $GLOBAL_CONFIG"

# 2. Project config (agent/.quill/config.json)
PROJECT_DIR="$AGENT_DIR/.quill"
PROJECT_CONFIG="$PROJECT_DIR/config.json"

mkdir -p "$PROJECT_DIR"

cat > "$PROJECT_CONFIG" << EOF
{
  "clientId": "$CLIENT_ID",
  "queryEndpoint": "$QUERY_ENDPOINT",
  "currentEnv": "staging"
}
EOF

echo "  Created $PROJECT_CONFIG (clientId: $CLIENT_ID)"
echo ""
echo "Done! CLI will route requests through $QUERY_ENDPOINT"
