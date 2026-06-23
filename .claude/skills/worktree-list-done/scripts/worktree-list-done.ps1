$ErrorActionPreference = 'Stop'

$projectDir = $env:CLAUDE_PROJECT_DIR
if (-not $projectDir) { $projectDir = (git rev-parse --show-toplevel) }
$projectDir = (Resolve-Path $projectDir).Path

$raw = git -C $projectDir worktree list --porcelain
$worktrees = @()
$path = $null

foreach ($line in $raw -split "`n") {
    if ($line -match '^worktree (.+)') { $path = $matches[1].Trim() }
    elseif ($line -eq '' -and $path) {
        $infoPath = Join-Path $path 'target\WORKTREE_INFO.json'
        if (Test-Path $infoPath) {
            $info = Get-Content $infoPath -Raw | ConvertFrom-Json
            if ($info.verified -eq $true) {
                $worktrees += [PSCustomObject]@{
                    path     = $path
                    branch   = $info.branch
                    taskName = $info.taskName
                    builtAt  = $info.builtAt
                }
            }
        }
        $path = $null
    }
}

if ($worktrees.Count -eq 0) {
    Write-Host "動作確認完了のworktreeはありません。" -ForegroundColor Yellow
    exit 0
}

Write-Host "動作確認完了のworktree:" -ForegroundColor Green
foreach ($wt in $worktrees) {
    Write-Host "  [$($wt.branch)] $($wt.taskName)" -ForegroundColor Cyan
    Write-Host "    path: $($wt.path)"
    Write-Host "    built: $($wt.builtAt)"
}
