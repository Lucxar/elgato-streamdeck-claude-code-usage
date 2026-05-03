$root = 'C:\Dev\smallStuff\ElgatoTokenPlugin'
Get-ChildItem -Recurse $root -ErrorAction SilentlyContinue |
  Where-Object {
    -not $_.PSIsContainer -and
    $_.FullName -notmatch '\\node_modules\\' -and
    $_.FullName -notmatch '\\\.sdPlugin\\bin\\' -and
    $_.FullName -notmatch '\\\.git\\'
  } |
  ForEach-Object { $_.FullName.Replace("$root\", '') } |
  Sort-Object
