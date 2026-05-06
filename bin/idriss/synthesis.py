"""Synthèse finale : compose le bilan Markdown à partir des résultats Ollama+Sonnet."""

from __future__ import annotations

from dataclasses import dataclass

from .anthropic_client import SynthResult
from .ollama_client import OllamaResult


@dataclass
class Bilan:
    body: str
    models_used: list[str]
    degraded: list[str]


def compose_bilan(
    ollama_results: list[OllamaResult],
    synth: SynthResult | None,
    raw_summary: str,
) -> Bilan:
    models_used: list[str] = []
    degraded: list[str] = []

    parts: list[str] = []

    if synth and synth.ok:
        parts.append(synth.text.strip())
        models_used.append(synth.model)
    else:
        if synth and synth.error:
            degraded.append(f"sonnet:{synth.error}")
        parts.append("⚠ Synthèse Sonnet indisponible — fallback brut.\n")
        parts.append("## Résumé brut")
        parts.append(raw_summary.strip())

    parts.append("\n---\n")
    parts.append("## Réponses Ollama (brut)")
    if not ollama_results:
        parts.append("_(aucun modèle Ollama interrogé)_")
    for res in ollama_results:
        parts.append(f"\n### {res.model}")
        if res.ok:
            parts.append(res.text.strip())
            models_used.append(res.model)
        else:
            parts.append(f"⚠ indisponible : {res.error}")
            degraded.append(f"{res.model}:{res.error}")

    body = "\n".join(parts).strip() + "\n"
    return Bilan(body=body, models_used=models_used, degraded=degraded)
