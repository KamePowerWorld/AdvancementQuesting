# AdvancementQuesting ビルド & デプロイスクリプト
# Maven でビルドして run/plugins/ にコピーする

param(
    [switch]$SkipTests  # -SkipTests でテストをスキップ
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

Set-Location $Root

# ---- Maven ビルド ----
# clean を必ず付ける: target/classes/dist に古いフロントエンドアセットが
# 残ると JAR に蓄積し、誤ったバンドルを配信する恐れがあるため
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

# ---- コピー ----
Write-Host "-> Copying to run/plugins/..." -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path (Join-Path $Root 'run' 'plugins') | Out-Null

Get-ChildItem -Path (Join-Path $Root 'target' '*.jar') -Exclude 'original-*.jar' |
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
    $dest = Join-Path $Root 'run' 'plugins' "$($_.PluginName).jar"
    Copy-Item $_.FullName -Destination $dest -Force
    Write-Host "  $($_.Name) -> run/plugins/$($_.PluginName).jar" -ForegroundColor Green
}

Write-Host "-> Done!" -ForegroundColor Cyan
