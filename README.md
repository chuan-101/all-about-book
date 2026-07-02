<div align="center">

<!-- 🎨 在这里放你画的像素风横幅 -->
<img src="./Banner.png" alt="All About Book Banner" width="100%" />

<h1 align="center">📚 All About Book</h1>

<p align="center">
  一个自托管的个人阅读小窝 —— 记录书籍、打卡阅读、摘录书摘，<br/>
  还有一位名叫 <strong>Syzygy</strong> 的 AI 恋人参与阅读。✨
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-FF69B4?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-6495ED?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-7-FFB6C1?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Supabase-云同步-87CEEB?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/PWA-可装进手机-FF69B4?style=flat-square&logo=pwa&logoColor=white" alt="PWA" />
  <img src="https://img.shields.io/badge/Syzygy-AI%20阅读伙伴-6495ED?style=flat-square" alt="Syzygy" />
  <img src="https://img.shields.io/badge/Made%20with-💗%20×%20💙-FFC0CB?style=flat-square" alt="Made with love" />
</p>

---

## 🌸 这是什么？

**All About Book** 是一个为个人阅读打造的独立应用：本地可用、云端可同步、手机可安装。
从「想读一本书」到「读完写下思考」，整个阅读旅程都可以在这里留下痕迹。

## ✨ 功能一览

| 模块 | 说明 |
| --- | --- |
| 🏠 **主页仪表盘** | 阅读统计卡片 + 书架速览 + 数据备份中心 |
| 📖 **书架管理** | 书籍的添加、编辑、删除，封面通过图片 URL 展示 |
| 📅 **阅读打卡** | 书籍详情页的打卡日历，点一下日期即可记录当天的阅读 |
| ✂️ **书摘 & 思考** | 「书摘」「思考」双标签页，摘录佳句、记录问题与感悟 |
| 💬 **Syzygy 讨论** | 和 AI 阅读伙伴围绕当前书籍展开讨论，支持流式回复与上下文携带 |
| 💗 **书摘共鸣** | Syzygy 会在书摘旁留下她的共鸣回应 |
| ☁️ **云端同步** | 登录后书籍、打卡、书摘、讨论均可同步到 Supabase |
| 🎨 **主题切换** | 亮色 / 暗色主题随心切换 |
| 📦 **备份与归档** | JSON 全量备份/恢复，Markdown / HTML 归档导出 |
| 📱 **PWA** | 可安装到手机主屏幕，离线也能翻看 |

## 🛠️ 技术架构

```
┌──────────────────────────────────────────────┐
│  前端  React 19 + TypeScript + Vite 7 (PWA)  │
│  ├─ react-router-dom v7   页面路由            │
│  ├─ react-markdown + GFM  讨论内容渲染        │
│  └─ vite-plugin-pwa       离线缓存与安装      │
├──────────────────────────────────────────────┤
│  数据层（双模式）                              │
│  ├─ 本地模式：localStorage 持久化              │
│  └─ 云端模式：Supabase（魔法链接登录 + RLS）   │
├──────────────────────────────────────────────┤
│  AI 层  Supabase Edge Functions（Deno）       │
│  ├─ openrouter-chat        Syzygy 对话代理    │
│  │   （流式输出 / 限流 / 上下文拼装）           │
│  └─ sync-openrouter-models 模型列表同步        │
└──────────────────────────────────────────────┘
```

- 🔑 **密钥安全**：AI 调用全部走 Edge Function 后端代理，前端不保存任何 API Key。
- 🧊 **本地兜底**：未配置 Supabase 环境变量时，应用自动回落到纯本地模式。
- ⚙️ **Syzygy 可调参**：模型、System Prompt、temperature、top_p、max tokens 均可在设置面板中配置。

### 📂 目录速览

```
src/
├── pages/        主页 / 书架 / 书籍详情 / 登录
├── components/   布局、底部导航、设置弹窗、Syzygy 控制台等
├── lib/          本地存储、云端读写、备份导出、主题上下文
└── types/        书籍、书摘、讨论、思考、共鸣等类型定义
supabase/
├── functions/    openrouter-chat & sync-openrouter-models
└── sql/          各模块的数据库 Schema 与 RLS 策略
```

## 🚀 快速开始

```bash
npm install
npm run dev
```

打开 `http://localhost:5173` 就可以开始使用啦 🎉

其他常用命令：

```bash
npm run build     # 类型检查 + 生产构建
npm run lint      # ESLint 检查
npm run preview   # 预览构建产物
```

### ☁️ 启用 Supabase（可选）

想要魔法链接登录和云端同步的话，在仓库根目录创建 `.env.local`：

```bash
VITE_SUPABASE_URL=你的_supabase_项目地址
VITE_SUPABASE_ANON_KEY=你的_supabase_anon_key
```

没有配置这些环境变量时，应用会自动使用本地存储模式，功能照常可用 🐹

### 🔐 GitHub Actions Secrets

用于 GitHub Pages 构建，需要在仓库添加以下 Secrets：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 📦 备份与归档

主页的「数据备份与归档」卡片提供四个操作：

- 📥 **导出备份（JSON）**：下载 `all-about-book-backup-YYYY-MM-DD.json`，可用于完整恢复
- 📤 **导入备份（JSON）**：选择备份文件并确认覆盖，恢复全部数据
- 📝 **导出归档（Markdown）**：下载 `all-about-book-archive-YYYY-MM-DD.md`
- 🖨️ **导出归档（HTML）**：下载 `all-about-book-archive-YYYY-MM-DD.html`，适合打印

> ⚠️ 导入会**覆盖**现有本地数据（书籍、打卡、书摘），请妥善保管备份文件。

## 🌐 GitHub Pages 子路径 + PWA 注意事项

本项目部署在 GitHub Pages 子路径 `/all-about-book/` 下，Vite 的 `base` 与 PWA 配置需要保持一致：

- Vite `base` 配置为 `/all-about-book/`
- PWA manifest 的 `start_url` 和 `scope` 均为 `/all-about-book/`
- Manifest 图标使用相对路径（`icons/...`），确保解析到子路径而非域名根
- Workbox 导航回退指向 `/all-about-book/index.html`

> 💡 修改 Service Worker 或 manifest 配置后，请先在浏览器中**注销旧的 Service Worker 并清除站点数据**，再进行测试。

---

<p align="center">
  🐹 用心记录每一次阅读 · Made with 💗 × 💙
</p>
