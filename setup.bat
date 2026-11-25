@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.11 or newer is required. Install it from python.org and add it to PATH.
  goto :failed
)
where node >nul 2>nul
if errorlevel 1 (
  for /d %%D in ("%~dp0.tools\node-*-win-x64") do set "PATH=%%~fD;%PATH%"
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 LTS or newer is required. Install it from nodejs.org, then reopen this window.
  goto :failed
)
if not exist ".venv\Scripts\python.exe" python -m venv .venv
if errorlevel 1 goto :failed
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :failed
pushd frontend
call npm ci --no-fund --no-audit
if errorlevel 1 goto :failed
call npm run build
if errorlevel 1 goto :failed
popd
if not exist .env copy .env.example .env >nul
echo.
echo FuelScope is ready. Run start.bat to launch.
pause
exit /b 0
:failed
echo Setup did not finish. Review the error above and run setup.bat again.
pause
exit /b 1
