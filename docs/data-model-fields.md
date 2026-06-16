# 数据模型字段说明

该文档可以帮助理解字段和关系，不展开接口实操。

如果你想边调接口边看数据库变化，可以参考
[postgres-api-walkthrough.md](./postgres-api-walkthrough.md)。

## 先抓住 5 个关键词

- `project_id`：Prompt 属于哪个项目，对应 `project.id`
- `prompt_key`：Prompt 在项目内的唯一标识，比如 `customer-answer`
- `name`：prompt的名称(也可与prompt_key一致)，比如 `Customer Answer`
- `version`：Prompt 内容的版本号，比如 `1`、`2`、`3`
- `label`：指向某个版本的别名，比如 `latest`、`production`
- `variables`：从 Prompt 内容里的 `{{variable}}` 自动提取出的变量名

## 一张表看懂

| 字段 | 所在表 | 用途 | 可以理解成 |
| --- | --- | --- | --- |
| `id` | 多张表 | 数据库主键 | 内部唯一 ID |
| `name` / `description` | `project` | 项目展示信息 | 项目名称和说明 |
| `project_id` | `prompt` | 区分项目 | 项目空间 |
| `token_hash` | `project_api_token` | 验证业务项目 Token | 不可逆 Token 摘要 |
| `revoked_at` | `project_api_token` | Token 是否已吊销 | 失效时间 |
| `prompt_key` | `prompt` | 区分同一项目里的 Prompt | 稳定业务键 |
| `name` | `prompt` | 展示名称 | 标题 |
| `description` | `prompt` | 补充说明 | 备注 |
| `type` | `prompt` | `text` 或 `chat` | 内容类型 |
| `version` | `prompt_version` | 第几个版本 | 内容版本号 |
| `content` | `prompt_version` | Prompt 正文 | 版本内容 |
| `model_config` | `prompt_version` | 模型参数 | 版本配置 |
| `variables` | 接口返回字段 | 模板变量名 | 业务调用时要填的值 |
| `commit_message` | `prompt_version` | 这次改了什么 | 版本说明 |
| `label` | `prompt_label` | 指向某个版本 | 别名 |
| `revision` | `prompt_label` | label 改过几次 | 标签修订号 |
| `reason` | `prompt_label_history` | 为什么发布或回滚 | 标签操作说明 |
| `created_by` / `updated_by` | 多张表 | 谁做的 | 操作者 |
| `created_at` / `updated_at` | 多张表 | 什么时候做的 | 时间戳 |

## 最关键的 4 组区别

### `id` 和 `prompt_key`

- `id` 是数据库内部主键
- `prompt_key` 是业务标识

`id` 负责唯一性，`prompt_key` 负责可读和稳定引用。

### `project_id` 和 `prompt_key`

- `project_id` 决定它属于哪个真实存在的项目
- `prompt_key` 决定它在该项目里是哪条 Prompt

这也是为什么数据库约束是：

```sql
UNIQUE (project_id, prompt_key)
```

不是全局唯一，而是“项目内唯一”。

### 管理员 Token 和 Project API Token

- 管理员 Token 来自环境变量，可以调用全部 `/api/v1/**` 管理接口
- Project API Token 由管理员创建，只能读取绑定项目中通过标签发布的 Prompt

Project API Token 的明文只在创建时返回一次。数据库只保存哈希值，Token
列表只显示名称、前缀、最后使用时间和吊销状态。

- 每个项目最多有 20 个有效 Token
- 同一项目中的有效 Token 名称不能重复
- 默认列表只返回有效 Token
- 使用 `include_revoked=true` 可以查看已吊销 Token 的历史

### `prompt_key` 和 `name`

- `prompt_key` 偏技术、偏稳定
- `name` 偏展示、偏可读

例如：

- `prompt_key = customer-answer`
- `name = Customer Answer`

### `version`、`label` 和 `revision`

- `version`：内容版本号
- `label`：指向某个版本的名字，比如 `latest`、`production`
- `revision`：这个 `label` 被改过几次

它们分别解决的是三件不同的事：

- 内容演进
- 发布指向
- 标签变更次数

### `content` 和 `variables`

Prompt 内容可以写成模板：

```text
请用 {{tone}} 的语气回答问题：{{question}}
```

系统会自动提取变量：

```json
["tone", "question"]
```

变量名必须以英文字母开头，只能包含英文字母、数字和下划线。例如
`{{question}}`、`{{user_name1}}` 是合法的，`{{user.name}}`、
`{{user-name}}`、`{{}}` 是非法的。

`variables` 不单独存表，而是根据版本 `content` 动态计算后返回。

## 为什么 `content` 不在 `prompt` 表里

因为这个项目要对内容做版本管理。

所以：

- `prompt` 存稳定的元信息
- `prompt_version` 存会演进的内容

这样一来，Prompt 可以改很多版，但主记录还是同一条。

## 两种说明字段

这两个字段很容易混：

- `commit_message`
  - 跟版本绑定
  - 说明“这次内容改了什么”
- `reason`
  - 跟标签操作绑定
  - 说明“为什么发布、回滚或移动标签”

举个例子：

- `commit_message = "Add refund policy"`
- `reason = "Publish updated support flow"`

前者在说版本变化，后者在说发布动作。

## 一个最小例子

假设有一条 Prompt：

- `project_id = project-a`
- `prompt_key = customer-answer`
- `name = Customer Answer`
- `content = "请回答：{{question}}"`

它可能有这些版本：

- `version 1`
- `version 2`
- `version 3`

它的标签可能是：

- `latest -> version 3`
- `production -> version 2`

这表示：

- 最新编辑结果是版本 3
- 线上正在用的是版本 2
- 业务项目读取该版本时，会看到 `variables = ["question"]`

如果要回滚，本质上不是修改某个版本的内容，
而是把 `production` 这个 label 指回之前稳定的版本，
比如从 `version 2` 改回 `version 1`。

## 看源码时重点看哪里

- 表结构：[migrations/001_prompt_registry.sql](../migrations/001_prompt_registry.sql)
- 不可变版本触发器：[migrations/002_immutable_prompt_versions.sql](../migrations/002_immutable_prompt_versions.sql)
- Migration 设计说明：[docs/schema-migrations.md](./schema-migrations.md)
- 路由：[src/prompt/routes.ts](../src/prompt/routes.ts)
- 核心逻辑：[src/prompt/service.ts](../src/prompt/service.ts)
