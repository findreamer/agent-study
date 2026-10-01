import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Can, usePermissions } from './use-permissions';
import { useAuthStore } from './auth.store';

function Probe({ code }: { code?: string }) {
  const { can } = usePermissions();
  return <span>{can(code) ? 'yes' : 'no'}</span>;
}

describe('usePermissions / <Can>', () => {
  afterEach(() => {
    cleanup();
    useAuthStore.getState().clear();
  });

  it('shows children when the permission is granted', () => {
    useAuthStore.setState({
      user: { isSuperadmin: false } as never,
      permissions: ['user:list', 'user:create'],
    });
    render(
      <Can permission="user:create" fallback={<span>denied</span>}>
        <span>granted</span>
      </Can>,
    );
    expect(screen.getByText('granted')).toBeInTheDocument();
    expect(screen.queryByText('denied')).not.toBeInTheDocument();
  });

  it('shows fallback when the permission is missing', () => {
    useAuthStore.setState({
      user: { isSuperadmin: false } as never,
      permissions: ['user:list'],
    });
    render(
      <Can permission="user:delete" fallback={<span>denied</span>}>
        <span>granted</span>
      </Can>,
    );
    expect(screen.queryByText('granted')).not.toBeInTheDocument();
    expect(screen.getByText('denied')).toBeInTheDocument();
  });

  it('always grants for superadmin', () => {
    useAuthStore.setState({
      user: { isSuperadmin: true } as never,
      permissions: [],
    });
    render(
      <Can permission="role:delete" fallback={<span>denied</span>}>
        <span>granted</span>
      </Can>,
    );
    expect(screen.getByText('granted')).toBeInTheDocument();

    cleanup();

    render(<Probe code="menu:delete" />);
    expect(screen.getByText('yes')).toBeInTheDocument();
  });

  it('treats an empty code as public', () => {
    useAuthStore.setState({
      user: { isSuperadmin: false } as never,
      permissions: [],
    });
    render(<Probe />);
    expect(screen.getByText('yes')).toBeInTheDocument();
  });
});
