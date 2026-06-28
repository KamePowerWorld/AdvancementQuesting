$ErrorActionPreference = 'Stop'

$wtPath = $env:CLAUDE_PROJECT_DIR
if (-not $wtPath) { $wtPath = (git rev-parse --show-toplevel) }
$wtPath = (Resolve-Path $wtPath).Path

# Find the base (main) worktree
$mainPath = (git -C $wtPath worktree list --porcelain |
    Select-String '^worktree ' | Select-Object -First 1).Line -replace '^worktree ', ''
$mainPath = (Resolve-Path $mainPath).Path

$isWorktree = ($wtPath -ne $mainPath)

if ($isWorktree) {
    # Symlink web/public (atlas images are gitignored) — idempotent
    $publicTarget = Join-Path $mainPath "web/public"
    $publicLink   = Join-Path $wtPath   "web/public"
    if (Test-Path $publicLink -PathType Container) {
        $item = Get-Item $publicLink -Force
        if ($item.LinkType -eq 'SymbolicLink') {
            Write-Host "-> web/public symlink already exists, skipping." -ForegroundColor Gray
        } else {
            Write-Host "!! web/public は通常ディレクトリとして存在します。手動で確認してください。" -ForegroundColor Red
            exit 1
        }
    } else {
        New-Item -ItemType SymbolicLink -Path $publicLink -Target $publicTarget | Out-Null
        Write-Host "-> web/public symlink created." -ForegroundColor Cyan
    }
} else {
    Write-Host "-> Main repo: skipping symlink setup." -ForegroundColor Gray
}

# npm install — idempotent (skip if node_modules exists and package-lock.json unchanged)
$webPath = Join-Path $wtPath "web"
$nm      = Join-Path $webPath "node_modules"
$lock    = Join-Path $webPath "package-lock.json"
if ((Test-Path $nm) -and (Test-Path $lock)) {
    Write-Host "-> node_modules already exists, skipping npm install." -ForegroundColor Gray
} else {
    Push-Location $webPath
    try { npm install } finally { Pop-Location }
    Write-Host "-> npm install done." -ForegroundColor Cyan
}

Write-Host ""
$label = if ($isWorktree) { "Worktree" } else { "Main repo" }
Write-Host "Setup complete ($label): $wtPath" -ForegroundColor Green
