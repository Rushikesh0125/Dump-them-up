@echo off
cd /d "%~dp0web"
set CLOUDFLARE_ACCOUNT_ID=7d7db815f4a8f55e80adbe86d041a846
call npm install || goto :fail
call npm run deploy || goto :fail
echo.
echo Deployed. The pages.dev link is printed above.
pause
exit /b 0
:fail
echo Deploy failed - copy the error above and send it to Claude.
pause
