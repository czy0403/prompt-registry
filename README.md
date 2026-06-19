# prompt-registry

prompt-registry 是一个 Prompt 注册、版本管理和发布读取的 MVP。它把管理侧写入和业务侧读取分开：

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

核心能力：

- Project 下的 Prompt 增删改查
- 不可变整数版本和自动 `latest` 标签
- 基于 label 的发布、回滚和历史记录
- 项目级只读 API Token
- `{{variable}}` 变量提取和结构化版本 diff
- 轻量 Web 管理界面

管理接口使用 `ADMIN_API_TOKEN`；业务读取接口使用 `Project API Token`，默认读取已发布 `production` label，也可读取其他已发布 label，但不能读取 `latest`。

## 本地开发

准备 `.env`：

```bash
cp .env.example .env

POSTGRES_PASSWORD=$(openssl rand -hex 32)
ADMIN_API_TOKEN=$(openssl rand -hex 32)
ADMIN_ACTOR_ID=$(node -e "console.log(crypto.randomUUID())")

sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgres://prompt_registry:$POSTGRES_PASSWORD@localhost:5432/prompt_registry|" .env
sed -i "s|^ADMIN_API_TOKEN=.*|ADMIN_API_TOKEN=$ADMIN_API_TOKEN|" .env
sed -i "s|^ADMIN_ACTOR_ID=.*|ADMIN_ACTOR_ID=$ADMIN_ACTOR_ID|" .env
```

启动本地 PostgreSQL 和服务：

```bash
docker volume create prompt_registry_postgres
docker run -d --name prompt-registry-postgres \
  -e POSTGRES_USER=prompt_registry \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -e POSTGRES_DB=prompt_registry \
  -e TZ=Asia/Shanghai \
  -p 127.0.0.1:5432:5432 \
  -v prompt_registry_postgres:/var/lib/postgresql/data \
  postgres:17-alpine postgres -c timezone=Asia/Shanghai

npm install
npm run db:migrate
npm run dev
```

服务默认地址：

- API health check: `http://127.0.0.1:3000/health`
- Web UI: `http://127.0.0.1:3000/ui/`

`.env` 是本地敏感配置，不要提交到 Git。已经创建过 PostgreSQL volume 后，再改
`POSTGRES_USER`、`POSTGRES_PASSWORD` 或 `POSTGRES_DB` 不会自动修改旧数据库账号。
常用排查 SQL 和重置命令见 [docs/debug-recipes.md](docs/debug-recipes.md)。

## Docker 部署

仓库里的 `docker-compose.yml` 用于部署完整应用栈：PostgreSQL、API 和 Web UI。应用容器启动时会先执行
migration。

```bash
cp .env.example .env.production

POSTGRES_PASSWORD=$(openssl rand -hex 32)
ADMIN_API_TOKEN=$(openssl rand -hex 32)
ADMIN_ACTOR_ID=$(node -e "console.log(crypto.randomUUID())")

sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env.production
sed -i "s|^ADMIN_API_TOKEN=.*|ADMIN_API_TOKEN=$ADMIN_API_TOKEN|" .env.production
sed -i "s|^ADMIN_ACTOR_ID=.*|ADMIN_ACTOR_ID=$ADMIN_ACTOR_ID|" .env.production

docker compose --env-file .env.production up -d --build
curl http://127.0.0.1:3000/health
```

Compose 会在容器内生成面向 `postgres` 服务的 `DATABASE_URL`，不会使用模板里的 localhost
连接串。默认端口绑定由 `APP_HOST_BIND` 和 `APP_PORT` 控制；公网部署建议保持
`APP_HOST_BIND=127.0.0.1`，再通过 HTTPS 反向代理暴露服务。

停止服务：

```bash
docker compose --env-file .env.production down
```

只有确认不需要保留数据时，才使用 `down -v` 删除生产 volume。

## Web UI

访问 `http://127.0.0.1:3000/ui/`，输入 `.env` 或 `.env.production` 中的
`ADMIN_API_TOKEN` 后即可管理：

- Project 和 Prompt
- Version、变量和 diff
- Label 发布、回滚和历史
- Project API Token
- 已归档 Project/Prompt 的永久删除

管理员 Token 不会从服务端回显。默认只保存在页面内存中；勾选 “Remember in this tab” 时会保存到当前标签页的
`sessionStorage`，关闭标签页后清除。

## 认证

- `/api/v1/**`：管理接口，使用 `Authorization: Bearer <ADMIN_API_TOKEN>`。
- `/api/public/v1/**`：业务读取接口，使用 Project API Token。
- Project API Token 明文只在创建时返回一次；数据库只保存 SHA-256 hash。
- Project API Token 只能读取项目中已发布 label 的 Prompt。

## 文档

- [docs/developer-guide.md](docs/developer-guide.md)：系统地图、代码入口和常见开发任务
- [docs/debug-recipes.md](docs/debug-recipes.md)：PostgreSQL 调试查询和本地重置
- [docs/data-model-fields.md](docs/data-model-fields.md)：字段和核心关系
- [docs/schema-migrations.md](docs/schema-migrations.md)：migration 维护约定
- [docs/testing-coverage.md](docs/testing-coverage.md)：当前测试覆盖和补测建议

## 示例

启动服务、创建 Prompt、发布 label 并复制 Project API Token 后：

```bash
PROMPT_REGISTRY_TOKEN='复制的 Project API Token' \
PROMPT_KEY='customer-answer' \
npm run example
```

更多说明见 [example/README.md](example/README.md)。

## 验证

```bash
npm run build
npm run test:db:up
npm run test:full
npm run test:db:down
```

`test:full` 会使用 `docker-compose.test.yml` 提供的独立 PostgreSQL 测试库，避免误清本地开发数据。
`test:db:down` 会同时删除测试数据库 volume。

如果直接运行 `npm test`，仍需要提前提供 `TEST_DATABASE_URL` 或 `DATABASE_URL`：

```bash
TEST_DATABASE_URL=postgres://prompt_registry:password@localhost:5432/prompt_registry_test npm test
```
