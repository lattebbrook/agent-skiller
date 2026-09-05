import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Palette } from './Palette.js';

describe('Palette', () => {
  it('lists node kinds and adds on click; Start is disabled once present', () => {
    const onAdd = vi.fn();
    render(<Palette onAdd={onAdd} onAddNote={() => undefined} hasStart />);
    expect(screen.getByText('Switch')).toBeInTheDocument();
    fireEvent.click(screen.getByText('If'));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'if' }));
    expect(screen.getByText('Start').closest('button')).toBeDisabled();
  });
});
