# skill:targeted-file-read

## Purpose
Read one or more known files (> 50 lines) and return a compact summary to Claude.
This is the "dad-as-reader" pattern — Claude cannot read large files directly, dad reads and summarizes.

## Use When
- File is > 50 lines and Claude needs to understand its content
- You know exactly WHICH file(s) to read (paths already known)
- Needed before writing a prompt for implementation (to verify current state)
- Needed to answer "what does this file do / what's the current shape of X?"

## Do Not Use When
- File is ≤ 50 lines — Claude reads it directly with Read tool
- Paths are unknown and tracing is required — use `skill:large-context-analysis`
- Reading arch docs — use dad directly without line limit (exceptions are critical)

## Required Inputs
- Exact file path(s) — `/mnt/d/SimpliSalonCLoud/...` format
- Specific question or aspect to focus on (not "read everything")

## Procedure
1. Read the file(s) in full
2. Extract only what's relevant to the question
3. Format as bulleted list (no prose paragraphs)
4. Hard cap: 20 lines per file — prune ruthlessly
5. Flag any security-sensitive findings (missing auth, missing salon_id filter)

## Expected Outputs
- Bulleted summary focused on the asked question
- Key exports / function signatures if relevant
- Any obvious issues noticed (missing guards, wrong types)

## Validation
N/A — read-only. No code changes.

## Bash Template (dad-as-reader)

```bash
# 1 plik:
DAD_PROMPT="Read .workflow/skills/targeted-file-read.md and follow it. Read /mnt/d/SimpliSalonCLoud/[plik]. TASK: [pytanie]. FORMAT: Bulleted list. LIMIT: 20 lines." bash ~/.claude/scripts/dad-exec.sh

# 2–3 pliki:
DAD_PROMPT="Read .workflow/skills/targeted-file-read.md and follow it. Read /mnt/d/SimpliSalonCLoud/[p1] and [p2]. TASK: [pytanie]. FORMAT: Bullets. LIMIT: 20 lines/file." bash ~/.claude/scripts/dad-exec.sh
```

## Safety Constraints
- Output only — no code changes, no "quick fixes while I'm here"
- If auth or salon_id issues are found: flag in output, do not fix silently
