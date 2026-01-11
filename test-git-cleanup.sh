#!/bin/bash
# Test script to verify git process cleanup

echo "Testing git process cleanup..."
echo ""

# Start the server in the background
echo "1. Starting server..."
npm start &
SERVER_PID=$!
echo "   Server PID: $SERVER_PID"
sleep 5

# Check initial process count
echo ""
echo "2. Checking /health endpoint..."
curl -s http://localhost:3000/health | jq .
echo ""

# Check metrics endpoint
echo "3. Checking /metrics endpoint..."
curl -s http://localhost:3000/metrics | grep "promptly_active_git_processes"
echo ""

# Count actual git zombie processes
echo "4. Checking for zombie git processes..."
ZOMBIE_COUNT=$(ps aux | grep '[g]it' | grep defunct | wc -l | tr -d ' ')
echo "   Zombie git processes: $ZOMBIE_COUNT"
echo ""

# Count all git processes
ALL_GIT_COUNT=$(ps aux | grep '[g]it' | grep -v grep | wc -l | tr -d ' ')
echo "   All git processes: $ALL_GIT_COUNT"
echo ""

# Test shutdown cleanup
echo "5. Testing shutdown cleanup (sending SIGTERM)..."
kill -TERM $SERVER_PID
sleep 3

# Check for remaining git processes
echo ""
echo "6. Checking git processes after shutdown..."
ZOMBIE_COUNT_AFTER=$(ps aux | grep '[g]it' | grep defunct | wc -l | tr -d ' ')
ALL_GIT_COUNT_AFTER=$(ps aux | grep '[g]it' | grep -v grep | wc -l | tr -d ' ')
echo "   Zombie git processes after shutdown: $ZOMBIE_COUNT_AFTER"
echo "   All git processes after shutdown: $ALL_GIT_COUNT_AFTER"
echo ""

if [ "$ZOMBIE_COUNT_AFTER" -eq 0 ]; then
    echo "✓ SUCCESS: No zombie processes after cleanup!"
else
    echo "✗ FAILED: Still have $ZOMBIE_COUNT_AFTER zombie processes"
fi
