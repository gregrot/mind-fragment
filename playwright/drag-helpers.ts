import { expect, type Page } from '@playwright/test';

export const workspaceDropzone = '[data-testid="workspace-dropzone"]';

export async function performDragAndDrop(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
): Promise<void> {
  await page.evaluate(({ sourceSelector, targetSelector }) => {
    const source = document.querySelector(sourceSelector);
    const target = document.querySelector(targetSelector);
    if (!source) {
      throw new Error(`No drag source found for selector: ${sourceSelector}`);
    }
    if (!target) {
      throw new Error(`No drop target found for selector: ${targetSelector}`);
    }

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;
    const pointerId = Math.floor(Math.random() * 1_000_000);

    const pointerDown = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: startX,
      clientY: startY,
      button: 0,
      buttons: 1,
      pointerId,
      pointerType: 'mouse',
      isPrimary: true,
      view: window,
    });
    source.dispatchEvent(pointerDown);

    const mouseDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: startX,
      clientY: startY,
      button: 0,
      buttons: 1,
      view: window,
    });
    source.dispatchEvent(mouseDown);

    const dataTransfer = new DataTransfer();
    source.dispatchEvent(
      new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        clientX: startX,
        clientY: startY,
        dataTransfer,
      }),
    );

    window.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY,
        buttons: 1,
        pointerId,
        pointerType: 'mouse',
        isPrimary: true,
        view: window,
      }),
    );

    const pointerEnter = new PointerEvent('pointerenter', {
      bubbles: true,
      cancelable: true,
      clientX: endX,
      clientY: endY,
      buttons: 1,
      pointerId,
      pointerType: 'mouse',
      isPrimary: true,
      view: window,
    });
    target.dispatchEvent(pointerEnter);

    target.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY,
        buttons: 1,
        pointerId,
        pointerType: 'mouse',
        isPrimary: true,
        view: window,
      }),
    );

    target.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY,
        buttons: 1,
        pointerId,
        pointerType: 'mouse',
        isPrimary: true,
        view: window,
      }),
    );

    target.dispatchEvent(
      new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY,
        dataTransfer,
        view: window,
      }),
    );
    target.dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY,
        dataTransfer,
        view: window,
      }),
    );
    target.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY,
        dataTransfer,
        view: window,
      }),
    );

    window.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY,
        button: 0,
        buttons: 0,
        pointerId,
        pointerType: 'mouse',
        isPrimary: true,
        view: window,
      }),
    );

    target.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY,
        button: 0,
        view: window,
      }),
    );

    target.dispatchEvent(
      new PointerEvent('pointerleave', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY,
        pointerId,
        pointerType: 'mouse',
        isPrimary: true,
        view: window,
      }),
    );

    source.dispatchEvent(
      new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY,
        dataTransfer,
        view: window,
      }),
    );
  }, { sourceSelector, targetSelector });
}

export async function dragPaletteBlock(page: Page, blockId: string, targetSelector: string): Promise<void> {
  await performDragAndDrop(page, `[data-testid="palette-${blockId}"]`, targetSelector);
}

export async function dragWorkspaceBlock(page: Page, blockId: string, targetSelector: string): Promise<void> {
  await performDragAndDrop(page, `[data-testid="block-${blockId}"]`, targetSelector);
}

export async function clearWorkspace(page: Page): Promise<void> {
  const workspace = page.locator(workspaceDropzone);
  await expect(workspace).toBeVisible();
  try {
    await expect(page.getByTestId('block-start')).toBeVisible({ timeout: 2000 });
  } catch {
    // If the workspace is already empty or the default program is unavailable, continue.
  }

  await expect
    .poll(async () => {
      return page.evaluate((selector) => {
        const root = document.querySelector(selector);
        if (!root) {
          return 0;
        }

        const deleteButtons = root.querySelectorAll('[data-testid$="-delete"]');
        deleteButtons.forEach((button) => (button as HTMLButtonElement).click());

        return root.querySelectorAll('[data-testid^="block-"]').length;
      }, workspaceDropzone);
    })
    .toBe(0);
}
