$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$failures = @()
$files = @(Get-ChildItem -LiteralPath $root -Filter '*.md' -File)
$phases = @($files | Where-Object Name -Like 'phase-*.md')
if ($phases.Count -ne 10) { $failures += 'Expected 10 phase files' }
foreach ($file in $files) {
  $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  if ($text -match '(?m)^\s*(?:- \[[ x]\] )?(?:_TBD_|Requirement A\s*$|Task A\s*$|_Describe what)') { $failures += "Template remains: $($file.Name)" }
  foreach ($match in [regex]::Matches($text, '\]\(([^)]+)\)')) {
    $target = $match.Groups[1].Value.Trim('<','>').Split('#')[0]
    if (-not $target -or $target -match '^[a-z]+://') { continue }
    if (-not (Test-Path -LiteralPath (Join-Path $file.DirectoryName $target))) {
      $failures += "Broken link: $($file.Name): $target"
    }
  }
}
$ids = @()
foreach ($phase in $phases) {
  $text = Get-Content -LiteralPath $phase.FullName -Raw -Encoding UTF8
  if ($text -notmatch '(?m)^status: todo\s*$') { $failures += "Unexpected phase status: $($phase.Name)" }
  $number = [int]([regex]::Match($phase.Name, 'phase-(\d+)').Groups[1].Value)
  if ($number -eq 9) {
    if ($text -notmatch 'Audio removed by user decision' -or $text -match '(?m)^- \[ \]') { $failures += 'Removed P09 must contain no executable tasks' }
    continue
  }
  $prefix = 'P{0:00}-' -f $number
  $matches = [regex]::Matches($text, '(?m)^- \[ \] (?:\*\*)?(P\d{2}-\d+)\b')
  if ($matches.Count -lt 4) { $failures += "Insufficient identified tasks: $($phase.Name)" }
  foreach ($match in $matches) {
    $id = $match.Groups[1].Value
    if (-not $id.StartsWith($prefix)) { $failures += "Wrong phase ID: $id" }
    if ($ids -contains $id) { $failures += "Duplicate task ID: $id" }
    $ids += $id
  }
}
if ($failures.Count) { $failures | ForEach-Object { Write-Output "FAIL: $_" }; exit 1 }
Write-Output "PASS: $($phases.Count) phases; $($ids.Count) unique pending task IDs; Markdown links resolve; no template placeholders."
Write-Output 'Scope: document structure only, not application behavior or business approval.'
