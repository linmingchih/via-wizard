@echo off
SETLOCAL EnableDelayedExpansion

:: Jump to main execution
GOTO :Main

:: Function to display error and pause
:ErrorAndExit
    echo ERROR: %~1
    echo Press any key to exit...
    pause > NUL
    EXIT /B 1

:Main
set "PYTHON_EXE="

:: -------------------------------------------------------
:: 1. Search for Ansys Bundled Python (Prioritize Newest)
:: -------------------------------------------------------
echo Searching for Ansys bundled Python 3.10...

:: Get all env vars starting with ANSYSEM_ROOT and sort them reversed to get newest first
:: 'set' output is sorted alphabetically. ANSYSEM_ROOT251 > ANSYSEM_ROOT241.
:: We can just iterate and overwrite, the last one will be the "newest" alphabetically (usually).
:: Wait, alphabetical: 232 < 241 < 251. So iterating normal order leaves the highest version last.
:: We want the highest version.

for /f "tokens=1,* delims==" %%A in ('set ANSYSEM_ROOT 2^>NUL') do (
    set "CANDIDATE_ROOT=%%B"
    set "CANDIDATE_PYTHON=!CANDIDATE_ROOT!\commonfiles\CPython\3_10\winx64\Release\python.exe"
    
    if exist "!CANDIDATE_PYTHON!" (
        echo Found Ansys Python at: !CANDIDATE_PYTHON!
        set "PYTHON_EXE=!CANDIDATE_PYTHON!"
    )
)

if defined PYTHON_EXE (
    goto :VerifyVersion
)

:: -------------------------------------------------------
:: 2. Check System Python
:: -------------------------------------------------------
echo Ansys bundled Python not found. Checking system PATH...
where python >NUL 2>NUL
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('where python') do (
        set "PYTHON_EXE=%%i"
        goto :VerifyVersion
    )
)

:: -------------------------------------------------------
:: 3. User Prompt
:: -------------------------------------------------------
:AskUser
echo.
echo Python 3.10 could not be automatically found.
set /p "PYTHON_EXE=Please enter the full path to python.exe (version 3.10): "

:: Remove quotes if user added them
set "PYTHON_EXE=!PYTHON_EXE:"=!"

if not exist "!PYTHON_EXE!" (
    echo File not found: "!PYTHON_EXE!"
    goto :AskUser
)

:VerifyVersion
echo Verifying Python version for: "!PYTHON_EXE!"

:: Create a temporary script to get Python version
echo import sys > get_python_version.py
echo print(f'{sys.version_info.major}.{sys.version_info.minor}') >> get_python_version.py

:: Execute the temporary script and capture output
for /f "tokens=*" %%i in ('"!PYTHON_EXE!" get_python_version.py') do set PYTHON_VERSION=%%i

:: Clean up temporary script
del get_python_version.py

echo Detected version: %PYTHON_VERSION%
for /f "tokens=1,2 delims=." %%a in ("%PYTHON_VERSION%") do (
    set MAJOR=%%a
    set MINOR=%%b
)

:: Strict 3.10 check
if "%MAJOR%" NEQ "3" (
    echo Error: Python version 3.10 is required. Found %PYTHON_VERSION%.
    set "PYTHON_EXE="
    goto :AskUser
)
if "%MINOR%" NEQ "10" (
    echo Error: Python version 3.10 is required. Found %PYTHON_VERSION%.
    set "PYTHON_EXE="
    goto :AskUser
)

echo Python 3.10 confirmed.

:: -------------------------------------------------------
:: 4. Setup Virtual Environment
:: -------------------------------------------------------
if not exist ".venv" (
    echo Creating Python virtual environment '.venv'...
    "!PYTHON_EXE!" -m venv .venv
    if !ERRORLEVEL! NEQ 0 (
        call :ErrorAndExit "Failed to create virtual environment."
    )
)

:: Activate the virtual environment
echo Activating the virtual environment...
call .venv\Scripts\activate.bat
if %ERRORLEVEL% NEQ 0 (
    call :ErrorAndExit "Failed to activate virtual environment."
)

:: Check if uv is installed, if not, install it
where uv >NUL 2>NUL
if %ERRORLEVEL% NEQ 0 (
    echo uv not found in virtual environment. Installing uv...
    pip install uv
    if %ERRORLEVEL% NEQ 0 (
        call :ErrorAndExit "Failed to install uv."
    )
)

:: Install dependencies using uv
echo Installing dependencies using uv...
uv pip install pyaedt pyedb pywebview scikit-rf
if %ERRORLEVEL% NEQ 0 (
    call :ErrorAndExit "Failed to install project dependencies."
)

echo Installation complete.
echo Press any key to continue...
pause > NUL

:: Deactivate the virtual environment
echo Deactivating the virtual environment.
call deactivate
ENDLOCAL
