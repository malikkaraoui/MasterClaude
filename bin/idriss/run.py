"""Idriss orchestrator — bilan quotidien 21:05.

Usage :
  python run.py --once       # exécution réelle, écrit dans le vault
  python run.py --dry-run    # log + skip écriture
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

from .anthropic_client import synthesize
from .compose import compose_summary, render_prompt
from .inputs import collect_all
from .logging_setup import setup_logging
from .ollama_client import fan_out
from .synthesis import compose_bilan
from .writer import write_bilan

KILL_SWITCH = Path("/tmp/idriss-disabled")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Idriss — bilan quotidien")
    parser.add_argument("--once", action="store_true", help="exécution réelle")
    parser.add_argument("--dry-run", action="store_true", help="pas d'écriture, logs only")
    parser.add_argument("--debug", action="store_true", help="logs DEBUG")
    return parser.parse_args(argv)


def _env_path(name: str, default: str) -> Path:
    return Path(os.getenv(name, default)).expanduser()


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    masterclaude_home = _env_path("MASTERCLAUDE_HOME", str(Path(__file__).resolve().parents[2]))
    vault = _env_path("MASTERCLAUDE_VAULT", "/Users/malik/Vault/Malik")

    env_file = masterclaude_home / ".env"
    if env_file.exists():
        load_dotenv(env_file)

    logger = setup_logging(masterclaude_home, debug=args.debug)
    logger.info("Idriss démarrage : args=%s", vars(args))

    if KILL_SWITCH.exists():
        logger.info("Kill switch présent (%s) — skip silencieux", KILL_SWITCH)
        return 0

    if not args.once and not args.dry_run:
        logger.error("Aucun mode choisi : --once ou --dry-run requis")
        return 2

    repos_root = Path("/Users/malik")
    inputs = collect_all(vault, masterclaude_home, repos_root)
    logger.info(
        "inputs : %d notes, %d handoffs, %d repos avec commits",
        len(inputs.notes),
        len(inputs.handoffs),
        len(inputs.commits),
    )

    summary = compose_summary(inputs, vault_root=vault)
    logger.debug("résumé brut (%d chars) :\n%s", len(summary), summary[:500])

    template_path = Path(__file__).parent / "templates" / "prompt-question.txt"
    prompt = render_prompt(template_path, summary)

    cloud_model = os.getenv("IDRISS_MODEL_CLOUD", "deepseek-v4-flash:cloud")
    local_model = os.getenv("IDRISS_MODEL_LOCAL", "qwen3.5:4b")
    models = [cloud_model, local_model]

    logger.info("fan-out Ollama : %s", models)
    ollama_results = fan_out(models, prompt)
    for res in ollama_results:
        if res.ok:
            logger.info("ollama %s OK (%.1fs, %d chars)", res.model, res.duration_s, len(res.text))
        else:
            logger.warning("ollama %s KO : %s", res.model, res.error)

    if not any(r.ok for r in ollama_results):
        logger.warning("degraded mode : aucun modèle Ollama disponible")

    synth = None
    if any(r.ok for r in ollama_results):
        responses = [(r.model, r.text) for r in ollama_results if r.ok]
        synth_model = os.getenv("IDRISS_SYNTH_MODEL", "claude-sonnet-4-6")
        logger.info("synthèse Sonnet : %s", synth_model)
        synth = synthesize(summary, responses, model=synth_model)
        if synth.ok:
            logger.info("sonnet OK (%d chars)", len(synth.text))
        else:
            logger.warning("sonnet KO : %s", synth.error)
    else:
        logger.info("skip synthèse Sonnet (pas de réponse Ollama)")

    bilan = compose_bilan(ollama_results, synth, summary)

    if args.dry_run:
        logger.info("dry-run : skip écriture (modèles utilisés : %s)", bilan.models_used)
        sys.stdout.write(bilan.body)
        return 0

    target = write_bilan(vault, bilan, today=date.today())
    logger.info("Idriss terminé : %s", target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
