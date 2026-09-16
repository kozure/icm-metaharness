// SPDX-License-Identifier: MIT
//
// ADR-284 guard: this fork is CLI-only. The ARC harness keeps `arc_render`
// as a plain MCP tool returning authoritative JSON, but registers no rendered
// surface. These assertions run against the BUILT server (`../dist/server.js`,
// produced by the package's `pretest` build) so they cover what is actually
// shipped, not just what the sources say.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MemoryAuditSink } from '../dist/audit.js';
import { startArcMcpServer } from '../dist/server.js';
import { ACTOR_TOKEN, BOSS_TOKEN, createFactoryFixture, toolPayload } from './helpers.js';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

interface LaneSurface {
  tools: string[];
  resources: string[];
}

/** `resources/list` answers -32601 on a lane that registers no resources at
 *  all — which is exactly the post-removal expectation, not an error. */
const METHOD_NOT_FOUND = -32601;

async function connect(url: URL, token: string): Promise<Client> {
  const client = new Client(
    { name: 'arc-no-ui-surface-test', version: '0.1.0' },
    { capabilities: {} },
  );
  await client.connect(new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  }));
  return client;
}

async function surfaceOf(client: Client): Promise<LaneSurface> {
  let resources: string[];
  try {
    resources = (await client.listResources()).resources.map((entry) => entry.uri).sort();
  } catch (error) {
    if ((error as { code?: number }).code !== METHOD_NOT_FOUND) throw error;
    resources = [];
  }
  return {
    tools: (await client.listTools()).tools.map((tool) => tool.name).sort(),
    resources,
  };
}

/** Starts the built server in one arm and reads back every lane's surface. */
async function probe(avo: boolean): Promise<{
  surfaces: Record<'actor' | 'boss', LaneSurface>;
  renderResult: Record<string, unknown>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'arc-no-ui-surface-'));
  const started = await startArcMcpServer({
    controllerFactory: createFactoryFixture().factory,
    stateRoot: root,
    port: 0,
    // Keep the audit trail in memory: the default FileAuditSink writes
    // .harness/arc-mcp-audit.jsonl into the process cwd.
    audit: new MemoryAuditSink(),
    ...(avo ? { avo: { arm: 'AVO_FULL' as const } } : {}),
    auth: {
      bearerPrincipals: [
        { token: ACTOR_TOKEN, principalId: 'no-ui-surface', lanes: ['actor'] as const },
        { token: BOSS_TOKEN, principalId: 'no-ui-surface', lanes: ['boss'] as const },
      ],
    },
    policy: { maxToolCallsPerMinute: 1_000 },
  });
  try {
    const actor = await connect(started.actorUrl, ACTOR_TOKEN);
    const boss = await connect(started.bossUrl, BOSS_TOKEN);
    try {
      const surfaces = {
        actor: await surfaceOf(actor),
        boss: await surfaceOf(boss),
      };
      const opened = toolPayload(await actor.callTool({
        name: 'arc_start',
        arguments: { idempotencyKey: `no-ui-surface-start-${avo ? 'avo' : 'legacy'}` },
      }));
      const rendered = await actor.callTool({
        name: 'arc_render',
        arguments: { episodeId: opened.episodeId as string },
      });
      return { surfaces, renderResult: toolPayload(rendered) };
    } finally {
      await actor.close();
      await boss.close();
    }
  } finally {
    await started.close();
    await rm(root, { recursive: true, force: true });
  }
}

describe('ADR-284 — the ARC harness registers no rendered surface', () => {
  let legacy: Awaited<ReturnType<typeof probe>>;
  let avo: Awaited<ReturnType<typeof probe>>;
  let declared: { resources: string[]; tools: Record<string, string[]> };
  let baseline: { lanes: Record<string, { tools: string[]; resources: string[] }> };

  beforeAll(async () => {
    [legacy, avo] = await Promise.all([probe(false), probe(true)]);
    declared = JSON.parse(
      await readFile(join(packageRoot, '.harness/mcp-capabilities.json'), 'utf8'),
    ) as typeof declared;
    baseline = JSON.parse(
      await readFile(join(packageRoot, '__tests__/fixtures/arc-pre-removal-tools.json'), 'utf8'),
    ) as typeof baseline;
  }, 120_000);

  afterAll(() => {
    // probe() cleans up its own server and state root in a finally block.
  });

  // (a) arc_render survives the widget removal with its authoritative payload.
  it('keeps arc_render registered and returning authoritative structuredContent', () => {
    for (const [arm, run] of [['legacy', legacy], ['avo', avo]] as const) {
      expect(run.surfaces.actor.tools, `${arm} actor lane`).toContain('arc_render');
      expect(typeof run.renderResult, `${arm} arc_render result`).toBe('object');
      expect(Object.keys(run.renderResult).length, `${arm} arc_render payload`)
        .toBeGreaterThan(0);
      expect(run.renderResult, `${arm} arc_render payload`)
        .toHaveProperty('observation');
    }
  });

  // (b) No ui:// resource anywhere — the central Unit 1 invariant.
  it('registers no ui:// resource on any lane in either arm', () => {
    for (const [arm, run] of [['legacy', legacy], ['avo', avo]] as const) {
      for (const [lane, surface] of Object.entries(run.surfaces)) {
        expect(surface.resources.filter((uri) => /^ui:\/\//.test(uri)), `${arm}/${lane}`)
          .toEqual([]);
      }
    }
    expect(declared.resources, '.harness/mcp-capabilities.json').toEqual([]);
  });

  // (c) The tracked capability declaration is self-verifying per lane.
  it('registers exactly the tools the capability declaration lists, per lane', () => {
    expect(legacy.surfaces.actor.tools).toEqual([...declared.tools.actor!].sort());
    expect(avo.surfaces.actor.tools).toEqual([...declared.tools.actorAvo!].sort());
    expect(legacy.surfaces.boss.tools).toEqual([...declared.tools.boss!].sort());
    expect(avo.surfaces.boss.tools).toEqual([...declared.tools.boss!].sort());
  });

  // (d) "Baseline minus zero entries", asserted against the pre-removal
  //     capture taken in sub-task 1.8 before resource.ts was deleted.
  it('matches the pre-removal tool-name baseline exactly, and drops only the ui:// resource', () => {
    expect(legacy.surfaces.actor.tools).toEqual(baseline.lanes.actor!.tools);
    expect(avo.surfaces.actor.tools).toEqual(baseline.lanes.actorAvo!.tools);
    expect(legacy.surfaces.boss.tools).toEqual(baseline.lanes.boss!.tools);
    // The baseline recorded the widget resource; the only permitted delta is
    // its disappearance.
    expect(baseline.lanes.actor!.resources).toEqual(['ui://metaharness/arc-agi-3/canvas']);
    expect(legacy.surfaces.actor.resources).toEqual([]);
  });
});
