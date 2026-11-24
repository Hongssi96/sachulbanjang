import json
from unittest.mock import MagicMock, patch

import pytest
from app.integrations.ai import AiGenerationError, OpenAiCompatibleClient


def make_client() -> OpenAiCompatibleClient:
    return OpenAiCompatibleClient(
        base_url="https://ai.example.test/v1",
        api_key="secret",
        model="test-model",
        timeout_seconds=30,
    )


def test_generate_markdown_calls_openai_compatible_endpoint() -> None:
    response = MagicMock()
    response.read.return_value = json.dumps(
        {"choices": [{"message": {"content": "# 생성 결과"}}]}
    ).encode()
    response.__enter__.return_value = response

    with patch("app.integrations.ai.urlopen", return_value=response) as request_mock:
        result = make_client().generate_markdown(system_prompt="system", user_prompt="input")

    assert result == "# 생성 결과"
    request = request_mock.call_args.args[0]
    assert request.full_url == "https://ai.example.test/v1/chat/completions"
    sent = json.loads(request.data.decode())
    assert sent["model"] == "test-model"
    assert sent["messages"][1]["content"] == "input"
    assert "temperature" not in sent
    assert request.get_header("Authorization") == "Bearer secret"


def test_generate_markdown_rejects_missing_content() -> None:
    response = MagicMock()
    response.read.return_value = b'{"choices": []}'
    response.__enter__.return_value = response

    with (
        patch("app.integrations.ai.urlopen", return_value=response),
        pytest.raises(AiGenerationError),
    ):
        make_client().generate_markdown(system_prompt="system", user_prompt="input")


@pytest.mark.parametrize(
    "content", ["<script>alert(1)</script>", "![external](https://example.com/x)"]
)
def test_generate_markdown_rejects_html_and_external_images(content: str) -> None:
    response = MagicMock()
    response.read.return_value = json.dumps(
        {"choices": [{"message": {"content": content}}]}
    ).encode()
    response.__enter__.return_value = response

    with (
        patch("app.integrations.ai.urlopen", return_value=response),
        pytest.raises(AiGenerationError, match="unsafe"),
    ):
        make_client().generate_markdown(system_prompt="system", user_prompt="input")
