# Debug Recipes

默认你已经按 README 启动本地 PostgreSQL，并执行过 `npm run db:migrate`。

## 进入数据库

```bash
set -a
source .env
set +a

docker exec -it prompt-registry-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

执行单条 SQL：

```bash
docker exec -i prompt-registry-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'SELECT version, applied_at FROM schema_migration ORDER BY version;'
```

## 常用查询

迁移状态：

```sql
SELECT version, applied_at
FROM schema_migration
ORDER BY version;
```

Project / Prompt：

```sql
SELECT id, name, archived_at, updated_at
FROM project
ORDER BY updated_at DESC;

SELECT id, project_id, prompt_key, name, type, archived_at, updated_at
FROM prompt
ORDER BY updated_at DESC;
```

Version / Label：

```sql
SELECT p.prompt_key, pv.version, pv.commit_message, pv.created_at
FROM prompt_version pv
JOIN prompt p ON p.id = pv.prompt_id
ORDER BY p.prompt_key, pv.version DESC;

SELECT p.prompt_key, pl.label, pv.version, pl.revision, pl.updated_at
FROM prompt_label pl
JOIN prompt p ON p.id = pl.prompt_id
JOIN prompt_version pv ON pv.id = pl.version_id
ORDER BY p.prompt_key, pl.label;
```

发布历史：

```sql
SELECT
  p.prompt_key,
  h.label,
  from_v.version AS from_version,
  to_v.version AS to_version,
  h.action,
  h.reason,
  h.created_at
FROM prompt_label_history h
JOIN prompt p ON p.id = h.prompt_id
LEFT JOIN prompt_version from_v ON from_v.id = h.from_version_id
JOIN prompt_version to_v ON to_v.id = h.to_version_id
ORDER BY h.created_at DESC;
```

Token 元数据：

```sql
SELECT project_id, name, token_prefix, last_used_at, revoked_at, created_at
FROM project_api_token
ORDER BY created_at DESC;
```

数据库不会保存 Project API Token 明文；创建响应丢失后需要重新创建 Token。

## 公开读取失败

优先检查三件事：

```sql
SELECT p.prompt_key, pl.label, pv.version
FROM prompt p
JOIN prompt_label pl ON pl.prompt_id = p.id
JOIN prompt_version pv ON pv.id = pl.version_id
WHERE p.prompt_key = 'customer-answer';

SELECT project.name AS project_name, project.archived_at AS project_archived_at,
       p.prompt_key, p.archived_at AS prompt_archived_at
FROM prompt p
JOIN project ON project.id = p.project_id
WHERE p.prompt_key = 'customer-answer';
```

- Prompt 是否发布到目标 label。
- Project 或 Prompt 是否已归档。
- 请求是否在读取 `latest`；公开 API 会拒绝 `latest`。

## 重置本地数据库

会删除本地开发数据：

```bash
docker rm -f prompt-registry-postgres
docker volume rm prompt_registry_postgres
```

然后按 README 重新启动本地 PostgreSQL，并执行：

```bash
npm run db:migrate
```
