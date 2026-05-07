---
kind: implementation-blueprint
version: 1
date: 2026-05-06
auteurs: [Malik (validation), Claude Opus 4.7 (rédaction)]
chantier: 1-telegram-pillage
source: /Users/malik/MasterHermesAgent/gateway/platforms/telegram_network.py
cible: /Users/malik/MasterClaude/lib/telegram_network.py
statut: prêt à implémenter
---

# Blueprint — Pillage Telegram (Hermes → MasterClaude)

## Objectif

Porter le `TelegramFallbackTransport` de Hermes Agent vers MasterClaude pour rendre le bridge Telegram **résilient aux pannes DNS / réseaux qui bloquent api.telegram.org**.

Le module fait du DNS-over-HTTPS (Google + Cloudflare), garde le SNI `api.telegram.org` constant, et retombe en cascade sur des IPs valides quand la primaire échoue (ConnectError/ConnectTimeout uniquement — jamais sur erreurs HTTP).

## Stack

- Python 3.11+ (déjà en place)
- `httpx` (déjà installé via `python-telegram-bot`)
- Pas de nouvelle dépendance — `httpx` + `ipaddress` (stdlib) + `socket` (stdlib)

## Contraintes (non négociables)

- Pas de signing dans les commits (cf. CLAUDE.md §13)
- Messages FR, atomiques
- Pré-push gate (`bash scripts/pre-push-gate.sh`) **doit passer** avant tout push (§24)
- Pas de push sans OK explicite Malik
- Anti-hallucination (§5) : si tu doutes d'une API httpx ou d'un comportement → demande, ne devine pas
- 3 commits séparés (A, B, C) — pas de commit-monstre

---

## Commit A — Créer `lib/telegram_network.py`

### Adaptation Hermes → MasterClaude

Le code Hermes original a une dépendance vers `gateway.platforms.base.resolve_proxy_url` qui n'existe pas chez nous. On la remplace par une version simplifiée qui lit uniquement les env vars (`TELEGRAM_PROXY`, `HTTPS_PROXY`, `https_proxy`).

### Étapes

1. Créer le dossier `lib/` à la racine de MasterClaude (s'il n'existe pas)
2. Écrire `lib/telegram_network.py` avec ce contenu **exact** :

