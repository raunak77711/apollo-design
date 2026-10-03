@echo off
REM Starts the Content Factory workers (transcription + video rendering). Leave this window open.
cd /d "%~dp0server"
call npm run workers
pause
