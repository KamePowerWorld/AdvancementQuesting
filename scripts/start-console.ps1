$ErrorActionPreference = 'Stop'

$projectDir = $env:CLAUDE_PROJECT_DIR
if (-not $projectDir) { $projectDir = (git rev-parse --show-toplevel) }
$projectDir = (Resolve-Path $projectDir).Path

# Always use the main worktree (run/ and mc-tests/ live there, not in worktree branches)
$mainPath = (git -C $projectDir worktree list --porcelain |
    Select-String '^worktree ' | Select-Object -First 1).Line -replace '^worktree ', ''
$projectDir = (Resolve-Path $mainPath).Path

$portOffset = [int]($env:PORT_OFFSET ?? '0')
$port = 7890 + $portOffset

$mcTestsDir = Join-Path $projectDir "mc-tests"
Write-Host "-> Starting test console on http://localhost:$port/test-console" -ForegroundColor Cyan

Push-Location $mcTestsDir
try {
    npm run dev:console
} finally {
    Pop-Location
}
