import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import axios from 'axios';
import fs from 'node:fs';
import Lead from '../models/Lead';
import RetargetingLead from '../models/RetargetingLead';
import User from '../models/User';
import { createLeadWithDuplicateLink, findDuplicateLead } from './leadCreation.service';
import { normalizeMakeMetaLeadInput, upsertMakeMetaLead } from './makeMeta.service';
import { createLead } from '../controllers/leadController';
import { importWithMapping } from '../controllers/excelController';
import { importLeadsFromGoogleSheetService } from './lead.service';

const query = (value: unknown) => {
  const result = {
    sort: () => result,
    select: () => result,
    then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(value).then(resolve, reject)
  };
  return result;
};

const salespersonId = new mongoose.Types.ObjectId();
const original = () => new Lead({
  name: 'Vincent Simbarashe Chapungu', email: 'chapsvs@gmail.com', phone: '447471344723',
  source: 'Social Media', status: 'DNP', priority: 'Medium', assignedTo: salespersonId,
  createdAt: new Date('2026-07-21T17:29:40Z')
});

test('contact matching handles imported numeric phones and chooses the oldest match', async (t) => {
  const older = original();
  let filter: Record<string, unknown> | undefined;
  let sort: Record<string, unknown> | undefined;
  t.mock.method(Lead, 'findOne', (input: Record<string, unknown>) => {
    filter = input;
    const result = query(older);
    result.sort = (input: Record<string, unknown>) => { sort = input; return result; };
    return result;
  });
  const result = await findDuplicateLead({ name: older.name, email: 'chapvinc@yahoo.com', phone: '+44 (7471) 344723' });
  assert.equal(result?.reason, 'PHONE_EXISTS');
  assert.deepEqual(sort, { createdAt: 1, _id: 1 });
  const conditions = filter?.$or as Array<Record<string, unknown>>;
  assert.ok(conditions.some((condition) => JSON.stringify(condition).includes('$convert')));
  assert.ok(!conditions.some((condition) => 'name' in condition));
});

test('exact names are considered only when no contact matches', async (t) => {
  const older = original();
  const calls: Array<Record<string, unknown>> = [];
  t.mock.method(Lead, 'findOne', (filter) => { calls.push(filter); return query(filter.name ? older : null); });
  const result = await findDuplicateLead({ name: older.name.toUpperCase(), email: 'changed@example.com', phone: '+447999888777' });
  assert.equal(result?.reason, 'NAME_EXISTS');
  assert.equal(calls.length, 2);
  assert.ok(calls[0]?.$or);
  assert.ok(calls[1]?.name instanceof RegExp);
});

test('a duplicate of an assigned DNP lead is a new unassigned lead even if intake requests assignment', async (t) => {
  const older = original();
  t.mock.method(Lead, 'findOne', () => query(null));
  t.mock.method(Lead.prototype, 'save', async function () {
    assert.equal(this.validateSync(), undefined);
    return this;
  });
  const lead = await createLeadWithDuplicateLink({
    name: older.name, email: older.email, phone: older.phone,
    source: 'Import', status: 'DNP', priority: 'Medium', assignedTo: salespersonId,
    assignmentHistory: [{ assignedTo: salespersonId, assignedAt: new Date(), source: 'Import' }]
  }, { match: { lead: older, reason: 'EMAIL_PHONE_EXISTS' } });
  assert.notEqual(String(lead._id), String(older._id));
  assert.equal(lead.status, 'New');
  assert.equal(lead.assignedTo, undefined);
  assert.deepEqual(lead.assignmentHistory.toObject(), []);
  assert.equal(String(lead.duplicateOf), String(older._id));
  assert.equal(lead.duplicateLabel, 'Duplicate');
  assert.equal(older.status, 'DNP');
  assert.equal(String(older.assignedTo), String(salespersonId));
});

