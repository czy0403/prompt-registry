# prompt-registry

prompt-registry 是一个聚焦 Prompt 注册、版本管理和发布读取的 MVP。

核心能力：

- Project 下的 Prompt 增删改查
- 不可变整数版本号和自动 `latest` 标签
- 基于标签的发布、回滚和历史记录
- 项目级只读 API Token，供业务项目读取已发布 Prompt
- 基于 `{{variable}}` 的 Prompt 变量提取
- 结构化版本差异对比

当前版本不包含运行时执行、Tracing、评测、工作流、Redis、队列或 ORM。

## 架构

```text
Fastify 模块化单体
        |
    PostgreSQL
```

PostgreSQL 保存 Project、Prompt、版本、标签、标签历史和 Project API Token。
事务用于串行化版本创建和标签移动；触发器保证版本不可变、标签只能指向同一条
Prompt 的版本。

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
`ADMIN_ACTOR_ID` 用于审计式记录管理员创建版本、发布和回滚等操作，生成后应保持
固定。

## 文档

- 接口实操和 PostgreSQL 观察：
  [docs/postgres-api-walkthrough.md](docs/postgres-api-walkthrough.md)
- 数据模型字段说明：
  [docs/data-model-fields.md](docs/data-model-fields.md)
- 迁移文件维护约定：
  [docs/schema-migrations.md](docs/schema-migrations.md)
- 测试覆盖分析：
  [docs/testing-coverage.md](docs/testing-coverage.md)

## 验证

```bash
npm run build
```

`npm test` 会运行数据库集成测试。如果没有设置 `TEST_DATABASE_URL`，测试会使用
`.env` 中的 `DATABASE_URL`，并在每个用例前后清空业务表。推荐使用单独测试库：

```bash
TEST_DATABASE_URL=postgres://prompt_registry:password@localhost:5432/prompt_registry_test npm test
```
