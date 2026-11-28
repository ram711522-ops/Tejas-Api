import { afterEach, expect } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});
