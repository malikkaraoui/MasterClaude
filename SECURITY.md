# Security Policy

## Supported Versions

Only the latest minor version receives security updates.

<!-- AUTO-GENERATED — do not edit manually. Run: node scripts/update-security.js -->
| Version  | Supported          |
| -------- | ------------------ |
| 0.26.x   | :white_check_mark: |
| < 0.26   | :x:                |
<!-- END AUTO-GENERATED -->

## Reporting a Vulnerability

Open an issue on [GitHub Issues](https://github.com/malikkaraoui/claude-atelier/issues) with the label `security`.

Please include:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact

You can expect a response within 48 hours. If the vulnerability is confirmed, a fix will be released as a patch version and credited to you (unless you prefer to stay anonymous).

> This package contains configuration files and CLI scripts — no authentication, cryptography, or network servers are involved. The primary attack surface is shell script injection in `scripts/pre-push-gate.sh` and hook execution via Claude Code.
