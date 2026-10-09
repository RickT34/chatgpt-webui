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

## 客户端与宿主机附件

- 文件选择请求继续使用原 App 的 `pick-files` / `showOpenDialog` 流程。目录请求仍交给项目目录选择器，文件请求显示双来源附件窗口。
- 宿主机文件支持目录浏览、隐藏项、多选、原始扩展名过滤及普通文件校验。
- 客户端文件使用带认证和 Origin 检查的 HTTP 上传，不将文件字节塞进 WebSocket JSON。文件名检查防止越界，写入独立 UUID 目录，单文件上限 32 MiB。
- 上传批次绑定当前浏览器连接；取消批次及断线清理未提交上传，已交给原 App 的附件保留在 `.uploads/`。
- 拖放先上传客户端 File，再提供同步 getPathForFile 映射并只重放一次 drop；保留原文件对象与字节，原 App 决定最终附件处理方式。
- 页面已切换、目录拖入和上传失败会提示错误。普通文字拖拽不被拦截。
- 文件窗口沿用嵌套弹窗、焦点与 Escape 隔离，避免关闭底层对话框。
- 根据使用者要求，本轮不做网页自动交互。后端/协议验证通过，手动验收步骤见 VALIDATION.md。

## PDF 预览修复

- 原 PDF.js 使用 `pdf.worker.*.mjs` 模块 Worker。静态服务此前没有 `.mjs` 映射，返回 application/octet-stream，导致浏览器拒绝加载。
- 为 `.mjs` 返回 text/javascript，同时补齐 `.pdf` 的 application/pdf。继续保留 nosniff 和原 CSP。
- 新增 `scripts/smoke-pdf.cjs`：直接检查实际 HTTP Worker 响应类型、与原 ASAR 的字节一致性、模块语法及 worker-src CSP。
- 协议检查通过；按使用者要求不执行网页自动交互，PDF 实际渲染由使用者验收。

## 自动依赖下载代理修复

- 在 Python/uv 引导之前加载 `scripts/proxy.sh`，规范代理变量的大小写、ALL_PROXY 回退和 NO_PROXY，并传递给 npm。
- 优先使用显式 CHATGPT_WEB_PROXY，其次环境变量，再读取 KDE/GNOME 手动代理；空值可禁用自动发现。配置内容按数据读取，不执行桌面配置文件。
- 大文件下载优先使用 curl，代理凭据通过环境传递；保留 HTTPS、重定向协议限制和 SHA-256 校验。没有 curl 时显式构造 urllib HTTP 代理，SOCKS/HTTPS 代理提示安装 curl。
- 不在来源提示中输出代理地址或认证信息，不写入 npmrc 或系统配置。
- 不执行 PAC；GNOME 代理认证凭据需通过显式环境变量提供。

## 2026-10-09 · 客户端日常操作适配

- 使用 capnweb 的两端 RPC 中继替换 App-host clipboard 服务为客户端实现，其他服务和原前端回调继续双向转发；不依赖私有 RPC 导出表编号。
- 原前端必须使用 RpcPromise 暴露异步属性，不能直接返回原生 Promise。回归测试覆盖文本写入、读取、拒绝传播和其他服务/回调转发。
- 不再暴露 electronBridge.showContextMenu，让原前端的 disable-native 分支使用既有网页菜单。
- 接管 showSaveDialog，使用网页文件名窗口；仅对本适配器发出的中转路径，在 writeFile/copyFile/rename 或输出流完成后宣布可下载。普通工作区文件写入不触发下载。
- 增加受原登录认证保护的下载和 /@fs 资源接口，支持字节范围与 HEAD。下载使用 Content-Disposition attachment；本地资源带 sandbox CSP、nosniff，HTML/JS 作为普通文本提供。
- 对原静态模块的 app://fs 源常量及 RPC 中的完整资源 URL 做转换。不改变普通文字中引用该协议的句子，不转换二进制消息。
- capnweb 从开发依赖调整为运行依赖；新增代码随自动准备流程写入副本。
- 真实原 App 协议测试已通过：workspaceFiles.saveCopy、save-file、客户端下载字节、未登录资源拒绝和 Range 响应。未自动操作网页。
- 后续范围：webview/MCP、媒体、辅助窗口、拖出文件、多连接及重连仍保留已知限制。
