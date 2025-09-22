import type { DropTarget } from '../types/blocks';

const parsePosition = (value: string | undefined): number | undefined => {
  if (typeof value === 'undefined' || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseAncestorIds = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

export const getDropTargetFromElement = (element: Element | null): DropTarget | null => {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const dropElement = element.closest<HTMLElement>('[data-drop-target-kind]');
  if (!dropElement) {
    return null;
  }

  const { dataset } = dropElement;
  const kind = dataset.dropTargetKind;
  const position = parsePosition(dataset.dropTargetPosition);
  const ancestorIds = parseAncestorIds(dataset.dropTargetAncestors);

  if (kind === 'workspace') {
    return { kind: 'workspace', position, ancestorIds };
  }

  if (kind === 'slot') {
    const ownerId = dataset.dropTargetOwnerId;
    const slotName = dataset.dropTargetSlotName;

    if (!ownerId || !slotName) {
      return null;
    }

    return { kind: 'slot', ownerId, slotName, position, ancestorIds };
  }

  return null;
};

export const getDropTargetFromTouchEvent = (
  event: Pick<TouchEvent, 'changedTouches'>,
): DropTarget | null => {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') {
    return null;
  }

  const touchList = event.changedTouches;
  if (!touchList || touchList.length === 0) {
    return null;
  }

  const touch = typeof touchList.item === 'function' ? touchList.item(0) : touchList[0];
  if (!touch) {
    return null;
  }

  const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
  return getDropTargetFromElement(targetElement);
};
