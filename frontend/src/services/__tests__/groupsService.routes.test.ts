import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as Array<{ method: string; path: string }>);

vi.mock('../../lib/api', () => {
  const record = (method: string) => async (path: string) => {
    calls.push({ method, path });
    if (path.endsWith('/participants') && method === 'GET') return { participants: [] };
    if (path === '/groups/invites') return { invites: [] };
    return {};
  };
  return {
    api: {
      get: record('GET'),
      post: record('POST'),
      put: record('PUT'),
      patch: record('PATCH'),
      delete: record('DELETE'),
    },
  };
});

import { groupsService } from '../groupsService';

// The routes the server registers, read from the file that registers them.
// Every call this service made to /conversations/... answered 404 for seven
// months, including creating a group, and no test compared the two sides.
const serverRoutes = (() => {
  const main = readFileSync(join(process.cwd(), '../backend/cmd/server/main.go'), 'utf8');
  const routes = new Set<string>();
  for (const [, method, path] of main.matchAll(
    /protected\.(GET|POST|PUT|PATCH|DELETE)\("([^"]+)"/g
  )) {
    routes.add(`${method} ${path.replace(/:[a-z_]+/g, ':param')}`);
  }
  return routes;
})();

const asRoute = ({ method, path }: { method: string; path: string }) =>
  `${method} ${path.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:param')}`;

beforeEach(() => {
  calls.length = 0;
});

describe('groupsService', () => {
  it('reads the route table it is checked against', () => {
    expect(serverRoutes.has('POST /groups')).toBe(true);
  });

  it.each([
    ['createGroup', () => groupsService.createGroup({ name: 'Test', participant_ids: [2, 3] })],
    ['getParticipants', () => groupsService.getParticipants(7)],
    ['addParticipant', () => groupsService.addParticipant(7, 2)],
    ['removeParticipant', () => groupsService.removeParticipant(7, 2)],
    ['updateParticipantRole', () => groupsService.updateParticipantRole(7, 2, { role: 'admin' })],
    ['updateGroup', () => groupsService.updateGroup(7, { name: 'Renamed' })],
    ['getSettings', () => groupsService.getSettings(7)],
    ['updateSettings', () => groupsService.updateSettings(7, { anyone_can_pin: true })],
    ['createInvite', () => groupsService.createInvite(7, { user_id: 2 })],
    ['acceptInvite', () => groupsService.acceptInvite(11)],
    ['declineInvite', () => groupsService.declineInvite(11)],
    ['getMyInvites', () => groupsService.getMyInvites()],
    ['leaveGroup', () => groupsService.leaveGroup(7)],
    ['transferOwnership', () => groupsService.transferOwnership(7, { new_owner_user_id: 2 })],
    ['discoverGroups', () => groupsService.discoverGroups({ query: 'test', limit: 10 })],
  ])('%s calls a route the server has', async (_name, call) => {
    await call();
    expect(calls).toHaveLength(1);
    expect(serverRoutes).toContain(asRoute(calls[0]));
  });
});
