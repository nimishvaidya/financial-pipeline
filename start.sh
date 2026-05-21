#!/bin/bash
# ============================================
# Financial Pipeline — Start Script
# ============================================
# Starts backend, frontend, and Telegram bot.
# Usage: ./start.sh
# To stop: press Ctrl+C
# ============================================

cd "$(dirname "$0")"

echo "Starting Financial Pipeline..."
echo ""

# Start backend in background
echo "[1/3] Starting backend (API on port 8000)..."
cd backend
uv run uvicorn pipeline.api:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to boot
sleep 2

# Start frontend in background
echo "[2/3] Starting frontend (Dashboard on port 5173)..."
cd frontend
pnpm dev &
FRONTEND_PID=$!
cd ..

# Start Telegram bot in background
echo "[3/3] Starting Telegram bot..."
cd backend
uv run python -m pipeline.telegram_bot &
BOT_PID=$!
cd ..

echo ""
echo "✓ Backend running  → http://localhost:8000"
echo "✓ Frontend running → http://localhost:5173"
echo "✓ Telegram bot running"
echo ""
echo "Press Ctrl+C to stop all."

# When Ctrl+C is pressed, kill all processes
trap "echo ''; echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID $BOT_PID 2>/dev/null; exit 0" INT

# Wait for all processes
wait
