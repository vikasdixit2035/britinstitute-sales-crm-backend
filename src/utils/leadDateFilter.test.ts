import assert from 'node:assert/strict';
import test from 'node:test';
import { getLeadDateFilter } from './leadDateFilter';

test('builds inclusive created and modified ranges together', () => {
  const filter = getLeadDateFilter({
    createdFromDate: '2026-09-01',
    createdToDate: '2026-09-10',
    modifiedFromDate: '2026-09-22',
    modifiedToDate: '2026-09-22',
    timezoneOffsetMinutes: '-60'
  });

  assert.deepEqual(filter, {
    createdAt: {
      $gte: new Date('2026-08-31T23:00:00.000Z'),
      $lte: new Date('2026-09-10T22:59:59.999Z')
    },
    updatedAt: {
      $gte: new Date('2026-09-21T23:00:00.000Z'),
      $lte: new Date('2026-09-22T22:59:59.999Z')
    }
  });
});

test('keeps the legacy single-field updated date filter', () => {
  const filter = getLeadDateFilter({
    fromDate: '2026-09-22',
    toDate: '2026-09-22',
    dateField: 'updatedAt',
    timezoneOffsetMinutes: '0'
  });

  assert.deepEqual(filter, {
    updatedAt: {
      $gte: new Date('2026-09-22T00:00:00.000Z'),
      $lte: new Date('2026-09-22T23:59:59.999Z')
    }
  });
});

test('builds an inclusive last-contacted range in the request timezone', () => {
  const filter = getLeadDateFilter({
    lastContactedFromDate: '2026-09-28',
    lastContactedToDate: '2026-09-29',
    timezoneOffsetMinutes: '-60'
  });

  assert.deepEqual(filter, {
    lastContactedAt: {
      $gte: new Date('2026-09-27T23:00:00.000Z'),
      $lte: new Date('2026-09-29T22:59:59.999Z')
    }
  });
});
