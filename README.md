# chatgpt-webui

**简体中文** | [English](README.en.md)

在浏览器中远程使用 ChatGPT Desktop 的原版界面，管理宿主机上的 Codex 项目和会话。

项目复用已安装 App 的 HTML、JavaScript、CSS 和原后端，通过 WebSocket 适配 Electron 通信。

> 非官方实验项目，与 OpenAI 无隶属关系。本仓库只分发适配代码，不包含 ChatGPT 安装包、原版前端资源、账号凭据或会话数据。使用者需要自行安装桌面 App 并完成登录。

## 运行效果

![chatgpt-webui 原版界面](docs/images/screenshot.png)


## 功能

- 在浏览器使用原版项目侧栏、会话列表和聊天界面。
- 保留原 App 后端及本机 Codex 配置、工具和会话存储。
- 用网页弹窗浏览**宿主机**文件夹并添加项目，支持路径输入、上一级、主目录和隐藏目录。
- 将普通 IPC、worker 消息和 App-host MessagePort 通信转发到浏览器。
- 支持随机访问令牌、固定访问令牌和无令牌模式。
- 支持 SSH 转发或 Nginx HTTPS / WebSocket 反向代理。
- 用脚本生成可撤销的 App 副本，保留源版本及补丁校验记录，方便升级后重新应用。

## 对话附件：客户端或宿主机

在对话中使用原来的“添加文件”入口，会出现两种来源：

- **客户端文件**：选择浏览器所在设备上的文件，上传到宿主机后交给原 App 添加附件。
- **宿主机文件**：浏览运行 App 的机器，选择一个或多个文件，直接使用宿主机路径，不经过浏览器复制文件内容。

也可以把客户端文件拖入原对话输入框。适配层会先上传文件、补全宿主机路径，再交由原 App 的拖放流程处理。暂不支持拖入客户端文件夹；原选择器的文件类型限制仍然生效。

客户端上传限制为**单文件 32 MiB**，与 Nginx 模板一致。文件保存在 `.uploads/` 下的独立目录，该目录不入 Git。取消或失败的上传会清理；已交给 App 的文件保留，避免历史对话引用失效。从原 UI 移除附件不会自动删除落盘文件，确认会话不再使用后再手动清理。

新增附件协议测试与拖放处理单元测试已通过。网页实际交互留待手动验收；协议测试不发送模型请求。

## 浏览器端日常操作

- **复制文字/链接**：App-host 的文本剪贴板服务改为浏览器 Clipboard API；若浏览器要求用户手势，会弹出确认复制窗口。取消或复制失败不会向原界面报告成功。
- **右键菜单**：启用原前端自带的网页菜单，不再调用宿主机原生菜单。
- **另存为/保存副本**：保存窗口在网页中选择下载文件名。原 App 完成写入后提供客户端下载；浏览器阻止自动下载时，可点击保留的下载链接。
- **本地资源**：将 `app://fs/...` 映射为带认证的 `/@fs/...`，支持图片、图标、PDF、字体等资源及 Range 请求。资源响应带限制性 CSP，HTML/脚本不作为同源可执行内容提供。

下载中转文件位于 `.downloads/`，不入 Git。当前进程中的下载链接在重启后失效；中转文件需在确认不再使用后手动清理。网页客户端是受信任的远程控制端，资源请求以宿主机进程的文件读取权限执行。

这些适配通过了协议和单元测试，网页行为仍需手动验收。`<webview>` / MCP 沙箱、多客户端连接、自动重连、拖出到客户端文件管理器、系统通知、全局快捷键和音视频完整链路尚未补齐。外部编辑器/文件管理器打开操作仍发生在宿主机。

## 环境要求

- Linux；当前实测 Arch Linux。
- ChatGPT Desktop：可复用已安装版本；未安装时会询问并下载到仓库。
- 当前适配版本：`chatgpt-desktop 26.930.21537-1`。
- Node.js 22+/npm 与 Python 3.11+：启动脚本自动检测，缺失时询问并本地安装。
- 首次自动下载建议至少 3 GiB 空间；基本引导工具为 POSIX shell、curl 或 wget、tar、sha256sum，以及 Linux `ldd`。
- 宿主系统须具备 Electron 所需的 glibc、GTK、NSS 等原生库；启动前会检测缺失项。

