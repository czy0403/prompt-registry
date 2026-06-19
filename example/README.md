# Python Business Client Example

这个目录只保留业务侧读取示例。示例只调用 `/api/public/v1/**`，业务服务只需要 Project API
Token，不应该持有 `ADMIN_API_TOKEN`。

## 前置条件

先按根目录 [README](../README.md) 启动服务，并在 Web UI 中准备好：

1. Project
2. Prompt
3. 指向目标版本的 `production` label
4. Project API Token

## 可用 Prompt 示例

Text Prompt：

```text
Prompt key: support-summary
Type: Text
Content:
Summarize the customer question in a {{tone}} tone:

{{question}}
```

Chat Prompt：

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

示例脚本默认会给 `tone` 和 `question` 填值。如果 Prompt 不包含变量，公开接口返回的
`variables` 会是空数组，业务代码也不需要替换。

## 运行

```bash
PROMPT_REGISTRY_TOKEN='复制的 Project API Token' \
PROMPT_KEY='customer-answer' \
PROMPT_LABEL='production' \
python3 example/python-client.py
```

也可以使用 npm script：

```bash
PROMPT_REGISTRY_TOKEN='复制的 Project API Token' \
PROMPT_KEY='customer-answer' \
npm run example
```

脚本会读取公开接口、替换变量，并打印可以继续传给 LLM 的 prompt 内容。
