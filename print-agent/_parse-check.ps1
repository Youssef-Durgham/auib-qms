$path = Join-Path $PSScriptRoot "print-agent.ps1"
$errors = $null
$content = Get-Content -Raw $path
[void][System.Management.Automation.PSParser]::Tokenize($content, [ref]$errors)
if ($errors -and $errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Host ("L{0}: {1}" -f $_.Token.StartLine, $_.Message) }
    Write-Host "TOTAL ERRORS: $($errors.Count)"
} else {
    Write-Host "OK - script parses cleanly."
}
