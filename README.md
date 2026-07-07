# 隔空手势画板 Vercel 版

这是从 `/Users/kyo/Projects/python/draw` 迁移出来的 Vercel 版本，原 Python 代码不需要改动。

保留功能：

- MediaPipe 手势识别画画
- 颜色、粗细、橡皮、撤销、清空、保存到本地
- 中文 / 日文切换
- Agnes AI 图生图

移除功能：

- AI 生成图和原始画布自动保存到服务器
- 多人房间 UI、同步 API 和 Redis 存储逻辑

## 本地运行

不想先登录 Vercel CLI 的话，可以直接运行本地模拟服务：

```bash
cd /Users/kyo/Projects/web/gesture-draw-vercel
AGNES_API_KEY="你的 Agnes API Key" node scripts/local-dev.mjs
```

默认地址是：

```text
http://127.0.0.1:3025
```

如果你想使用 Vercel 官方本地环境：

```bash
cd /Users/kyo/Projects/web/gesture-draw-vercel
pnpm install
AGNES_API_KEY="你的 Agnes API Key" pnpm dev
```

## 部署到 Vercel

```bash
cd /Users/kyo/Projects/web/gesture-draw-vercel
npx vercel
```

在 Vercel 项目环境变量里设置：

```dotenv
AGNES_API_KEY="你的 Agnes API Key"
```
