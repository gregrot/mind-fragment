import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDropTargetFromElement, getDropTargetFromTouchEvent } from './dropTarget';

type ElementFromPoint = (x: number, y: number) => Element | null;

let originalElementFromPoint: ElementFromPoint | undefined;

beforeEach(() => {
  originalElementFromPoint =
    typeof document.elementFromPoint === 'function' ? document.elementFromPoint : undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  const doc = document as Document & { elementFromPoint?: ElementFromPoint };
  doc.elementFromPoint = originalElementFromPoint ?? (undefined as unknown as ElementFromPoint);
  document.body.innerHTML = '';
});

describe('getDropTargetFromElement', () => {
  it('returns null for non-HTMLElement targets', () => {
    const text = document.createTextNode('not an element');
    const result = getDropTargetFromElement(text.parentElement);
    expect(result).toBeNull();
  });

  it('parses workspace drop targets from dataset metadata', () => {
    const element = document.createElement('div');
    element.dataset.dropTargetKind = 'workspace';
    element.dataset.dropTargetPosition = '2';
    element.dataset.dropTargetAncestors = 'abc, def ,';

    document.body.appendChild(element);

    const result = getDropTargetFromElement(element);
    expect(result).toEqual({
      kind: 'workspace',
      position: 2,
      ancestorIds: ['abc', 'def'],
    });
  });

  it('parses slot drop targets when owner metadata exists', () => {
    const dropElement = document.createElement('div');
    dropElement.dataset.dropTargetKind = 'slot';
    dropElement.dataset.dropTargetOwnerId = 'owner-1';
    dropElement.dataset.dropTargetSlotName = 'do';
    dropElement.dataset.dropTargetPosition = '0';
    dropElement.dataset.dropTargetAncestors = 'root,owner-0';

    const child = document.createElement('span');
    dropElement.appendChild(child);
    document.body.appendChild(dropElement);

    const result = getDropTargetFromElement(child);
    expect(result).toEqual({
      kind: 'slot',
      ownerId: 'owner-1',
      slotName: 'do',
      position: 0,
      ancestorIds: ['root', 'owner-0'],
    });
  });

  it('returns null when slot metadata is incomplete', () => {
    const element = document.createElement('div');
    element.dataset.dropTargetKind = 'slot';
    element.dataset.dropTargetOwnerId = '';
    element.dataset.dropTargetSlotName = '';

    expect(getDropTargetFromElement(element)).toBeNull();
  });
});

describe('getDropTargetFromTouchEvent', () => {
  it('translates the first changed touch into a drop target lookup', () => {
    const dropElement = document.createElement('div');
    dropElement.dataset.dropTargetKind = 'workspace';
    dropElement.dataset.dropTargetAncestors = '';
    document.body.appendChild(dropElement);

    const elementSpy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(dropElement);

    const touch = { clientX: 10, clientY: 20 } as Touch;
    const touchList = {
      length: 1,
      item: vi.fn(() => touch),
      0: touch,
    } as unknown as TouchList;

    const result = getDropTargetFromTouchEvent({ changedTouches: touchList });

    expect(elementSpy).toHaveBeenCalledWith(10, 20);
    expect(result).toEqual({ kind: 'workspace', position: undefined, ancestorIds: [] });
  });

  it('returns null when elementFromPoint is unavailable', () => {
    (document as Document & { elementFromPoint?: ElementFromPoint }).elementFromPoint =
      undefined as unknown as ElementFromPoint;

    const touchList = { length: 0 } as unknown as TouchList;
    expect(getDropTargetFromTouchEvent({ changedTouches: touchList })).toBeNull();
  });

  it('returns null when no touches are provided', () => {
    const touchList = {
      length: 0,
      item: vi.fn(() => null),
    } as unknown as TouchList;

    expect(getDropTargetFromTouchEvent({ changedTouches: touchList })).toBeNull();
  });
});
