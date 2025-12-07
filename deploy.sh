#!/bin/bash

# TheWhereWhat VPS Deployment Script
# Run this on your VPS after initial setup

echo "🚀 Deploying TheWhereWhat..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Stop existing process
echo -e "${YELLOW}Stopping existing process...${NC}"
pm2 stop tww 2>/dev/null || true

# Pull latest code
echo -e "${YELLOW}Pulling latest code...${NC}"
git pull origin main

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install --production

# Create uploads directory if it doesn't exist
mkdir -p public/uploads

# Restart with PM2
echo -e "${YELLOW}Starting server with PM2...${NC}"
pm2 start server.js --name tww --node-args="--max-old-space-size=512"
pm2 save

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}View logs: pm2 logs tww${NC}"
echo -e "${GREEN}Monitor: pm2 monit${NC}"

