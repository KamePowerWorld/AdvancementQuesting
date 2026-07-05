#!/usr/bin/env pwsh
# Editor shim for git rebase, used as both GIT_SEQUENCE_EDITOR and GIT_EDITOR.
# git invokes it as: pwsh -File rebase-editor.ps1 <file-git-wants-edited>
# It dispatches on the file name:
#   git-rebase-todo  -> overwrite the todo list with the plan ($env:AQ_REBASE_TODO)
#   anything else    -> a commit message (reword/squash); write the next block
#                       from $env:AQ_REBASE_MSGS, tracked via $env:AQ_REBASE_STATE.
param([Parameter(Mandatory)][string]$Target)
$ErrorActionPreference = 'Stop'

if ((Split-Path -Leaf $Target) -eq 'git-rebase-todo') {
    if ($env:AQ_REBASE_TODO) {
        Copy-Item -LiteralPath $env:AQ_REBASE_TODO -Destination $Target -Force
    }
    exit 0
}

# Commit-message edit (reword / squash). With no messages file, accept git's default.
if (-not $env:AQ_REBASE_MSGS) { exit 0 }

$i = 0
if ($env:AQ_REBASE_STATE -and (Test-Path -LiteralPath $env:AQ_REBASE_STATE)) {
    $i = [int]((Get-Content -LiteralPath $env:AQ_REBASE_STATE -Raw).Trim())
}

$content = Get-Content -LiteralPath $env:AQ_REBASE_MSGS -Raw
# Split on a line that is exactly "===="
$blocks = [regex]::Split($content, "(?m)^====\r?$")
if ($i -lt $blocks.Count) {
    Set-Content -LiteralPath $Target -Value ($blocks[$i].Trim("`r", "`n")) -NoNewline
}
if ($env:AQ_REBASE_STATE) {
    Set-Content -LiteralPath $env:AQ_REBASE_STATE -Value ([string]($i + 1)) -NoNewline
}
exit 0
