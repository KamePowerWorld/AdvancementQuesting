#!/bin/sh
# Kill java processes whose CWD matches the given run directory
RUNDIR="${1%/}"  # strip trailing slash
killed=0

if [ "$(uname)" = "Darwin" ]; then
  # macOS: /proc is unavailable; use lsof to get CWD
  for pid in $(pgrep java 2>/dev/null); do
    cwd=$(lsof -a -d cwd -p "$pid" 2>/dev/null | awk 'NR==2 {print $9}')
    if [ "${cwd%/}" = "$RUNDIR" ]; then
      kill -9 "$pid"
      echo "Killed PID $pid (cwd: $cwd)"
      killed=$((killed + 1))
    fi
  done
else
  # Linux: use /proc
  for pid in $(pgrep java 2>/dev/null); do
    cwd=$(readlink /proc/$pid/cwd 2>/dev/null)
    if [ "${cwd%/}" = "$RUNDIR" ]; then
      kill -9 "$pid"
      echo "Killed PID $pid (cwd: $cwd)"
      killed=$((killed + 1))
    fi
  done
fi

if [ "$killed" -eq 0 ]; then
  echo "No java process found in $RUNDIR" >&2
  exit 1
fi
exit 0
