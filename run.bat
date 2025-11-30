@echo off
SETLOCAL

:: Check for Python virtual environment
if not exist ".venv" (
    echo Virtual environment .venv not found.
    echo Please run install.bat first.
    pause
    EXIT /B 1
)

:: Activate venv
call .venv\Scripts\activate.bat
if %ERRORLEVEL% NEQ 0 (
    echo Failed to activate virtual environment.
    pause
    EXIT /B 1
)

:: Check if pywebview is installed
python -c "import webview" >NUL 2>NUL
if %ERRORLEVEL% NEQ 0 (
    echo pywebview not found. Installing...
    pip install pywebview
    if %ERRORLEVEL% NEQ 0 (
        echo Failed to install pywebview.
        pause
        EXIT /B 1
    )
)

:: Run the application
start "" /B pythonw main.py

ENDLOCAL
