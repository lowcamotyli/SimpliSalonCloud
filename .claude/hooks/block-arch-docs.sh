#!/bin/bash
# Blocks direct Read of docs/architecture — use Gemini summarization instead.
input=$(cat)
file_path=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null || echo "")

if echo "$file_path" | grep -qi "docs/architecture"; then
  echo "BLOCKED: Nie czytaj docs/architecture bezpośrednio — użyj Gemini do streszczenia."
  echo ""
  echo "Użyj:"
  echo "  gemini -p \"Read $file_path. Summarize: constraints relevant to the current task. Max 20 lines. No explanations.\" --output-format text 2>/dev/null | grep -v \"^Loaded\""
  exit 2
fi

exit 0