```python
"""Telegram-specific network helpers (porté depuis Hermes Agent).

Provides a hostname-preserving fallback transport for networks where
api.telegram.org resolves to an endpoint that is unreachable from the current
host. The transport keeps the logical request host and TLS SNI as
api.telegram.org while retrying the TCP connection against one or more fallback
IPv4 addresses.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import socket
from typing import Iterable, Optional

import httpx

logger = logging.getLogger(__name__)

_TELEGRAM_API_HOST = "api.telegram.org"

# DNS-over-HTTPS providers used to discover Telegram API IPs that may differ
# from the (potentially unreachable) IP returned by the local system resolver.
_DOH_TIMEOUT = 4.0  # seconds — bounded so connect() isn't noticeably delayed

_DOH_PROVIDERS: list[dict] = [
    {
        "url": "https://dns.google/resolve",
        "params": {"name": _TELEGRAM_API_HOST, "type": "A"},
        "headers": {},
    },
    {
        "url": "https://cloudflare-dns.com/dns-query",
        "params": {"name": _TELEGRAM_API_HOST, "type": "A"},
        "headers": {"Accept": "application/dns-json"},
    },
]

# Last-resort IPs when DoH is also blocked. Stable Telegram Bot API
# endpoint in the 149.154.160.0/20 block.
_SEED_FALLBACK_IPS: list[str] = ["149.154.167.220"]


def _resolve_proxy_url(target_hosts=None) -> Optional[str]:
    """Resolve proxy URL from env vars.

    Order: TELEGRAM_PROXY > HTTPS_PROXY > https_proxy.
    target_hosts kept for API compat with Hermes (not used here — env-only).
    """
    for var in ("TELEGRAM_PROXY", "HTTPS_PROXY", "https_proxy"):
        val = os.environ.get(var, "").strip()
        if val:
            return val
    return None


class TelegramFallbackTransport(httpx.AsyncBaseTransport):
    """Retry Telegram Bot API requests via fallback IPs while preserving TLS/SNI.

    Requests continue to target https://api.telegram.org/... logically, but on
    connect failures the underlying TCP connection is retried against a known
    reachable IP. This is effectively the programmatic equivalent of
    ``curl --resolve api.telegram.org:443:<ip>``.
    """

    def __init__(self, fallback_ips: Iterable[str], **transport_kwargs):
        self._fallback_ips = [ip for ip in dict.fromkeys(_normalize_fallback_ips(fallback_ips))]
        proxy_url = _resolve_proxy_url(target_hosts=[_TELEGRAM_API_HOST, *self._fallback_ips])
        if proxy_url and "proxy" not in transport_kwargs:
            transport_kwargs["proxy"] = proxy_url
        self._primary = httpx.AsyncHTTPTransport(**transport_kwargs)
        self._fallbacks = {
            ip: httpx.AsyncHTTPTransport(**transport_kwargs) for ip in self._fallback_ips
        }
        self._sticky_ip: Optional[str] = None
        self._sticky_lock = asyncio.Lock()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if request.url.host != _TELEGRAM_API_HOST or not self._fallback_ips:
            return await self._primary.handle_async_request(request)

        sticky_ip = self._sticky_ip
        attempt_order: list[Optional[str]] = [sticky_ip] if sticky_ip else [None]
        for ip in self._fallback_ips:
            if ip != sticky_ip:
                attempt_order.append(ip)

        last_error: Exception | None = None
        for ip in attempt_order:
            candidate = request if ip is None else _rewrite_request_for_ip(request, ip)
            transport = self._primary if ip is None else self._fallbacks[ip]
            try:
                response = await transport.handle_async_request(candidate)
                if ip is not None and self._sticky_ip != ip:
                    async with self._sticky_lock:
                        if self._sticky_ip != ip:
                            self._sticky_ip = ip
                            logger.warning(
                                "[Telegram] Primary api.telegram.org path unreachable; using sticky fallback IP %s",
                                ip,
                            )
                return response
            except Exception as exc:
                last_error = exc
                if not _is_retryable_connect_error(exc):
                    raise
                if ip is None:
                    logger.warning(
                        "[Telegram] Primary api.telegram.org connection failed (%s); trying fallback IPs %s",
                        exc,
                        ", ".join(self._fallback_ips),
                    )
                    continue
                logger.warning("[Telegram] Fallback IP %s failed: %s", ip, exc)
                continue

        if last_error is None:
            raise RuntimeError("All Telegram fallback IPs exhausted but no error was recorded")
        raise last_error

    async def aclose(self) -> None:
        await self._primary.aclose()
        for transport in self._fallbacks.values():
            await transport.aclose()


def _normalize_fallback_ips(values: Iterable[str]) -> list[str]:
    normalized: list[str] = []
    for value in values:
        raw = str(value).strip()
        if not raw:
            continue
        try:
            addr = ipaddress.ip_address(raw)
        except ValueError:
            logger.warning("Ignoring invalid Telegram fallback IP: %r", raw)
            continue
        if addr.version != 4:
            logger.warning("Ignoring non-IPv4 Telegram fallback IP: %s", raw)
            continue
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_unspecified:
            logger.warning("Ignoring private/internal Telegram fallback IP: %s", raw)
            continue
        normalized.append(str(addr))
    return normalized


def parse_fallback_ip_env(value: Optional[str]) -> list[str]:
    if not value:
        return []
    parts = [part.strip() for part in value.split(",")]
    return _normalize_fallback_ips(parts)


def _resolve_system_dns() -> set[str]:
    """Return the IPv4 addresses that the OS resolver gives for api.telegram.org."""
    try:
        results = socket.getaddrinfo(_TELEGRAM_API_HOST, 443, socket.AF_INET)
        return {addr[4][0] for addr in results}
    except Exception:
        return set()


async def _query_doh_provider(
    client: httpx.AsyncClient, provider: dict
) -> list[str]:
    """Query one DoH provider and return A-record IPs."""
    try:
        resp = await client.get(
            provider["url"], params=provider["params"], headers=provider["headers"]
        )
        resp.raise_for_status()
        data = resp.json()
        ips: list[str] = []
        for answer in data.get("Answer", []):
            if answer.get("type") != 1:  # A record
                continue
            raw = answer.get("data", "").strip()
            try:
                ipaddress.ip_address(raw)
                ips.append(raw)
            except ValueError:
                continue
        return ips
    except Exception as exc:
        logger.debug("DoH query to %s failed: %s", provider["url"], exc)
        return []


async def discover_fallback_ips() -> list[str]:
    """Auto-discover Telegram API IPs via DNS-over-HTTPS.

    Resolves api.telegram.org through Google and Cloudflare DoH and returns all
    unique A records. Falls back to a hardcoded seed list only when DoH yields
    no usable answers.
    """
    async with httpx.AsyncClient(timeout=httpx.Timeout(_DOH_TIMEOUT)) as client:
        doh_tasks = [_query_doh_provider(client, p) for p in _DOH_PROVIDERS]
        system_dns_task = asyncio.to_thread(_resolve_system_dns)
        results = await asyncio.gather(system_dns_task, *doh_tasks, return_exceptions=True)

    system_ips: set[str] = results[0] if isinstance(results[0], set) else set()

    doh_ips: list[str] = []
    for r in results[1:]:
        if isinstance(r, list):
            doh_ips.extend(r)

    seen: set[str] = set()
    candidates: list[str] = []
    for ip in doh_ips:
        if ip not in seen:
            seen.add(ip)
            candidates.append(ip)

    validated = _normalize_fallback_ips(candidates)

    if validated:
        logger.debug("Discovered Telegram fallback IPs via DoH: %s", ", ".join(validated))
        return validated

    logger.info(
        "DoH discovery yielded no usable IPs (system DNS: %s); using seed fallback IPs %s",
        ", ".join(system_ips) or "unknown",
        ", ".join(_SEED_FALLBACK_IPS),
    )
    return list(_SEED_FALLBACK_IPS)


def _rewrite_request_for_ip(request: httpx.Request, ip: str) -> httpx.Request:
    original_host = request.url.host or _TELEGRAM_API_HOST
    url = request.url.copy_with(host=ip)
    headers = request.headers.copy()
    headers["host"] = original_host
    extensions = dict(request.extensions)
    extensions["sni_hostname"] = original_host
    return httpx.Request(
        method=request.method,
        url=url,
        headers=headers,
        stream=request.stream,
        extensions=extensions,
    )


def _is_retryable_connect_error(exc: Exception) -> bool:
    return isinstance(exc, (httpx.ConnectTimeout, httpx.ConnectError))
```

