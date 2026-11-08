#!/usr/bin/env bash
# Start Morrow Media in the background on port 3000 (override with PORT=xxxx).
cd "$(dirname "$0")/.."
if [ -f .server.pid ] && kill -0 "$(cat .server.pid)" 2>/dev/null; then echo "Already running (pid $(cat .server.pid))"; exit 0; fi
setsid nohup node server.js >> logs/server.log 2>&1 &
echo $! > .server.pid
sleep 1; tail -n 1 logs/server.log
