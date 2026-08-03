# Security Policy

## Supported version

Security fixes target the latest release on the default branch.

## Reporting

Please report suspected vulnerabilities privately through GitHub Security Advisories. Do not include real API keys, session tokens, memory contents or personal data in a public issue.

## Deployment baseline

- Replace the example `SERVICE_TOKEN` before starting the service.
  The server refuses to start with the placeholder value or any token shorter
  than 32 characters.
- `MCP_PATH_TOKEN` travels inside the URL path. URLs are commonly recorded by
  reverse proxies, CDN logs and browser history — treat this mode as a
  compatibility fallback for clients that cannot send headers, prefer the
  `Authorization` header, and rotate the path token more aggressively.
- Keep `.env`, `state/`, OAuth state, transition journals and `memory-data/` out of version control.
- Bind the service to loopback unless a trusted reverse proxy provides TLS and access control.
- Leave model, memory and notification integrations disabled until each one has been tested independently.
- Treat `/v1/settle`, `/v1/conversation-event`, `/v1/heartbeat` and `/v1/drive-feedback` as state-changing endpoints.
- Use independent values for `SERVICE_TOKEN`, `MCP_PATH_TOKEN` and `OAUTH_APPROVAL_TOKEN`.
- Keep external-memory credentials such as `OMBRE_MCP_TOKEN` in the server-side
  environment only. Never place them in a browser bundle, URL or repository,
  and never substitute an external service's Dashboard password.
- Never expose an MCP path token in screenshots, documentation, analytics or public URLs.
- Remote OAuth deployments must use HTTPS. Do not weaken PKCE or redirect URI validation.
- Do not put chat transcripts, credentials or stable identity/core instructions in handoff notes.
