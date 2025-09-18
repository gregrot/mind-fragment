import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.clearAllTimers();
});

// Setup jsdom environment
beforeEach(() => {
  // Reset any global state if needed
  // Clear any mocks or spies
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeEach(() => {
  console.error = (...args: any[]) => {
    // Only show errors that aren't React testing warnings
    if (
      typeof args[0] === 'string' &&
      !args[0].includes('Warning: ReactDOM.render is no longer supported') &&
      !args[0].includes('Warning: React.createFactory() is deprecated') &&
      !args[0].includes('Warning: componentWillReceiveProps has been renamed')
    ) {
      originalConsoleError(...args);
    }
  };
  
  console.warn = (...args: any[]) => {
    // Filter out common React testing warnings
    if (
      typeof args[0] === 'string' &&
      !args[0].includes('Warning:') &&
      !args[0].includes('React Hook useEffect has a missing dependency')
    ) {
      originalConsoleWarn(...args);
    }
  };
  
  // Suppress console.log in tests unless explicitly needed
  console.log = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});

// Mock Canvas API for jsdom
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn(() => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Array(4) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => []),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

// Mock performance.now for consistent timing in tests
Object.defineProperty(global.performance, 'now', {
  value: vi.fn(() => Date.now()),
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });