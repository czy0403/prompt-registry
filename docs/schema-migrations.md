# Schema Migration 说明

该文档说明 `migrations/` 中 SQL 文件的职责、执行方式和后续维护约定。
如果你想理解字段含义，可以参考 [data-model-fields.md](./data-model-fields.md)；
如果你想边调接口边观察数据库变化，可以参考
[postgres-api-walkthrough.md](./postgres-api-walkthrough.md)。

## 当前阶段

prompt-registry 目前仍处于初期开发和测试阶段，暂时没有上到生产环境，也没有
需要长期保留的线上数据。

因此，当前阶段可以为了让初始 schema 更清晰而整理已有 migration，例如：

- 调整表结构或约束
- 合并还没有对外落地的 migration
- 重写本地已经试跑过但还不稳定的 migration
- 通过重建本地数据库验证最终 schema

但要注意：migration runner 会用 `schema_migration` 表记录已经执行过的文件名。
如果你修改了已经在本地执行过的 SQL 文件，`npm run db:migrate` 不会自动重跑它。
需要重建本地数据库：

```bash
docker compose down -v
docker compose up -d postgres
npm run db:migrate
```

进入共享环境、CI、测试服务器、生产环境，或已经有其他协作者执行过 migration 后，
应把已执行的 migration 视为历史。之后的 schema 变更通过新增 migration 完成，
避免不同环境出现同名 migration 但真实 schema 不一致的情况。

当前 `docker-compose.yml` 是开发和准生产基础配置，不是完整生产部署方案。生产环境
还需要私网数据库、备份、最小权限账号、密钥管理、监控和按需 TLS 等配套能力。

一句话：本地开发可以重建，发布历史要可追溯。

## 执行方式

`src/db/migrate.ts` 会读取 `migrations/` 目录下所有 `.sql` 文件，按文件名排序后
依次执行。每个文件执行成功后，会把文件名写入 `schema_migration.version`。

每个 migration 文件会在事务中执行：

- 成功：提交 SQL，并记录 migration 版本
- 失败：回滚本文件中的 SQL，不记录版本
- 再次运行：跳过 `schema_migration` 中已经存在的文件

所以文件名的数字前缀很重要，例如：

```text
001_prompt_registry.sql
002_immutable_prompt_versions.sql
003_projects_and_api_tokens.sql
```

## Migration 列表

### `001_prompt_registry.sql`

建立 Prompt Registry 的核心表。

主要内容：

- `schema_migration`：记录已执行的 migration 文件
- `prompt`：保存 Prompt 的稳定元信息
- `prompt_version`：保存不可变的 Prompt 内容版本
- `prompt_label`：保存 label 当前指向的版本
- `prompt_label_history`：保存 label 移动历史
- `enforce_prompt_label_version_owner()`：保证 label 只能指向同一条 Prompt 的版本

核心设计：

- `prompt` 和 `prompt_version` 分开，是为了支持内容版本管理
- `UNIQUE (project_id, prompt_key)` 保证 Prompt 在项目内唯一
- `UNIQUE (prompt_id, version)` 保证版本号在同一条 Prompt 下递增且唯一
- `PRIMARY KEY (prompt_id, label)` 保证同一条 Prompt 下同名 label 只有一个当前指向
- label 指向版本时要经过触发器校验，避免把 A Prompt 的 label 指到 B Prompt 的版本

### `002_immutable_prompt_versions.sql`

让 `prompt_version` 变成 append-only。

主要内容：

- 创建 `prevent_prompt_version_mutation()` 触发器函数
- 阻止对 `prompt_version` 的 `UPDATE` 和 `DELETE`

核心设计：

- 已创建的版本不能被修改
- 内容变更必须创建新版本
- 回滚不是改旧版本，而是移动 label

这样可以让版本历史保持可信，也能让 `production -> version 2` 这类发布指向具有稳定含义。

### `003_projects_and_api_tokens.sql`

引入项目和项目级只读 API Token。

主要内容：

- `project`：保存项目元信息
- `project_api_token`：保存项目 API Token 的哈希、前缀和吊销状态
- 为 `prompt.project_id` 添加到 `project.id` 的外键

核心设计：

- Prompt 必须属于一个真实存在的项目
- Project API Token 只绑定一个项目
- 数据库只保存 `token_hash`，不保存 Token 明文
- `revoked_at` 用于保留已吊销 Token 的历史

## 写新 Migration 的约定

在当前初期阶段，如果 schema 还没有被共享环境或生产环境执行，可以优先整理已有
初始 migration，让数据库结构保持清爽。

一旦进入共享或持久化阶段，采用追加式规则：

- 新 schema 变更新增 `004_xxx.sql`、`005_xxx.sql`
- 不修改已经被共享环境执行过的 migration
- 不复用已经执行过的 migration 文件名
- 需要数据修复时，在 migration 中明确写出 backfill SQL
- 需要破坏性变更时，先确认是否有需要保留的数据

新增文件名建议使用三位数字前缀和简短描述：

```text
004_add_prompt_tags.sql
005_add_project_slug.sql
006_backfill_prompt_updated_at.sql
```

## 修改既有 Migration 前的判断

可以修改既有 migration 的情况：

- 只有本地开发数据库执行过
- 数据可以通过 `docker compose down -v` 丢弃
- 没有测试服务器、CI、生产环境或协作者依赖当前 migration
- 修改后会重建数据库并重新跑完整 migration

应该新增 migration 的情况：

- migration 已经在共享环境执行过
- 数据库里有需要保留的数据
- 其他协作者已经基于当前 migration 开发
- 已经发布 tag、部署版本或交付给外部使用

## 检查清单

提交 schema 变更前，至少检查：

- 文件名排序是否符合预期
- 新约束是否表达了真实业务规则
- 外键是否会影响已有数据插入顺序
- 索引是否服务于实际查询
- 触发器错误信息是否能帮助定位问题
- 本地重建数据库后 `npm run db:migrate` 是否通过
- 相关接口测试是否仍然通过
