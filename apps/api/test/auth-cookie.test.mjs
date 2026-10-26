import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRefreshTokenCookieOptions, getClearCookieOptions } from '../dist/services/auth.service.js';

describe('Refresh cookies for separate Render web/API origins', () => {
  function inEnvironment(name, check) {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = name;
    try { check(); } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  }

  it('production permits cross-site refresh only over HTTPS and keeps the cookie HttpOnly', () => {
    inEnvironment('production', () => {
      const options = getRefreshTokenCookieOptions();
      assert.equal(options.sameSite, 'none');
      assert.equal(options.secure, true);
      assert.equal(options.httpOnly, true);
      assert.equal(options.path, '/api/auth');
      assert.equal('domain' in options, false);
      assert.ok(options.maxAge > 0);
    });
  });

  it('local development keeps strict cookies and supports localhost HTTP', () => {
    inEnvironment('development', () => {
      const options = getRefreshTokenCookieOptions();
      assert.equal(options.sameSite, 'strict');
      assert.equal(options.secure, false);
      assert.equal(options.httpOnly, true);
    });
  });

  it('logout clears the same cookie attributes used for login in both environments', () => {
    for (const name of ['production', 'development']) {
      inEnvironment(name, () => {
        const { maxAge, ...loginOptions } = getRefreshTokenCookieOptions();
        assert.ok(maxAge > 0);
        assert.deepEqual(getClearCookieOptions(), loginOptions);
      });
    }
  });
});
