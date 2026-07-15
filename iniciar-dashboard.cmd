@echo off
cd /d "%~dp0"
start "Servidor Dashboard Platino - NAO FECHAR" cmd /k "cd /d ""%~dp0"" && npm start"
powershell -NoProfile -Command "$ok=$false; 1..30 | ForEach-Object { if(-not $ok){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/generate-document' -TimeoutSec 1; if($r.StatusCode -eq 200){$ok=$true} } catch {}; if(-not $ok){Start-Sleep -Milliseconds 500} } }; if(-not $ok){exit 1}"
if errorlevel 1 (
  echo Nao foi possivel iniciar o servidor do Dashboard.
  echo Verifique a janela "Servidor Dashboard Platino - NAO FECHAR".
  pause
  exit /b 1
)
start "Dashboard Platino" http://localhost:3000
