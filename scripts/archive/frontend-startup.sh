#!/bin/bash
export VITE_API_BASE_URL=http://localhost:3001/api
export NODE_ENV=development
npm run dev > frontend.log 2>&1 &
echo $! > frontend.pid