3. **Commit A** :
   ```
   git add lib/telegram_network.py
   git commit -m "feat(telegram): port TelegramFallbackTransport (DoH + SNI fallback)

   Pillage depuis Hermes Agent. Permet au bridge Telegram de survivre quand
   api.telegram.org est injoignable via DNS système : DoH Google+Cloudflare,
   IPs seed en dernier recours, sticky-IP après premier succès, SNI préservé."
   ```

---

## Commit B — Patcher `scripts/telegram-bridge.py`

### Patch 1 : ajout imports (après ligne 23, avant `load_dotenv()` ligne 25)

**Localisation** : entre la ligne 23 (`from telegram.ext import ...`) et la ligne 25 (`load_dotenv()`).

**Ajouter** :
```python
import sys
from pathlib import Path as _Path
sys.path.insert(0, str(_Path(__file__).resolve().parent.parent / "lib"))
from telegram_network import (
    TelegramFallbackTransport,
    discover_fallback_ips,
    parse_fallback_ip_env,
)
from telegram.request import HTTPXRequest
```

⚠ **Note** : `Path` est probablement déjà importé ligne 16 (`from pathlib import Path`). Si oui, tu peux réutiliser sans aliaser. Vérifie avec un Grep avant.

### Patch 2 : `TelegramBot.__init__` (ligne 549-557)

