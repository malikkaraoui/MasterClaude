"""Tests du client Ollama (mocks subprocess)."""

from __future__ import annotations

import subprocess

import pytest

from idriss import ollama_client


class FakeProc:
    def __init__(self, stdout: str = "", stderr: str = "", returncode: int = 0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


def test_run_model_ok(monkeypatch):
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        captured["input"] = kwargs.get("input")
        return FakeProc(stdout="réponse OK\n")

    monkeypatch.setattr(subprocess, "run", fake_run)
    result = ollama_client.run_model("qwen3.5:4b", "prompt test")
    assert result.ok is True
    assert "réponse OK" in result.text
    assert captured["cmd"] == ["ollama", "run", "qwen3.5:4b"]
    assert captured["input"] == "prompt test"


def test_run_model_non_zero_exit(monkeypatch):
    monkeypatch.setattr(
        subprocess, "run", lambda *a, **k: FakeProc(stderr="erreur cloud", returncode=1)
    )
    result = ollama_client.run_model("deepseek-v4-flash:cloud", "x")
    assert result.ok is False
    assert "erreur cloud" in (result.error or "")


def test_run_model_timeout(monkeypatch):
    def fake_run(*a, **k):
        raise subprocess.TimeoutExpired(cmd=a[0], timeout=1)

    monkeypatch.setattr(subprocess, "run", fake_run)
    result = ollama_client.run_model("modele", "x", timeout=0.5)
    assert result.ok is False
    assert "timeout" in (result.error or "")


def test_run_model_cli_absent(monkeypatch):
    def fake_run(*a, **k):
        raise FileNotFoundError("ollama")

    monkeypatch.setattr(subprocess, "run", fake_run)
    result = ollama_client.run_model("modele", "x")
    assert result.ok is False
    assert "introuvable" in (result.error or "")


def test_run_model_reponse_vide(monkeypatch):
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: FakeProc(stdout="   \n"))
    result = ollama_client.run_model("modele", "x")
    assert result.ok is False
    assert "vide" in (result.error or "")


def test_fan_out(monkeypatch, fake_ollama_responses):
    def fake_run(cmd, **kwargs):
        model = cmd[2]
        return FakeProc(stdout=fake_ollama_responses[model])

    monkeypatch.setattr(subprocess, "run", fake_run)
    results = ollama_client.fan_out(list(fake_ollama_responses.keys()), "prompt")
    assert len(results) == 2
    assert all(r.ok for r in results)
    assert {r.model for r in results} == set(fake_ollama_responses.keys())


def test_fan_out_partial_failure(monkeypatch):
    def fake_run(cmd, **kwargs):
        if "cloud" in cmd[2]:
            return FakeProc(stderr="cloud down", returncode=1)
        return FakeProc(stdout="local OK")

    monkeypatch.setattr(subprocess, "run", fake_run)
    results = ollama_client.fan_out(["x:cloud", "x:local"], "prompt")
    by_model = {r.model: r for r in results}
    assert by_model["x:cloud"].ok is False
    assert by_model["x:local"].ok is True


def test_fan_out_empty():
    assert ollama_client.fan_out([], "prompt") == []
