# Security Policy

## Supported version

Security fixes target the latest release on the default branch.

## Reporting

Please report suspected vulnerabilities privately through GitHub Security Advisories. Do not include real API keys, session tokens, memory contents or personal data in a public issue.

## Deployment baseline

- Replace the example `SERVICE_TOKEN` before starting the service.
- Keep `.env`, `state/` and `memory-data/` out of version control.
- Bind the service to loopback unless a trusted reverse proxy provides TLS and access control.
- Leave model, memory and notification integrations disabled until each one has been tested independently.
- Treat `/v1/settle`, `/v1/conversation-event`, `/v1/heartbeat` and `/v1/drive-feedback` as state-changing endpoints.
