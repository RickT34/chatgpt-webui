# 验收清单

## 自动化

- `npm test`：三种认证模式、配置校验、Secure Cookie、Origin、消息结构化编码、preload 合成事件、目录浏览及取消。
- `npm run test:integration`：HTTP 认证、原 HTML/CSP、共享对象响应回传、真实 App-host 握手、startup.whenReady 与 appInfo.get。
- 无令牌测试需设置 `CHATGPT_WEB_AUTH=none`；代理测试需设置 `CHATGPT_WEB_URL` 为实际 HTTPS 地址。

## 页面与人工反馈

- 已在真实浏览器看到原版首页、项目列表、会话列表和输入框。
- 使用者已报告基本功能测试正常。
- 使用者已确认目录窗口可选宿主机目录，且修复嵌套弹窗冲突后能完成项目操作。
- 每次更新仍应检查：项目创建、目录取消、刷新恢复、消息与审批、连接断开提示。
- 语音、视频、原生拖放、内嵌浏览器、MCP App 沙箱尚未完整验收。

截图 `docs/images/screenshot.png` 的项目、会话和当前项目名称已用不透明区域及示例文字替换；原始图片不入库。用于再生成该图的脚本坐标只对应已审查的固定尺寸截图，不是通用自动脱敏工具。

## 0.1.0 本机集成结果

- 实际生成的 App 分别以 random、custom、none 模式启动，HTTP 认证和 WebSocket Origin 检查全部通过。
- 停止服务后可运行 `node scripts/verify-modes.cjs` 重做三种模式测试；使用临时本机端口，结束后停止测试 App。
- 临时 Nginx + 本地测试证书完成 HTTPS 登录、Secure Cookie、WSS 和真实 App-host RPC 测试。测试仅将临时 CA 提供给 Node 测试进程，未关闭 TLS 校验。
- Nginx 模板部署时仍需替换自己的域名与有效证书，并运行 `nginx -t`；测试不等于已部署到用户域名。

## 自动引导安装验收

- 8 项 Python 回归测试覆盖架构选择、询问/拒绝/非交互模式、SHA-256 失败、缓存复用、tar 越界、Debian 包选择性解包、无效显式路径和原生库缺失。
- 使用已有官方 x64 `.deb` 缓存实测固定 SHA-256 校验和仅 App 文件解包；包下载器的实际 HTTPS 路径通过 Node 下载验证，未重复消耗数百 MB 下载同一 App 包。
- 实际从 nodejs.org 下载 Node 22 LTS、校验并执行成功。
- 隔离 PATH 去掉系统 Python/Node 后，成功通过官方 uv 安装器下载 uv 与 Python 3.12，再使用仓库内 Node 和 App 完成依赖安装、生成副本与启动；uv 校验路径也已复验。
- 仓库内运行时启动后，真实 App-host RPC、preload 返回事件和运行锁检查通过。
- `--check` 在环境完整时成功，在缺失或副本过期时明确退出且不下载。
- ARM64 只实现架构分派及固定包校验信息，尚未在 ARM 硬件实测。

## 附件协议及手动验收

自动测试：

- `npm test` 覆盖宿主机多选/过滤、二进制上传、路径越界、大小限制、连接归属、取消中的上传清理，以及拖放映射和单次重放。
- `node scripts/smoke-attachments.cjs` 使用原 App 的 `vscode://codex/pick-files` 协议，验证宿主机文件、客户端上传后路径、字节一致性和取消结果。不自动操作网页、不发送模型请求。

请手动验证：

1. 原“添加文件”入口选择“客户端文件”，选中文名文本或图片，点击“添加所选文件”，确认附件出现在输入框中。
2. 改选“宿主机文件”，浏览目录、多选文件并确认；文件路径应属于宿主机。
3. 从文件管理器拖入文件到对话输入框，确认上传后附件出现且没有重复。
4. 取消选择或上传，确认不新增附件；超过 32 MiB 的客户端文件应显示错误。
5. 发送一条包含测试附件的消息，确认模型能读取；刷新后检查会话附件引用。

本轮网页与模型读取效果由使用者验收，未将协议测试作为 UI 全链路通过的证据。

## PDF 预览

服务启动后运行：

```sh
node --experimental-vm-modules scripts/smoke-pdf.cjs
```

验证原 PDF Worker 返回 JavaScript MIME、保留 nosniff、内容与原 ASAR 完全一致、模块语法有效且 CSP 允许同源 Worker。此检查不代替实际页面渲染；请手动重新打开 PDF 预览，检查页面内容、翻页和缩放。
