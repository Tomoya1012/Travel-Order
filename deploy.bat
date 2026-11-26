@echo off
if not defined NETLIFY_MCP_PROXY_PATH (
  echo Set NETLIFY_MCP_PROXY_PATH to the current Netlify MCP proxy URL before running.
  exit /b 1
)
npx -y @netlify/mcp@latest --site-id 6a504ec5-7026-4eea-a71d-f5693ea122a9 --proxy-path "%NETLIFY_MCP_PROXY_PATH%"
