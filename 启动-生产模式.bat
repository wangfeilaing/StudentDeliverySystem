@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "NODE_DIR=D:\deepseek\_dl\node-v22.20.0-win-x64"
set "PATH=%NODE_DIR%;%PATH%"
set "NODE_ENV=production"
echo ============================================
echo   IP Manager - starting production server
echo ============================================
if not exist "%NODE_DIR%\node.exe" echo [ERROR] Node not found at %NODE_DIR% & pause & exit /b 1
if not exist "node_modules" call "%NODE_DIR%\npm.cmd" ci --no-fund --no-audit
if not exist ".next\BUILD_ID" call "%NODE_DIR%\npm.cmd" run build
echo.
echo   Local:   http://localhost:3000
echo   Ctrl+C to stop
echo.
call "%NODE_DIR%\npm.cmd" run start
pause
