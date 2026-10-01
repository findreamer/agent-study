import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileResponse } from '@agent-study/contracts';
import { refreshOnce } from '../api/client';
import { useAuthStore } from './auth.store';

const profile: ProfileResponse = {
  user: {
    id: 'u1',
    username: 'admin',
    nickname: '管理员',
    email: 'admin@example.com',
    status: 'ACTIVE',
    isSuperadmin: true,
    departmentId: null,
  },
  currentSystemCode: 'admin',
  systems: [{ id: 's1', code: 'admin', name: '系统管理', status: 'ENABLED', sort: 0 }],
  menus: [
    {
      id: 'm1',
      parentId: null,
      type: 'DIR',
      name: '系统管理',
      visible: true,
      status: 'ENABLED',
      sort: 0,
      children: [
        {
          id: 'm2',
          parentId: 'm1',
          type: 'MENU',
          name: '用户管理',
          path: '/users',
          component: 'users',
          icon: 'users',
          permissionCode: 'user:list',
          visible: true,
          status: 'ENABLED',
          sort: 0,
        },
      ],
    },
  ],
  permissions: ['user:list', 'user:create'],
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useAuthStore', () => {
  it('populates session fields after setSession', () => {
    useAuthStore.getState().setSession({ accessToken: 'at1', profile });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('at1');
    expect(state.user?.username).toBe('admin');
    expect(state.currentSystemCode).toBe('admin');
    expect(state.systems).toHaveLength(1);
    expect(state.menus).toHaveLength(1);
    expect(state.menus[0].children).toHaveLength(1);
    expect(state.permissions).toEqual(['user:list', 'user:create']);
  });

  it('setProfile updates profile fields but keeps the access token', () => {
    useAuthStore.getState().setSession({ accessToken: 'at1', profile });
    useAuthStore
      .getState()
      .setProfile({ ...profile, permissions: ['user:list'] });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('at1');
    expect(state.permissions).toEqual(['user:list']);
  });

  it('clear resets everything including bootstrapped', () => {
    useAuthStore.getState().setSession({ accessToken: 'at1', profile });
    useAuthStore.getState().setBootstrapped(true);
    expect(useAuthStore.getState().bootstrapped).toBe(true);

    useAuthStore.getState().clear();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.currentSystemCode).toBeNull();
    expect(state.systems).toEqual([]);
    expect(state.menus).toEqual([]);
    expect(state.permissions).toEqual([]);
    expect(state.bootstrapped).toBe(false);
  });

  it('refreshOnce bridges the new token into the store', async () => {
    useAuthStore.getState().setSession({ accessToken: 'at1', profile });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, { code: 0, data: { accessToken: 'at2' }, message: 'ok' }),
      ),
    );

    const ok = await refreshOnce();

    expect(ok).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('at2');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().clear();
  });
});
