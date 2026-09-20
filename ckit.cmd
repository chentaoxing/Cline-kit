@echo off
rem cline-kit launcher for people who downloaded the release zip instead of installing from npm.
rem Runs the CLI straight out of this folder, so nothing is written to the global npm tree.
setlocal
set "HERE=%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo cline-kit needs Node.js 20.10 or newer on PATH.  https://nodejs.org
  exit /b 1
)
node "%HERE%src\cli.js" %*
exit /b %ERRORLEVEL%
