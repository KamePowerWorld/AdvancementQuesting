#!/usr/bin/env pwsh
# Non-interactive `git rebase -i`.
#
# `git rebase -i` normally opens two editors: the todo list, and a commit-message
# editor for every `reword` / `squash`. This drives both from files via a shim
# editor (rebase-editor.ps1), so it runs where no interactive editor exists.
#
# Usage:
#   git-rebase-plan.ps1 -Base <ref> -Todo <todo-file> [-Messages <messages-file>]
#
#   -Base       ref to rebase onto (e.g. main, origin/main, HEAD~9)
#   -Todo       replaces the todo list verbatim. One action per line:
#                   pick / fixup / squash / reword / drop  <sha> subject
#               Order = final order. `fixup` discards its message; `squash` and
#               `reword` pull a message from -Messages.
#   -Messages   optional. Commit messages in the order git asks (top-to-bottom:
#               each reword, then each squash group), separated by a lone `====`.
#
# Tip: seed the todo with
#   git log --reverse --format='pick %h %s' <base>..HEAD > tmp/todo.txt
param(
    [Parameter(Mandatory)][string]$Base,
    [Parameter(Mandatory)][string]$Todo,
    [string]$Messages
)
$ErrorActionPreference = 'Stop'

$editor = Join-Path $PSScriptRoot 'rebase-editor.ps1'
$editorCmd = "pwsh -NoProfile -File `"$editor`""

$env:GIT_SEQUENCE_EDITOR = $editorCmd
$env:GIT_EDITOR          = $editorCmd
$env:AQ_REBASE_TODO      = (Resolve-Path -LiteralPath $Todo).Path

$state = $null
if ($Messages) {
    $env:AQ_REBASE_MSGS = (Resolve-Path -LiteralPath $Messages).Path
    $state = [System.IO.Path]::GetTempFileName()
    Set-Content -LiteralPath $state -Value '0' -NoNewline
    $env:AQ_REBASE_STATE = $state
} else {
    Remove-Item Env:AQ_REBASE_MSGS  -ErrorAction SilentlyContinue
    Remove-Item Env:AQ_REBASE_STATE -ErrorAction SilentlyContinue
}

try {
    git rebase -i $Base
    if ($LASTEXITCODE -ne 0) { throw "git rebase exited with code $LASTEXITCODE" }
}
finally {
    if ($state -and (Test-Path -LiteralPath $state)) { Remove-Item -LiteralPath $state -Force }
    foreach ($v in 'GIT_SEQUENCE_EDITOR', 'GIT_EDITOR', 'AQ_REBASE_TODO', 'AQ_REBASE_MSGS', 'AQ_REBASE_STATE') {
        Remove-Item "Env:$v" -ErrorAction SilentlyContinue
    }
}
