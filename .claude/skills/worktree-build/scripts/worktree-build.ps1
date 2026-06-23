param(
    [Parameter(Mandatory)]
    [string]$TaskName
)

$ErrorActionPreference = 'Stop'

$projectDir = $env:CLAUDE_PROJECT_DIR
if (-not $projectDir) { $projectDir = (git rev-parse --show-toplevel) }
$projectDir = Resolve-Path $projectDir

# ---- Maven build ----
Write-Host "-> Maven build..." -ForegroundColor Cyan
Push-Location $projectDir
try {
    mvn clean package -DskipTests
    if ($LASTEXITCODE -ne 0) {
        Write-Host "!! Maven build failed." -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

# ---- Write WORKTREE_INFO.json (no copy to run/) ----
$branch = (git -C $projectDir rev-parse --abbrev-ref HEAD 2>$null)
if (-not $branch) { $branch = "unknown" }

$info = [ordered]@{
    worktreePath = $projectDir.Path
    branch       = $branch
    builtAt      = (Get-Date -Format 'o')
    taskName     = $TaskName
    verified     = $false
} | ConvertTo-Json
[System.IO.File]::WriteAllText("$projectDir\target\WORKTREE_INFO.json", $info, [System.Text.UTF8Encoding]::new($false))

Write-Host "-> Worktree build complete. Deploy via test-console." -ForegroundColor Yellow
Write-Host "   Task: $TaskName" -ForegroundColor Gray
