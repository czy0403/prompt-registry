# 测试覆盖分析

这份文档用于快速判断当前自动化测试保护了哪些行为，以及优先补什么。开发入口见
[developer-guide.md](./developer-guide.md)，数据库排查见 [debug-recipes.md](./debug-recipes.md)。

## 运行方式

```bash
npm test
```

`test/prompt-api.test.ts` 需要 PostgreSQL。测试优先读取 `TEST_DATABASE_URL`，没有时读取
`DATABASE_URL`。推荐用一次性测试数据库运行完整测试：

```bash
npm run test:db:up
npm run test:full
npm run test:db:down
```

`test:full` 会把 `TEST_DATABASE_URL` 指向 `docker-compose.test.yml` 中的独立 PostgreSQL。
`test:db:down` 会删除测试数据库 volume。直接运行 `npm test` 时，仍需要自己提供
`TEST_DATABASE_URL` 或 `DATABASE_URL`。

如果直接使用开发库，测试会在每个用例前后清空核心业务表。`package.json` 已设置
`--test-concurrency=1`，当前测试按文件串行运行。

## 测试结构

| 文件 | 类型 | 主要职责 |
| --- | --- | --- |
| `test/auth.test.ts` | 单元测试 | Bearer Token、Token hash、管理员 Token 比对 |
| `test/json-diff.test.ts` | 单元测试 | JSON diff 的新增、删除和变更 |
| `test/prompt-api.test.ts` | 集成测试 | API 合约、PostgreSQL 约束、事务和公开读取 |
| `test/ui-routes.test.ts` | 集成测试 | Web UI 静态资源托管 |
| `test/variables.test.ts` | 单元测试 | Prompt 变量提取和非法变量校验 |

## 已覆盖重点

- 健康检查和管理接口鉴权。
- Project、Prompt 的创建、更新、列表、归档和永久删除。
- 项目内 `prompt_key` 唯一，不同项目可复用。
- Prompt 版本递增、不可变、并发创建不重复。
- `latest` 自动移动，不能手动发布或回滚。
- `production` 和其他 label 的发布、回滚、历史和乐观并发。
- 数据库约束阻止 label 指向其他 Prompt 的版本。
- `text` / `chat` 内容校验、变量提取、`model_config` 校验。
- Project API Token 创建、列表、吊销、名称复用和数量限制。
- 公开接口的 Token 鉴权、项目隔离、归档隐藏、拒绝 `latest`。
- Version diff 和 migration runner 幂等。

## 仍建议补齐

P1：

- 字段长度边界。
- 错误响应 `details` 的路径和唯一键冲突信息。
- 更复杂的 diff 形态。
- 多条 Project/Prompt 的排序稳定性。

P2：

- CI 中创建独立测试数据库，并运行 `npm run build` 和 `npm test`。
- 引入覆盖率统计工具，例如 `c8`，作为查漏参考。
- migration 变复杂后，增加空 schema 初始化测试。

## 结论

当前测试已经覆盖 MVP 的主流程和高风险边界：版本不可变、标签发布/回滚、并发写入、
项目级 Token 隔离、公开读取、归档语义和关键数据库约束。下一步优先补 CI 独立测试库和细边界。
