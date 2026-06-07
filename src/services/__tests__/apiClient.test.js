
import { vi, describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';
import apiClient from '../apiClient';

vi.mock('axios', () => {
  const mockInstance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    post: vi.fn(),
  };
  return {
    default: {
      create: vi.fn(() => mockInstance),
    },
  };
});

describe('apiClient', () => {
  it('should have tests running', () => {
    expect(true).toBe(true);
  });
});
