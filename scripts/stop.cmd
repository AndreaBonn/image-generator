@echo off
REM Thin wrapper: the real implementation is stop.py (Python port).
uv run --script "%~dp0stop.py" %*
