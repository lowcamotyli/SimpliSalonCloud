@echo off
setlocal
set "ROOT=%~dp0.."
set "PLAYWRIGHT_BROWSERS_PATH=%ROOT%\.playwright"
call "%ROOT%\node_modules\.bin\playwright.cmd" %*