test('duplicate sequence collisions retry with the next label and keep linking to the oldest lead', async (t) => {
  const older = original();
  const existingDuplicate = new Lead({ ...older.toObject(), _id: new mongoose.Types.ObjectId(), duplicateOf: older._id, duplicateSequence: 1 });
  let attempts = 0;
  t.mock.method(Lead, 'findById', () => query(older));
  t.mock.method(Lead, 'findOne', () => query({ duplicateSequence: attempts ? 2 : 1 }));
  t.mock.method(Lead.prototype, 'save', async function () {
    attempts += 1;
    if (attempts === 1) throw { code: 11000, keyPattern: { duplicateOf: 1, duplicateSequence: 1 } };
    return this;
  });
  const lead = await createLeadWithDuplicateLink({
    name: older.name, email: older.email, phone: older.phone, source: 'Meta', assignedBy: salespersonId
  }, { match: { lead: existingDuplicate, reason: 'EMAIL_PHONE_EXISTS' } });
  assert.equal(attempts, 2);
  assert.equal(lead.duplicateLabel, 'Duplicate_3');
  assert.equal(String(lead.duplicateOf), String(older._id));
  assert.ok(lead.notes[0]?.content.startsWith('Duplicate_3'));
});

test('manual lead creation returns 201 with a linked unassigned duplicate', async (t) => {
  const older = original();
  t.mock.method(Lead, 'findOne', (filter) => query(filter.duplicateOf ? null : older));
  t.mock.method(Lead.prototype, 'save', async function () { return this; });
  t.mock.method(Lead.prototype, 'populate', async function () { return this; });
  let status: number | undefined;
  let body: { success: boolean; data: typeof older } | undefined;
  const res = { status: (value: number) => { status = value; return res; }, json: (value) => { body = value; } };
  await createLead({ body: { name: older.name, email: older.email, phone: older.phone, source: 'Manual', priority: 'Medium' }, user: { userId: String(salespersonId) } } as never, res as never);
  assert.equal(status, 201);
  assert.equal(body?.success, true);
  assert.equal(body?.data.assignedTo, undefined);
  assert.equal(String(body?.data.duplicateOf), String(older._id));
});

test('a new Meta enquiry creates an unassigned duplicate, and the same Meta ID never creates a second copy', async (t) => {
  const older = original();
  let stored: typeof older | null = null;
  let saves = 0;
  t.mock.method(Lead, 'findOne', (filter) => query(filter.metaLeadId ? stored : filter.duplicateOf ? null : older));
  t.mock.method(RetargetingLead, 'findOne', () => query(null));
  t.mock.method(RetargetingLead, 'updateOne', async () => ({}));
  t.mock.method(User, 'findOne', () => query({ _id: salespersonId }));
  t.mock.method(Lead.prototype, 'save', async function () { stored = this; saves += 1; return this; });
  const input = normalizeMakeMetaLeadInput({ metaLeadId: '1771049250804912', name: older.name, email: 'chapvinc@yahoo.com', phone: '+447471344723' });
  const first = await upsertMakeMetaLead(input);
  const retry = await upsertMakeMetaLead(input);
  assert.equal(first.outcome, 'created');
  assert.equal(first.lead.status, 'New');
  assert.equal(first.lead.assignedTo, undefined);
  assert.equal(String(first.lead.duplicateOf), String(older._id));
  assert.equal(retry.outcome, 'duplicate');
  assert.equal(String(retry.lead._id), String(first.lead._id));
  assert.equal(saves, 2); // One insert and one payload refresh of that same lead.
});

test('legacy Retargeting events become normal unassigned leads with original timestamps and retained source data', async (t) => {
  const older = original();
  const event = new RetargetingLead({
    name: older.name, email: 'chapvinc@yahoo.com', phone: '+447471344723',
    metaLeadId: '1771049250804912', existingLeadId: older._id, matchReason: 'PHONE_EXISTS',
    createdAt: new Date('2026-10-01T10:18:32.789Z'), metaCreatedTime: new Date('2026-10-01T10:18:15Z'),
    rawPayload: { leadId: '1771049250804912', full_name: older.name, email: 'chapvinc@yahoo.com', phone: '+447471344723', education: 'College' }
  });
  t.mock.method(Lead, 'findOne', () => query(null));
  t.mock.method(Lead, 'findById', () => query(older));
  t.mock.method(RetargetingLead, 'findOne', () => query(event));
  let archive: Record<string, unknown> | undefined;
  t.mock.method(RetargetingLead, 'updateOne', async (_filter, update) => { archive = update.$set; return {}; });
  t.mock.method(User, 'findOne', () => query({ _id: salespersonId }));
  t.mock.method(Lead.prototype, 'save', async function (options) {
    assert.equal(options.timestamps, false);
    assert.equal(this.validateSync(), undefined);
    return this;
  });
  const result = await upsertMakeMetaLead(normalizeMakeMetaLeadInput({ metaLeadId: event.metaLeadId }));
  assert.equal(result.outcome, 'created');
  assert.equal(result.lead.name, older.name);
  assert.equal(result.lead.status, 'New');
  assert.equal(result.lead.assignedTo, undefined);
  assert.equal(result.lead.createdAt.toISOString(), event.createdAt.toISOString());
  assert.equal(result.lead.metaRawPayload?.education, 'College');
  assert.equal(String(archive?.migratedLeadId), String(result.lead._id));
  assert.equal(String(event.existingLeadId), String(older._id));
});

