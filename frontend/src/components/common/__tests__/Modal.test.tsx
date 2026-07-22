import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Modal } from '../Modal';

describe('Modal', () => {
  it('restores focus to an explicit stable return target', () => {
    const returnTarget = document.createElement('button');
    returnTarget.textContent = 'Return target';
    document.body.appendChild(returnTarget);
    returnTarget.focus();

    const { rerender } = render(
      <Modal isOpen restoreFocusTo={returnTarget} ariaLabelledBy="modal-title">
        <h2 id="modal-title">Test dialog</h2>
      </Modal>
    );

    expect(screen.getByRole('dialog')).toHaveFocus();

    rerender(
      <Modal isOpen={false} restoreFocusTo={returnTarget} ariaLabelledBy="modal-title">
        <h2 id="modal-title">Test dialog</h2>
      </Modal>
    );

    expect(returnTarget).toHaveFocus();
    returnTarget.remove();
  });

  it('does not animate when animation is disabled', () => {
    render(
      <Modal isOpen animation="none" ariaLabelledBy="static-modal-title">
        <h2 id="static-modal-title">Static dialog</h2>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.style.animation).toBe('');
    expect(dialog.parentElement?.style.animation).toBe('');
  });
});
