# 仿生蝴蝶飞行器 · 综合监测仪表盘

单 HTML 文件 + Vercel Serverless Function 实现。普通版直接打开 `index.html` 即可使用；Pro 版（豆包大模型识别）需部署到 Vercel 才能使用。

## 目录结构

```
butterfly/
├── index.html          # 单页前端（含本地识别 / 摄像头 / 串口 / 传感器 / 地图 / 翅膀模拟）
├── api/
│   └── recognize.js    # 豆包视觉大模型代理（服务端持有 API Key）
├── package.json        # 仅声明 openai 依赖（供 Vercel 安装）
├── vercel.json         # 部署配置（同源、CORS、缓存策略）
├── .gitignore          # 已忽略 .env / node_modules / .vercel
└── .env.example        # 环境变量模板（不会提交，仅作参考）
```

## 普通版 vs Pro 版

| 模式 | 访问方式 | 豆包识别按钮 | API Key |
|------|----------|--------------|---------|
| 普通版 | `https://your-domain.vercel.app/` | 隐藏 | 不需要 |
| Pro 版 | `https://your-domain.vercel.app/?mode=pro` | 显示 | 需要 |

前端通过 `URLSearchParams` 检测 `mode=pro`，自动启用 `Doubao` 模块并显示 `PRO` 徽章。

## 部署到 Vercel（5 分钟）

### 1. 准备代码并推送到 GitHub

```bash
git init
git add .
git commit -m "feat: butterfly dashboard with doubao pro mode"
git branch -M main
git remote add origin https://github.com/<你的用户名>/butterfly.git
git push -u origin main
```

### 2. 在 Vercel 导入仓库

1. 访问 https://vercel.com/new
2. 选择刚才推送的 GitHub 仓库
3. Framework Preset 选 **Other**（保持默认即可，Vercel 会自动识别）
4. Root Directory 保持 `./`
5. Build Command 留空（无需构建）
6. Output Directory 留空
7. 点击 **Deploy**，等待部署完成

### 3. 配置环境变量（关键，密钥只在这里）

1. 进入 Vercel 项目 → **Settings** → **Environment Variables**
2. 添加以下变量（**不要**写在代码里或 `.env` 里提交）：

| Name | Value | Environment |
|------|-------|-------------|
| `DOUBAO_API_KEY` | 你的豆包 / 火山方舟 API Key | Production (and Preview) |
| `DOUBAO_BASE_URL` | `https://ark.cn-beijing.volces.com/api/v3` | Production |
| `DOUBAO_MODEL` | 你的视觉模型接入点 ID，如 `ep-xxxxxxxx` 或 `doubao-vision-pro-32k` | Production |
| `PROD_URL` | `https://your-project.vercel.app`（部署后获得的域名） | Production |

3. 保存后点击 **Redeploy** 让环境变量生效

### 4. 访问

- 普通版：`https://your-project.vercel.app/`
- Pro 版：`https://your-project.vercel.app/?mode=pro`

## 本地开发

```bash
npm install -g vercel      # 安装 Vercel CLI
cd butterfly
vercel dev                 # 启动本地开发环境（含 serverless functions）
# 访问 http://localhost:3000 或 http://localhost:3000/?mode=pro
```

本地开发同样需要在 `vercel env add DOUBAO_API_KEY` 中设置环境变量，或创建 `.env`（已被 `.gitignore` 忽略）。

## 密钥安全保证

1. **API Key 只存在于 Vercel 环境变量**，前端代码中没有任何硬编码密钥
2. 前端通过同域 `fetch('/api/recognize', ...)` 调用，由 Vercel Function 转发到豆包 API
3. `.gitignore` 已忽略 `.env`，无法被推送到 GitHub
4. 后端 Function 校验同源请求，外部站点无法直接调用你的接口消耗额度
5. 单次请求体大小限制 2MB，避免恶意超大请求
6. `vercel.json` 设置 `public: false`（默认即可），项目不公开

## 豆包 API 申请

1. 访问 https://www.volcengine.com/product/doubao
2. 注册并开通**豆包大模型**服务
3. 在 https://console.volcengine.com/ark 创建模型推理接入点（视觉模型，如 `doubao-vision-pro-32k`）
4. 在 https://console.volcengine.com/ark/manage/apikey 获取 API Key
5. 将 API Key 与接入点 ID 填入 Vercel 环境变量

## 常见问题

**Q: 为什么 Pro 版按钮不显示？**
A: 访问 URL 必须带 `?mode=pro` 参数，例如 `https://your-domain.vercel.app/?mode=pro`。

**Q: 点击豆包识别返回 500？**
A: 检查 Vercel 环境变量 `DOUBAO_API_KEY` 是否设置；检查 `DOUBAO_MODEL` 是否为正确的接入点 ID。

**Q: 摄像头无法开启？**
A: 浏览器要求 `getUserMedia` 必须在 `localhost` 或 HTTPS 下运行，Vercel 默认提供 HTTPS，因此部署后即可使用。

**Q: Web Serial API 无法使用？**
A: 仅 Chrome/Edge 浏览器支持，且同样要求 HTTPS 或 localhost。Vercel 部署后即可正常使用。
