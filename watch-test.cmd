@echo off
REM Run the phase 3 acceptance suite with a visible browser window
REM so you can watch the bot play live.
set WATCH=1
npm run test:phase3
pause
