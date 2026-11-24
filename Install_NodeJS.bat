@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Install Node.js LTS - FGC Open Scorebars

set "FROM_LAUNCHER=0"
if /i "%~1"=="--from-launcher" set "FROM_LAUNCHER=1"

echo.
echo  ================================================================
echo     Node.js LTS Auto-Installer (FGC Open Scorebars)
echo  ================================================================
echo.

call :refresh_path
call :check_node
if !NODE_OK!==1 (
  echo  [OK] Node.js !NODE_VER! is already installed and compatible ^(18+^).
  echo       You are ready to launch Start_Scorebar.bat!
  if "!FROM_LAUNCHER!"=="0" (
    echo.
    pause
  )
  exit /b 0
)

if defined NODE_VER (
  echo  [!] Outdated Node.js version detected: !NODE_VER! ^(Node.js 18+ required^).
) else (
  echo  [!] Node.js was not found on this PC.
)
echo  [*] Installing the latest official Node.js LTS from nodejs.org...
echo.

:: Method 1: Windows Package Manager (winget) - built into Windows 10/11
where winget >nul 2>nul
if !errorlevel!==0 (
  echo  [1/2] Installing Node.js LTS via winget ^(OpenJS.NodeJS.LTS^)...
  echo        ^(Accept the Windows UAC prompt if requested.^)
  echo.
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  call :refresh_path
  call :check_node
  if !NODE_OK!==1 goto :success
  echo.
  echo  [!] winget did not finish cleanly. Falling back to direct official MSI download...
)

:: Method 2: Direct official MSI download from nodejs.org via PowerShell
echo  [2/2] Downloading the latest official Node.js LTS installer from nodejs.org...
echo        ^(Accept the Windows UAC prompt when the installer opens.^)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } elseif ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }; $rel = (Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json') | Where-Object { $_.lts -ne $false } | Select-Object -First 1; $ver = $rel.version; $msi = 'node-' + $ver + '-' + $arch + '.msi'; $url = 'https://nodejs.org/dist/' + $ver + '/' + $msi; $out = Join-Path $env:TEMP $msi; Write-Host ('  -> Downloading ' + $msi + ' from nodejs.org...'); Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing; Write-Host '  -> Running official MSI installer...'; $p = Start-Process msiexec.exe -ArgumentList ('/i', $out, '/qb') -Wait -PassThru; Remove-Item $out -ErrorAction SilentlyContinue; exit $p.ExitCode"

set "PS_ERR=!errorlevel!"
call :refresh_path
call :check_node
if !NODE_OK!==1 goto :success

echo.
echo  [ERROR] Automatic installation could not be completed ^(code !PS_ERR!^).
echo          Please download and install Node.js LTS manually from:
echo          https://nodejs.org/
echo.
if "!FROM_LAUNCHER!"=="0" pause
exit /b 1

:success
echo.
echo  ================================================================
echo  [OK] Node.js !NODE_VER! installed successfully!
echo  ================================================================
echo.
if "!FROM_LAUNCHER!"=="0" (
  echo  You can now close this window and run Start_Scorebar.bat.
  echo.
  pause
)
exit /b 0

:: -----------------------------------------------------------------
:: Refresh PATH from Windows registry (Machine + User) + common dirs
:: -----------------------------------------------------------------
:refresh_path
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$m=[Environment]::GetEnvironmentVariable('Path','Machine'); $u=[Environment]::GetEnvironmentVariable('Path','User'); ($m,$u | Where-Object { $_ }) -join ';'"`) do (
  set "PATH=%%P"
)
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
exit /b 0

:: -----------------------------------------------------------------
:: Check that node exists and major version >= 18
:: -----------------------------------------------------------------
:check_node
set "NODE_OK=0"
set "NODE_VER="
where node >nul 2>nul
if errorlevel 1 exit /b 0
for /f "delims=" %%V in ('node -v 2^>nul') do set "NODE_VER=%%V"
if not defined NODE_VER exit /b 0
set "NODE_MAJOR=!NODE_VER:v=!"
for /f "tokens=1 delims=." %%M in ("!NODE_MAJOR!") do set "NODE_MAJOR=%%M"
if !NODE_MAJOR! GEQ 18 set "NODE_OK=1"
exit /b 0
