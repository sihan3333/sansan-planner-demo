@echo off
chcp 65001 >nul
rem 用户试用：在本机同时启动作息簿（8000）和数据后端（8001），并打开数据看板
cd /d %~dp0
start "作息簿 8000" python -m http.server 8000
start "数据后端 8001" python -m uvicorn app:app --port 8001 --app-dir backend
timeout /t 3 >nul
start "" http://localhost:8001/dashboard
echo.
echo 已启动。每位试用者打开（把 t01 换成 t02、t03……）：
echo     http://localhost:8000/?tester=t01
echo 换下一个人之前：在 App「我的 → 数据」里点「恢复示例数据」，再换 tester 编号。
echo 看板在 http://localhost:8001/dashboard ，默认只显示真实数据。
echo.
pause
