#!/bin/bash
# Install Linux dependencies for Cooper (Electron app)
# Auto-detects distro and installs appropriate packages
# Run with: sudo ./scripts/install-linux-deps.sh

set -e

# Detect package manager / distro
if command -v apt-get &> /dev/null; then
    echo "Detected Debian/Ubuntu - using apt..."
    apt-get update
    
    # Core packages available on all Ubuntu/Debian versions
    PKGS="libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgtk-3-0 \
          libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
          libxrandr2 at-spi2-core"
    
    # Try t64 variant first (Ubuntu 24.04+), fall back to old name
    if apt-get install -y $PKGS libasound2t64 2>/dev/null; then
        echo "Installed with libasound2t64 (Ubuntu 24.04+)"
    else
        apt-get install -y $PKGS libasound2
        echo "Installed with libasound2 (older Ubuntu/Debian)"
    fi

elif command -v dnf &> /dev/null; then
    echo "Detected Fedora/RHEL - using dnf..."
    dnf install -y nss alsa-lib atk at-spi2-atk cups-libs libdrm gtk3 \
        mesa-libgbm libxkbcommon libXcomposite libXdamage libXfixes \
        libXrandr at-spi2-core dbus-libs fuse fuse-libs

elif command -v pacman &> /dev/null; then
    echo "Detected Arch Linux - using pacman..."
    pacman -S --noconfirm --needed nss alsa-lib atk at-spi2-atk libcups \
        libdrm gtk3 mesa libxkbcommon libxcomposite libxdamage libxfixes \
        libxrandr at-spi2-core

elif command -v zypper &> /dev/null; then
    echo "Detected openSUSE - using zypper..."
    zypper install -y mozilla-nss alsa-lib atk at-spi2-atk libcups2 \
        libdrm2 gtk3 Mesa-libgbm1 libxkbcommon0 libXcomposite1 \
        libXdamage1 libXfixes3 libXrandr2 at-spi2-core

else
    echo "Unknown distro. Please install manually:"
    echo "  - NSS (Network Security Services)"
    echo "  - ALSA lib (audio)"
    echo "  - GTK3 + dependencies"
    echo "  - libgbm, libxkbcommon, libxcomposite, libxdamage, libxfixes, libxrandr"
    echo "  - at-spi2-core (accessibility)"
    exit 1
fi

echo ""
echo "Done! Electron dependencies installed."
echo "Verify with: ldd node_modules/electron/dist/electron | grep 'not found'"
