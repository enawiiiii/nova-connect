import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { Brand } from '../components/Brand';
import { demoMe, useAuthStore } from '../stores/auth.store';

afterEach(cleanup);

describe('Brand', () => {
  it('takes guests to sign in', () => {
    useAuthStore.setState({ user: null, accessToken: null, demo: false, ready: true });
    render(<MemoryRouter><Brand /></MemoryRouter>);
    expect(screen.getByLabelText('NOVA Connect home')).toHaveAttribute('href', '/login');
  });

  it('takes signed-in users to their inbox without ending the session', () => {
    useAuthStore.setState({ user: demoMe, accessToken: 'active-token', demo: false, ready: true });
    render(<MemoryRouter><Brand /></MemoryRouter>);
    expect(screen.getByLabelText('NOVA Connect home')).toHaveAttribute('href', '/app/chats');
    expect(useAuthStore.getState().accessToken).toBe('active-token');
  });
});
