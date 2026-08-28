# Agent Light 项目自动上传到 GitHub 脚本
# 使用方法：在 PowerShell 中运行此脚本
# 需要准备：GitHub 个人访问令牌（Personal Access Token）

Write-Host "🚀 Agent Light GitHub 自动上传脚本" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

# 配置参数
# 用户名从现有 origin 远程自动推导；没有远程时手动输入，不在脚本里硬编码
$originUrl = git remote get-url origin 2>$null
if ($originUrl -match 'github\.com[/:]([^/]+?)(\.git)?$') {
    $GITHUB_USERNAME = $Matches[1]
} else {
    $GITHUB_USERNAME = Read-Host "请输入你的 GitHub 用户名"
}
$REPO_NAME = "agent-light"
$REPO_DESCRIPTION = "Claude Code status indicator using ESP32-C3 traffic light - Hardware and software solutions for AI coding visualization"
# 项目根目录 = 本脚本所在 scripts/ 的上一级，放任何盘符都能用
$PROJECT_PATH = Split-Path $PSScriptRoot -Parent

# 检查项目路径是否存在
if (-not (Test-Path $PROJECT_PATH)) {
    Write-Host "❌ 错误：项目路径不存在: $PROJECT_PATH" -ForegroundColor Red
    exit 1
}

# 检查是否已经是 Git 仓库
$gitDir = Join-Path $PROJECT_PATH ".git"
if (-not (Test-Path $gitDir)) {
    Write-Host "❌ 错误：这不是一个 Git 仓库" -ForegroundColor Red
    Write-Host "请先在项目目录中运行: git init" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 项目路径验证成功: $PROJECT_PATH" -ForegroundColor Green
Write-Host ""

# 获取 GitHub 个人访问令牌
Write-Host "🔑 需要你的 GitHub 个人访问令牌 (Personal Access Token)" -ForegroundColor Yellow
Write-Host "获取步骤：" -ForegroundColor Cyan
Write-Host "1. 访问: https://github.com/settings/tokens" -ForegroundColor White
Write-Host "2. 点击 'Generate new token' -> 'Generate new token (classic)'" -ForegroundColor White
Write-Host "3. 勾选 'repo' 权限" -ForegroundColor White
Write-Host "4. 设置过期时间，点击生成" -ForegroundColor White
Write-Host "5. 复制生成的令牌（只显示一次！）" -ForegroundColor White
Write-Host ""

$token = Read-Host "请粘贴你的 GitHub 个人访问令牌"

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "❌ 错误：令牌不能为空" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📡 正在连接到 GitHub..." -ForegroundColor Cyan

# 创建基本的认证头
$base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($GITHUB_USERNAME):$token"))
$headers = @{
    Authorization = "Basic $base64AuthInfo"
    "Content-Type" = "application/json"
}

# 检查仓库是否已存在
$checkRepoUrl = "https://api.github.com/repos/$GITHUB_USERNAME/$REPO_NAME"
try {
    $checkResponse = Invoke-RestMethod -Uri $checkRepoUrl -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "⚠️  警告：仓库 '$REPO_NAME' 已存在" -ForegroundColor Yellow
    $choice = Read-Host "是否继续使用现有仓库？(Y/N)"
    if ($choice -ne "Y" -and $choice -ne "y") {
        Write-Host "❌ 操作已取消" -ForegroundColor Red
        exit 1
    }
} catch {
    # 仓库不存在，创建新仓库
    Write-Host "📝 正在创建新仓库: $REPO_NAME..." -ForegroundColor Cyan

    $createRepoBody = @{
        name = $REPO_NAME
        description = $REPO_DESCRIPTION
        private = $false
        auto_init = $false
    } | ConvertTo-Json

    try {
        $createResponse = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Body $createRepoBody -Headers $headers
        Write-Host "✅ 仓库创建成功！" -ForegroundColor Green
        Write-Host "   仓库地址: $($createResponse.html_url)" -ForegroundColor White
    } catch {
        Write-Host "❌ 创建仓库失败: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🔗 正在配置 Git 远程仓库..." -ForegroundColor Cyan

# 切换到项目目录
Set-Location $PROJECT_PATH

# 检查是否已有远程仓库（remote 始终用干净 URL，token 永不写入 .git/config）
$cleanUrl = "https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"
if ($remotes -match "origin") {
    Write-Host "🔄 更新现有远程仓库地址..." -ForegroundColor Yellow
    git remote set-url origin $cleanUrl
} else {
    Write-Host "➕ 添加新的远程仓库..." -ForegroundColor Yellow
    git remote add origin $cleanUrl
}

# 重命名分支为 main
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "main") {
    Write-Host "🔀 重命名分支 $currentBranch -> main..." -ForegroundColor Yellow
    git branch -M main
}

Write-Host ""
Write-Host "📤 正在推送代码到 GitHub..." -ForegroundColor Cyan
Write-Host "这可能需要几分钟，请耐心等待..." -ForegroundColor Yellow

# 用一次性带 token 的 URL 推送（仅存在于本次命令内存中，不落盘）
$pushUrl = "https://$GITHUB_USERNAME:$token@github.com/$GITHUB_USERNAME/$REPO_NAME.git"
$pushOutput = git push $pushUrl main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 代码推送成功！" -ForegroundColor Green
    git branch --set-upstream-to=origin/main main | Out-Null
} else {
    Write-Host "❌ 推送失败:" -ForegroundColor Red
    Write-Host $pushOutput -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "🎉 上传完成！" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "📦 仓库信息:" -ForegroundColor Cyan
Write-Host "   名称: $REPO_NAME" -ForegroundColor White
Write-Host "   地址: https://github.com/$GITHUB_USERNAME/$REPO_NAME" -ForegroundColor White
Write-Host ""
Write-Host "📊 上传统计:" -ForegroundColor Cyan
$stats = git count-objects -vH
Write-Host "   文件数: $($stats.'count')" -ForegroundColor White
Write-Host "   大小: $($stats.'size-disk')" -ForegroundColor White
Write-Host ""
Write-Host "🎯 下一步操作:" -ForegroundColor Yellow
Write-Host "1. 访问你的仓库: https://github.com/$GITHUB_USERNAME/$REPO_NAME" -ForegroundColor White
Write-Host "2. 添加 README 图片和资源" -ForegroundColor White
Write-Host "3. 设置仓库主题和标签" -ForegroundColor White
Write-Host "4. 考虑添加开源许可证" -ForegroundColor White
Write-Host ""
Write-Host "💡 提示：你可以在 GitHub 仓库设置中配置：" -ForegroundColor Cyan
Write-Host "   - 仓库描述和网站链接" -ForegroundColor White
Write-Host "   - 主题标签" -ForegroundColor White
Write-Host "   - 开源许可证" -ForegroundColor White
Write-Host "   - 社区健康文件" -ForegroundColor White
Write-Host ""

# 询问是否打开仓库
$openChoice = Read-Host "是否现在打开 GitHub 仓库？(Y/N)"
if ($openChoice -eq "Y" -or $openChoice -eq "y") {
    Start-Process "https://github.com/$GITHUB_USERNAME/$REPO_NAME"
}

Write-Host "✨ 脚本执行完成！" -ForegroundColor Green