## 快速开始

下载本仓库并进入目录：

```sh
scripts/start.sh --ozone-platform=headless --disable-gpu
```

首次启动会依次检查 Python、Node/npm、App、原生动态库和项目依赖。需要下载时会显示来源、版本与目标路径，并询问 `Continue [y/N]`；直接回车或输入 `n` 会停止。

```sh
# 仅检查环境
scripts/start.sh --check

# 完成环境安装和副本准备，但不启动 App
scripts/start.sh --setup-only

# 明确同意所有仓库内下载，适合无交互环境
scripts/start.sh --yes --setup-only
scripts/start.sh --yes --ozone-platform=headless --disable-gpu
```

`--help` 查看入口选项，其他参数原样传递给 Electron。

自动安装范围：

| 组件 | 来源及版本 | 仓库内位置 |
| --- | --- | --- |
| ChatGPT Desktop | [官方 Linux 分发源](https://learn.chatgpt.com/docs/linux/linux-app)，固定已适配的 `26.930.21537`，按 x64 / ARM64 选择| `.deps/chatgpt-<版本>-<架构>/` |
| Node.js + npm | [nodejs.org](https://nodejs.org/dist/latest-v22.x/)，安装时解析 Node 22 LTS 当前版本| `.deps/node/` |
| Python | [Astral uv](https://docs.astral.sh/uv/guides/install-python/) 获取 Python 3.12 standalone 构建| `.deps/python/`、`.deps/uv/` |
| npm 依赖 | `package-lock.json`，执行 `npm ci --ignore-scripts` | `node_modules/`，缓存 `.deps/cache/` |

App 的 `.deb` **仅解包 App 文件，不需要 sudo**。

打开终端输出的登录链接，例如 `http://127.0.0.1:18765/login?token=...`。当前链接也保存在 `.logs/access-url`。

默认监听 `127.0.0.1:18765`。`Ctrl+C` 停止服务。不带 headless 参数时会显示本机 App 窗口，可用于首次登录：

```sh
scripts/start.sh
```

登录后停止窗口版本，再按需启动 headless 版本。

### 下载代理

启动脚本会统一为 curl、Python 下载器、uv 和 npm 传递代理配置，优先级为：

1. `CHATGPT_WEB_PROXY` 显式指定。
2. 已导出的 `http_proxy` / `https_proxy` / `all_proxy`（也接受大写；同名时小写优先）。
3. 没有上述配置时，读取 KDE 或 GNOME 的**手动代理**设置。

`ALL_PROXY` 会补齐下载工具需要的 HTTP/HTTPS 变量；`NO_PROXY` / `no_proxy` 保留并同步给 npm。大文件优先由 curl 下载，支持 HTTP(S) 和 SOCKS 代理；没有 curl 时的 Python 回退只支持 HTTP 代理。不同工具对 SOCKS 的支持可能受其版本影响，使用代理软件的 HTTP/mixed 端口兼容性最好。

```sh
# 明确指定本机代理软件的 HTTP/mixed 端口
CHATGPT_WEB_PROXY=http://127.0.0.1:7890 scripts/start.sh --setup-only

# 继承常规系统代理环境变量
export HTTPS_PROXY=http://127.0.0.1:7890
export NO_PROXY=localhost,127.0.0.1,::1
scripts/start.sh --setup-only

# 本次禁用代理，包括桌面自动发现
CHATGPT_WEB_PROXY= scripts/start.sh --setup-only
```

不执行 PAC 脚本，也不读取仅存在于浏览器扩展中的代理；此类情况请显式提供代理地址。GNOME 手动代理自动发现不读取认证密码，需要认证时可用带凭据的 `CHATGPT_WEB_PROXY` 环境变量。脚本的代理来源提示不输出地址或凭据，配置不会写入仓库。仅设置 shell 别名而未 export 的变量不能被子进程继承。

### 三种访问令牌模式

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

至少 16 个字符，建议使用 `openssl rand -hex 32` 生成的随机值。

**不使用访问令牌**

```sh
unset CHATGPT_WEB_ACCESS_TOKEN
CHATGPT_WEB_AUTH=none scripts/start.sh --ozone-platform=headless --disable-gpu
```

直接访问 `http://127.0.0.1:18765/`。此模式允许能访问服务的人操作宿主机 App，仅用于可信本机、私有隧道，或已有独立认证的反向代理。**不要将无认证入口直接暴露到公网**。

### 配置项

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `CHATGPT_APP_DIR` | 自动发现 | 指定已安装或手动解包的 App 目录 |
| `CHATGPT_WEB_PROXY` | 环境/桌面手动代理 | 统一下载代理；空值禁用代理 |
| `CHATGPT_WEB_PYTHON` | 系统或本地 Python | 显式指定引导 Python 路径 |
| `CHATGPT_WEB_SETUP_YES` | `0` | `1` 等同 `--yes`，同意仓库内安装 |
| `CHATGPT_WEB_PORT` | `18765` | 本机监听端口 |
| `CHATGPT_WEB_AUTH` | `token` | `token` 或 `none` |
| `CHATGPT_WEB_ACCESS_TOKEN` | 随机生成 | 自定义访问令牌；不要与 `none` 同时设置 |
| `CHATGPT_WEB_ORIGIN` | `http://127.0.0.1:<端口>` | 浏览器实际访问的完整源，如 `https://chatgpt.example.com` |

更改安装目录或端口的例子：

```sh
CHATGPT_APP_DIR=/path/to/chatgpt scripts/start.sh --setup-only
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

应确保 `CHATGPT_WEB_ORIGIN` 与浏览器地址完全一致。

## 更新、回滚和数据位置

更新 App 后，先停止 Web UI，再执行：

```sh
scripts/start.sh --ozone-platform=headless --disable-gpu
```

启动时会检查原 ASAR 与补丁的校验值，仅在缺失或变化时重新生成副本；切换来源时同步更新资源链接。

数据位置：

| 路径 | 内容 |
| --- | --- |
| `.deps/` | 本地工具、App 下载、缓存及安装记录，不入库 |
| `.runtime/` | 可重新生成的 App 副本及资源链接 |
| `.downloads/` | 客户端下载中转文件；下载链接在服务重启后失效 |
| `.uploads/` | 已交给 App 的客户端附件，仍被会话引用时应保留 |
| `.profile/` | 独立 Electron 登录、偏好和缓存，升级时保留 |
| `.logs/access-url` | 当前访问入口，包含令牌时属于凭据 |
| `prepare-manifest.json` | 本次源 App 版本、SHA-256 和补丁 SHA-256 |
| `.logs/prepare-history.jsonl` | 每次生成操作的追加记录 |

以上路径均被 Git 忽略。

目前仅允许一个浏览器 WebSocket 连接。遇到连接冲突时，关闭其他已连接标签页再重试。

## 开发与验证

```sh
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
# App 已启动且浏览器连接已关闭时：
npm run test:integration
# 附件协议测试，不自动操作网页：
node scripts/smoke-attachments.cjs
# 剪贴板 RPC、保存副本和本地资源协议检查：
node scripts/smoke-native.cjs
# PDF Worker 资源检查：
node --experimental-vm-modules scripts/smoke-pdf.cjs
# 无令牌模式的集成检查：
CHATGPT_WEB_AUTH=none npm run test:integration
```

反代环境测试时同时设置 `CHATGPT_WEB_URL=https://chatgpt.example.com`。测试会读取 `.logs/access-url`，只做目录和 App 信息读取，不创建会话、不发送模型请求。

```text
原版网页 → electronBridge / MessagePort 适配 → WebSocket
       → 原 Electron 主进程 → 原 renderer / preload → 原 App 服务
```

[修改记录](docs/OPERATIONS.md) · [MIT License](LICENSE)

MIT 许可仅适用于本仓库新增代码。ChatGPT 名称、界面和安装资源属于其各自权利人，不随本项目授权或分发。
