# 测试覆盖分析

该文档用于快速判断当前测试能保护哪些行为，以及还缺哪些测试。它关注
`test/` 目录里的自动化测试，不替代
[postgres-api-walkthrough.md](./postgres-api-walkthrough.md) 这种手工实操文档。

## 运行方式

测试使用 Node.js 内置 test runner，通过 `tsx` 直接执行 TypeScript：

```bash
npm test
```

`prompt-api.test.ts` 是数据库集成测试，需要可用的 PostgreSQL。测试会优先读取
`TEST_DATABASE_URL`，没有时读取 `DATABASE_URL`：

```bash
TEST_DATABASE_URL=postgres://prompt_registry:password@localhost:5432/prompt_registry_test npm test
```

如果直接使用本地开发库，测试会在每个用例前后清空核心表：
`project_api_token`、`prompt_label_history`、`prompt_label`、`prompt_version`、
`prompt`、`project`。因此更推荐使用单独的测试库，避免误删开发数据。

`package.json` 里配置了 `--test-concurrency=1`，当前集成测试按文件串行运行，便于
共享一个测试数据库并减少并发清库带来的不确定性。

## 当前测试结构

| 文件 | 类型 | 主要职责 |
| --- | --- | --- |
| `test/auth.test.ts` | 单元测试 | 验证 Bearer Token 解析、Token Hash 和管理员 Token 比对 |
| `test/json-diff.test.ts` | 单元测试 | 验证 JSON diff 能识别嵌套新增、删除和变更 |
| `test/prompt-api.test.ts` | API 集成测试 | 通过 Fastify `app.inject` 调用接口，并验证 PostgreSQL 约束、事务和公开读取行为 |
| `test/variables.test.ts` | 单元测试 | 验证 Prompt 变量提取、去重顺序和非法变量校验 |

## 已覆盖能力

### 鉴权和基础项目管理

- `/health` 会返回服务健康状态。
- 管理接口必须使用管理员 Bearer Token。
- Bearer Token 解析、管理员 Token 比对和 Token Hash 有单元测试覆盖。
- Project 支持创建、列表、详情和更新。
- Project 默认 `description` 为空字符串。
- Project 归档后，不能继续更新项目、创建 Token、创建 Prompt、更新 Prompt、
  创建版本或发布标签。

### Prompt 管理

- Prompt 支持创建、列表、详情、更新和归档。
- 默认列表不会返回已归档 Prompt，`include_archived=true` 会返回。
- 同一 Project 内 `prompt_key` 不能重复，不同 Project 可以复用。
- 非法 `prompt_key` 会被拒绝，合法的点号、斜杠、下划线和短横线组合可以创建。

### Prompt 版本和标签

- 创建 Prompt 时生成第一个不可变版本。
- 新建版本时版本号递增，并自动移动 `latest`。
- 数据库触发器会阻止修改 `prompt_version` 中的不可变字段。
- 并发创建版本不会产生重复版本号。
- 对未知 Prompt、已归档 Prompt、已归档 Project 下的 Prompt 创建版本会返回稳定错误。
- 查询不存在版本会返回 `404`。
- `production` 标签可以发布和回滚。
- 标签历史会记录 `publish`、`rollback` 的来源版本和目标版本。
- 标签历史会记录 `reason` 和 `created_by`。
- 发布到当前版本不会重复写标签历史。
- 乐观并发参数 `expected_current_version` 能拒绝陈旧发布。
- `latest` 不能通过管理接口手动移动。
- 不存在的发布/回滚目标版本会返回 `404`。
- 回滚 `latest` 或使用陈旧版本预期回滚会被拒绝。
- 数据库约束会阻止标签指向其他 Prompt 的版本。
- migration runner 重复执行时保持幂等。

### Prompt 变量和内容

- `text` 和 `chat` 两种 Prompt 都会提取 `{{variable}}` 变量。
- 重复变量会去重，并保留首次出现顺序。
- 空变量、非法变量名、点号变量、未闭合变量、孤立右括号会被拒绝。
- `text` Prompt 的 `content` 必须是字符串。
- `chat` Prompt 的 `content` 必须是消息数组。
- `model_config` 必须是 JSON object。

### Project API Token 和公开读取

- Project API Token 只在创建时返回明文。
- Token 列表不会返回 `token` 或 `token_hash`。
- 未知 Project 的 Token 列表会返回 `404`。
- Token 可以吊销，默认列表只返回有效 Token。
- `include_revoked=true` 可以查看已吊销 Token 元数据。
- 有效 Token 名称在同一项目内唯一，吊销后可以复用名称。
- 并发创建同名 Token 时只允许一个成功。
- 每个项目最多 20 个有效 Token。
- Project Token 不能调用管理接口。
- 公开接口缺少 Token、Token 非法或 Token 已吊销时都会返回 `401`。
- 有效 Project Token 成功读取公开接口后会更新 `last_used_at`。
- 公开接口可以读取默认 `production` 标签和指定标签。
- 公开接口拒绝读取 `latest` 和指定版本号。
- Project Token 只能读取自己项目下的 Prompt。
- 归档 Prompt 或归档 Project 后，公开接口不再返回已发布 Prompt。

### 版本差异

- 版本 diff 只返回 `content` 和 `model_config`。
- diff 对不存在的 base/target version、非法 `base_version` 和相同版本有覆盖。
- JSON diff 单元测试覆盖了嵌套对象和数组路径上的新增、删除、变更。

## 完备性判断

当前测试对 MVP 的核心风险覆盖较完整：版本不可变、标签发布/回滚、并发版本号、
项目级 Token 隔离、公开读取、管理侧 CRUD、归档语义、schema 边界和关键数据库
约束都有测试。

它仍不是“绝对完备”的测试集，因为还没有覆盖率统计、CI 独立测试库、复杂 diff
形态和所有长度边界。以当前 MVP 范围看，已经可以比较放心地防住主流程和高风险
回归；后续建议集中在维护体验和更细的边界覆盖上。

## 仍建议补齐的测试

### P1：增强边界覆盖

- 字段长度边界：Project/Prompt 名称 128 字符、描述 10,000 字符、label 64 字符、
  commit message 2,000 字符。
- 更多错误响应细节：校验错误 `details` 的路径、唯一键冲突返回的具体 constraint。
- 复杂 diff：数组新增/删除、多层对象变更、类型从对象变数组等形态。
- Project 和 Prompt 多条数据的排序稳定性，尤其是 `updated_at DESC, id`。

### P2：长期维护建议

- 在 CI 中创建独立测试数据库，跑 `npm run build` 和 `npm test`，避免
  `DATABASE_URL` 指向开发库时被清空。
- 增加覆盖率统计工具，例如 `c8`，把覆盖率作为参考指标，而不是唯一准入条件。
- 如果未来 migration 变复杂，可以加一个从空 schema 初始化的专用迁移测试库。

## 推荐补测顺序

1. 先在 CI 中固定独立测试数据库，避免本地 `.env` 指向开发库时被清表。
2. 再补字段长度和错误 `details`，让 API 契约更稳定。
3. 接着补复杂 diff 和排序稳定性。
4. 最后引入覆盖率统计，作为查漏工具，不作为唯一质量标准。

## 结论

当前测试已经覆盖 Prompt Registry 的主流程、管理侧行为、公开读取、安全边界、
并发写入、迁移幂等和关键数据库约束。以 MVP 阶段判断，测试已经比较完整；继续
补齐时应优先投入 CI、覆盖率和更细的 API 边界，而不是继续堆重复的 happy path。
