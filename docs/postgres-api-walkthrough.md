# PostgreSQL 接口实操

该文档演示通过调用接口，然后立刻看 PostgreSQL 里发生了什么。

如果你想看字段含义，可以参考 [data-model-fields.md](./data-model-fields.md)。

## 准备

终端 1：

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

如果你本地之前已经用旧的 `agentforge` 初始化过 PostgreSQL，
先执行一次 `docker compose down -v`，再重新 `up`，否则数据库里的用户和库名
不会自动切到新的 `prompt_registry`。

同理，如果你修改了 `.env` 中的 `POSTGRES_USER`、`POSTGRES_PASSWORD` 或
`POSTGRES_DB`，已有 Docker volume 也不会自动更新初始化凭证。本地开发可以用
`docker compose down -v` 丢弃旧数据后重新初始化。

终端 2：

```bash
# 从可信的本地 .env 加载并导出变量，避免在终端历史中输入真实 Token
set -a
source .env
set +a

BASE_URL=http://localhost:3000
ADMIN_AUTH="Authorization: Bearer $ADMIN_API_TOKEN"

PG="docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB"
```

Shell 历史只会记录上面的变量引用，不会记录 `.env` 中的真实
`ADMIN_API_TOKEN` 和 `POSTGRES_PASSWORD`。仅应 `source` 自己信任的 `.env`
文件，因为该命令会执行文件中的 Shell 内容。实操结束后可以清理当前终端中的
敏感变量：

```bash
unset POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL
unset ADMIN_API_TOKEN ADMIN_AUTH PROJECT_API_TOKEN
```

继续操作前，确认终端 1 中的 `npm run dev` 仍在运行：

```bash
curl --fail-with-body -sS "$BASE_URL/health"
```

正常情况下会返回 `{"status":"ok"}`。如果显示无法连接，请回到终端 1 重新运行
`npm run dev`。

先创建项目并保存项目 ID：

```bash
PROJECT_RESPONSE=$(curl --fail-with-body -sS -X POST \
  "$BASE_URL/api/v1/projects" \
  -H "$ADMIN_AUTH" \
  -H "content-type: application/json" \
  -d '{"name":"Prompt walkthrough"}')

PROJECT_ID=$(printf '%s' "$PROJECT_RESPONSE" | node -pe \
  'JSON.parse(require("fs").readFileSync(0, "utf8")).id')
```

列出所有项目

```bash
curl --fail-with-body -sS "$BASE_URL/api/v1/projects" \
  -H "$ADMIN_AUTH" | jq
```

如果宿主机装了 `psql`，也可以这样写：

```bash
PG="psql $DATABASE_URL"
```

## 常用查询

下面这组命令可以整块复制执行。

```bash
# 查看 prompt
$PG -c "
SELECT id, project_id, prompt_key, name, archived_at, updated_at
FROM prompt
ORDER BY updated_at DESC;
"

# 查看版本
$PG -c "
SELECT prompt_id, version, commit_message, created_at
FROM prompt_version
ORDER BY created_at DESC;
"

# 查看当前标签指向
$PG -c "
SELECT pl.prompt_id, pl.label, pv.version, pl.revision, pl.updated_at
FROM prompt_label pl
JOIN prompt_version pv ON pv.id = pl.version_id
ORDER BY pl.updated_at DESC;
"

# 查看标签历史
$PG -c "
SELECT prompt_id, label, action, reason, created_at
FROM prompt_label_history
ORDER BY created_at DESC;
"
```

## 可选：先试一个 `text` Prompt

这个项目支持两种内容形态：

- `type = text` 时，`content` 是字符串
- `type = chat` 时，`content` 是消息数组
- `content` 里可以使用 `{{variable}}` 变量，接口会返回自动提取的
  `variables`

创建一个 `text` Prompt：

```bash
curl -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/prompts" \
  -H "content-type: application/json" \
  -H "$ADMIN_AUTH" \
  -d '{
    "prompt_key": "summary-text",
    "name": "Summary Text",
    "type": "text",
    "content": "Summarize the following content in {{bullet_count}} bullet points:\n\n{{article}}",
    "commit_message": "Initial text prompt"
  }'
```

查看结果：

```bash
# 查看 text prompt 元数据
$PG -c "
SELECT id, prompt_key, name, type
FROM prompt
WHERE project_id = '$PROJECT_ID'
  AND prompt_key = 'summary-text';
"

# 查看 text prompt 的版本内容
$PG -c "
SELECT version, content, model_config, commit_message
FROM prompt_version
WHERE prompt_id = (
  SELECT id
  FROM prompt
  WHERE project_id = '$PROJECT_ID'
    AND prompt_key = 'summary-text'
)
ORDER BY version;
"
```

观察点：

- `type` 在 `prompt` 表
- `content` 在 `prompt_version` 表
- `text` 的 `content` 看起来像 JSON 字符串
- 版本详情接口会返回 `variables = ["bullet_count", "article"]`

