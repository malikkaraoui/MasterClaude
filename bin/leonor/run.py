"""Léonor orchestrator — stratège hebdomadaire (vendredi 22:00).

Pipeline simplifié vs Idriss : pas de fan-out Ollama. Sonnet direct + sanity
check Qwen local optionnel.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

from idriss.anthropic_client import _build_user_message  # noqa: F401  (pas utilisé directement)
from idriss.anthropic_client import synthesize as _synth_idriss  # noqa: F401  (compat ref)
from idriss.logging_setup import setup_logging
from idriss.ollama_client import run_model

from .compose import compose_context, render_prompt
from .inputs import collect_all
from .writer import StrategyNote, write_strategy

KILL_SWITCH = Path("/tmp/leonor-disabled")

LEONOR_SYSTEM = (
    "Tu es Léonor, stratège hebdomadaire. Tu lis les 7 derniers jours du projet "
    "(vault, CLAUDE.md projets, bilans Idriss). Tu cherches les liens entre les "
    "chantiers, ce qui se répète, ce qui dort, ce qui mérite d'être enterré. "
    "Pas de flatterie, pas de préambule. Format Markdown court, brut, actionnable. "
    "Sections obligatoires : "
    "## 3 propositions concrètes pour la semaine, "
    "## Ce qui se cherche entre les projets, "
    "## Chantier à enterrer, "
    "## Questions ouvertes."
)

SANITY_SYSTEM_PROMPT = (
    "Tu reçois 4 propositions stratégiques. Tu réponds en 5 lignes max : "
    "lesquelles sont réalistes vu les contraintes du vault, lesquelles ne le "
    "sont pas, et pourquoi. Français, brut."
)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Léonor — stratège hebdomadaire")
    parser.add_argument("--once", action="store_true", help="exécution réelle")
    parser.add_argument("--dry-run", action="store_true", help="pas d'écriture, logs only")
    parser.add_argument("--debug", action="store_true", help="logs DEBUG")
    parser.add_argument("--no-sanity", action="store_true", help="skip sanity-check Qwen")
    return parser.parse_args(argv)


def _env_path(name: str, default: str) -> Path:
    return Path(os.getenv(name, default)).expanduser()


def _call_sonnet(context: str, prompt: str, model: str, api_key: str | None):
    """Appel Sonnet direct (sans la fonction Idriss qui fan-out 2 réponses)."""
    if not api_key:
        return False, "", "ANTHROPIC_API_KEY absent"
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=LEONOR_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:  # noqa: BLE001
        return False, "", str(exc)

    chunks: list[str] = []
    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if text is None and isinstance(block, dict):
            text = block.get("text")
        if text:
            chunks.append(text)
    out = "\n".join(chunks).strip()
    if not out:
        return False, "", "réponse vide"
    return True, out, None


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    masterclaude_home = _env_path("MASTERCLAUDE_HOME", str(Path(__file__).resolve().parents[2]))
    vault = _env_path("MASTERCLAUDE_VAULT", "/Users/malik/Vault/Malik")

    env_file = masterclaude_home / ".env"
    if env_file.exists():
        load_dotenv(env_file)

    logger = setup_logging(masterclaude_home, debug=args.debug, name="leonor")
    logger.info("Léonor démarrage : args=%s", vars(args))

    if KILL_SWITCH.exists():
        logger.info("Kill switch présent (%s) — skip silencieux", KILL_SWITCH)
        return 0

    if not args.once and not args.dry_run:
        logger.error("Aucun mode choisi : --once ou --dry-run requis")
        return 2

    home_root = Path("/Users/malik")
    inputs = collect_all(vault, home_root)
    logger.info(
        "inputs : %d fichiers vault, %d CLAUDE.md, %d bilans Idriss",
        len(inputs.vault_files),
        len(inputs.claude_mds),
        len(inputs.idriss_bilans),
    )

    context = compose_context(inputs, vault_root=vault)
    template_path = Path(__file__).parent / "templates" / "prompt-strategy.txt"
    prompt = render_prompt(template_path, context)
    logger.debug("contexte composé : %d chars", len(context))

    synth_model = os.getenv("LEONOR_SYNTH_MODEL", "claude-sonnet-4-6")
    api_key = os.getenv("ANTHROPIC_API_KEY")

    logger.info("appel Sonnet : %s", synth_model)
    ok, sonnet_text, err = _call_sonnet(context, prompt, synth_model, api_key)

    body_parts: list[str] = []
    models_used: list[str] = []
    degraded: list[str] = []

    if ok:
        body_parts.append(sonnet_text)
        models_used.append(synth_model)
        logger.info("sonnet OK (%d chars)", len(sonnet_text))
    else:
        logger.warning("sonnet KO : %s", err)
        degraded.append(f"sonnet:{err}")
        body_parts.append("⚠ Synthèse Sonnet indisponible.\n")
        body_parts.append("## Contexte brut")
        body_parts.append(context)

    if ok and not args.no_sanity:
        sanity_model = os.getenv("LEONOR_SANITY_MODEL", "qwen3.5:4b")
        logger.info("sanity check Ollama : %s", sanity_model)
        sanity_prompt = f"{SANITY_SYSTEM_PROMPT}\n\n---\n\n{sonnet_text}"
        sanity = run_model(sanity_model, sanity_prompt, timeout=60)
        if sanity.ok:
            body_parts.append("\n---\n")
            body_parts.append(f"## Sanity-check ({sanity.model})")
            body_parts.append(sanity.text)
            models_used.append(sanity.model)
        else:
            logger.warning("sanity KO : %s", sanity.error)
            degraded.append(f"{sanity_model}:{sanity.error}")

    note = StrategyNote(
        body="\n".join(body_parts).strip() + "\n",
        models_used=models_used,
        degraded=degraded,
    )

    if args.dry_run:
        logger.info("dry-run : skip écriture (modèles : %s)", note.models_used)
        sys.stdout.write(note.body)
        return 0

    target = write_strategy(vault, note, today=date.today())
    logger.info("Léonor terminé : %s", target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
