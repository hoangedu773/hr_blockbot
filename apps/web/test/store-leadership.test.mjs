import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const bundle = await build({ entryPoints: [new URL('../src/components/StoreLeadership.tsx', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')],
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', write: false });
const { StoreLeadership, storeManagerText } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const base = { managerName: 'Nhi', managerEmployeeId: 'nhi', storeManagerStatus: 'identified', managers: [
  { employeeId: 'nhi', fullName: 'Nhi', role: 'sm', assignmentKind: 'home' },
  { employeeId: 'hang', fullName: 'Hang', role: 'am', assignmentKind: 'supervisory' },
] };
const render = (store) => renderToStaticMarkup(React.createElement(StoreLeadership, { store }));
test('table names the SM; drawer labels SM and AM separately', () => {
  assert.equal(storeManagerText(base), 'Nhi'); const html = render(base);
  assert.match(html, /Cửa hàng trưởng · SM<\/dt><dd[^>]*>Nhi/);
  assert.match(html, /Quản lý khu vực · AM<\/dt><dd[^>]*>Hang/);
  assert.equal((html.match(/>Nhi</g) ?? []).length, 1);
});
test('legacy unlabeled names never masquerade as the SM during a rolling deploy', () => {
  const store = { managerName: 'AM, SM', managers: [{ employeeId: 'x', fullName: 'Unverified' }] };
  assert.equal(storeManagerText(store), 'Chưa xác định cửa hàng trưởng');
  assert.match(render(store), /Vai trò chưa xác định/);
});
test('ambiguous SMs and cover retain clear labels and names', () => {
  const html = render({ ...base, managerName: null, managerEmployeeId: null, storeManagerStatus: 'ambiguous', managers: [
    ...base.managers, { employeeId: 'cover', fullName: 'Cover', role: 'sm', assignmentKind: 'cover', relationValidUntil: '2027-11-02T08:00:00Z' },
  ] });
  assert.match(html, /Chưa xác định SM phụ trách chính/); assert.match(html, /SM có quan hệ quản lý/);
  assert.match(html, /SM kiêm nhiệm/); assert.match(html, /Quan hệ quản lý đến/);
});
