import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OAuthProvider } from '../src/oauth-provider.js';

function request(method, value = '') {
  const stream = Readable.from(value ? [value] : []);
  stream.method = method;
  stream.headers = {};
  return stream;
}

function response() {
  return {
    status: null,
    headers: {},
    body: '',
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = { ...this.headers, ...headers };
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(value = '') {
      this.body += value;
    },
  };
}

async function provider() {
  const directory = await mkdtemp(join(tmpdir(), 'xinchao-oauth-'));
  const statePath = join(directory, 'oauth.json');
  const instance = new OAuthProvider({
    enabled: true,
    publicBaseUrl: 'https://xinchao.example.test',
    approvalToken: 'correct-horse-battery-staple',
    statePath,
    accessTtlSeconds: 3600,
    refreshTtlSeconds: 86400,
  });
  await instance.init();
  return { instance, statePath };
}

async function register(instance, redirectUri = 'https://claude.ai/api/mcp/auth_callback') {
  const reply = response();
  const body = JSON.stringify({
    client_name: 'Claude',
    redirect_uris: [redirectUri],
  });
  await instance.handle(
    request('POST', body),
    reply,
    new URL('https://xinchao.example.test/oauth/register'),
  );
  return { reply, data: JSON.parse(reply.body) };
}

test('OAuth discovery advertises protected resource, DCR, PKCE and refresh', async () => {
  const { instance } = await provider();
  assert.deepEqual(instance.protectedResourceMetadata(), {
    resource: 'https://xinchao.example.test/mcp',
    authorization_servers: ['https://xinchao.example.test'],
    bearer_methods_supported: ['header'],
    scopes_supported: ['xinchao'],
  });
  const metadata = instance.authorizationServerMetadata();
  assert.equal(metadata.registration_endpoint, 'https://xinchao.example.test/oauth/register');
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.ok(metadata.grant_types_supported.includes('refresh_token'));
  assert.match(instance.wwwAuthenticate(), /resource_metadata="https:\/\/xinchao\.example\.test\/\.well-known\/oauth-protected-resource\/mcp"/);
});

test('DCR rejects unsafe callbacks and persists safe public clients', async () => {
  const { instance, statePath } = await provider();
  const unsafe = await register(instance, 'https://user:password@example.com/callback');
  assert.equal(unsafe.reply.status, 400);
  assert.equal(unsafe.data.error, 'invalid_redirect_uri');

  const safe = await register(instance);
  assert.equal(safe.reply.status, 201);
  assert.equal(safe.data.token_endpoint_auth_method, 'none');
  assert.ok(safe.data.client_id);
  const persisted = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(persisted.clients[safe.data.client_id].clientName, 'Claude');
});

test('authorization code flow requires approval token and PKCE, then refreshes', async () => {
  const { instance, statePath } = await provider();
  const { data: registration } = await register(instance);
  const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorizeUrl = new URL('https://xinchao.example.test/oauth/authorize');
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: registration.client_id,
    redirect_uri: registration.redirect_uris[0],
    state: 'claude-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: 'https://xinchao.example.test/mcp',
    scope: 'xinchao',
  });

  const consent = response();
  await instance.handle(request('GET'), consent, authorizeUrl);
  assert.equal(consent.status, 200);
  assert.match(consent.body, /心潮动态心智系统/);
  assert.doesNotMatch(consent.body, /correct-horse-battery-staple/);
  assert.match(consent.headers['Content-Security-Policy'], /form-action 'self' https:/);

  const denied = response();
  const deniedForm = new URLSearchParams(authorizeUrl.searchParams);
  deniedForm.set('approval_token', 'wrong-password-value');
  await instance.handle(
    request('POST', deniedForm.toString()),
    denied,
    new URL('https://xinchao.example.test/oauth/authorize'),
  );
  assert.equal(denied.status, 401);
  assert.match(denied.body, /授权口令不正确/);

  const approved = response();
  const approvedForm = new URLSearchParams(authorizeUrl.searchParams);
  approvedForm.set('approval_token', 'correct-horse-battery-staple');
  await instance.handle(
    request('POST', approvedForm.toString()),
    approved,
    new URL('https://xinchao.example.test/oauth/authorize'),
  );
  assert.equal(approved.status, 302);
  const callback = new URL(approved.headers.Location);
  assert.equal(callback.searchParams.get('state'), 'claude-state');
  const code = callback.searchParams.get('code');
  assert.ok(code);

  const exchanged = response();
  const tokenBody = JSON.stringify({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    resource: 'https://xinchao.example.test/mcp',
  });
  const tokenRequest = request('POST', tokenBody);
  tokenRequest.headers['content-type'] = 'application/json';
  await instance.handle(
    tokenRequest,
    exchanged,
    new URL('https://xinchao.example.test/oauth/token'),
  );
  assert.equal(exchanged.status, 200);
  const firstTokens = JSON.parse(exchanged.body);
  assert.equal(firstTokens.token_type, 'Bearer');
  assert.equal(instance.validateAccessToken(firstTokens.access_token), true);

  const refreshed = response();
  const refreshForm = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: firstTokens.refresh_token,
  });
  await instance.handle(
    request('POST', refreshForm.toString()),
    refreshed,
    new URL('https://xinchao.example.test/oauth/token'),
  );
  assert.equal(refreshed.status, 200);
  const secondTokens = JSON.parse(refreshed.body);
  assert.notEqual(secondTokens.refresh_token, firstTokens.refresh_token);

  const replay = response();
  await instance.handle(
    request('POST', refreshForm.toString()),
    replay,
    new URL('https://xinchao.example.test/oauth/token'),
  );
  assert.equal(replay.status, 400);
  assert.equal(JSON.parse(replay.body).error, 'invalid_grant');

  const restored = new OAuthProvider({
    enabled: true,
    publicBaseUrl: 'https://xinchao.example.test',
    approvalToken: 'correct-horse-battery-staple',
    statePath,
    accessTtlSeconds: 3600,
    refreshTtlSeconds: 86400,
  });
  await restored.init();
  assert.equal(restored.validateAccessToken(secondTokens.access_token), true);
});
