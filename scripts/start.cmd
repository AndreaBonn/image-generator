@echo off
REM Thin wrapper: the real implementation is start.py (Python port).
uv run --script "%~dp0start.py" %*
