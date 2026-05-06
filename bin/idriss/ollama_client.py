"""Client Ollama : subprocess CLI `ollama run <model>` (cloud + local).

Décision Malik 2026-05-06 : on passe par la CLI ollama, pas l'API HTTP — le
binaire gère lui-même l'auth Cloud via ~/.ollama/. Le modèle suffixé `:cloud`
route automatiquement vers Ollama Cloud, le modèle local reste à `localhost:11434`.

Implémentation : `subprocess.run` synchrone + `ThreadPoolExecutor` pour fan-out
parallèle (pas asyncio — plus simple, pas de risque de shell injection car on
passe la liste d'arguments sans `shell=True`).
"""

from __future__ import annotations

import logging
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 120.0


@dataclass
class OllamaResult:
    model: str
    ok: bool
    text: str
    error: str | None = None
    duration_s: float = 0.0


def run_model(model: str, prompt: str, timeout: float = DEFAULT_TIMEOUT) -> OllamaResult:
    """Lance `ollama run <model>` avec prompt en stdin, renvoie stdout."""
    start = time.monotonic()
    try:
        proc = subprocess.run(
            ["ollama", "run", model],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError:
        return OllamaResult(model=model, ok=False, text="", error="ollama CLI introuvable")
    except subprocess.TimeoutExpired:
        return OllamaResult(
            model=model,
            ok=False,
            text="",
            error=f"timeout après {timeout}s",
            duration_s=time.monotonic() - start,
        )
    except OSError as exc:
        return OllamaResult(
            model=model, ok=False, text="", error=f"OSError: {exc}", duration_s=time.monotonic() - start
        )

    duration = time.monotonic() - start
    if proc.returncode != 0:
        err = (proc.stderr or "").strip() or f"exit {proc.returncode}"
        return OllamaResult(model=model, ok=False, text="", error=err, duration_s=duration)

    text = (proc.stdout or "").strip()
    if not text:
        return OllamaResult(
            model=model, ok=False, text="", error="réponse vide", duration_s=duration
        )
    return OllamaResult(model=model, ok=True, text=text, duration_s=duration)


def fan_out(models: list[str], prompt: str, timeout: float = DEFAULT_TIMEOUT) -> list[OllamaResult]:
    """Lance les modèles en parallèle (threads), retourne les résultats dans l'ordre."""
    if not models:
        return []
    with ThreadPoolExecutor(max_workers=len(models)) as pool:
        futures = [pool.submit(run_model, m, prompt, timeout) for m in models]
        return [f.result() for f in futures]
