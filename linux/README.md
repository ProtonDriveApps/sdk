# ProtonDrive Linux Client

This directory contains a community-contributed Linux desktop client for ProtonDrive while official Linux support is in development.

## Overview

This client provides Linux users with a native GUI interface to access ProtonDrive, filling the gap until official support arrives.

## Features

- 🖥️ **Native GUI** - Built with Python/Tkinter for lightweight performance
- 🔒 **Secure Backend** - Uses proven rclone for ProtonDrive communication
- 📁 **Full Functionality** - Sync, browse, and mount capabilities
- 🐧 **Desktop Integration** - Proper .desktop file and system tray support
- 📦 **Easy Installation** - Available via AUR, Flatpak, AppImage, and more

## Installation

### Arch Linux (AUR)
```bash
yay -S protondrive-linux
```

### Other Distributions
See the main README for Flatpak, AppImage, and source installation instructions.

## Technical Details

- **Language**: Python 3.8+
- **GUI Framework**: Tkinter (included with Python)
- **Backend**: rclone with ProtonDrive support
- **License**: GPL v3

## Repository

The full source code and releases are available at:
https://github.com/donniedice/protondrive-linux

## Why This Contribution?

Linux users have been requesting ProtonDrive desktop support. This community contribution demonstrates:
- Strong demand for Linux support
- Feasibility of implementation
- Active Linux community engagement

## Testing

This client has been tested on:
- Arch Linux / Manjaro
- Ubuntu 22.04+
- Fedora 38+
- Debian 12+

## Future

Once official Linux support is released, users can transition from this community client to the official version.