# check-encoding.ps1
# Detects Polish mojibake (UTF-8 bytes misread as Windows-1252) in TS/TSX source files.
# Patterns are built with [char] constructors to avoid encoding issues in the script itself.
# Exit 0 = clean, Exit 1 = mojibake found.
#
# Usage:
#   powershell ./scripts/check-encoding.ps1
#   pwsh ./scripts/check-encoding.ps1
#
# False-positive exclusions:
#   lib/booksy/processor.ts  -- intentional .replace() patterns for email normalization

param(
    [string]$Root = (Split-Path $PSScriptRoot -Parent)
)

# Two-char sequences that are unambiguously Polish mojibake.
# Each Polish UTF-8 char (C4/C5/C3 + byte) appears as two Windows-1252 glyphs when misread.
# Built with [char] to avoid encoding issues in this script file.
$mojibakePatterns = @(
    ([char]0x00C4 + [char]0x2122),  # A+tm  = e-ogonek (e with tail)
    ([char]0x00C4 + [char]0x2026),  # A+...  = a-ogonek (a with tail)
    ([char]0x00C4 + [char]0x2021),  # A+ddag = c-acute
    ([char]0x00C5 + [char]0x201A),  # A~+sq  = l-stroke
    ([char]0x00C5 + [char]0x201E),  # A~+dq  = n-acute
    ([char]0x00C5 + [char]0x203A),  # A~+>   = s-acute
    ([char]0x00C5 + [char]0x00BA),  # A~+ord = z-acute
    ([char]0x00C5 + [char]0x00BC),  # A~+1/4 = z-dot
    ([char]0x00C3 + [char]0x00B3)   # A~+3   = o-acute
)

# Files that intentionally contain mojibake pattern strings (normalization / replacement code)
$excludedRelPaths = @(
    "lib/booksy/processor.ts"
)

$files = Get-ChildItem -Path $Root -Recurse -Include "*.ts", "*.tsx" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "\\node_modules\\|\\\.next\\|\\.git\\" }

$issues = [System.Collections.Generic.List[object]]::new()

foreach ($file in $files) {
    $relPath = $file.FullName.Substring($Root.Length).TrimStart('\').Replace('\', '/')

    if ($excludedRelPaths -contains $relPath) {
        continue
    }

    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    if (-not $content) { continue }

    $lines = $content -split "`n"
    for ($i = 0; $i -lt $lines.Count; $i++) {
        foreach ($pattern in $mojibakePatterns) {
            if ($lines[$i].Contains($pattern)) {
                $snippet = $lines[$i].Trim()
                if ($snippet.Length -gt 80) { $snippet = $snippet.Substring(0, 80) + '...' }
                $issues.Add([PSCustomObject]@{
                    File    = $relPath
                    Line    = $i + 1
                    Pattern = $pattern
                    Text    = $snippet
                })
            }
        }
    }
}

if ($issues.Count -gt 0) {
    Write-Host "FAIL: Polish mojibake detected in $($issues.Count) location(s):" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "  $($issue.File):$($issue.Line)  pattern=[$($issue.Pattern)]" -ForegroundColor Yellow
        Write-Host "    $($issue.Text)" -ForegroundColor Gray
    }
    exit 1
}

Write-Host "OK: No Polish mojibake detected in TS/TSX source files." -ForegroundColor Green
exit 0
