# chatgpt-webui

在浏览器中使用本机 ChatGPT Desktop 的原版界面，管理宿主机上的 Codex 项目和会话。

项目复用已安装 App 的 HTML、JavaScript、CSS 和原后端，通过 WebSocket 适配 Electron 通信。无需重新实现聊天界面，也不直接连接独立的 Codex app-server。

> 非官方实验项目，与 OpenAI 无隶属关系。本仓库只分发适配代码，不包含 ChatGPT 安装包、原版前端资源、账号凭据或会话数据。使用者需要自行安装桌面 App 并完成登录。

## 运行效果

![chatgpt-webui 原版界面](docs/images/screenshot.png)

截图来自实际运行界面；真实项目名、会话标题和当前项目位置已用不透明遮盖及示例名称替换，未包含私人对话内容。

## 功能

- 在浏览器使用原版项目侧栏、会话列表和聊天界面。
- 保留原 App 后端及本机 Codex 配置、工具和会话存储。
- 用网页弹窗浏览**宿主机**文件夹并添加项目，支持路径输入、上一级、主目录和隐藏目录。
- 将普通 IPC、worker 消息和 App-host MessagePort 通信转发到浏览器。
- 支持随机访问令牌、固定访问令牌和无令牌模式。
- 支持 SSH 转发或 Nginx HTTPS / WebSocket 反向代理。
- 用脚本生成可撤销的 App 副本，保留源版本及补丁校验记录，方便升级后重新应用。

基本操作和项目文件夹选择已由使用者手动测试通过；自动检查覆盖认证、目录选择、消息编码和真实 App-host 通信。语音、视频、原生文件拖放、内嵌浏览器及 MCP App 沙箱等功能未完整验收。

## 环境要求

- Linux；当前实测 Arch Linux。
- 已安装 ChatGPT Desktop，默认目录 `/usr/lib/chatgpt`。
- 当前适配版本：`chatgpt-desktop 26.930.21537-1`。
- Node.js 22+、npm、Python 3.11+、`flock`（通常由 util-linux 提供）。
- 约 1 GB 可用空间用于本地 App 副本，另需运行时缓存空间。

这是桌面 App 的浏览器适配层，仍需在宿主机运行 Electron。依赖原 App 私有协议，新版本需要重新测试；暂不承诺其他系统或版本兼容。

## 快速开始

下载本仓库并进入目录：

```sh
npm ci --ignore-scripts
python3 scripts/prepare.py
scripts/start.sh --ozone-platform=headless --disable-gpu
```

打开终端输出的登录链接，例如 `http://127.0.0.1:18765/login?token=...`。当前链接也保存在 `.logs/access-url`。

默认监听 `127.0.0.1:18765`。`Ctrl+C` 停止服务。不带 headless 参数时会显示本机 App 窗口，可用于首次登录：

```sh
scripts/start.sh
```

登录后停止窗口版本，再按需启动 headless 版本。不同 App 版本的登录行为可能不同。

### 三种访问令牌模式

访问令牌只控制本 Web UI 的访问，**不是 OpenAI API Key，也不能代替 App 账号登录**。

**默认：每次启动生成随机令牌**

```sh
scripts/start.sh --ozone-platform=headless --disable-gpu
```

服务重启后旧链接及旧 Cookie 失效，请重新打开 `.logs/access-url` 中的链接。

**自定义固定令牌**

```sh
export CHATGPT_WEB_ACCESS_TOKEN='replace-with-a-long-random-secret'
scripts/start.sh --ozone-platform=headless --disable-gpu
```

至少 16 个字符，建议使用 `openssl rand -hex 32` 生成的随机值。可以由进程管理器注入环境变量，避免写入 Git 或共享脚本。固定令牌使登录链接保持不变；Cookie 每次重启仍会轮换，需要重新打开该链接。

**不使用访问令牌**

```sh
unset CHATGPT_WEB_ACCESS_TOKEN
CHATGPT_WEB_AUTH=none scripts/start.sh --ozone-platform=headless --disable-gpu
```

直接访问 `http://127.0.0.1:18765/`。此模式允许能访问服务的人操作宿主机 App，仅用于可信本机、私有隧道，或已有独立认证的反向代理。不要将无认证入口直接暴露到公网。即使关闭令牌认证，WebSocket 仍检查页面 Origin。

