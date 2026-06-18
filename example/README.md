# Python Business Client Example

这个目录只保留 Python 业务侧读取示例。示例代码只调用公开读取接口
`/api/public/v1/**`，业务服务只需要保存 Project API Token，不应该持有
`ADMIN_API_TOKEN`。

## 前置条件

先按根目录 README 启动服务：

```bash
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

## 准备 Prompt

Python 示例只读取已经发布的 Prompt，不创建 Project、Prompt、版本或 Token。
请先在 Web 管理界面录入并发布 Prompt。

示例里的 `{{tone}}` 和 `{{question}}` 只是演示用变量，不是必填格式。
如果 Prompt 内容不包含 `{{variable}}`，公开接口返回的 `variables` 会是空数组，
业务代码也不需要替换变量。只有当 Prompt 内容里写了类似 `{{question}}` 的变量时，
业务代码才需要提供同名变量值。

打开 `http://127.0.0.1:3000/ui/`：

1. 在顶部输入 `.env` 里的 `ADMIN_API_TOKEN`。
2. 在 `Projects` 面板创建一个 Project，例如 `Customer Support`。
3. 选中这个 Project，在 `Prompts` 面板创建下面两个 Prompt 示例。

### Text Prompt 示例

- `Prompt key`：`support-summary`
- `Type`：`Text`
- `Display name`：`Support Summary`
- `Prompt content`：

```text
Summarize the customer question in a {{tone}} tone:

{{question}}
```

- `Model config JSON`：

```json
{
  "model": "example-text-model",
  "temperature": 0.2
}
```

### Chat Prompt 示例

- `Prompt key`：`customer-answer`
- `Type`：`Chat`
- `Display name`：`Customer Answer`
- `Prompt content`：

```json
[
  {
    "role": "system",
    "content": "You are a helpful support assistant. Answer in a {{tone}} tone."
  },
  {
    "role": "user",
    "content": "{{question}}"
  }
]
```

- `Model config JSON`：

```json
{
  "model": "example-chat-model",
  "temperature": 0.1
}
```

4. 分别选中每个 Prompt，在右侧 `Labels` 区域发布：
   - label 输入 `production`
   - version 选择刚创建的版本
   - 点击 `Publish`
5. 在 `Project API Tokens` 区域创建 Token，例如 `python-client`。
   Token 明文只显示一次，复制后作为业务服务配置使用。

## 运行示例

运行 Python 示例：

```bash
PROMPT_REGISTRY_TOKEN='复制的 Project API Token' \
PROMPT_KEY='customer-answer' \
PROMPT_LABEL='production' \
python3 example/python-client.py
```

上面示例读取 Chat Prompt。读取 Text Prompt 时只需要把
`PROMPT_KEY` 改成前端设置的相应值 `support-summary` 即可
脚本会读取公开接口、替换变量，然后打印可以继续传给 LLM 的 prompt 内容。

## 文件说明

- `python-client.py`：Python 业务侧读取示例，只调用 `/api/public/v1/**`。
