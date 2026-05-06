#!/usr/bin/env python3
"""
transcribe-daemon.py — Mini-daemon Whisper sur socket Unix
Socket : /tmp/tg-transcribe.sock
Protocol : JSON newline-delimited
  IN  : {"audio_path": "/tmp/voice_xxx.oga", "language": "fr"}
  OUT : {"transcript": "..."} ou {"error": "..."}
"""
import asyncio
import json
import os
import sys
import signal

SOCK_PATH = "/tmp/tg-transcribe.sock"

# Whisper chargé une seule fois au démarrage
try:
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    print(f"[transcribe] Whisper small chargé", flush=True)
except ImportError:
    model = None
    print("[transcribe] WARN: faster_whisper absent — transcription désactivée", flush=True)


async def handle(reader, writer):
    try:
        raw = await reader.readline()
        if not raw:
            return
        req = json.loads(raw.decode())
        audio_path = req.get("audio_path", "")
        language = req.get("language", "fr")

        if not model:
            resp = {"error": "faster_whisper non installé"}
        elif not os.path.exists(audio_path):
            resp = {"error": f"fichier introuvable: {audio_path}"}
        else:
            segments, _ = model.transcribe(audio_path, language=language, beam_size=1)
            text = " ".join(s.text.strip() for s in segments).strip()
            resp = {"transcript": text or "(vide)"}
    except Exception as e:
        resp = {"error": str(e)}

    writer.write((json.dumps(resp, ensure_ascii=False) + "\n").encode())
    await writer.drain()
    writer.close()


async def main():
    # Nettoyer socket périmé
    if os.path.exists(SOCK_PATH):
        os.unlink(SOCK_PATH)

    server = await asyncio.start_unix_server(handle, path=SOCK_PATH)
    os.chmod(SOCK_PATH, 0o600)
    print(f"[transcribe] écoute sur {SOCK_PATH}", flush=True)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, server.close)

    async with server:
        await server.serve_forever()

    if os.path.exists(SOCK_PATH):
        os.unlink(SOCK_PATH)


if __name__ == "__main__":
    asyncio.run(main())
