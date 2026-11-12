import test from 'node:test';
import assert from 'node:assert/strict';
import { pollsRefreshDue } from '../scripts/polls-refresh-due.mjs';

const now = Date.parse('2026-11-12T16:00:00Z');
const feed = minutes => ({schemaVersion:1, success:true, polls:[{id:'valid'}],
  checkedAt:new Date(now - minutes * 60_000).toISOString(), sources:[{ok:true}]});

test('refreshes archives whose two-hour schedule was missed', () => {
  assert.equal(pollsRefreshDue(feed(121), now), true);
  assert.equal(pollsRefreshDue(feed(120), now), true);
  assert.equal(pollsRefreshDue(feed(119), now), false);
});

test('regular news runs do not collect polls unnecessarily', () => {
  assert.equal(pollsRefreshDue(feed(5), now), false);
});

test('retries partial source failures after thirty minutes', () => {
  const partial = feed(31); partial.sources.push({ok:false});
  assert.equal(pollsRefreshDue(partial, now), true);
  partial.checkedAt = feed(29).checkedAt;
  assert.equal(pollsRefreshDue(partial, now), false);
});

test('missing, invalid, empty and future-dated archives request recovery', () => {
  for (const data of [undefined, {}, {...feed(5), success:false}, {...feed(5), polls:[]},
    {...feed(5), checkedAt:'bad'}, feed(-10)]) {
    assert.equal(pollsRefreshDue(data, now), true);
  }
});

