"""Tests de la composition du bilan final."""

from __future__ import annotations

from idriss.anthropic_client import SynthResult
from idriss.ollama_client import OllamaResult
from idriss.synthesis import compose_bilan


def test_compose_bilan_ok():
    ollama = [
        OllamaResult(model="cloud", ok=True, text="cloud reply"),
        OllamaResult(model="local", ok=True, text="local reply"),
    ]
    synth = SynthResult(ok=True, text="## Conviction\nx", model="claude-sonnet-4-6")
    bilan = compose_bilan(ollama, synth, raw_summary="brut")
    assert "Conviction" in bilan.body
    assert "cloud reply" in bilan.body
    assert "local reply" in bilan.body
    assert bilan.degraded == []
    assert "claude-sonnet-4-6" in bilan.models_used


def test_compose_bilan_sonnet_down():
    ollama = [OllamaResult(model="local", ok=True, text="local reply")]
    synth = SynthResult(ok=False, text="", model="claude-sonnet-4-6", error="429")
    bilan = compose_bilan(ollama, synth, raw_summary="résumé brut")
    assert "Synthèse Sonnet indisponible" in bilan.body
    assert "résumé brut" in bilan.body
    assert any("sonnet" in d for d in bilan.degraded)


def test_compose_bilan_tout_down():
    ollama = [
        OllamaResult(model="cloud", ok=False, text="", error="down"),
        OllamaResult(model="local", ok=False, text="", error="off"),
    ]
    bilan = compose_bilan(ollama, synth=None, raw_summary="brut")
    assert "indisponible" in bilan.body
    assert "brut" in bilan.body
    # Les 2 erreurs Ollama sont remontées dans degraded
    assert any("cloud" in d for d in bilan.degraded)
    assert any("local" in d for d in bilan.degraded)
    # synth=None : pas de dégradation Sonnet listée
    assert not any("sonnet" in d for d in bilan.degraded)


def test_compose_bilan_ollama_partial():
    ollama = [
        OllamaResult(model="cloud", ok=False, text="", error="down"),
        OllamaResult(model="local", ok=True, text="local OK"),
    ]
    synth = SynthResult(ok=True, text="## Conviction\nokOk", model="claude-sonnet-4-6")
    bilan = compose_bilan(ollama, synth, raw_summary="brut")
    assert "local OK" in bilan.body
    assert "indisponible : down" in bilan.body
    assert any("cloud" in d for d in bilan.degraded)
