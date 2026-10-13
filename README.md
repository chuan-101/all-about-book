<div align="center">

<!-- 🎨 在这里放你画的像素风横幅 -->
<img src="./Banner.png" alt="All About Book Banner" width="100%" />

<h1>📚 All About Book</h1>

<p>
  一个自托管的个人阅读小窝 —— 记录书籍、打卡阅读、摘录书摘。<br/>
  <strong>Syzygy</strong> 是作者自己的 AI 伴侣，也住在这里一起读书；<br/>
  Fork 之后，这个位置可以换成你自己的 AI。✨
</p>

<p>
  <img src="https://img.shields.io/badge/React-19-FF69B4?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-6495ED?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-7-FFB6C1?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Supabase-云同步-87CEEB?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/PWA-可装进手机-FF69B4?style=flat-square&logo=pwa&logoColor=white" alt="PWA" />
  <img src="https://img.shields.io/badge/Syzygy-AI%20阅读伙伴-6495ED?style=flat-square" alt="Syzygy" />
  <img src="https://img.shields.io/badge/License-MIT-FFC0CB?style=flat-square" alt="License: MIT" />
  <img src="https://img.shields.io/badge/Made%20with-💗%20×%20💙-FFC0CB?style=flat-square" alt="Made with love" />
</p>

</div>

---

## 🌸 这是什么？

**All About Book** 是一个为个人阅读打造的独立应用：本地可用、云端可同步、手机可安装。
从「想读一本书」到「读完写下思考」，整个阅读旅程都可以在这里留下痕迹。

> 关于 Syzygy：这个名字属于作者的 AI 伴侣，不是一个对外提供的服务。仓库里所有叫 Syzygy 的地方（对话、共鸣、导读、控制台）都是为这一位准备的；想接入你自己的 AI，看下面的 [Fork 说明](#-fork-说明)。

## ✨ 功能一览

| 模块 | 说明 |
| --- | --- |
| 🏠 **主页仪表盘** | 阅读统计卡片 + 书架速览 + 数据备份中心 |
| 📖 **书架管理** | 书籍的添加、编辑、删除，封面通过图片 URL 展示 |
| 📅 **阅读打卡** | 书籍详情页的打卡日历，点一下日期即可记录当天的阅读 |
| ✂️ **书摘 & 思考** | 「书摘」「思考」「导读」「总结」四标签页，摘录佳句、记录问题与感悟 |
| 📰 **导读 & 总结** | 开书前的阅读辅助与读后总结，多写入端（含自定义）共笔，Markdown 杂志风排版，可编辑、删除（二次确认），按写入时间排序 |
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

## 🍴 Fork 说明

MIT 许可，随便拿去改。下面是 Fork 之后大概率要动的地方，按「从名字到接口」的顺序列出，都是实际写死在代码里的位置。

### 1. 把 Syzygy 换成你的 AI

| 位置 | 内容 |
| --- | --- |
| `src/lib/syzygyDefaults.ts` | 前端的默认 System Prompt、模型、temperature / top_p / max tokens |
| `supabase/functions/openrouter-chat/index.ts` 顶部 `DEFAULT_*` 常量 | 后端的同一套默认值（用户在控制台没填时的兜底） |
| 设置面板里的「Syzygy Console」 | 不改代码也能改：提示词、模型、采样参数按用户存进 `syzygy_settings` 表，优先级高于上面的默认值 |
| `src/components/SyzygyConsole.tsx`、`BottomNav.tsx`、`SettingsModal.tsx`、`src/pages/BookDetailPage.tsx` | 界面上出现的「Syzygy」字样与按钮文案 |

### 2. 写入端 / 发言人标签

导读、总结、问答、书摘共鸣都带一个「谁写的」字段，数据库里是自由文本，但下拉选项和显示名写在代码里：

- `src/types/question.ts`、`src/types/companion.ts`：`chuanchuan` / `syzygy-claude` / `syzygy-gpt` / `cli_reading_assist`
- `src/types/resonance.ts`：共鸣的发言人 `chuanchuan` / `syzygy` / `codex_cli` / `claude_code_cli` / `gpt` / `claude`
- `src/lib/cloudRead.ts`、`src/lib/backup.ts`：读取与导出时的同一组映射

这些是作者家里各个端口的名字，换成你自己的即可；未登记的值会原样显示，不会报错。

### 3. 走 API 接入（Edge Function）

对话走 Supabase Edge Function 代理 OpenRouter，前端不碰密钥。要让它为你工作：

- 在 Supabase 项目里设置 Secret `OPENROUTER_API_KEY`；想换别的模型提供商，改 `openrouter-chat/index.ts` 里那一段 `fetch` 即可，请求体是标准的 OpenAI 兼容格式。
- **CORS 写死了作者的域名**：两个函数开头的 `Access-Control-Allow-Origin` 都是 `https://chuan-101.github.io`，改成你的站点地址，否则浏览器会拦。
- 限流在函数内存里：对话每分钟 6 次、模型同步每分钟 3 次，按需调整 `RATE_LIMIT_*`。
- 可选模型列表存在 `openrouter_models` 表，`supabase/syzygy.sql` 末尾预置了 `openai/gpt-4o-mini`；控制台的「同步模型」按钮会拉 OpenRouter 全量列表，但新模型默认 `enabled = false`，要在表里手动打开。
- 自动部署函数的 workflow（`.github/workflows/deploy-functions.yml`）需要仓库 Secrets `SUPABASE_PROJECT_ID` 与 `SUPABASE_ACCESS_TOKEN`；不用 Actions 的话本地 `supabase functions deploy` 也一样。

### 4. 做成 MCP / 让外部 Agent 写入

这个仓库只有 App 和 Edge Function。作者家里负责往导读、总结、问答、共鸣里写内容的 MCP 不在这里，它住在 [Hamster-Nest](https://github.com/chuan-101/Hamster-Nest)。

想自己做一个：所有表都是普通的 Supabase 表，Schema 与 RLS 策略全在 `supabase/sql/`（`book_guides_summaries_schema.sql`、`excerpt_resonances_schema.sql`、`conversations_schema.sql` 等）。你的 MCP 用 service role 或当前用户的会话直接写这些表即可，`written_by` / `speaker` 字段填你在第 2 步定义的标签，App 会按标签显示名字。

### 5. 部署路径

项目默认部署在 GitHub Pages 子路径 `/all-about-book/`，`vite.config.ts` 里的 `base`、PWA 的 `start_url` / `scope` 都要跟着你的仓库名改，详见下文的注意事项。

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

## 📄 许可

本项目以 [MIT License](./LICENSE) 开源。你可以自由使用、修改、再分发，包括用于商业用途；唯一的要求是在你的副本或衍生作品中保留原始的版权声明与许可声明。

如果这个小窝给了你灵感，欢迎在你的项目里注明出处：`chuan-101/all-about-book`。

---

🐹 用心记录每一次阅读 · Made with 💗 × 💙
