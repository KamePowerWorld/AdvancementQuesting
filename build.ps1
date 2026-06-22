# AdvancementQuesting build & deploy script
# Builds with Maven and copies to run/plugins/

param(
    [switch]$SkipTests,
    [string]$Worktree = ""
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

Set-Location $Root

# ---- Maven build ----
# Always run clean: stale frontend assets in target/classes/dist would be bundled into JAR
Write-Host "-> Maven build..." -ForegroundColor Cyan

$mvnArgs = @('clean', 'package', '-DskipTests')
if (-not $SkipTests) {
    $mvnArgs = @('clean', 'package')
}

mvn @mvnArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "!! Maven build failed." -ForegroundColor Red
    exit 1
}

# ---- WORKTREE_INFO.json + optional copy ----
$branch = (git -C $Root rev-parse --abbrev-ref HEAD 2>$null)
if (-not $branch) { $branch = "unknown" }

if ($Worktree) {
    # Worktree mode: skip run/ copy, just write WORKTREE_INFO.json
    $info = [ordered]@{
        worktreePath = (Resolve-Path $Worktree).Path
        branch       = $branch
        builtAt      = (Get-Date -Format 'o')
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText("$Root\target\WORKTREE_INFO.json", $info, [System.Text.UTF8Encoding]::new($false))
    Write-Host "-> Worktree build complete. Deploy via test-console." -ForegroundColor Yellow
    Write-Host "   WORKTREE_INFO.json written to target/" -ForegroundColor Gray
} else {
    # Normal mode: copy JAR to run/plugins/
    Write-Host "-> Copying to run/plugins/..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path "$Root\run\plugins" | Out-Null

    Get-ChildItem -Path "$Root\target\*.jar" -Exclude 'original-*.jar' |
    Where-Object { $_.Name -cNotMatch '-[a-z]+\.jar' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Property *, @{
        Name       = 'PluginName'
        Expression = {
            $pos = $_.Name.IndexOf('-')
            if ($pos -lt 0) { $_.BaseName } else { $_.Name.Substring(0, $pos) }
        }
    } |
    Group-Object -Property PluginName |
    ForEach-Object { $_.Group | Select-Object -First 1 } |
    ForEach-Object {
        $dest = "$Root\run\plugins\$($_.PluginName).jar"
        Copy-Item $_.FullName -Destination $dest -Force
        Write-Host "  $($_.Name) -> run\plugins\$($_.PluginName).jar" -ForegroundColor Green
    }

    # Write WORKTREE_INFO.json for base project too (shows in dropdown)
    $info = [ordered]@{
        worktreePath = $Root
        branch       = $branch
        builtAt      = (Get-Date -Format 'o')
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText("$Root\target\WORKTREE_INFO.json", $info, [System.Text.UTF8Encoding]::new($false))
}

Write-Host "-> Done!" -ForegroundColor Cyan
