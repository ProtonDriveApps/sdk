#!/bin/bash
# AUR Submission Script for ProtonDrive Linux

set -e

echo "📦 Submitting to AUR..."

# Navigate to home
cd /home/hpl

# Clone AUR repo
if [ ! -d "protondrive-linux-aur" ]; then
    git clone ssh://aur@aur.archlinux.org/protondrive-linux.git protondrive-linux-aur
fi

cd protondrive-linux-aur

# Copy package files
cp /home/hpl/protondrive-linux/PKGBUILD .
cp /home/hpl/protondrive-linux/.SRCINFO .

# Update SRCINFO
makepkg --printsrcinfo > .SRCINFO

# Submit to AUR
git add PKGBUILD .SRCINFO
git commit -m "Initial commit: ProtonDrive Linux GUI Client v1.0.0

First unofficial desktop client for ProtonDrive on Linux.
Built with Python/Tkinter and rclone backend."

git push origin master

echo "✅ Submitted to AUR as 'protondrive-linux'"
echo "Install with: yay -S protondrive-linux"