Localiser exactement cette zone :

```python
class TelegramBot:
    def __init__(self):
        self.session_mgr = SessionManager()
        self.rate_limiter = RateLimiter()
        self.claude_runners: Dict[Tuple[int, str], ClaudeRunner] = {}
        self.notification_fifo = NotificationFifo()
        self.inbox_writer = InboxWriter()
        self.transcriber = VoiceTranscriber()
        self.polisher = OllamaPolisher()
        self.app: Optional[Application] = None
```

**Ajouter à la fin de `__init__`**, après `self.app = ...` :

```python
        self._fallback_ips_cache: Optional[list[str]] = None
```

### Patch 3 : méthode `run()` (ligne 831-835)

**Avant** :
```python
    async def run(self):
        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
            raise ValueError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required")

        self.app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
```

**Après** :
```python
    async def run(self):
        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
            raise ValueError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required")

        # IPs fallback : env override > DoH discovery > seed list
        env_ips = parse_fallback_ip_env(os.getenv("TELEGRAM_FALLBACK_IPS"))
        if env_ips:
            self._fallback_ips_cache = env_ips
            logger.info(f"Using TELEGRAM_FALLBACK_IPS from env: {env_ips}")
        else:
            try:
                self._fallback_ips_cache = await discover_fallback_ips()
                logger.info(f"Discovered Telegram fallback IPs: {self._fallback_ips_cache}")
            except Exception as e:
                logger.warning(f"DoH discovery failed: {e} — using seed list")
                self._fallback_ips_cache = ["149.154.167.220"]

        robust_transport = TelegramFallbackTransport(self._fallback_ips_cache)
        request = HTTPXRequest(httpx_kwargs={"transport": robust_transport})
        self.app = Application.builder().token(TELEGRAM_BOT_TOKEN).request(request).build()
```

### Vérification post-patch

```bash
python3 -c "import ast; ast.parse(open('scripts/telegram-bridge.py').read()); print('OK')"
```

### Commit B
```
git add scripts/telegram-bridge.py
git commit -m "feat(telegram): injecter TelegramFallbackTransport dans le bridge

Au démarrage : auto-discover via DoH (override possible TELEGRAM_FALLBACK_IPS),
puis branche le transport robuste sur le HTTPXRequest de python-telegram-bot.
Les routes api.telegram.org survivent désormais aux pannes DNS locales."
```

---

## Commit C — Tests `test/test_telegram_network.py`

### Étapes

1. Créer le fichier `test/test_telegram_network.py`
2. Vérifier que `pytest` + `pytest-asyncio` sont dispo : `pip list | grep -i pytest`
   - Si manquants : `pip install pytest pytest-asyncio` dans le venv courant (ou `bin/.shared-venv` quand il existera)
3. Contenu :

