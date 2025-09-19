/**
 * Test setup file for vitest
 */

import '@testing-library/jest-dom';

// Enhanced Mock DataTransfer for advanced drag and drop tests
export class EnhancedMockDataTransfer {
  private data: Record<string, string> = {};
  private _mousePosition: { x: number; y: number } = { x: 0, y: 0 };
  private _dropTarget: HTMLElement | null = null;
  
  setData(format: string, data: string): void {
    this.data[format] = data;
  }
  
  getData(format: string): string {
    return this.data[format] || '';
  }
  
  clearData(format?: string): void {
    if (format) {
      delete this.data[format];
    } else {
      this.data = {};
    }
  }
  
  get types(): string[] {
    return Object.keys(this.data);
  }
  
  dropEffect: string = 'none';
  effectAllowed: string = 'uninitialized';
  files: FileList = [] as any;
  items: DataTransferItemList = [] as any;

  // Enhanced methods for position simulation
  simulateMousePosition(x: number, y: number): void {
    this._mousePosition = { x, y };
  }

  simulateDropTarget(element: HTMLElement): void {
    this._dropTarget = element;
  }

  getMousePosition(): { x: number; y: number } {
    return { ...this._mousePosition };
  }

  getDropTarget(): HTMLElement | null {
    return this._dropTarget;
  }

  // Reset all simulation data
  resetSimulation(): void {
    this._mousePosition = { x: 0, y: 0 };
    this._dropTarget = null;
    this.data = {};
  }
}

// Set up global DataTransfer with enhanced capabilities
global.DataTransfer = EnhancedMockDataTransfer as any;

// Enhanced Mock DragEvent with position support
global.DragEvent = class DragEvent extends Event {
  dataTransfer: EnhancedMockDataTransfer;
  clientX: number;
  clientY: number;
  
  constructor(type: string, eventInitDict?: DragEventInit & { clientX?: number; clientY?: number }) {
    super(type, eventInitDict);
    this.dataTransfer = (eventInitDict?.dataTransfer as EnhancedMockDataTransfer) || new EnhancedMockDataTransfer();
    this.clientX = eventInitDict?.clientX || 0;
    this.clientY = eventInitDict?.clientY || 0;
  }
} as any;