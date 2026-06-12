# prompt-registry

prompt-registry 是一个聚焦于 Prompt 注册与版本管理的 MVP，核心能力包括：

- Prompt 元数据的增删改查
- 不可变的整数版本号
- 自动维护的 `latest` 标签
- 基于标签的发布与回滚
- 乐观并发检查
- 标签移动历史
- 结构化版本差异对比

当前版本只覆盖 Prompt Registry 本身，不包含运行时执行、Tracing、评测、
工作流、Redis、队列或 ORM。

## 架构

```text
Fastify 模块化单体
        |
    PostgreSQL
```

PostgreSQL 负责保存 Prompt、版本、标签及其历史。事务用于串行化版本创建
和标签移动；触发器用于保证标签只能指向属于同一条 Prompt 的版本。

## 本地开发

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

服务默认监听 `http://localhost:3000`。所有写操作都要求在 `x-user-id`
请求头中携带合法的 UUID。

## 文档导航

- 想边调接口边观察 PostgreSQL 的实际变化：
  [docs/postgres-api-walkthrough.md](docs/postgres-api-walkthrough.md)
- 想理解 `project_id`、`prompt_key`、`version`、`label` 等字段的含义：
  [docs/data-model-fields.md](docs/data-model-fields.md)

## 验证

```bash
npm run build
npm test
```
