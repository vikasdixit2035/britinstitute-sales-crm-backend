import assert from 'node:assert/strict';
import test from 'node:test';
import type { ILead } from '../types';
import { buildMetaFeedbackPayload, normalizeMakeMetaLeadInput, normalizePhoneIdentity } from './makeMeta.service';

test('normalizes Make and Meta aliases into the CRM lead contract', () => {
  const lead = normalizeMakeMetaLeadInput({
    lead_id: 123456789012345,
    full_name: '  Test Person  ',
    email: ' TEST@EXAMPLE.COM ',
    phone_number: '+91 98765 43210',
    campaign_name: 'Summer Campaign',
    adset_name: 'Analytics Audience',
    ad_name: 'Video 1',
    created_time: 1787270400,
  });

  assert.equal(lead.metaLeadId, '123456789012345');
  assert.equal(lead.name, 'Test Person');
  assert.equal(lead.email, 'test@example.com');
  assert.equal(lead.phone, '+91 98765 43210');
  assert.equal(lead.campaignName, 'Summer Campaign');
  assert.equal(lead.createdTime, '1787270400');
  assert.equal(lead.originalName, 'Test Person');
  assert.equal(lead.originalEmail, 'TEST@EXAMPLE.COM');
  assert.equal(lead.originalPhone, '+91 98765 43210');
});

test('reads contact answers from Meta field_data arrays', () => {
  const lead = normalizeMakeMetaLeadInput({
    id: '123456789012345',
    field_data: [
      { name: 'full_name', values: ['Test Person'] },
      { name: 'email', values: ['test@example.com'] },
      { name: 'phone_number', values: ['919876543210'] },
    ],
  });

  assert.equal(lead.name, 'Test Person');
  assert.equal(lead.email, 'test@example.com');
  assert.equal(lead.phone, '919876543210');
});

test('normalizes phone formatting for repeat-lead identity matching', () => {
  assert.equal(normalizePhoneIdentity('+91 (98765) 43210'), '919876543210');
  assert.equal(normalizePhoneIdentity('+91-98765-43210'), '919876543210');
});

test('preserves invalid Meta contact values and the complete incoming payload', () => {
  const payload = {
    leadId: '1037961745774666',
    full_name: '<test lead: dummy data for full_name>',
    email: 'test@meta.com',
    phone_number: '<test lead: dummy data for phone_number>',
    education_level: 'dummy education',
  };
  const lead = normalizeMakeMetaLeadInput(payload);

  assert.equal(lead.originalName, payload.full_name);
  assert.equal(lead.originalEmail, payload.email);
  assert.equal(lead.originalPhone, payload.phone_number);
  assert.deepEqual(lead.rawPayload, payload);
});

test('builds the Make feedback payload expected by the CRM conversions module', () => {
  const lead = {
    _id: '507f1f77bcf86cd799439011',
    status: 'Qualified',
    metaLeadId: '123456789012345',
    email: 'test@example.com',
    phone: '+91 98765-43210',
    campaignName: 'Summer Campaign',
  } as unknown as ILead;

  const payload = buildMetaFeedbackPayload(lead, 'Contacted', new Date('2026-08-21T10:00:00.000Z'));

  assert.equal(payload.eventName, 'Qualified');
  assert.equal(payload.eventTime, 1787306400);
  assert.equal(payload.leadId, '123456789012345');
  assert.equal(payload.phoneNumber, '919876543210');
  assert.equal(payload.previousStatus, 'Contacted');
  assert.equal(payload.campaignName, 'Summer Campaign');
});

test('extracts and formats custom form attributes from Make collection format (Screenshot 2)', () => {
  const payload = {
    metaLeadId: '2019744138745208',
    fieldData: {
      full_name: 'Adnaan yaqoob',
      phone_number: '+447492054477',
      education_level: 'High school / GED',
      'what_is_your_primary_goal_for_enrolling_in_this_program?': ['get_a_job_in_data_analytics'],
      'when_are_you_planning_to_start_the_course?': ['immediately'],
      email: 'Adnaanyaqoob@outlook.com',
      'what_is_your_current_status?': ['employed'],
    },
  };

  const lead = normalizeMakeMetaLeadInput(payload);

  assert.equal(lead.name, 'Adnaan yaqoob');
  assert.equal(lead.email, 'adnaanyaqoob@outlook.com');
  assert.equal(lead.phone, '+447492054477');

  assert.ok(lead.metaAttributes);
  assert.equal(lead.metaAttributes.length, 4);

  const goalAttr = lead.metaAttributes.find(
    (a) => a.key === 'what_is_your_primary_goal_for_enrolling_in_this_program?'
  );
  assert.ok(goalAttr);
  assert.equal(goalAttr.label, 'What is your primary goal for enrolling in this program?');
  assert.equal(goalAttr.value, 'Get a job in data analytics');

  const eduAttr = lead.metaAttributes.find((a) => a.key === 'education_level');
  assert.ok(eduAttr);
  assert.equal(eduAttr.label, 'Education Level');
  assert.equal(eduAttr.value, 'High school / GED');

  const whenAttr = lead.metaAttributes.find(
    (a) => a.key === 'when_are_you_planning_to_start_the_course?'
  );
  assert.ok(whenAttr);
  assert.equal(whenAttr.label, 'When are you planning to start the course?');
  assert.equal(whenAttr.value, 'Immediately');

  const statusAttr = lead.metaAttributes.find((a) => a.key === 'what_is_your_current_status?');
  assert.ok(statusAttr);
  assert.equal(statusAttr.label, 'What is your current status?');
  assert.equal(statusAttr.value, 'Employed');
});

test('extracts attributes from Make mappableFieldData and top-level fields', () => {
  const payload = {
    metaLeadId: '123456789',
    mappableFieldData: [
      { Name: 'full_name', Value: 'Adnaan yaqoob' },
      { Name: 'phone_number', Value: '+447492054477' },
      { Name: 'email', Value: 'adnaan@test.com' },
      { Name: 'education_level', Value: 'High school / GED' },
      { Name: 'what_is_your_primary_goal_for_enrolling_in_this_program?', Value: 'get_a_job_in_data_analytics' },
    ],
  };

  const lead = normalizeMakeMetaLeadInput(payload);
  assert.equal(lead.name, 'Adnaan yaqoob');
  assert.equal(lead.email, 'adnaan@test.com');
  assert.equal(lead.metaAttributes?.length, 2);
});

