# 修改记录

## 2026-10-08 · 0.1.0

### 原 App 复用

- 检查版本 `26.930.21537` 的 `webview/index.html`、`.vite/build/preload.js` 和原启动入口。
- 生成脚本复制 Electron 可执行文件、链接原依赖资源、重建本地 ASAR 索引；追加适配代码，不修改系统安装包。
- 新入口先启动 HTTP / WebSocket / IPC 桥接，再运行原入口。
- 普通 preload 调用、worker 消息及 capnweb MessagePort 均经过原 App 后端。
- 用结构化编码保留二进制、undefined、BigInt、Date、Map/Set 等值。
- 独立 profile 必须同时使用 `--user-data-dir`；只设置环境变量对该版本太晚。独立 profile 并不隔离宿主机 Codex 存储。
- 使用运行锁、原包校验值和追加生成记录支持升级复用。

### 加载问题修复

- 原 preload 合成消息的 source 为 null；不能只接受 source === window，否则初始化响应会被丢弃。
- 原头像浮窗也暴露桥接接口。将中继固定到首次主 renderer，防止辅助窗口替换连接而触发 Startup renderer is unavailable。
- 保留原 CSP；App 内侧用 IPC，浏览器端只加入配置的 WebSocket 源。
- 已验证网页首页、项目列表、会话列表显示；使用者报告基本功能测试正常。

### 宿主机目录选择

- 主进程接管目录类型的原生 showOpenDialog 请求，以 Web UI 弹窗选择宿主机路径。
- 支持路径输入、主目录、上一级、隐藏目录、目录符号链接；不提供目录创建或任意文件内容接口。
- 返回前验证真实目录，将路径按原生对话框结果结构交回原项目流程。
- 取消和断线释放待完成请求，过期请求 ID 无法操作新选择窗口。
- 选择窗口必须挂到原项目 dialog 内部，避免 Radix 把目录点击识别为 outside-click；同时隔离点击、焦点和 Escape，关闭后恢复原焦点。
- 使用者已手动确认目录选择和创建项目流程成功。

### 开源整理

- 命名为 chatgpt-webui，增加 MIT 许可，仅覆盖新增适配代码。
- README 加入脱敏截图、功能、运行方法、限制与升级流程。
- 默认随机令牌；支持 CHATGPT_WEB_ACCESS_TOKEN 固定令牌及 CHATGPT_WEB_AUTH=none。
- 配置 CHATGPT_WEB_ORIGIN 统一登录 URL、CSP、WebSocket Origin 校验与 Secure Cookie。
- 登录令牌与会话 Cookie 分离，重启轮换 Cookie；令牌使用常量时间比较。
- 增加 Nginx HTTPS / WebSocket 模板；关闭该站点访问日志，避免记录登录令牌。
- 仅进行本地 Git 提交；未创建远程仓库或公开发布。

## 升级检查点

1. 原启动入口、preload 必需接口、HTML 模块入口是否改变。
2. 新 ASAR 是否仍能用原运行时启动；资源目录是否变化。
3. 主窗口和辅助窗口的启动顺序是否变化。
4. capnweb 协议、新增同步调用或可转移对象是否需要适配。
5. 原生目录对话框及项目弹窗结构是否变化。
6. 三种认证模式、Origin 和反代 WebSocket 是否通过测试。
7. 新截图逐区域审查，不能提交原始截图、个人 profile 或会话记录。

## 自动化启动与仓库内安装

- `start.sh` 先检测可用 Python；缺少时经确认用官方 uv 安装器将 uv/Python 安装到 `.deps`，不修改 shell 配置。
- `bootstrap.py` 检查 Node/npm、App、动态库和依赖，逐项确认下载；`--yes` 提供明确预授权，`--check` 不下载，`--setup-only` 不启动。
- 固定 App 26.930.21537 的 amd64/arm64 包和 SHA-256；Node 从官方 Node 22 LTS 清单解析具体版本并校验；不静默切换到新 App 版本。
- 仅抽取 `.deb` 的 usr/lib/chatgpt 子树，不运行系统安装脚本；安全 tar 过滤防止目录穿越和外部符号链接。
- 引导脚本使用 fcntl 锁，并把同一个锁 FD 传给 prepare，最后由 App 持有；移除启动对 flock 命令的依赖。
- 自动识别副本过期并重建；切换系统 App 与本地 App 时刷新资源符号链接。
- `.deps/install-history.jsonl` 记录新下载的 URL、实际 SHA-256 和是否匹配预期校验；Python 构建路径保留具体版本。
- 不能安全下载替代的系统图形库和 libc 只列出缺失项并停止，不修改系统。
