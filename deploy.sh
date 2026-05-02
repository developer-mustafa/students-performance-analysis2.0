#!/bin/bash

# =================================================================
# 🚀 EdTech Automata Pro - Auto Deployment Script for VPS
# =================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}--- Starting Deployment ---${NC}"

# 1. Pull the latest code from GitHub
echo -e "${GREEN}Step 1: Pulling latest changes from Git...${NC}"
git pull origin development

# 2. Install Dependencies
echo -e "${GREEN}Step 2: Installing dependencies...${NC}"
npm install --silent

# 3. Build the Project
echo -e "${GREEN}Step 3: Building the production bundle...${NC}"
npm run build

# 4. Success Message
echo -e "${BLUE}--- Deployment Completed Successfully! ---${NC}"
echo -e "Your project is now live in the 'dist' folder."
echo -e "Make sure your Nginx/Apache points to this directory."
