# LLM Ping

一个部署在 Cloudflare Worker 上的轻量探测站点，用于快速验证 OpenAI 及 OpenAI-compatible 服务是否可用。

它提供一个单页界面，支持：

- 输入 `apiKey` 和 `baseUrl`
- 调用上游 `/v1/models` 获取模型列表
- 选择模型发起最小调用
- 查看延迟、状态、结果摘要与错误信息

## 部署教程

当前项目的推荐发布方式：

- 在 Cloudflare Dashboard 中为 Worker `llm-ping` 绑定自定义域名
- 通过 Cloudflare Workers Builds 自动从 GitHub 拉取代码并更新 Worker

### 前置条件

- 已开通 Cloudflare Workers
- 本地已安装 Node.js 和 npm
- 域名已托管到对应 Cloudflare 账号
- GitHub 仓库可被 Cloudflare 访问

### 部署步骤

1. 在 Cloudflare Dashboard 中创建或确认 Worker：`llm-ping`
2. 在 `Workers & Pages` 中为 Worker 绑定自定义域名：`llm-ping.32r4.asia`
3. 在 Cloudflare 中启用 Workers Builds 并连接 GitHub 仓库
4. 选择生产分支，通常为 `main`
5. 推送代码到生产分支，等待 Cloudflare 自动部署
