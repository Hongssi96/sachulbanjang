from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class AiGenerationError(Exception):
    """A safe, provider-independent AI generation failure."""


_HTML_TAG = re.compile(r"<\s*/?\s*[A-Za-z][^>]*>")
_MARKDOWN_IMAGE = re.compile(r"!\[[^\]]*\]\(")
_MAX_MARKDOWN_LENGTH = 100_000


def validate_generated_markdown(content: str) -> str:
    """Reject empty, oversized, or unsafe AI output before it is stored."""
    if not isinstance(content, str) or not content.strip():
        raise AiGenerationError("AI server returned empty generated content")
    normalized = content.strip()
    if len(normalized) > _MAX_MARKDOWN_LENGTH:
        raise AiGenerationError("AI server returned oversized generated content")
    if _HTML_TAG.search(normalized) or _MARKDOWN_IMAGE.search(normalized):
        raise AiGenerationError("AI server returned unsafe generated content")
    return normalized


@dataclass(frozen=True)
class OpenAiCompatibleClient:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: int

    def generate_markdown(self, *, system_prompt: str, user_prompt: str) -> str:
        endpoint = f"{self.base_url.rstrip('/')}/chat/completions"
        body = json.dumps(
            {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            },
            ensure_ascii=False,
        ).encode("utf-8")
        request = Request(
            endpoint,
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise AiGenerationError(f"AI server returned HTTP {error.code}") from error
        except (URLError, TimeoutError, OSError) as error:
            raise AiGenerationError("AI server connection failed") from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise AiGenerationError("AI server returned an invalid response") from error

        try:
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise AiGenerationError(
                "AI server response did not contain generated content"
            ) from error
        if not isinstance(content, str) or not content.strip():
            raise AiGenerationError("AI server returned empty generated content")
        return validate_generated_markdown(content)
