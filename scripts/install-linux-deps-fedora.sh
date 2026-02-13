#!/bin/bash
# Install Linux dependencies for Cooper (Fedora/RHEL/CentOS/Rocky)
# Run with: sudo ./scripts/install-linux-deps-fedora.sh

set -e

echo "Installing Electron dependencies for Fedora/RHEL..."

# Core Electron dependencies (equivalent to Ubuntu's libnss3 + libasound2)
dnf install -y \
    nss \
    alsa-lib

echo "Done! Electron dependencies installed."
echo ""
echo "Verify with: ldd node_modules/electron/dist/electron | grep 'not found'"
