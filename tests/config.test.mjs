import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, env = {}, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, process: { env }, URL, atob, Map, require: name => {
    if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
    return dependencies[name];
  } });
  return exports;
}

test('missing environment uses demo without constructing a Supabase client', () => {
  const config = load('lib/config.ts');
  assert.equal(config.isDemoMode, true);
  const supabase = load('lib/supabase.ts', {}, {
    './config': config,
    '@supabase/supabase-js': { createClient: () => assert.fail('Unexpected client creation') },
  });
  assert.throws(() => supabase.getSupabase(), /Shared rooms need/);
});

test('configuration rejects malformed URLs and server-only credentials', () => {
  const { validateSupabaseConfiguration: validate } = load('lib/config.ts');
  for (const url of ['invalid', 'http://example.org', 'https://example.org/path', 'https://user:password@example.org']) {
    const anon = `header.${btoa(JSON.stringify({ role: 'anon' }))}.signature`;
    assert.match(validate(url, anon).issue, /HTTPS project URL/);
  }
  for (const key of ['sb_secret_rejected', 'invalid', `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`]) {
    assert.match(validate('https://example.org', key).issue, /public|Secret/);
  }
  const anon = `header.${btoa(JSON.stringify({ role: 'anon' }))}.signature`;
  // Syntactic fixtures only. No network calls or real/fake credentials are installed.
  assert.equal(validate('http://localhost:54321', anon).issue, null);
});

test('explicit demo overrides configuration and invalid demo values are explained', () => {
  assert.equal(load('lib/config.ts', { NEXT_PUBLIC_DEMO_MODE: 'true' }).isDemoMode, true);
  assert.match(load('lib/config.ts', { NEXT_PUBLIC_DEMO_MODE: 'typo' }).roomConfigurationIssue, /must be/);
});

test('YouTube URL parsing accepts known hosts and rejects lookalikes/truncated IDs', () => {
  const youtube = load('lib/youtube.ts', {}, { '@/lib/quota': {} });
  const id = 'M7lc1UVf-VE';
  for (const input of [id, `https://youtube.com/watch?v=${id}`, `https://youtu.be/${id}?t=3`, `https://www.youtube.com/shorts/${id}`]) {
    assert.equal(youtube.extractVideoId(input), id);
  }
  for (const input of [`https://evil.example/watch?v=${id}`, `https://youtube.com.evil.example/embed/${id}`, id + 'x', 'javascript:alert(1)']) {
    assert.equal(youtube.extractVideoId(input), null);
  }
  assert.equal(youtube.parseDuration('PT1H2M3S'), '1:02:03');
});

test('keyless URL mode returns explicitly unverified metadata; search explains setup', async () => {
  const youtube = load('lib/youtube.ts', {}, { '@/lib/quota': {} });
  const video = await youtube.fetchVideoById('M7lc1UVf-VE');
  assert.match(video.title, /unverified/);
  assert.equal(video.duration, 'Unknown');
  assert.equal(await youtube.fetchVideoById('bad'), null);
  await assert.rejects(youtube.searchYouTubeVideos('song'), /KEY_MISSING/);
});
