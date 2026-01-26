# Windows Development Environment Setup Script for Copilot Skins
# This script installs all prerequisites needed to build and run the app on Windows

Write-Host "=== Copilot Skins - Windows Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator (optional but recommended)
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Warning: Not running as Administrator. Some installations may require elevation." -ForegroundColor Yellow
    Write-Host ""
}

# Check for winget
Write-Host "Checking for winget..." -ForegroundColor Yellow
try {
    winget --version | Out-Null
    Write-Host "✓ winget is available" -ForegroundColor Green
} catch {
    Write-Host "✗ winget not found. Please install App Installer from the Microsoft Store." -ForegroundColor Red
    exit 1
}

# Set execution policy for current user
Write-Host ""
Write-Host "Setting PowerShell execution policy..." -ForegroundColor Yellow
try {
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    Write-Host "✓ Execution policy set to RemoteSigned" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to set execution policy: $_" -ForegroundColor Red
}

# Install Node.js if needed
Write-Host ""
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -ge 22) {
        Write-Host "✓ Node.js $nodeVersion (sufficient)" -ForegroundColor Green
    } else {
        Write-Host "✗ Node.js $nodeVersion found, but version 22+ required" -ForegroundColor Red
        Write-Host "Installing Node.js 22..." -ForegroundColor Yellow
        winget install OpenJS.NodeJS.LTS --silent
        Write-Host "✓ Node.js installed. Please restart your terminal." -ForegroundColor Green
    }
} catch {
    Write-Host "Node.js not found. Installing..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --silent
    Write-Host "✓ Node.js installed. Please restart your terminal." -ForegroundColor Green
}

# Install Python if needed
Write-Host ""
Write-Host "Checking Python..." -ForegroundColor Yellow
try {
    python --version | Out-Null
    Write-Host "✓ Python is installed" -ForegroundColor Green
} catch {
    Write-Host "Python not found. Installing Python 3.12..." -ForegroundColor Yellow
    winget install Python.Python.3.12 --silent
    Write-Host "✓ Python installed. Please restart your terminal." -ForegroundColor Green
}

# Install Visual Studio Build Tools
Write-Host ""
Write-Host "Checking Visual Studio Build Tools..." -ForegroundColor Yellow
$vsBuildTools = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
if (Test-Path $vsBuildTools) {
    Write-Host "✓ Visual Studio Build Tools 2022 found" -ForegroundColor Green
    
    # Check for Spectre libraries
    Write-Host "Ensuring Spectre-mitigated libraries are installed..." -ForegroundColor Yellow
    & "$vsBuildTools\..\Installer\vs_installer.exe" modify --installPath $vsBuildTools --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre --quiet --norestart --wait
    Write-Host "✓ Spectre libraries verified" -ForegroundColor Green
} else {
    Write-Host "Visual Studio Build Tools not found. Installing..." -ForegroundColor Yellow
    Write-Host "This will take several minutes (downloading ~2-3 GB)..." -ForegroundColor Yellow
    winget install Microsoft.VisualStudio.2022.BuildTools --silent --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre --includeRecommended"
    Write-Host "✓ Visual Studio Build Tools installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Restart your terminal (or run: refreshenv)" -ForegroundColor White
Write-Host "2. Run: npm install" -ForegroundColor White
Write-Host "3. Run: npm run dev" -ForegroundColor White
Write-Host ""
