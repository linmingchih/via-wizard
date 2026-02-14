@echo off
setlocal EnableDelayedExpansion

:: Toggle UI framework here:
:: True  -> browser web GUI
:: False -> pywebview desktop GUI
set "WEBGUI=True"
set "WEBGUI_HOST=127.0.0.1"
set "WEBGUI_PORT=8080"

:: 1. Check if uv is installed
where uv >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo uv not found. Installing uv...
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    
    :: Add common uv install locations to PATH for this session
    set "PATH=%USERPROFILE%\.cargo\bin;%LOCALAPPDATA%\bin;%USERPROFILE%\.local\bin;%LOCALAPPDATA%\Programs\uv;%LOCALAPPDATA%\Programs\uv\bin;%PATH%"
)

:: Verify uv is available
where uv >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: uv installation failed or not found in PATH.
    echo Please restart your terminal or install uv manually.
    pause
    exit /b 1
)

:: 2. Check .python-version
if exist ".python-version" (
    set /p PYTHON_VERSION=<.python-version
    echo Target Python version: !PYTHON_VERSION!
) else (
    echo Warning: .python-version file not found.
)

:: 3. uv sync
echo Syncing environment...
call uv sync
if %ERRORLEVEL% NEQ 0 (
    echo Error: uv sync failed.
    pause
    exit /b 1
)

:: 4. Open GUI
echo Starting GUI...
call .venv\Scripts\activate.bat

if /I "%WEBGUI%"=="True" (
    echo Launch mode: browser web GUI (%WEBGUI_HOST%:%WEBGUI_PORT%)
    start "" python src\main.py --webgui --host %WEBGUI_HOST% --port %WEBGUI_PORT%
) else (
    echo Launch mode: pywebview desktop GUI
    start "" pythonw src\main.py
)

endlocal