```python
"""Tests for lib/telegram_network.py."""
from __future__ import annotations

import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from telegram_network import (  # noqa: E402
    TelegramFallbackTransport,
    _is_retryable_connect_error,
    _normalize_fallback_ips,
    _rewrite_request_for_ip,
    parse_fallback_ip_env,
)


def test_normalize_filters_invalid():
    out = _normalize_fallback_ips(
        ["149.154.167.220", "127.0.0.1", "10.0.0.1", "::1", "not-an-ip", "  ", "8.8.8.8"]
    )
    assert out == ["149.154.167.220", "8.8.8.8"]


def test_parse_env_csv():
    assert parse_fallback_ip_env("149.154.167.220, 8.8.8.8") == ["149.154.167.220", "8.8.8.8"]
    assert parse_fallback_ip_env("") == []
    assert parse_fallback_ip_env(None) == []


def test_retryable_classification():
    assert _is_retryable_connect_error(httpx.ConnectError("x"))
    assert _is_retryable_connect_error(httpx.ConnectTimeout("x"))
    assert not _is_retryable_connect_error(httpx.ReadTimeout("x"))
    assert not _is_retryable_connect_error(ValueError("x"))


def test_rewrite_preserves_sni_and_host_header():
    original = httpx.Request("GET", "https://api.telegram.org/bot123/getMe")
    rewritten = _rewrite_request_for_ip(original, "149.154.167.220")
    assert rewritten.url.host == "149.154.167.220"
    assert rewritten.headers["host"] == "api.telegram.org"
    assert rewritten.extensions.get("sni_hostname") == "api.telegram.org"
    assert rewritten.method == "GET"
    assert str(rewritten.url.path) == "/bot123/getMe"


@pytest.mark.asyncio
async def test_transport_passthrough_for_non_telegram_host(monkeypatch):
    """Non-telegram hosts go through primary transport untouched."""
    transport = TelegramFallbackTransport(["149.154.167.220"])
    calls = {"primary": 0, "fallback": 0}

    async def fake_primary(req):
        calls["primary"] += 1
        return httpx.Response(200, request=req)

    async def fake_fallback(req):
        calls["fallback"] += 1
        return httpx.Response(200, request=req)

    monkeypatch.setattr(transport._primary, "handle_async_request", fake_primary)
    for t in transport._fallbacks.values():
        monkeypatch.setattr(t, "handle_async_request", fake_fallback)

    req = httpx.Request("GET", "https://example.com/")
    resp = await transport.handle_async_request(req)
    assert resp.status_code == 200
    assert calls == {"primary": 1, "fallback": 0}
    await transport.aclose()


@pytest.mark.asyncio
async def test_transport_falls_back_on_connect_error(monkeypatch):
    """Primary ConnectError → tries fallback IPs in order, sticks on success."""
    transport = TelegramFallbackTransport(["149.154.167.220"])

    async def primary_fails(req):
        raise httpx.ConnectError("primary down")

    async def fallback_ok(req):
        return httpx.Response(200, request=req)

    monkeypatch.setattr(transport._primary, "handle_async_request", primary_fails)
    monkeypatch.setattr(
        transport._fallbacks["149.154.167.220"], "handle_async_request", fallback_ok
    )

    req = httpx.Request("GET", "https://api.telegram.org/bot123/getMe")
    resp = await transport.handle_async_request(req)
    assert resp.status_code == 200
    assert transport._sticky_ip == "149.154.167.220"
    await transport.aclose()


@pytest.mark.asyncio
async def test_non_retryable_error_propagates(monkeypatch):
    """Non-connect errors (e.g. ReadTimeout) bubble up immediately."""
    transport = TelegramFallbackTransport(["149.154.167.220"])

    async def primary_read_timeout(req):
        raise httpx.ReadTimeout("read timeout")

    monkeypatch.setattr(transport._primary, "handle_async_request", primary_read_timeout)

    req = httpx.Request("GET", "https://api.telegram.org/bot123/getMe")
    with pytest.raises(httpx.ReadTimeout):
        await transport.handle_async_request(req)
    await transport.aclose()
```

4. Lancer : `python3 -m pytest test/test_telegram_network.py -v`
5. **Si pytest-asyncio missing** : ajouter `asyncio_mode = "auto"` dans `pyproject.toml` ou `pytest.ini` ou marker chaque test comme dans le fichier.

### Commit C
```
git add test/test_telegram_network.py
git commit -m "test(telegram): couvrir TelegramFallbackTransport (sticky, SNI, retry)

Tests : normalisation IPs, parse env CSV, classification erreurs retryables,
préservation SNI/host header, passthrough non-telegram, fallback sur
ConnectError, propagation erreurs non-connect."
```

---

## Critères d'arrêt « ça marche »

