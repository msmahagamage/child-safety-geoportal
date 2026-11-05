@echo off
cd /d "%~dp0"
echo Serving the geoportal at http://localhost:8765/  (close this window to stop)
start "" http://localhost:8765/
python serve.py 8765 || py serve.py 8765
pause
