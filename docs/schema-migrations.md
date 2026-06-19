# Schema Migration 说明

这份文档说明 `migrations/` 的执行方式和维护规则。字段含义见
[data-model-fields.md](./data-model-fields.md)，常用 SQL 见 [debug-recipes.md](./debug-recipes.md)。

## 执行方式

`src/db/migrate.ts` 会读取 `migrations/*.sql`，按文件名排序执行。每个文件成功后写入
`schema_migration.version`。

- 成功：提交本文件 SQL，并记录 migration 版本。
- 失败：回滚本文件 SQL，不记录版本。
- 再次运行：跳过已记录的文件。

文件名需要稳定排序，例如：

```text
001_prompt_registry.sql
002_immutable_prompt_versions.sql
003_projects_and_api_tokens.sql
```

## 当前 migration

| 文件 | 职责 |
| --- | --- |
| `001_prompt_registry.sql` | 创建 Prompt、Version、Label、Label History 等核心表，并保证 label 只能指向同一 Prompt 的版本 |
| `002_immutable_prompt_versions.sql` | 阻止 `prompt_version` 被更新或删除，使内容版本 append-only |
| `003_projects_and_api_tokens.sql` | 引入 Project 和项目级 API Token hash |
| `004_permanent_delete_archived_resources.sql` | 允许永久删除已归档资源时绕过版本删除保护 |

## 维护规则

项目仍处于早期开发阶段。本地未共享的 migration 可以为了清晰度重写，但要重建本地数据库后重新跑完整迁移。

一旦 migration 进入共享环境、CI、测试服务器、生产环境，或已有协作者执行过，就视为历史。之后的 schema
变更必须新增 migration，不再修改旧文件。

判断方式：

- 只有本地开发数据库执行过，且数据可丢弃：可以重写旧 migration。
- 有需要保留的数据、共享环境或协作者依赖：新增 migration。
- 需要数据修复：在新 migration 中写明确的 backfill SQL。
- 需要破坏性变更：先确认数据保留和回滚策略。

一句话：本地开发可以重建，发布历史要可追溯。

## 本地重建

如果修改了已在本地执行过的 migration，`npm run db:migrate` 不会自动重跑它。需要删除本地数据库：

```bash
docker rm -f prompt-registry-postgres
docker volume rm prompt_registry_postgres
```

然后按 README 重建 PostgreSQL，并运行：

```bash
npm run db:migrate
```

## 检查清单

提交 schema 变更前至少检查：

- 文件名排序是否符合预期。
- 约束和外键是否表达真实业务规则。
- 索引是否服务实际查询。
- 触发器错误信息是否便于定位。
- 从空库执行 `npm run db:migrate` 是否通过。
- 相关接口测试是否仍然通过。
