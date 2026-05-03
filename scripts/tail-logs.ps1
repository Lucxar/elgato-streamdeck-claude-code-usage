$logsDir = Join-Path $env:APPDATA 'Elgato\StreamDeck\Plugins\com.wegastudios.claude-code-usage.sdPlugin\logs'
if (-not (Test-Path $logsDir)) {
    Write-Host "no logs dir at: $logsDir"
    exit 0
}
$latest = Get-ChildItem $logsDir | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest) {
    Write-Host "logs dir empty"
    exit 0
}
Write-Host "=== $($latest.Name) ==="
Get-Content $latest.FullName -Tail 80
