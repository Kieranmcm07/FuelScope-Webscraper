@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" goto :setup
if not exist "frontend\dist\index.html" goto :setup
".venv\Scripts\python.exe" -m backend.launch
if errorlevel 1 pause
exit /b
:setup
echo Please run setup.bat first.
pause
exit /b 1
