@echo off
REM Thin wrapper: the real implementation is install.py (Python port).
uv run --script "%~dp0install.py" %*
