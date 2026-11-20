// Money: balance, loans, payments and money leaks.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { replaceState, migrate, DEFAULTS } from '../js/store.js';
import { balances, loanStatus, setCashNow, moneyLeaks, TX_SIGN, catInfo } from '../js/core.js';
import { today, addDays } from '../js/util.js';

const T = today();
let n = 0;
const tx = (type, amount, extra = {}) => ({ id: 't' + n++, date: T, type, amount, cat: extra.cat || type, note: '', ...extra });
const state = (extra = {}) => {
  const s = DEFAULTS();
  s.profile = { name: 'Test', goals: [], why: '', created: T };
  replaceState({ ...s, ...extra, settings: { ...s.settings, ...(extra.settings || {}) } });
};
beforeEach(() => state());

test('every record type moves cash in the right direction', () => {
  state({ settings: { moneyStart: 1000 }, tx: [tx('in', 500), tx('out', 200, { cat: 'food' }), tx('save', 100, { cat: 'savings' })] });
  const b = balances();
  assert.equal(b.cash, 1200);
  assert.equal(b.savings, 100);
  assert.equal(b.net, 1300);
  assert.equal(b.set, true);
  for (const k of ['in', 'out', 'save', 'pay', 'collect', 'borrow', 'lend']) assert.ok(TX_SIGN[k], k);
});

test('borrowing adds cash and debt; payments reduce both', () => {
  const loan = { id: 'L1', dir: 'owe', who: 'Bank', total: 0, due: '' };
  state({ loans: [loan], tx: [tx('borrow', 10000, { loanId: 'L1' }), tx('pay', 2500, { loanId: 'L1' })] });
  const b = balances();
  assert.equal(b.cash, 7500);
  assert.equal(b.owe, 7500);
  assert.equal(b.net, 0); // borrowing doesn't make you richer
  const s = loanStatus(loan);
  assert.deepEqual([s.principal, s.paid, s.left, s.done], [10000, 2500, 7500, false]);
});

test('total with interest, paid-off and overdue loans', () => {
  const a = { id: 'A', dir: 'owe', who: 'Lending app', total: 1200, due: addDays(T, -3) };
  const c = { id: 'C', dir: 'owed', who: 'Juan', total: 0, due: '' };
  state({ loans: [a, c], tx: [tx('borrow', 1000, { loanId: 'A' }), tx('pay', 200, { loanId: 'A' }), tx('lend', 300, { loanId: 'C' }), tx('collect', 300, { loanId: 'C' })] });
  const sa = loanStatus(a), sc = loanStatus(c);
  assert.equal(sa.left, 1000);
  assert.equal(sa.overdue, true);
  assert.equal(sc.done, true);
  assert.equal(balances().owed, 0);
  assert.ok(moneyLeaks().some((l) => /overdue/.test(l.t)));
});

test('setCashNow makes tracked cash match reality without touching records', async () => {
  const store = await import('../js/store.js');
  state({ tx: [tx('in', 500), tx('out', 120, { cat: 'food' })] });
  assert.equal(balances().set, false);
  setCashNow(2000);
  assert.equal(store.S.settings.moneyStart, 1620);
  assert.equal(store.S.tx.length, 2);
  replaceState(store.S);
  assert.equal(balances().cash, 2000);
});

test('money leaks: bad habits, overspending and borrowing for daily spending', () => {
  state({ settings: { budget: 0 }, tx: [tx('in', 1000, { cat: 'salary' }), tx('out', 900, { cat: 'food' }), tx('out', 300, { cat: 'gambling' }), tx('borrow', 500, { loanId: 'X' })], loans: [{ id: 'X', dir: 'owe', who: 'Friend' }] });
  const leaks = moneyLeaks();
  assert.equal(leaks[0].sev, 3);
  assert.ok(leaks.some((l) => l.t.startsWith('Gambling:')));
  assert.ok(leaks.some((l) => l.t.startsWith('You spent more than you received')));
  assert.ok(leaks.some((l) => l.t.startsWith('You borrowed')));
});

test('no leaks for a calm month; loan categories have labels', () => {
  state({ settings: { budget: 30000 }, tx: [tx('in', 20000, { cat: 'salary' }), tx('out', 100, { cat: 'food' })] });
  assert.deepEqual(moneyLeaks(), []);
  assert.equal(catInfo('pay')[2], 'Loan payment');
});

test('older saved data gets an empty loans list', () => {
  const m = migrate({ tx: [], settings: {} });
  assert.deepEqual(m.loans, []);
  assert.equal(m.settings.moneyStart, null);
});

test('balance history follows the records day by day', async () => {
  const { balanceHistory, curShort } = await import('../js/core.js');
  state({ settings: { moneyStart: 1000 }, tx: [
    tx('in', 500, { date: addDays(T, -5) }), tx('out', 200, { date: addDays(T, -2), cat: 'food' }), tx('borrow', 300, { date: T, loanId: 'L' })] });
  const h = balanceHistory(7);
  assert.equal(h.length, 7);
  assert.equal(h[h.length - 1].k, T);
  assert.deepEqual(h.map((p) => p.v), [1000, 1500, 1500, 1500, 1300, 1300, 1600]);
  assert.equal(h[h.length - 1].v, balances().cash);
  const w = balanceHistory(365, 7);
  assert.equal(w[w.length - 1].k, T);
  assert.ok(w.length <= 54);
  assert.equal(curShort(12500), '₱12.5k');
  assert.equal(curShort(-950), '-₱950');
});
