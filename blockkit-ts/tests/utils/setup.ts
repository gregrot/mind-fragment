/**
 * Test setup file for vitest
 */

import '@testing-library/jest-dom';

// Mock DataTransfer for drag and drop tests
global.DataTransfer = class DataTransfer {
  private data: Record<string, string> = {};
  
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
};

// Mock DragEvent
global.DragEvent = class DragEvent extends Event {
  dataTransfer: DataTransfer;
  
  constructor(type: string, eventInitDict?: DragEventInit) {
    super(type, eventInitDict);
    this.dataTransfer = eventInitDict?.dataTransfer || new DataTransfer();
  }
} as any;