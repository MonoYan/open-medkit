import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../lib/api';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    getAuthStatus: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    setOnUnauthenticated: vi.fn(),
    getAppSettings: vi.fn(),
    getMedicines: vi.fn(),
    getStats: vi.fn(),
  };
});

import { AuthGate } from './AuthGate';

function ChildComponent() {
  api.getAppSettings();
  api.getMedicines();
  return <div data-testid="child">App Content</div>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuthGate', () => {
  it('renders children immediately when auth not required', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({
      requiresAuth: false,
      authenticated: false,
    });

    render(
      <AuthGate>
        <ChildComponent />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });

  it('renders login page when auth required and not authenticated', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({
      requiresAuth: true,
      authenticated: false,
    });

    render(
      <AuthGate>
        <ChildComponent />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByText('访问密码')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('does NOT mount children (and their requests) when unauthenticated', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({
      requiresAuth: true,
      authenticated: false,
    });

    render(
      <AuthGate>
        <ChildComponent />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByText('访问密码')).toBeInTheDocument();
    });

    expect(api.getAppSettings).not.toHaveBeenCalled();
    expect(api.getMedicines).not.toHaveBeenCalled();
  });

  it('renders children when authenticated', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({
      requiresAuth: true,
      authenticated: true,
    });

    render(
      <AuthGate>
        <ChildComponent />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });
});
