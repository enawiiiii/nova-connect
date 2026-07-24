import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

afterEach(() => {
  cleanup();
  delete window.google;
});

describe('GoogleSignInButton', () => {
  it('renders the official button and returns its ID credential', async () => {
    const onCredential = vi.fn();
    let callback: ((response: { credential: string }) => void) | undefined;
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => { callback = options.callback; }),
          renderButton: vi.fn((parent) => { parent.textContent = 'Sign in with Google'; }),
        },
      },
    };

    render(
      <GoogleSignInButton
        clientId="123456789-nova-test.apps.googleusercontent.com"
        mode="login"
        onCredential={onCredential}
        onError={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Sign in with Google')).toBeInTheDocument());
    act(() => callback?.({ credential: 'signed-google-id-token' }));
    expect(onCredential).toHaveBeenCalledWith('signed-google-id-token');
  });
});
