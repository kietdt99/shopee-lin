$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$localWorkspace = Join-Path $projectRoot 'supabase\local'

if (-not (Test-Path -LiteralPath (Join-Path $localWorkspace 'supabase\config.toml'))) {
  Write-Host 'Local Supabase has not been initialized.'
  exit 0
}

& pnpm exec supabase stop --workdir $localWorkspace
if ($LASTEXITCODE -ne 0) {
  throw 'Could not stop the local Supabase stack.'
}
