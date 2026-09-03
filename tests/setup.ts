import { vi } from 'vitest';

// Mock server-only package so server modules can be unit tested in Vitest environment
vi.mock('server-only', () => ({}));
