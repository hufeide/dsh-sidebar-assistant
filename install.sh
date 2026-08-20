#!/usr/bin/env bash
# 一键：构建 + link 到 DSH web profile。
# 用法：在本插件根目录下执行 `./install.sh`
#
# 为什么不直接 `add dsh-sidebar-assistant`？
# 因为本插件尚未发布到 npm，那个名字在 registry 里是 404。
# `dsh plugin add` 的剩余参数会原样交给 pnpm，需要传路径而不是包名。

set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

echo "[1/3] build..."
pnpm run build >/dev/null

echo "[2/3] link to profile=web (absolute path, no npm-registry lookup)..."
npx -p @deepseek-ai/dsh dsh plugin --profile web add "link:${here}"

echo "[3/3] done. 现在重启 dsh web 让插件生效："
echo "    pkill -9 -f 'dsh web' && dsh web &"
