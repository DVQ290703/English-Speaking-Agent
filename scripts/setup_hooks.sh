#!/bin/bash
# Install git pre-push hook for AI log submission
set -e

HOOK_FILE=".git/hooks/pre-push"

cat > "$HOOK_FILE" << 'EOF'
#!/bin/bash
# Submit AI logs to grading server before push
if [ -x ".venv/Scripts/python.exe" ]; then
	".venv/Scripts/python.exe" scripts/submit_log.py || true
elif [ -x ".venv/bin/python" ]; then
	".venv/bin/python" scripts/submit_log.py || true
elif command -v py >/dev/null 2>&1; then
	py -3 scripts/submit_log.py || true
elif command -v python3 >/dev/null 2>&1; then
	python3 scripts/submit_log.py || true
elif command -v python >/dev/null 2>&1; then
	python scripts/submit_log.py || true
else
	echo "[ai-log] Python not found. Skipping log submission." >&2
fi
exit 0  # Never block push
EOF

chmod +x "$HOOK_FILE"
echo "[ai-log] Git pre-push hook installed."

# Create .ai-log directory if not exists
mkdir -p .ai-log
touch .ai-log/.gitkeep

echo "[ai-log] Setup complete. Configure AI_LOG_SERVER in your .env file."
