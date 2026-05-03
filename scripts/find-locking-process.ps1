# Lists every process whose Path or CommandLine references the plugin folder,
# so we can kill the one holding the rename lock.
$target = 'claude-usage'
$procs = Get-CimInstance Win32_Process | Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath -like "*$target*") -or
    ($_.CommandLine -and $_.CommandLine -like "*$target*")
}
if (-not $procs) {
    Write-Host "No process found referencing '$target'"
    Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path | Format-Table -Wrap
    exit 0
}
$procs | Select-Object ProcessId, Name, ExecutablePath, CommandLine | Format-List
