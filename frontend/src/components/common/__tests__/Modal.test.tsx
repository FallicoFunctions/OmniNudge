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

  // A dialog opened over the call screen has to sit above it. Two z- classes on
  // one element are settled by the stylesheet's order, so the layer replaces
  // the default rather than joining it.
  it('takes its stacking layer from its own prop', () => {
    const { unmount } = render(
      <Modal isOpen ariaLabelledBy="default-layer-title">
        <h2 id="default-layer-title">Default layer</h2>
      </Modal>
    );
    expect(screen.getByRole('dialog').parentElement).toHaveClass('z-50');
    unmount();

    render(
      <Modal isOpen layerClassName="z-[110]" ariaLabelledBy="raised-layer-title">
        <h2 id="raised-layer-title">Raised layer</h2>
      </Modal>
    );
    const overlay = screen.getByRole('dialog').parentElement;
    expect(overlay).toHaveClass('z-[110]');
    expect(overlay).not.toHaveClass('z-50');
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