### 配置项

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `CHATGPT_APP_DIR` | `/usr/lib/chatgpt` | **生成副本时**指定已安装 App 路径 |
| `CHATGPT_WEB_PORT` | `18765` | 本机监听端口 |
| `CHATGPT_WEB_AUTH` | `token` | `token` 或 `none` |
| `CHATGPT_WEB_ACCESS_TOKEN` | 随机生成 | 自定义访问令牌；不要与 `none` 同时设置 |
| `CHATGPT_WEB_ORIGIN` | `http://127.0.0.1:<端口>` | 浏览器实际访问的完整源，如 `https://chatgpt.example.com` |

`CHATGPT_WEB_ORIGIN` 只接受协议、域名和可选端口，不支持路径前缀。它同时控制登录链接、WebSocket Origin 校验、CSP 和 HTTPS Cookie 的 Secure 属性。

更改安装目录或端口的例子：

```sh
CHATGPT_APP_DIR=/path/to/chatgpt python3 scripts/prepare.py
CHATGPT_WEB_PORT=18766 scripts/start.sh --ozone-platform=headless --disable-gpu
```

## 远程访问

### SSH 隧道

在访问端执行：

```sh
ssh -N -L 18765:127.0.0.1:18765 user@target-machine
```

然后打开目标机器 `.logs/access-url` 中的链接。若本地端口不同，宿主机启动时将 `CHATGPT_WEB_ORIGIN` 设置为浏览器访问的地址和端口。

### Nginx 反向代理

完整模板：[deploy/nginx.conf](deploy/nginx.conf)。适用于 Nginx 与 Web UI 在同一台机器，通过独立域名的根路径提供服务。

1. 将模板中的 `chatgpt.example.com` 和 TLS 证书路径换为自己的配置。
2. 将模板放到 Nginx `http {}` 包含的配置目录，如 `/etc/nginx/conf.d/`。
3. 用对应的外部地址启动 App：

```sh
export CHATGPT_WEB_ORIGIN=https://chatgpt.example.com
export CHATGPT_WEB_ACCESS_TOKEN='replace-with-a-long-random-secret'
scripts/start.sh --ozone-platform=headless --disable-gpu
```

4. 执行 `sudo nginx -t`，通过后再重新加载 Nginx。
5. 打开终端输出的 **HTTPS** 登录链接。

模板已包含 WebSocket Upgrade、长连接超时和关闭代理缓冲。该站点关闭 access log，避免记录登录 URL 中的令牌。不要移除 Origin 校验来解决连接问题，应确保 `CHATGPT_WEB_ORIGIN` 与浏览器地址完全一致。

## 更新、回滚和数据位置

更新 App 后，先停止 Web UI，再执行：

```sh
npm ci --ignore-scripts
python3 scripts/prepare.py
scripts/start.sh --ozone-platform=headless --disable-gpu
```

生成脚本与启动脚本共用锁，避免运行中替换 ASAR。原安装包不会被改写；停止副本后直接使用原桌面 App 即可回滚。

| 路径 | 内容 |
| --- | --- |
| `.runtime/` | 可重新生成的 App 副本及资源链接 |
| `.profile/` | 独立 Electron 登录、偏好和缓存，升级时保留 |
| `.logs/access-url` | 当前访问入口，包含令牌时属于凭据 |
| `prepare-manifest.json` | 本次源 App 版本、SHA-256 和补丁 SHA-256 |
| `.logs/prepare-history.jsonl` | 每次生成操作的追加记录 |

以上路径均被 Git 忽略。**独立 Electron profile 不代表隔离 Codex 数据**：App 后端仍访问宿主机的配置、文件及会话。不要从多个 App 实例同时操作同一会话。

目前仅允许一个浏览器 WebSocket 连接。遇到连接冲突时，关闭其他已连接标签页再重试。

## 开发与验证

```sh
npm test
# App 已启动且浏览器连接已关闭时：
npm run test:integration
# 无令牌模式的集成检查：
CHATGPT_WEB_AUTH=none npm run test:integration
```

反代环境测试时同时设置 `CHATGPT_WEB_URL=https://chatgpt.example.com`。测试会读取 `.logs/access-url`，只做目录和 App 信息读取，不创建会话、不发送模型请求。

```text
原版网页 → electronBridge / MessagePort 适配 → WebSocket
       → 原 Electron 主进程 → 原 renderer / preload → 原 App 服务
```

文件夹选择适配只接管已连接 Web UI 的目录选择请求；文件上传、原生菜单、语音等需要单独适配。每次升级应按 [验收清单](docs/VALIDATION.md)检查。

[修改记录](docs/OPERATIONS.md) · [MIT License](LICENSE)

MIT 许可仅适用于本仓库新增代码。ChatGPT 名称、界面和安装资源属于其各自权利人，不随本项目授权或分发。
