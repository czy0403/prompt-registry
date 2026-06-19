# 数据模型字段说明

这份文档只解释字段和关系。系统入口见 [developer-guide.md](./developer-guide.md)，数据库排查见
[debug-recipes.md](./debug-recipes.md)。

## 核心对象

| 对象 | 作用 | 关键字段 |
| --- | --- | --- |
| `project` | 业务空间 | `id`、`name`、`description`、`archived_at` |
| `prompt` | Prompt 元信息 | `project_id`、`prompt_key`、`name`、`type`、`archived_at` |
| `prompt_version` | 不可变内容快照 | `prompt_id`、`version`、`content`、`model_config`、`commit_message` |
| `prompt_label` | label 当前指向 | `prompt_id`、`label`、`version_id`、`revision` |
| `prompt_label_history` | label 移动历史 | `from_version_id`、`to_version_id`、`action`、`reason` |
| `project_api_token` | 业务读取凭证 | `project_id`、`name`、`token_hash`、`token_prefix`、`revoked_at` |

## 关键关系

- `prompt_key` 只在同一 `project_id` 内唯一，对外适合作为稳定业务键。
- Prompt 内容不在 `prompt` 表里；每次内容变更都会创建新的 `prompt_version`。
- `version` 是内容版本号；`label` 是发布别名；`revision` 是 label 自己的修订次数。
- `latest` 由系统在创建版本时自动移动，公开 API 不能读取它。
- `production` 是普通 label，但公开 API 默认读取它。
- Project API Token 绑定单个项目，数据库只保存 hash，明文只在创建时返回一次。
- 已归档 Project/Prompt 会阻止写入，并从公开读取中隐藏。

## 变量

Prompt 内容里的 `{{variable}}` 会在接口返回时被提取为 `variables`。变量名必须以英文字母开头，只能包含英文字母、数字和下划线。

示例：

```text
请用 {{tone}} 的语气回答：{{question}}
```

返回：

```json
["tone", "question"]
```

`variables` 不单独存表，而是从具体版本的 `content` 动态计算。

## 常见混淆

- `id` 是内部主键；`prompt_key` 是业务引用键。
- `prompt_key` 偏稳定和技术；`name` 偏展示。
- `commit_message` 描述版本内容变化；`reason` 描述发布或回滚原因。
- 回滚不是修改旧版本，而是把 label 指回旧版本。

## 最小例子

同一条 Prompt 可以有：

```text
versions: 1, 2, 3
latest: version 3
production: version 2
```

这表示最新编辑结果是版本 3，线上读取仍使用版本 2。

相关源码：

- [migrations/001_prompt_registry.sql](../migrations/001_prompt_registry.sql)
- [migrations/002_immutable_prompt_versions.sql](../migrations/002_immutable_prompt_versions.sql)
- [src/prompt/service.ts](../src/prompt/service.ts)