```bash
TEXT_PROMPT_ID=$($PG -t -A -c "
SELECT id
FROM prompt
WHERE project_id = '$PROJECT_ID'
  AND prompt_key = 'summary-text';
")

curl --fail-with-body -sS \
  "$BASE_URL/api/v1/prompts/$TEXT_PROMPT_ID/versions/1" \
  -H "$ADMIN_AUTH" | jq '.variables'
```

## 主流程

下面这 5 步对应这个项目最核心的使用方式。

### 1. 创建 Prompt

```bash
curl -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/prompts" \
  -H "content-type: application/json" \
  -H "$ADMIN_AUTH" \
  -d '{
    "prompt_key": "customer-answer",
    "name": "Customer Answer",
    "type": "chat",
    "content": [
      {"role": "system", "content": "You are a support assistant. Use a {{tone}} tone."},
      {"role": "user", "content": "{{question}}"}
    ],
    "model_config": {"temperature": 0.2},
    "commit_message": "Initial version"
  }'
```

这一步会：

- 新增一条 `prompt`
- 新增版本 `1`
- 自动创建 `latest -> version 1`
- 写入一条标签历史

```bash
# 查看当前项目下的 prompt
$PG -c "
SELECT id, prompt_key, name, type, created_at
FROM prompt
WHERE project_id = '$PROJECT_ID';
"

# 查看当前项目下的版本
$PG -c "
SELECT p.prompt_key, pv.version, pv.commit_message
FROM prompt_version pv
JOIN prompt p ON p.id = pv.prompt_id
WHERE p.project_id = '$PROJECT_ID'
ORDER BY pv.version;
"

# 查看当前项目下的标签
$PG -c "
SELECT p.prompt_key, pl.label, pv.version, pl.revision
FROM prompt_label pl
JOIN prompt p ON p.id = pl.prompt_id
JOIN prompt_version pv ON pv.id = pl.version_id
WHERE p.project_id = '$PROJECT_ID';
"
```

把 `PROMPT_ID` 保存下来：

```bash
# 保存刚创建的 prompt id
PROMPT_ID=$($PG -t -A -c "
SELECT id
FROM prompt
WHERE project_id = '$PROJECT_ID'
  AND prompt_key = 'customer-answer';
")

echo "$PROMPT_ID"
```

创建供业务项目读取的 Project API Token：

```bash
PROJECT_API_TOKEN=$(curl -s -X POST \
  "$BASE_URL/api/v1/projects/$PROJECT_ID/api-tokens" \
  -H "$ADMIN_AUTH" \
  -H "content-type: application/json" \
  -d '{"name":"walkthrough-client-production"}' | node -pe \
  'JSON.parse(require("fs").readFileSync(0, "utf8")).token')
```

Token 明文只在创建响应中返回一次。此时 `customer-answer` 只有自动维护的
`latest` 标签，还不能通过公开接口读取；现在调用会得到
`Published prompt not found.`。完成下面第 3 步的 `production` 发布后，再这样
读取：

```bash
curl "$BASE_URL/api/public/v1/prompts/customer-answer" \
  -H "Authorization: Bearer $PROJECT_API_TOKEN"
```

返回中会包含变量列表：

```json
"variables": ["tone", "question"]
```

每个项目最多有 20 个有效 Token，有效 Token 名称不能重复。默认列表只显示
有效 Token：

```bash
curl --fail-with-body -sS \
  "$BASE_URL/api/v1/projects/$PROJECT_ID/api-tokens" \
  -H "$ADMIN_AUTH" | jq
```

需要查看包含已吊销 Token 的历史时：

```bash
curl --fail-with-body -sS \
  "$BASE_URL/api/v1/projects/$PROJECT_ID/api-tokens?include_revoked=true" \
  -H "$ADMIN_AUTH" | jq
```

### 2. 创建新版本

```bash
curl -X POST "$BASE_URL/api/v1/prompts/$PROMPT_ID/versions" \
  -H "content-type: application/json" \
  -H "$ADMIN_AUTH" \
  -d '{
    "content": [
      {"role": "system", "content": "You are a concise support assistant. Use a {{tone}} tone."},
      {"role": "user", "content": "{{question}}"}
    ],
    "model_config": {"temperature": 0.1},
    "commit_message": "Make answers concise"
  }'
```

这一步会：

- 新增版本 `2`
- 把 `latest` 从 `1` 移到 `2`
- `revision` 加 1
- 写一条 `move` 历史

```bash
# 查看这条 prompt 的全部版本
$PG -c "
SELECT version, commit_message, created_at
FROM prompt_version
WHERE prompt_id = '$PROMPT_ID'
ORDER BY version;
"

# 查看这条 prompt 当前的标签指向
$PG -c "
SELECT pl.label, pv.version, pl.revision, pl.updated_at
FROM prompt_label pl
JOIN prompt_version pv ON pv.id = pl.version_id
WHERE pl.prompt_id = '$PROMPT_ID'
ORDER BY pl.label;
"
```

