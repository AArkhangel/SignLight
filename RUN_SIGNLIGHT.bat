@echo off
TITLE SignLight - System Launch
COLOR 0E
CLS

echo  ============================================================
echo               SIGNLIGHT: ON-DEVICE ML SYSTEM
echo  ============================================================
echo.
echo  [INFO] Checking environment...

cd /d "%~dp0"

:: Check for node_modules
if not exist node_modules (
    echo  [WARN] Node modules not found!
    echo  [SYSTEM] Installing dependencies (this may take a minute)...
    call npm install
)

echo  [SYSTEM] Initializing Neural Engine...
echo  [SYSTEM] Launching Dashboard...
echo.
echo  ------------------------------------------------------------
echo   KEEP THIS WINDOW OPEN WHILE USING THE APPLICATION
echo  ------------------------------------------------------------
echo.

:: Start Vite dev server with --open (already configured in package.json)
call npm run dev

pause
