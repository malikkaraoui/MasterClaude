"""Client Anthropic : appel synthèse Sonnet 4.6 (synchrone, un seul appel)."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)

SYNTH_SYSTEM = (
    "Tu es Idriss, un synthétiseur. Tu reçois : (1) un résumé brut de la journée, "
    "(2) deux réponses produites par deux modèles Ollama distincts. "
    "Confronte les 2 IA, garde l'utile, vire la flatterie. "
    "Format : Markdown court, brut, actionnable. Trois sections : "
    "## Conviction, ## Red-flag, ## Expérience demain. "
    "Pas de préambule, pas de répétition du résumé. Français."
)

DEFAULT_MAX_TOKENS = 2048


@dataclass
class SynthResult:
    ok: bool
    text: str
    model: str
    error: str | None = None


def _build_user_message(summary: str, ollama_responses: list[tuple[str, str]]) -> str:
    parts = ["# Résumé brut", summary, ""]
    for label, text in ollama_responses:
        parts.append(f"# Réponse {label}")
        parts.append(text.strip() or "_(vide)_")
        parts.append("")
    return "\n".join(parts).strip()


def synthesize(
    summary: str,
    ollama_responses: list[tuple[str, str]],
    model: str = "claude-sonnet-4-6",
    max_tokens: int = DEFAULT_MAX_TOKENS,
    api_key: str | None = None,
    client_factory=None,
) -> SynthResult:
    """Appelle Anthropic Messages API. Retourne SynthResult avec text Markdown.

    `client_factory` : injection pour tests (callable() -> client). Sinon
    instancie `anthropic.Anthropic()` par défaut.
    """
    key = api_key or os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return SynthResult(
            ok=False, text="", model=model, error="ANTHROPIC_API_KEY absent"
        )

    try:
        if client_factory is None:
            import anthropic

            client = anthropic.Anthropic(api_key=key)
        else:
            client = client_factory()
    except Exception as exc:  # noqa: BLE001
        logger.exception("anthropic client init")
        return SynthResult(ok=False, text="", model=model, error=f"init: {exc}")

    user_message = _build_user_message(summary, ollama_responses)
    try:
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=SYNTH_SYSTEM,
            messages=[{"role": "user", "content": user_message}],
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("anthropic messages.create")
        return SynthResult(ok=False, text="", model=model, error=str(exc))

    text = _extract_text(response)
    if not text:
        return SynthResult(ok=False, text="", model=model, error="réponse vide")
    return SynthResult(ok=True, text=text, model=model)


def _extract_text(response) -> str:
    """Extrait le text concaténé d'une réponse Messages SDK."""
    try:
        content = getattr(response, "content", None) or response.get("content")  # type: ignore[union-attr]
    except AttributeError:
        return ""
    if not content:
        return ""
    chunks: list[str] = []
    for block in content:
        text = getattr(block, "text", None)
        if text is None and isinstance(block, dict):
            text = block.get("text")
        if text:
            chunks.append(text)
    return "\n".join(chunks).strip()
