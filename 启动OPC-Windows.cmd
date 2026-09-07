@echo off
cd /d "%~dp0"
node scripts\launch.mjs
if errorlevel 1 pause