1. ☐ `python3 -c "from lib.telegram_network import TelegramFallbackTransport; print('OK')"` (depuis `/Users/malik/MasterClaude`) renvoie OK — vérifier que `lib/` est bien sur sys.path ou utiliser `sys.path` hack
2. ☐ `python3 -m py_compile scripts/telegram-bridge.py` ne renvoie rien
3. ☐ `python3 -m pytest test/test_telegram_network.py -v` → 7 tests passent
4. ☐ `bash scripts/pre-push-gate.sh` → exit 0 (jamais `--no-verify`)
5. ☐ Lancement à blanc du bridge : `python3 scripts/telegram-bridge.py` doit logger `Discovered Telegram fallback IPs: [...]` ou `Using TELEGRAM_FALLBACK_IPS from env: [...]` puis `Telegram bot started (polling mode)` — Ctrl+C après confirmation visuelle, pas de production
6. ☐ Test offline (debranchement DNS local simulé) → optionnel, à faire plus tard

## Pré-push gate

Obligatoire avant chaque `git push` (cf. CLAUDE.md §24) :
```bash
bash scripts/pre-push-gate.sh
```
5 étapes : secrets → fichiers sensibles → lint → build → tests. **Ne jamais utiliser `--no-verify`**.

## Pas de push sans OK

Une fois les 3 commits créés + gate verte → **stop**. Demande à Malik si on push, ou si on enchaîne sur PR draft via `/review-copilot` (cf. §25).

---

## Variables d'environnement (optionnelles)

À ajouter dans `.env` si besoin de forcer des IPs ou un proxy :

```dotenv
# Override DoH discovery avec IPs explicites (CSV)
TELEGRAM_FALLBACK_IPS=149.154.167.220,149.154.175.50

# Proxy spécifique Telegram (sinon HTTPS_PROXY est utilisé)
TELEGRAM_PROXY=http://user:pass@proxy.example.com:8080
```

`.gitignore` couvre déjà `.env` — vérifier.

---

## Anti-hallucination (§5 CLAUDE.md)

Si tu rencontres :
- Une API `httpx` que tu n'as pas vue → `mcp__plugin_context7_context7__query-docs` avant de coder
- Un comportement `python-telegram-bot` non testé → demander à Malik
- Une dépendance `gateway.platforms.base` (Hermes-only) → **ne pas l'importer**, utiliser le `_resolve_proxy_url` simplifié ci-dessus
- Un module qui n'existe pas dans MasterClaude → demander avant de l'inventer

---

## Ordre strict de livraison

1. **Commit A** (lib/telegram_network.py)  → vérif import
2. **Commit B** (patch telegram-bridge.py) → vérif syntaxe + dry-run bridge
3. **Commit C** (tests) → pytest passe
4. **Branche dédiée** : `git checkout -b feat/telegram-fallback-transport` (si pas déjà fait avant commits)
5. **Gate pré-push** → 5 étapes vertes (`bash scripts/pre-push-gate.sh`)
6. **Séquence §25 CLAUDE.md (auto, sans demander)** :
   1. `/review-copilot` → handoff JSON dans `docs/handoffs/`
   2. `git add docs/handoffs/* && git commit -m "docs(handoff): review Copilot — telegram fallback"` + push branche
   3. `gh pr create --draft --base main --title "feat(telegram): TelegramFallbackTransport (DoH + SNI)" --body "<résumé 3 commits>"`
   4. **PR draft → ready_for_review** (`gh pr ready`) — sinon Copilot ne review pas
   5. `/copilot-loop` (ou subscribe_pr_activity webhook)
   6. Attendre verdict Copilot
7. **Si Copilot demande des fixes** : appliquer, push, attendre re-review
8. **Si Copilot approuve** : merge squash sur main + push main
   ```bash
   gh pr merge --squash --delete-branch
   git checkout main && git pull
   ```
9. **Stop** : reporter à Malik (Telegram via FIFO ou message direct) avec URL PR mergée + SHA main

Pas de raccourci. Pas de fusion de commits A/B/C. Pas de `--no-verify`. Pas de signing.

**Verrou humain** : si Copilot demande des changements > 50 lignes ou questionne l'archi → STOP, demande à Malik avant de continuer.
