import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { INSERT_ATTEMPT, validateFields, displayAmount } from '../lib/checks.ts';
import { isSameOrigin } from '../lib/request-security.ts';

const complete = { date: '2026-10-14', payee: '小雨', amount: '1000000.50', goal: '创造理想生活', author: '小雨' };
test('origin checks support Next.js and Vercel forwarded hosts and reject cross-site requests', () => {
  const request = headers => new Request('http://localhost:3000/api/checks', { headers });
  assert.equal(isSameOrigin(request({ origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' })), true);
  const forwarded = { host: 'internal:3000', 'x-forwarded-host': 'checks.example.com', 'x-forwarded-proto': 'https' };
  assert.equal(isSameOrigin(request({ ...forwarded, origin: 'https://checks.example.com' })), true);
  assert.equal(isSameOrigin(request({ ...forwarded, origin: 'https://other.example.com' })), false);
  assert.equal(isSameOrigin(request({ ...forwarded, origin: 'https://checks.example.com', 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(isSameOrigin(request({ ...forwarded, origin: 'null' })), false);
});
test('all five fields required; real dates and positive exact decimal amounts', () => {
  assert.deepEqual(validateFields(complete).errors, {});
  for (const key of Object.keys(complete)) assert.ok(validateFields({ ...complete, [key]: '  ' }).errors[key]);
  for (const date of ['2026-02-29', '2026-13-01', '2026-04-31', '1899-01-01']) assert.ok(validateFields({ ...complete, date }).errors.date);
  assert.equal(validateFields({ ...complete, date: '2028-02-29' }).errors.date, undefined);
  for (const amount of ['0', '-1', '1.999', '1e4', 'Infinity', 'NaN', '1000000000000000']) assert.ok(validateFields({ ...complete, amount }).errors.amount);
  assert.equal(displayAmount('999999999999999.99'), '¥ 999,999,999,999,999.99');
  assert.ok(validateFields({ ...complete, goal: '愿'.repeat(81) }).errors.goal);
});

test('each account has exactly 50 attempts including invalid submissions; retries never double charge', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../drizzle/0000_optimal_devos.sql', import.meta.url), 'utf8'));
  const insert = db.prepare(INSERT_ATTEMPT);
  const count = db.prepare('SELECT COUNT(*) AS used FROM check_attempts WHERE user_id = ?');
  const send = (user, key, ok) => insert.run(user, key, ok ? 1 : 0, ok ? JSON.stringify(complete) : null, ok ? '{}' : '{"date":"invalid"}', new Date().toISOString(), user);
  for (let i = 0; i < 50; i++) assert.equal(send('user-a', String(i), i % 2 === 0).changes, 1);
  assert.equal(count.get('user-a').used, 50);
  assert.equal(send('user-a', '51st', true).changes, 0);
  assert.equal(send('user-a', '0', true).changes, 0);
  assert.equal(count.get('user-a').used, 50);
  assert.equal(send('user-b', '0', false).changes, 1);
  assert.equal(send('user-b', '0', false).changes, 0);
  assert.equal(count.get('user-b').used, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM check_attempts WHERE user_id=? AND successful=1').get('user-a').n, 25);
  db.close();
});
