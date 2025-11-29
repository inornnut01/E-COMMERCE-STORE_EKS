import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Create shared mock functions for toast
export const mockToastSuccess = vi.fn();
export const mockToastError = vi.fn();

// Mock react-hot-toast - the stores import 'toast' as default
vi.mock("react-hot-toast", () => {
  const toast = vi.fn();
  toast.success = mockToastSuccess;
  toast.error = mockToastError;

  return {
    default: toast,
    toast,
  };
});

// Mock axios with interceptors support
vi.mock("../lib/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      response: {
        use: vi.fn(),
      },
      request: {
        use: vi.fn(),
      },
    },
  },
}));
