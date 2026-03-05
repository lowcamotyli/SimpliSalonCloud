param(
    [string]$SourceDir = ".",
    [string]$OutputDir = "do_wysylki_klientom"
)

$ErrorActionPreference = "Stop"

function Normalize-Document {
    param([string]$Text)

    $t = $Text -replace "`r`n", "`n" -replace "`r", "`n"
    $t = $t -replace "\u00A0", " "

    # Drop preview helper line if present
    $t = [regex]::Replace($t, "(?im)^\s*Podgl.*gotowego dokumentu\s*$", "")

    # Break huge inline separators into separate lines
    $t = [regex]::Replace($t, "[ \t]{8,}", "`n")

    # Ensure key sections start on new lines
    $anchors = @(
        "Czy ", "Jeśli ", "Jesli ", "If ", "Are ", "Do ", "Have ", "What ", "When ",
        "Jak ", "Proszę ", "Prosze ", "Wyrażam ", "Wyr\S*am ", "KLAUZULA ", "CEL:",
        "PODSTAWA PRAWNA", "SPRZECIW:", "Gdzie ", "Komu ", "Jakie ", "ZGODA "
    )

    foreach ($a in $anchors) {
        $pattern = "(?<!`n)" + [regex]::Escape($a)
        $t = [regex]::Replace($t, $pattern, "`n" + $a)
    }

    # Split glued answer options like TakNie / YesNo / Nie dotyczyChoroby
    $t = [regex]::Replace($t, "(?<=Tak|Nie|Yes|No|Oui|Non|Si|Ja|Nein|Да|Нет|Так|Ні)(?=Tak|Nie|Yes|No|Oui|Non|Si|Ja|Nein|Да|Нет|Так|Ні)", "`n")
    $t = [regex]::Replace($t, "(?<=[\p{Ll}\)])(?=[\p{Lu}][\p{Ll}])", "`n")

    # Make legal section visually distinct
    $t = [regex]::Replace($t, "\n*KLAUZULA INFORMACYJNA", "`n`n## Klauzula informacyjna RODO`n`nKLAUZULA INFORMACYJNA")

    # Cleanup spacing
    $t = [regex]::Replace($t, "[ \t]+$", "", "Multiline")
    $t = [regex]::Replace($t, "\n{3,}", "`n`n")
    $t = $t.Trim() + "`n"

    return $t
}

$src = Resolve-Path $SourceDir
$outPath = Join-Path $src $OutputDir
New-Item -ItemType Directory -Force -Path $outPath | Out-Null

$files = Get-ChildItem -Path $src -Filter *.md -File
foreach ($file in $files) {
    $raw = Get-Content -Path $file.FullName -Raw -Encoding UTF8
    $formatted = Normalize-Document -Text $raw
    $target = Join-Path $outPath $file.Name
    Set-Content -Path $target -Value $formatted -Encoding UTF8
}

"Formatted $($files.Count) files into: $outPath"
