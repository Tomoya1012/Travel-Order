@echo off
setlocal
cd /d "%~dp0"

set "SITE_ID=6a504ec5-7026-4eea-a71d-f5693ea122a9"

echo Triggering a build from the GitHub branch connected to Netlify...
echo This does not upload uncommitted local files. Push the desired commit to GitHub first.
call npx.cmd --yes netlify-cli@latest deploy --trigger --site "%SITE_ID%"
if errorlevel 1 (
  echo.
  echo Netlify deploy trigger failed. If needed, sign in with: npx netlify-cli login
  exit /b 1
)

endlocal
exit /b 0
