import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION, BUILD_ID } from '../src/index.js';

describe('Protocol Package Tests', () => {
  it('should export protocol version and build ID', () => {
    expect(PROTOCOL_VERSION).toBe('1.0.0');
    expect(BUILD_ID).toBeDefined();
  });
});
