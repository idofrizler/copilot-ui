#!/bin/bash
# Install Linux dependencies for Cooper (Debian/Ubuntu)
# Run with: sudo ./scripts/install-linux-deps.sh

set -e

echo "Installing Electron dependencies for Debian/Ubuntu..."

apt-get update

# Core Electron dependencies (verified on Ubuntu 24.04)
# libnss3 - Network Security Services (also pulls in libnspr4)
# libasound2t64 - ALSA audio (Ubuntu 24.04+ uses t64 suffix)
# libasound2 - ALSA audio (older Ubuntu versions)

# Try the t64 variant first (Ubuntu 24.04+), fall back to old name
if apt-get install -y libnss3 libasound2t64 2>/dev/null; then
    echo "Installed libasound2t64 (Ubuntu 24.04+)"
else
    apt-get install -y libnss3 libasound2
    echo "Installed libasound2 (older Ubuntu)"
fi

echo "Done! Electron dependencies installed."
echo ""
echo "Verify with: ldd node_modules/electron/dist/electron | grep 'not found'"
