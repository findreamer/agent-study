import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

/** component key -> 页面组件；key 与 seed 菜单的 component 字段完全一致。 */
export const componentRegistry: Record<string, ComponentType> = {
  users: dynamic(() => import('@/features/users/users.page')),
  roles: dynamic(() => import('@/features/roles/roles.page')),
  'permission-center': dynamic(
    () => import('@/features/permission-center/permission-center.page'),
  ),
  profile: dynamic(() => import('@/features/profile/profile.page')),
};
