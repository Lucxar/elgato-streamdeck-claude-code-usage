$path = Join-Path $env:APPDATA 'Elgato\StreamDeck\Plugins\com.wegastudios.claude-code-usage.sdPlugin'
Get-Item $path | Format-List FullName, LinkType, Target
Write-Host '---streamdeck process---'
Get-Process -Name 'StreamDeck' -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, StartTime
