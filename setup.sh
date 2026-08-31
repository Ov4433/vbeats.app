#!/bin/bash

# VbeatS Expo Setup Script
# This script installs all dependencies and initializes the Expo project

set -e

echo "🚀 VbeatS Expo Setup Started..."
echo ""

# Step 1: Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

echo "✅ Dependencies installed successfully!"
echo ""

# Step 2: Create .env file from template
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please update .env with your actual values:"
    echo "   - STRIPE_SECRET_KEY"
    echo "   - Smart contract addresses"
    echo "   - Blockchain RPC URLs"
    echo ""
else
    echo "✅ .env file already exists, skipping..."
fi

# Step 3: Initialize EAS (if not already done)
echo ""
echo "🔗 Initializing EAS (Expo Application Services)..."
echo "Please follow the prompts to link your Expo account."
echo ""

# Check if eas.json exists
if grep -q "YOUR_EAS_PROJECT_ID" eas.json; then
    echo "⚠️  eas.json contains placeholder project ID."
    echo "Run: expo eas:init"
    echo "Then update app.json with your actual EAS Project ID"
    echo ""
fi

echo "✅ Setup complete!"
echo ""
echo "🎮 Quick Start Commands:"
echo "   npm start         - Start Expo development server"
echo "   npm run ios       - Run on iOS simulator"
echo "   npm run android   - Run on Android emulator"
echo "   npm run web       - Run on web browser"
echo ""
echo "📱 Build for Production:"
echo "   npm run eas:build:dev      - Build development version"
echo "   npm run eas:build:preview  - Build preview version"
echo "   npm run eas:build:prod     - Build production version"
echo ""