### 3. 发布到 `production`

```bash
curl -X PUT "$BASE_URL/api/v1/prompts/$PROMPT_ID/labels/production" \
  -H "content-type: application/json" \
  -H "$ADMIN_AUTH" \
  -d '{
    "version": 2,
    "expected_current_version": null,
    "reason": "Publish version 2"
  }'
```

这一步会：

- 新增 `production -> version 2`
- 写一条 `publish` 历史

```bash
# 查看当前标签
$PG -c "
SELECT pl.label, pv.version, pl.revision
FROM prompt_label pl
JOIN prompt_version pv ON pv.id = pl.version_id
WHERE pl.prompt_id = '$PROMPT_ID'
ORDER BY pl.label;
"

# 查看 production 标签历史
$PG -c "
SELECT label, action, reason, created_at
FROM prompt_label_history
WHERE prompt_id = '$PROMPT_ID'
  AND label = 'production'
ORDER BY created_at DESC;
"
```

### 4. 回滚 `production`

```bash
curl -X POST "$BASE_URL/api/v1/prompts/$PROMPT_ID/labels/production/rollback" \
  -H "content-type: application/json" \
  -H "$ADMIN_AUTH" \
  -d '{
    "version": 1,
    "expected_current_version": 2,
    "reason": "Rollback production"
  }'
```

这一步不会改版本内容，只会把：

- `production -> version 2`

改成：

- `production -> version 1`

```bash
# 查看回滚后的标签
$PG -c "
SELECT pl.label, pv.version, pl.revision, pl.updated_at
FROM prompt_label pl
JOIN prompt_version pv ON pv.id = pl.version_id
WHERE pl.prompt_id = '$PROMPT_ID'
ORDER BY pl.label;
"

# 查看回滚后的 production 历史
$PG -c "
SELECT label, action, reason, created_at
FROM prompt_label_history
WHERE prompt_id = '$PROMPT_ID'
  AND label = 'production'
ORDER BY created_at DESC;
"
```

### 5. 归档 Prompt

```bash
curl -X DELETE "$BASE_URL/api/v1/prompts/$PROMPT_ID" \
  -H "$ADMIN_AUTH" \
  -i
```

这一步不是硬删除，只会给 `prompt` 打上归档时间。

```bash
# 查看这条 prompt 是否已归档
$PG -c "
SELECT id, prompt_key, archived_at, updated_at
FROM prompt
WHERE id = '$PROMPT_ID';
"
```

## 看这几个规律就够了

- `prompt_version` 只增不改
- `latest` 自动跟随最新版本
- 发布和回滚改的是 `label`，不是 `content`
- `prompt_label_history` 记录完整轨迹
- 归档是软删除

## 清理测试数据

如果你只是想把这份文档里产生的测试数据清掉，有两种常用方式。

### 方式 1：只清数据，保留表结构

适合继续在当前数据库里反复练习。`project` 是业务数据的顶层表，
`CASCADE` 会同时清空它关联的 Project API Token、Prompt、版本、标签和历史，
但保留 `schema_migration`、表结构、索引与触发器。

```bash
# 清空全部业务数据，保留表结构和迁移记录
$PG -c "
TRUNCATE TABLE project CASCADE;
"
```

清完后可以快速确认：

```bash
# 业务表应全部为 0，schema_migration 仍保留已执行的迁移
$PG -c "
SELECT 'project' AS table_name, count(*) FROM project
UNION ALL SELECT 'project_api_token', count(*) FROM project_api_token
UNION ALL SELECT 'prompt', count(*) FROM prompt
UNION ALL SELECT 'prompt_version', count(*) FROM prompt_version
UNION ALL SELECT 'prompt_label', count(*) FROM prompt_label
UNION ALL SELECT 'prompt_label_history', count(*) FROM prompt_label_history
UNION ALL SELECT 'schema_migration', count(*) FROM schema_migration
ORDER BY table_name;
"
```

### 方式 2：彻底重置数据库

适合回到刚初始化的状态。

```bash
# 删除数据库容器和数据卷
docker compose down -v

# 重新启动 PostgreSQL
docker compose up -d postgres

# 重新执行迁移
npm run db:migrate
```

这会清掉所有数据，包括迁移记录。

## 对照源码

- 路由：[src/prompt/routes.ts](../src/prompt/routes.ts)
- 核心逻辑：[src/prompt/service.ts](../src/prompt/service.ts)
- 表结构：[migrations/001_prompt_registry.sql](../migrations/001_prompt_registry.sql)
- 版本不可变触发器：[migrations/002_immutable_prompt_versions.sql](../migrations/002_immutable_prompt_versions.sql)
