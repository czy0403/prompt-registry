# prompt-registry

prompt-registry 是一个聚焦 Prompt 注册、版本管理和发布读取的 MVP。

核心能力：

- Project 下的 Prompt 增删改查
- 不可变整数版本号和自动 `latest` 标签
- 基于标签的发布、回滚和历史记录
- 项目级只读 API Token，供业务项目读取已发布 Prompt
- 基于 `{{variable}}` 的 Prompt 变量提取
- 结构化版本差异对比

## 架构

```mermaid
flowchart LR
  admin[管理员 / Web UI] -->|ADMIN_API_TOKEN| api[Fastify API]
  api -->|创建 Project / Prompt / Version| db[(PostgreSQL)]
  api -->|发布 label: production| db

  api -->|记录标签历史和 Token hash| db

  service[业务服务 / Python 示例] -->|Project API Token| public[/Public API/]
  public -->|按 prompt_key + label 读取| db
  public -->|返回 content、model_config、variables| service
  service -->|填充模板变量| llm[LLM 请求]
```

管理接口负责创建版本并移动发布标签；公开接口只允许业务服务通过 Project API Token
读取已发布 `production` 标签，不能读取 `latest`。

PostgreSQL 保存 Project、Prompt、版本、标签、标签历史和 Project API Token。
事务用于串行化版本创建和标签移动；触发器保证版本不可变、标签只能指向同一条Prompt 的版本。

## 本地开发

```bash
cp .env.example .env

POSTGRES_PASSWORD=$(openssl rand -hex 32)
ADMIN_API_TOKEN=$(openssl rand -hex 32)
ADMIN_ACTOR_ID=$(node -e "console.log(crypto.randomUUID())")

sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgres://prompt_registry:$POSTGRES_PASSWORD@localhost:5432/prompt_registry|" .env
sed -i "s|^ADMIN_API_TOKEN=.*|ADMIN_API_TOKEN=$ADMIN_API_TOKEN|" .env
sed -i "s|^ADMIN_ACTOR_ID=.*|ADMIN_ACTOR_ID=$ADMIN_ACTOR_ID|" .env

docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

上面的命令会把 `.env.example` 复制为本地 `.env`，再生成并写入：

- `POSTGRES_PASSWORD`：本地 PostgreSQL 初始化密码，同时同步到 `DATABASE_URL`。
- `ADMIN_API_TOKEN`：调用 `/api/v1/**` 管理接口时使用的管理员 Token。
- `ADMIN_ACTOR_ID`：记录版本创建、发布、回滚等操作的管理员身份 ID。

`.env` 是本地敏感配置，不会提交到 Git。生成后如果只是重启服务，这些值会继续
生效；如果已经创建过 PostgreSQL Docker volume，再修改数据库用户名、密码或库名，
不会自动改掉 volume 里的初始化账号。

如果误重新生成了 `.env`，优先把旧值改回去；需要保留数据但只改错了密码时，可用
当前 `.env` 中的密码同步数据库用户：

```bash
set -a; . ./.env; set +a
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v db_user="$POSTGRES_USER" -v db_pass="$POSTGRES_PASSWORD" \
  -c 'ALTER USER :"db_user" WITH PASSWORD :'\'db_pass\'';
```

如果不需要保留数据，可用 `docker compose down -v` 丢弃旧 volume 后重新初始化。

服务默认监听 `http://127.0.0.1:3000`。如需从容器外、局域网或反向代理访问，
在部署环境中设置 `HOST=0.0.0.0`。

## Web 管理界面

服务启动后可以访问 `http://127.0.0.1:3000/ui/` 使用轻量 Web 管理界面。
该界面由服务直接托管静态 HTML/CSS/JS，不需要额外前端构建步骤。

Web 管理界面支持：

- Project 创建、编辑、归档
- Prompt 创建、编辑、归档
- Prompt 版本创建、查看变量、查看结构化 diff
- 标签发布、回滚和历史查看
- Project API Token 创建、查看列表和吊销
- 已归档 Project/Prompt 的永久删除，用于清理测试数据

界面不会从服务端读取或展示 `.env` 中的 `ADMIN_API_TOKEN`。首次打开时需要手动输入
管理员 Token；默认只保存在当前页面的 JavaScript 内存中，刷新页面后需要重新输入。
如果勾选 “Remember in this tab”，Token 会保存到当前标签页的 `sessionStorage`，关闭
标签页后清除。不要在不可信浏览器或公网暴露的环境中使用该管理界面。

永久删除只会在资源已经归档后启用，并要求输入 Project 名称或 Prompt key 二次确认。
该操作会删除相关版本、标签、标签历史和 Token 等依赖数据，主要用于本地测试数据清理，
不建议用于生产审计数据。

## 认证模型

- `/api/v1/**` 是管理接口，使用
  `Authorization: Bearer <ADMIN_API_TOKEN>`。
- `/api/public/v1/**` 是业务读取接口，使用 Project API Token。
- Project API Token 只在创建响应中展示一次，只能读取绑定项目中通过标签发布的
  Prompt。
- 每个项目最多 20 个有效 API Token；有效 API Token 名称在项目内不能重复。

验证方式：

- `ADMIN_API_TOKEN` 来自 `.env`，请求时会与环境变量中的管理员 Token 做安全比较。
- Project API Token 创建时只返回明文一次，数据库只保存 SHA-256 hash；业务请求时
  会将传入 Token hash 后匹配数据库，并确认 Token 未吊销。
- Project API Token 验证通过后，服务只使用 Token 绑定的 `project_id` 读取 Prompt，
  不接受业务请求传入 `project_id`。

`ADMIN_API_TOKEN` 和 `Project API Token` 都是敏感凭证，不要提交到 Git。
`ADMIN_ACTOR_ID` 用于审计式记录管理员创建版本、发布和回滚等操作，生成后应保持固定。

## 文档

- 接口实操和 PostgreSQL 观察：
  [docs/postgres-api-walkthrough.md](docs/postgres-api-walkthrough.md)
- 数据模型字段说明：
  [docs/data-model-fields.md](docs/data-model-fields.md)
- 迁移文件维护约定：
  [docs/schema-migrations.md](docs/schema-migrations.md)
- 测试覆盖分析：
  [docs/testing-coverage.md](docs/testing-coverage.md)

## 示例

启动服务并准备好已发布 Prompt 和 Project API Token 后，可以运行 Python 业务读取示例：

```bash
PROMPT_REGISTRY_TOKEN='复制的 Project API Token' \
PROMPT_KEY='customer-answer' \
npm run example
```

示例只调用公开读取接口取回 Prompt，渲染 `{{variable}}`，并打印业务代码最终会传给
LLM 的 prompt 内容。更多说明见 [example/README.md](example/README.md)。

## 验证

```bash
npm run build
```

`npm test` 会运行数据库集成测试。如果没有设置 `TEST_DATABASE_URL`，测试会使用
`.env` 中的 `DATABASE_URL`，并在每个用例前后清空业务表。推荐使用单独测试库：

```bash
TEST_DATABASE_URL=postgres://prompt_registry:password@localhost:5432/prompt_registry_test npm test
```
