#!/usr/bin/env python3
import json
import os
import re
import urllib.parse
import urllib.request


# 业务服务只需要配置公开读取地址、Project API Token、Prompt key 和发布标签。
BASE_URL = os.getenv("PROMPT_REGISTRY_BASE_URL", "http://127.0.0.1:3000")
TOKEN = os.environ["PROMPT_REGISTRY_TOKEN"]
PROMPT_KEY = os.getenv("PROMPT_KEY", "customer-answer")
PROMPT_LABEL = os.getenv("PROMPT_LABEL", "production")

# 示例变量。只有 Prompt 内容里写了 {{tone}}、{{question}} 时才需要提供。
VARIABLES = {
    "tone": "friendly and concise",
    "question": "How do I reset my password?",
}


def get_prompt():
    # 业务侧只调用公开接口，不需要 ADMIN_API_TOKEN。
    path = f"/api/public/v1/prompts/{urllib.parse.quote(PROMPT_KEY)}"
    query = urllib.parse.urlencode({"label": PROMPT_LABEL})
    url = urllib.parse.urljoin(BASE_URL, path) + f"?{query}"
    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    opener = build_opener(url)

    with opener.open(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def build_opener(url):
    # 本地调试时绕过系统代理，避免 localhost 请求被代理转发。
    hostname = urllib.parse.urlparse(url).hostname
    if hostname in {"127.0.0.1", "localhost", "::1"}:
        return urllib.request.build_opener(urllib.request.ProxyHandler({}))
    return urllib.request.build_opener()


def render_template(value):
    # 把 Prompt Registry 返回的 {{variable}} 替换成业务运行时变量。
    return re.sub(
        r"\{\{([A-Za-z][A-Za-z0-9_]*)\}\}",
        lambda match: str(VARIABLES[match.group(1)]),
        value,
    )


def render_prompt(prompt):
    required_variables = prompt.get("variables", [])
    if not required_variables:
        # Prompt 不包含 {{variable}} 时，不需要准备变量，直接使用原始内容。
        return prompt["content"]

    missing = [name for name in required_variables if name not in VARIABLES]
    if missing:
        raise RuntimeError(f"Missing prompt variables: {', '.join(missing)}")

    # Text Prompt 渲染后是字符串；Chat Prompt 渲染后是 messages 数组。
    if prompt["type"] == "text":
        return render_template(prompt["content"])

    return [
        {
            **message,
            "content": render_template(message["content"]),
        }
        for message in prompt["content"]
    ]


prompt = get_prompt()
llm_input = render_prompt(prompt)

print(json.dumps(llm_input, ensure_ascii=False, indent=2))
