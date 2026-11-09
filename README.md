[README.md](https://github.com/user-attachments/files/26425568/README.md)
[README.md](https://github.com/user-attachments/files/26425568/README.md)
# openUBMC CSR 拓扑图形化编辑器

> **[🚀 项目启动页 — 在线预览全部模块](https://cinnnnnnndy.github.io/BMC/launch.html)**
> **[BMC-explore 工作地图（GitHub Pages）](https://charlottezhuang97-jpg.github.io/BMC-explore/BMC-%E6%8E%A2%E7%B4%A2/%E5%B7%A5%E4%BD%9C%E5%9C%B0%E5%9B%BE-CSR%E5%8D%8F%E4%BD%9C.html)**

将 CSR (Component Self-description Record) 的 JSON 文本转化为可视化拓扑树，支持拖拽操作、事件配置、传感器配置与仿真调试。

基于 [openUBMC 板卡适配指南](https://www.openubmc.cn/docs/zh/development/tool_guide/board_integration_guide.html) 设计。

## Web 工具（推荐）

独立 Web 应用，在浏览器中直接使用：

```bash
cd web-app
npm install
npm run dev
```

浏览器打开 http://localhost:5173 ，上传 `.sr` 文件或粘贴 JSON 即可编辑，修改后点击「下载保存」导出。

## 功能模块

### 1. 拓扑图形化编辑器
- 使用 **React Flow** 展示 ManagementTopology 的链路拓扑
- 节点类型：Anchor、Bus（I2C/JTAG/GPIO 等）、Chip、Connector
- 支持拖拽调整布局、连线表示拓扑关系

### 2. 事件配置
- 表单式配置 Event 对象
- 支持从 event_def.json 预定义模板选择 EventKeyId
- 配置 Reading、Condition、Component、DescArg 等字段

### 3. 传感器配置
- **Scanner**：配置 Chip 引用、Offset、Size、Period 等
- **ThresholdSensor**：配置 Reading、EntityId、上下限阈值等

### 4. 仿真调试
- 为 Scanner 设置模拟 Value
- 查看 ThresholdSensor 的 Reading 依赖及仿真取值

## 技术栈

- **前端**: React + TypeScript + React Flow
- **数据**: 直接读写本地 `.sr` JSON 文件（VS Code Extension API）
- **运行**: VS Code WebView Panel，打包为 `.vsix` 安装到 openUBMC Studio

## 安装

```bash
# 打包
npm run compile
npx @vscode/vsce package --no-dependencies

# 在 VS Code / openUBMC Studio 中安装
code --install-extension openubmc-csr-topology-editor-0.1.0.vsix
```

## 使用

1. 在 openUBMC Studio 中打开 vpd 工作空间
2. 右键任意 `.sr` 文件，选择「打开方式」→「CSR 拓扑图形化编辑器」
3. 或通过命令面板执行「打开 CSR 拓扑编辑器」

## 项目结构

```
csr-topology-editor/
├── src/                 # Extension 源码
│   ├── extension.ts
│   ├── editorProvider.ts
│   ├── webviewContent.ts
│   └── types.ts
├── webview/              # WebView 前端 (React)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── csrParser.ts   # JSON <-> Flow 转换
│   │   ├── components/
│   │   │   ├── TopologyView.tsx
│   │   │   ├── EventConfig.tsx
│   │   │   ├── SensorConfig.tsx
│   │   │   └── Simulator.tsx
│   │   └── ...
│   └── dist/             # 构建产物
└── package.json
```

## CSR 结构说明

CSR 核心包含：
- **ManagementTopology**: 链路拓扑（Anchor → Buses → Chips/Connectors）
- **Objects**: 器件对象定义（Chip、Scanner、ThresholdSensor、Event 等）

数据格式为 JSON，详见 openUBMC 社区文档。

## Demo 经验沉淀

2026.07 一个月 demo 开发周期的设计经验归档：

- [BMC Demo 一个月经验复盘](https://claude.ai/code/artifact/5e0c430f-c2a0-4582-9d99-6c2c0b896144) — 项目复盘总结
- [暗色 IDE 设计手册 v5](https://claude.ai/code/artifact/e21f946d-5954-4da0-9d6f-f92cb4e5e679) — 完整设计系统：配色、视觉原则、IDE 布局、9 类脚手架、R1-R8 自动检查
- [HPC 拓扑查看器 · 概念解码器](https://claude.ai/code/artifact/bfdf8f0a-d916-40f0-8897-f8686b4be767) — 3D 拓扑可视化方案
- [通信可视化 · 任务化 UX 校验清单](https://claude.ai/code/artifact/85f205a5-bf68-4b1f-9492-65e47bb94e9a) — UX 校验流程
- [HPM 签名配置 × CSR 出包](https://claude.ai/code/artifact/fcb11b65-c9eb-4146-8e2f-8708de2bdc66) — PTO 优化版配置页

### Claude Code Skills

仓库内置两个 skill，在 Claude Code 会话中自动可用：

| Skill | 路径 | 用途 |
|-------|------|------|
| **design-system** | `.claude/skills/design-system/` | 暗色 IDE 设计系统完整参考（配色/布局/组件/脚手架/R1-R8 规则）+ PTO Design System 原始指南 |
| **public-page-scaffold** | `.claude/skills/public-page-scaffold/` | 新建 public/ 页面时自动填充 boilerplate，消除 R1/R2 违规源头 |

视觉约束自动检查：`node scripts/check-ui-style.mjs`（R1-R8 规则，PostToolUse hook 自动运行）。
