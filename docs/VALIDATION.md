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
