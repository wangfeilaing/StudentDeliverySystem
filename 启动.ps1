# 学员交付管理系统 · 启动器（Windows PowerShell 版）
# 用法：右键本文件 → 使用 PowerShell 运行；或在 PowerShell 里执行：
#   Invoke-Expression (Get-Content -LiteralPath '.\启动.ps1' -Raw)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

$nodeDir = 'D:\deepseek\_dl\node-v22.20.0-win-x64'
$env:Path = "$nodeDir;$env:Path"
$env:NODE_ENV = 'production'

Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  学员交付管理系统 启动中...' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath (Join-Path $nodeDir 'node.exe'))) {
  Write-Host "[错误] 找不到 Node 运行时：$nodeDir" -ForegroundColor Red
  Write-Host '       请修改本脚本顶部的 $nodeDir 为你机器上的 Node 安装目录。' -ForegroundColor Yellow
  Read-Host '按回车退出'
  exit 1
}
Write-Host ('Node 版本：' + (& (Join-Path $nodeDir 'node.exe') -v)) -ForegroundColor Green

if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) {
  Write-Host '[1/3] 安装依赖（约 1-2 分钟）...' -ForegroundColor Yellow
  & (Join-Path $nodeDir 'npm.cmd') ci --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { Write-Host '依赖安装失败' -ForegroundColor Red; Read-Host '按回车退出'; exit 1 }
}

if (-not (Test-Path -LiteralPath (Join-Path $root '.next\BUILD_ID'))) {
  Write-Host '[2/3] 构建生产包（约 1 分钟）...' -ForegroundColor Yellow
  & (Join-Path $nodeDir 'npm.cmd') run build
  if ($LASTEXITCODE -ne 0) { Write-Host '构建失败' -ForegroundColor Red; Read-Host '按回车退出'; exit 1 }
}

Write-Host '[3/3] 启动服务...' -ForegroundColor Yellow
Write-Host ''
Write-Host '  本机访问：   http://localhost:3000' -ForegroundColor Green
foreach ($ip in (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                 Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' })) {
  Write-Host ('  局域网访问： http://' + $ip.IPAddress + ':3000') -ForegroundColor Green
}
Write-Host ('  数据库：     ' + (Join-Path $root 'data\app.db')) -ForegroundColor Gray
Write-Host '  按 Ctrl+C 停止服务' -ForegroundColor Gray
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

& (Join-Path $nodeDir 'npm.cmd') run start
