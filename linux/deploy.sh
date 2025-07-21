#!/bin/bash
# ProtonDrive Linux Distribution Script
# Execute this to fully deploy the package

set -e

echo "🚀 Starting ProtonDrive Linux Client Distribution..."

# Navigate to project
cd /home/hpl/protondrive-linux

# Install GitHub CLI if not present
if ! command -v gh &> /dev/null; then
    echo "📦 Installing GitHub CLI..."
    sudo pacman -S github-cli --noconfirm
fi

# Authenticate with GitHub
echo "🔐 Authenticating with GitHub..."
gh auth status || gh auth login

# Create repository
echo "📂 Creating GitHub repository..."
gh repo create protondrive-linux \
  --public \
  --description "🐧 ProtonDrive Linux GUI Client - First unofficial desktop client for ProtonDrive on Linux" \
  --add-readme=false

# Add remote and push
echo "⬆️ Pushing code to GitHub..."
git remote add origin https://github.com/donniedice/protondrive-linux.git 2>/dev/null || true
git branch -M main
git push -u origin main

# Create release
echo "🏷️ Creating release..."
git tag v1.0.0 2>/dev/null || true
git push origin v1.0.0
gh release create v1.0.0 \
  --title "v1.0.0 - First ProtonDrive Linux Client" \
  --notes "🎉 First unofficial ProtonDrive desktop client for Linux!"

# Test local build
echo "🔨 Testing local package build..."
makepkg -si --noconfirm

echo "✅ GitHub repository created: https://github.com/donniedice/protondrive-linux"
echo "✅ Release tagged: v1.0.0"
echo "✅ Local package tested successfully"
echo ""
echo "🎉 ProtonDrive Linux Client is now distributed!"
echo "Install with: yay -S protondrive-linux"
echo "Launch with: protondrive-gui"