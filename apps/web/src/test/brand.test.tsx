import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Brand } from '../components/Brand';

describe('Brand', () => {
  it('links back to the NOVA home', () => {
    render(<MemoryRouter><Brand /></MemoryRouter>);
    expect(screen.getByLabelText('NOVA Connect home')).toHaveAttribute('href', '/');
  });
});
