# Developer Guide

这份文档用于快速建立项目地图：系统边界、核心不变量、代码入口和常见改动路径。

## 心智模型

```text
Project -> Prompt -> Prompt Version -> Label -> Public Read
```

- 管理端 `/api/v1/**` 创建版本、移动 label、管理 Project API Token。
- 业务端 `/api/public/v1/**` 用 Project API Token 读取已发布 Prompt。
- PostgreSQL 负责保存版本、label、history、Token hash，并用约束和触发器保护不变量。

## 不变量

- `prompt_key` 只要求项目内唯一。
- Prompt 内容只写入 `prompt_version`，版本创建后不可修改。
- 新建版本会递增 `version`，并自动移动 `latest`。
- `latest` 只能系统维护，不能通过管理接口发布或回滚。
- 公开 API 禁止读取 `latest`，也不接受 `project_id`；项目由 Token 决定。
- Label 只能指向同一条 Prompt 的版本。
- Label 移动使用 `expected_current_version` 做乐观并发控制。
- Project API Token 明文只返回一次，数据库只保存 SHA-256 hash。
- 已归档 Project/Prompt 会阻止写入，并从公开读取中隐藏。

## 代码入口

启动与装配：

- `src/server.ts`：加载配置、创建数据库连接池、启动 Fastify。
- `src/app.ts`：注册健康检查、认证 hook、路由和错误处理。
- `src/config.ts`：环境变量 schema。

业务模块：

- `src/project/routes.ts` / `src/project/service.ts`：Project 和 Project API Token。
- `src/prompt/routes.ts` / `src/prompt/service.ts`：Prompt、Version、Label、Diff。
- `src/public/routes.ts`：业务读取接口。
- `src/auth.ts`：管理员 Token 和 Project API Token 验证。
- `src/prompt/schemas.ts`：管理端输入校验。
- `src/prompt/variables.ts`：`{{variable}}` 提取。

数据库和 UI：

- `migrations/`：schema 变更。
- `src/db/migrate.ts`：按文件名顺序执行迁移。
- `src/db/pool.ts`、`src/db/transaction.ts`：数据库连接和事务 helper。
- `src/ui/routes.ts`、`web/`：静态 Web 管理界面。

## API 地图

管理接口需要 `Authorization: Bearer <ADMIN_API_TOKEN>`：

| 能力 | 入口 |
| --- | --- |
| Project CRUD/归档/永久删除 | `/api/v1/projects` |
| Prompt CRUD/归档/永久删除 | `/api/v1/projects/:projectId/prompts`、`/api/v1/prompts/:promptId` |
| Version 创建/查看 | `/api/v1/prompts/:promptId/versions` |
| Version diff | `/api/v1/prompts/:promptId/versions/:version/diff?base_version=...` |
| Label 发布/回滚/历史 | `/api/v1/prompts/:promptId/labels/:label` |
| Project Token 创建/列表/吊销 | `/api/v1/projects/:projectId/api-tokens` |

公开接口使用 Project API Token：

```text
GET /api/public/v1/prompts/:promptKey?label=production
```

## 常见开发任务

新增或调整 API：

- 从对应 `routes.ts` 找入口。
- 在 `schemas.ts` 定义输入校验。
- 在 `service.ts` 实现业务规则。
- 补 `test/prompt-api.test.ts` 或相关单元测试。

调整数据库结构：

- 未共享的早期迁移可按 [schema-migrations.md](./schema-migrations.md) 判断是否重写。
- 已共享或已部署的结构变更必须新增 migration。
- 优先用集成测试验证数据库约束。

调整公开读取：

- 重点看 `src/public/routes.ts` 和 `src/auth.ts`。
- 不要让公开接口接受 `project_id`。
- 不要开放 `latest`。
- 不要返回 Token hash 或管理端内部字段。

调整 UI：

- 静态资源在 `web/`，服务端只负责托管。
- UI 不读取服务端 `.env`，管理员 Token 由用户手动输入。
- 关键操作要有可见反馈，并展示管理 API 的错误信息。

## 测试

- 行为规则和 API 合约：`test/prompt-api.test.ts`。
- 纯函数：变量提取、JSON diff、认证 helper。
- UI 静态托管：`test/ui-routes.test.ts`。
- 数据库不变量：用真实 PostgreSQL 集成测试覆盖。

更多说明见 [testing-coverage.md](./testing-coverage.md)。