test('Google Sheets creates every repeated enquiry unassigned without reassigning or changing the older lead', async (t) => {
  const older = original();
  const saved: Array<typeof older> = [];
  t.mock.method(axios, 'get', async () => ({ data:
    'Name,Email,Phone,Assigned To\nVincent Simbarashe Chapungu,chapvinc@yahoo.com,+447471344723,Salesperson\nVincent Simbarashe Chapungu,chapvinc@yahoo.com,+447471344723,Salesperson'
  }));
  t.mock.method(User, 'findOne', () => query({ _id: salespersonId }));
  t.mock.method(Lead, 'findOne', (filter) => query(filter.duplicateOf ? saved.at(-1) || null : older));
  t.mock.method(Lead.prototype, 'save', async function () {
    assert.notEqual(String(this._id), String(older._id));
    saved.push(this);
    return this;
  });
  const result = await importLeadsFromGoogleSheetService('https://docs.google.com/spreadsheets/d/test-fixture/edit');
  assert.equal(result.insertedCount, 2);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.duplicateCount, 2);
  assert.deepEqual(saved.map((lead) => lead.duplicateLabel), ['Duplicate', 'Duplicate_2']);
  assert.ok(saved.every((lead) => lead.status === 'New' && !lead.assignedTo && !lead.assignmentHistory.length));
  assert.equal(older.status, 'DNP');
  assert.equal(String(older.assignedTo), String(salespersonId));
});

test('Excel import includes duplicate rows as successfully created linked leads', async (t) => {
  const older = original();
  const saved: Array<typeof older> = [];
  const readFile = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (path, options) => path === 'duplicate-import-fixture.csv'
    ? 'Name,Email,Phone\nVincent Simbarashe Chapungu,chapvinc@yahoo.com,+447471344723\nVincent Simbarashe Chapungu,chapvinc@yahoo.com,+447471344723'
    : readFile(path, options));
  const unlinkFile = fs.unlinkSync;
  t.mock.method(fs, 'unlinkSync', (path) => { if (path !== 'duplicate-import-fixture.csv') unlinkFile(path); });
  t.mock.method(User, 'findOne', () => query({ _id: salespersonId }));
  t.mock.method(Lead, 'findOne', (filter) => query(filter.duplicateOf ? saved.at(-1) || null : older));
  t.mock.method(Lead.prototype, 'save', async function () { saved.push(this); return this; });
  let status: number | undefined;
  let body;
  const res = { status: (value: number) => { status = value; return res; }, json: (value) => { body = value; } };
  await importWithMapping({
    file: { path: 'duplicate-import-fixture.csv', originalname: 'leads.csv' },
    body: {
      sheetName: 'Sheet1', startFromRow: '2', skipEmptyRows: 'true',
      fieldMappings: JSON.stringify(['name', 'email', 'phone'].map((field) => ({ excelColumn: field[0].toUpperCase() + field.slice(1), leadField: field, isRequired: true })))
    }
  } as never, res as never);
  assert.equal(status, 200);
  assert.equal(body.data.successfulImports, 2);
  assert.deepEqual(body.data.errors, []);
  assert.deepEqual(saved.map((lead) => lead.duplicateLabel), ['Duplicate', 'Duplicate_2']);
  assert.ok(saved.every((lead) => !lead.assignedTo && String(lead.duplicateOf) === String(older._id)));
});
