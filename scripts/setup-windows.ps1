# Windows Development Environment Setup Script for Cooper
# This script installs all prerequisites needed to build and run the app on Windows.
# Designed to complete fully on the first run with no terminal restart required.

Write-Host "=== Cooper - Windows Setup ===" -ForegroundColor Cyan
Write-Host ""

# --- Helpers ---

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# Locate a real Python binary, skipping the Windows Store alias under WindowsApps.
function Find-Python {
    # 1. Check common install locations directly
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe",
        "C:\Python3*\python.exe",
        "C:\Program Files\Python3*\python.exe",
        "C:\Program Files (x86)\Python3*\python.exe"
    )
    foreach ($glob in $candidates) {
        $found = Get-ChildItem $glob -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    # 2. Walk PATH entries, but skip WindowsApps aliases
    foreach ($dir in ($env:Path -split ';')) {
        if ($dir -match 'WindowsApps') { continue }
        $exe = Join-Path $dir "python.exe"
        if (Test-Path $exe) { return $exe }
    }
    return $null
}

# Locate node.exe on PATH.
function Find-Node {
    foreach ($dir in ($env:Path -split ';')) {
        $exe = Join-Path $dir "node.exe"
        if (Test-Path $exe) { return $exe }
    }
    return $null
}

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

# --- Node.js ---
Write-Host ""
Write-Host "Checking Node.js..." -ForegroundColor Yellow
Refresh-Path
$nodeOk = $false
$nodePath = Find-Node
if ($nodePath) {
    $nodeVersion = & $nodePath --version 2>&1
    if ($LASTEXITCODE -eq 0 -and $nodeVersion -match '^v(\d+)') {
        if ([int]$Matches[1] -ge 22) {
            $nodeOk = $true
            Write-Host "✓ Node.js $nodeVersion (sufficient)" -ForegroundColor Green
        } else {
            Write-Host "✗ Node.js $nodeVersion found, but version 22+ required" -ForegroundColor Red
        }
    }
}
if (-not $nodeOk) {
    Write-Host "Installing Node.js LTS..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    $nodePath = Find-Node
    if (-not $nodePath) {
        Write-Host "✗ Node.js installation failed — 'node.exe' not found on PATH." -ForegroundColor Red
        exit 1
    }
    # Prepend so this session can use it even if PATH ordering is odd
    $env:Path = (Split-Path $nodePath) + ";" + $env:Path
    $nodeVersion = & $nodePath --version 2>&1
    Write-Host "✓ Node.js $nodeVersion installed" -ForegroundColor Green
}

# --- Python (required by node-gyp for native modules) ---
Write-Host ""
Write-Host "Checking Python..." -ForegroundColor Yellow
Refresh-Path
$pythonPath = Find-Python
if (-not $pythonPath) {
    Write-Host "Python not found. Installing Python 3.12..." -ForegroundColor Yellow
    winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    $pythonPath = Find-Python
}
if ($pythonPath) {
    $pythonVersion = & $pythonPath --version 2>&1
    # Prepend real Python dir so it wins over the Windows Store alias
    $env:Path = (Split-Path $pythonPath) + ";" + $env:Path
    # Tell node-gyp exactly which Python to use (bypasses its own PATH search)
    $env:NODE_GYP_FORCE_PYTHON = $pythonPath
    Write-Host "✓ $pythonVersion ($pythonPath)" -ForegroundColor Green
} else {
    Write-Host "✗ Python installation failed — no python.exe found in standard locations." -ForegroundColor Red
    exit 1
}

# --- Visual Studio Build Tools (C++ compiler for native modules) ---
Write-Host ""
Write-Host "Checking Visual Studio Build Tools..." -ForegroundColor Yellow
$vsFound = $false
$vsSearchPaths = @(
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools",
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\Community",
    "C:\Program Files\Microsoft Visual Studio\2022\Community",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\Professional",
    "C:\Program Files\Microsoft Visual Studio\2022\Professional",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\Enterprise",
    "C:\Program Files\Microsoft Visual Studio\2022\Enterprise"
)
foreach ($p in $vsSearchPaths) {
    if (Test-Path $p) {
        $vsFound = $true
        Write-Host "✓ Visual Studio 2022 found at $p" -ForegroundColor Green
        break
    }
}
if (-not $vsFound) {
    Write-Host "Visual Studio Build Tools not found. Installing..." -ForegroundColor Yellow
    Write-Host "This will take several minutes (downloading ~2-3 GB)..." -ForegroundColor Yellow
    winget install Microsoft.VisualStudio.2022.BuildTools --silent --accept-package-agreements --accept-source-agreements --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Failed to install VS Build Tools (exit code $LASTEXITCODE)." -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Visual Studio Build Tools installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Prerequisites ready ===" -ForegroundColor Green
Write-Host ""

# --- npm install ---
Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "✗ npm install failed (exit code $LASTEXITCODE)." -ForegroundColor Red
    exit 1
}
Write-Host "✓ npm dependencies installed" -ForegroundColor Green

Write-Host ""
Write-Host "=== All Done! ===" -ForegroundColor Green
Write-Host ""
Write-Host "To start development, run:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
