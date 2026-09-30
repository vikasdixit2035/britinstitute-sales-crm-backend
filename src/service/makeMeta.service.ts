import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import Lead from '../models/Lead';
import RetargetingLead from '../models/RetargetingLead';
import User from '../models/User';
import type { ILead, MakeMetaLeadInput, MetaFeedbackPayload } from '../types';

export type MakeMetaUpsertOutcome = 'created' | 'retargeting' | 'duplicate';

export interface MakeMetaUpsertResult {
  outcome: MakeMetaUpsertOutcome;
  lead: ILead;
  retargetingLead?: Record<string, unknown>;
}

export interface MetaFeedbackResult {
  sent: boolean;
  skipped: boolean;
  error?: string;
}

const stringValue = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

const normalizeLookupKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');

const getFieldDataValue = (body: Record<string, unknown>, candidates: string[]): string => {
  const candidateSet = new Set(candidates.map(normalizeLookupKey));

  // 1. Check mappableFieldData / mappable_field_data (Make Array of { Name/name, Value/value })
  const mappable = body.mappableFieldData || body.mappable_field_data;
  if (Array.isArray(mappable)) {
    for (const item of mappable) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const name = normalizeLookupKey(stringValue(rec.Name ?? rec.name ?? rec.key ?? rec.field));
      if (candidateSet.has(name)) {
        const candidateValues = rec.Values ?? rec.values;
        if (Array.isArray(candidateValues)) {
          const matched = candidateValues.map(stringValue).find(Boolean);
          if (matched) return matched;
        }
        const val = stringValue(rec.Value ?? rec.value);
        if (val) return val;
      }
    }
  }

  // 2. Check fieldData / field_data
  const fieldData = body.fieldData || body.field_data;
  if (Array.isArray(fieldData)) {
    for (const item of fieldData) {
      if (!item || typeof item !== 'object') continue;
      const field = item as Record<string, unknown>;
      const name = normalizeLookupKey(stringValue(field.name ?? field.Name ?? field.key));
      if (!candidateSet.has(name)) continue;

      if (Array.isArray(field.values)) {
        const matchedValue = field.values.map(stringValue).find(Boolean);
        if (matchedValue) return matchedValue;
      }

      const value = stringValue(field.value ?? field.Value);
      if (value) return value;
    }
  } else if (fieldData && typeof fieldData === 'object') {
    for (const [key, val] of Object.entries(fieldData as Record<string, unknown>)) {
      const name = normalizeLookupKey(key);
      if (!candidateSet.has(name)) continue;

      if (Array.isArray(val)) {
        const matchedValue = val.map(stringValue).find(Boolean);
        if (matchedValue) return matchedValue;
      }
      const str = stringValue(val);
      if (str) return str;
    }
  }

  return '';
};

const IGNORED_ATTRIBUTE_KEYS = new Set([
  'id',
  'leadid',
  'leadgenid',
  'metaleadid',
  'formid',
  'pageid',
  'adid',
  'campaignid',
  'adsetid',
  'metafbc',
  'metafbp',
  'name',
  'fullname',
  'firstname',
  'lastname',
  'email',
  'phone',
  'phonenumber',
  'whatsapp',
  'whatsappnumber',
  'zoomphonenumber',
  'campaignname',
  'adsetname',
  'adname',
  'createdtime',
  'datecreated',
  'folder',
  'source',
  'status',
  'priority',
  'rawpayload',
  'metarawpayload',
  'fielddata',
  'mappablefielddata',
  'customfields',
  'formfields',
  'metaattributes',
  'attributes',
  'feedback',
  'metafeedbacklaststatus',
  'metafeedbacklastsentat',
  'metafeedbacklasterror',
  'apikey',
  'xapikey',
  'createdat',
  'updatedat',
  'v',
  '_v',
  '__v',
  'notes',
  'assignedto',
  'assignedby',
  'assignmenthistory',
  'leadscore',
]);

const QUESTION_WORDS = new Set([
  'what',
  'when',
  'why',
  'where',
  'how',
  'who',
  'which',
  'whose',
  'whom',
  'are',
  'do',
  'does',
  'did',
  'is',
  'can',
  'could',
  'will',
  'would',
  'have',
  'has',
  'should',
]);

const ACRONYMS: Record<string, string> = {
  ged: 'GED',
  id: 'ID',
  crm: 'CRM',
  uk: 'UK',
  us: 'US',
  usa: 'USA',
  vps: 'VPS',
  it: 'IT',
  hr: 'HR',
  api: 'API',
  url: 'URL',
  ai: 'AI',
  qa: 'QA',
};

export const formatAttributeLabel = (key: string): string => {
  if (!key) return '';
  const trimmed = key.trim();
  const hasQuestionMark = trimmed.endsWith('?');
  const cleanKey = trimmed.replace(/\?+$/, '');

  const words = cleanKey
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[\-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return trimmed;

  const firstWordLower = words[0].toLowerCase();
  const isQuestion = hasQuestionMark || QUESTION_WORDS.has(firstWordLower);

  if (isQuestion) {
    const formattedWords = words.map((w, idx) => {
      const lower = w.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      if (lower === 'i') return 'I';
      if (idx === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    });
    return `${formattedWords.join(' ')}?`;
  }

  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
};

export const formatAttributeValue = (value: unknown): { value: string; rawValue: string } => {
  if (value === null || value === undefined) {
    return { value: '', rawValue: '' };
  }

  if (Array.isArray(value)) {
    const formattedItems = value
      .map((item) => formatAttributeValue(item))
      .filter((res) => Boolean(res.value));
    return {
      value: formattedItems.map((item) => item.value).join(', '),
      rawValue: formattedItems.map((item) => item.rawValue).join(', '),
    };
  }

  if (typeof value === 'boolean') {
    return { value: value ? 'Yes' : 'No', rawValue: String(value) };
  }

  if (typeof value === 'number') {
    return { value: String(value), rawValue: String(value) };
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('value' in obj || 'Value' in obj) {
      return formatAttributeValue(obj.value ?? obj.Value);
    }
    if ('values' in obj || 'Values' in obj) {
      return formatAttributeValue(obj.values ?? obj.Values);
    }
    const str = JSON.stringify(value);
    return { value: str, rawValue: str };
  }

  const rawString = String(value).trim();
  if (!rawString) return { value: '', rawValue: '' };

  if (/\s|\/|[A-Z]/.test(rawString)) {
    return { value: rawString, rawValue: rawString };
  }

  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(rawString)) {
    const parts = rawString.split('_');
    const titleized = parts
      .map((p, idx) => {
        if (ACRONYMS[p]) return ACRONYMS[p];
        if (idx === 0) return p.charAt(0).toUpperCase() + p.slice(1);
        return p;
      })
      .join(' ');
    return { value: titleized, rawValue: rawString };
  }

  if (/^[a-z]+$/.test(rawString)) {
    return {
      value: rawString.charAt(0).toUpperCase() + rawString.slice(1),
      rawValue: rawString,
    };
  }

  return { value: rawString, rawValue: rawString };
};

export const extractMetaAttributes = (body: Record<string, unknown>): Array<{ key: string; label: string; value: string; rawValue?: string }> => {
  const result: Array<{ key: string; label: string; value: string; rawValue?: string }> = [];
  const seen = new Set<string>();

  const addCandidate = (rawKey: unknown, rawVal: unknown, customLabel?: string) => {
    if (!rawKey || typeof rawKey !== 'string') return;
    const key = rawKey.trim();
    if (!key) return;

    const normalizedKey = normalizeLookupKey(key);
    if (IGNORED_ATTRIBUTE_KEYS.has(normalizedKey)) return;
    if (seen.has(normalizedKey)) return;

    const { value, rawValue } = formatAttributeValue(rawVal);
    if (!value) return;

    seen.add(normalizedKey);
    result.push({
      key,
      label: customLabel?.trim() || formatAttributeLabel(key),
      value,
      rawValue: rawValue || value,
    });
  };

  // 1. Explicit attributes container
  const explicitAttributes = body.metaAttributes || body.attributes || body.customFields || body.formFields;
  if (Array.isArray(explicitAttributes)) {
    for (const item of explicitAttributes) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const k = rec.key || rec.name || rec.label || rec.field;
      const v = rec.value ?? rec.values;
      const label = typeof rec.label === 'string' ? rec.label : undefined;
      addCandidate(k, v, label);
    }
  } else if (explicitAttributes && typeof explicitAttributes === 'object') {
    for (const [k, v] of Object.entries(explicitAttributes as Record<string, unknown>)) {
      addCandidate(k, v);
    }
  }

  // 2. mappableFieldData / mappable_field_data (Make Array: [{ Name, Value }])
  const mappable = body.mappableFieldData || body.mappable_field_data;
  if (Array.isArray(mappable)) {
    for (const item of mappable) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const k = rec.Name ?? rec.name ?? rec.key ?? rec.field;
      const v = rec.Value ?? rec.value ?? rec.values;
      addCandidate(k, v);
    }
  }

  // 3. fieldData / field_data (Array or Object)
  const fieldData = body.fieldData || body.field_data;
  if (Array.isArray(fieldData)) {
    for (const item of fieldData) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const k = rec.name ?? rec.Name ?? rec.key;
      const v = rec.values ?? rec.value ?? rec.Value;
      addCandidate(k, v);
    }
  } else if (fieldData && typeof fieldData === 'object') {
    for (const [k, v] of Object.entries(fieldData as Record<string, unknown>)) {
      addCandidate(k, v);
    }
  }

  // 4. Root-level custom keys
  for (const [k, v] of Object.entries(body)) {
    addCandidate(k, v);
  }

  return result;
};

const firstValue = (body: Record<string, unknown>, candidates: string[]): string => {
  for (const candidate of candidates) {
    const value = stringValue(body[candidate]);
    if (value) return value;
  }
  return getFieldDataValue(body, candidates);
};

const optionalString = (value: string): string | undefined => value || undefined;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+]?([\d\s\-().]){7,25}$/;

const normalizePhone = (value: string): string =>
  value.replace(/[^\d+\-().\s]/g, '').replace(/\s+/g, ' ').trim();

export const normalizePhoneIdentity = (value: string): string => value.replace(/\D/g, '');

const phoneIdentityPattern = (value: string): RegExp | null => {
  const digits = normalizePhoneIdentity(value);
  if (digits.length < 7) return null;
  return new RegExp(`^\\D*${digits.split('').join('\\D*')}\\D*$`);
};

const parseMetaCreatedTime = (value: string): Date | undefined => {
  if (!value) return undefined;

  const numericValue = Number(value);
  const parsed = Number.isFinite(numericValue)
    ? new Date(numericValue < 10_000_000_000 ? numericValue * 1000 : numericValue)
    : new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export const normalizeMakeMetaLeadInput = (body: Record<string, unknown>): MakeMetaLeadInput => {
  const firstName = firstValue(body, ['firstName', 'first_name']);
  const lastName = firstValue(body, ['lastName', 'last_name']);
  const suppliedName = firstValue(body, ['name', 'fullName', 'full_name']);

  const originalEmail = firstValue(body, ['email']);
  const originalPhone = firstValue(body, ['phone', 'phoneNumber', 'phone_number']);
  const originalName = suppliedName || [firstName, lastName].filter(Boolean).join(' ');
  const metaAttributes = extractMetaAttributes(body);

  const result: MakeMetaLeadInput = {
    metaLeadId: firstValue(body, ['metaLeadId', 'leadId', 'lead_id', 'leadgenId', 'leadgen_id', 'id']),
    name: originalName,
    email: originalEmail.toLowerCase(),
    phone: normalizePhone(originalPhone),
    originalName,
    originalEmail,
    originalPhone,
    metaAttributes,
    rawPayload: { ...body },
  };

  const optionalValues: Array<[keyof MakeMetaLeadInput, string | undefined]> = [
    ['whatsapp', optionalString(normalizePhone(firstValue(body, ['whatsapp', 'whatsApp'])))],
    ['position', optionalString(firstValue(body, ['position', 'jobTitle', 'job_title']))],
    ['folder', optionalString(firstValue(body, ['folder']))],
    ['campaignName', optionalString(firstValue(body, ['campaignName', 'campaign_name']))],
    ['adsetName', optionalString(firstValue(body, ['adsetName', 'adSetName', 'adset_name']))],
    ['adName', optionalString(firstValue(body, ['adName', 'ad_name']))],
    ['formId', optionalString(firstValue(body, ['formId', 'form_id']))],
    ['pageId', optionalString(firstValue(body, ['pageId', 'page_id']))],
    ['adId', optionalString(firstValue(body, ['adId', 'ad_id']))],
    ['createdTime', optionalString(firstValue(body, ['createdTime', 'created_time']))],
  ];

  optionalValues.forEach(([key, value]) => {
    if (value !== undefined) {
      (result as unknown as Record<string, unknown>)[key] = value;
    }
  });

  return result;
};

const fallbackIdentity = (metaLeadId: string): string =>
  createHash('sha256').update(metaLeadId).digest('hex').slice(0, 24);

const fallbackPhone = (metaLeadId: string): string => {
  const hex = createHash('sha256').update(metaLeadId).digest('hex').slice(0, 12);
  return `9${BigInt(`0x${hex}`).toString().padStart(15, '0').slice(0, 15)}`;
};

const crmContactValues = (leadData: MakeMetaLeadInput) => ({
  name: leadData.name.length >= 2 && leadData.name.length <= 100
    ? leadData.name
    : 'Unknown Meta Lead',
  email: emailPattern.test(leadData.email)
    ? leadData.email
    : `meta-${fallbackIdentity(leadData.metaLeadId)}@invalid.local`,
  phone: phonePattern.test(leadData.phone)
    ? leadData.phone
    : fallbackPhone(leadData.metaLeadId),
});

const getSystemUserId = async (): Promise<mongoose.Types.ObjectId | undefined> => {
  const systemUser = await User.findOne({ email: 'system@leadmanager.com' }).select('_id');
  return systemUser?._id ? new mongoose.Types.ObjectId(String(systemUser._id)) : undefined;
};

const buildAuditNote = (leadData: MakeMetaLeadInput): string => [
  'Meta lead received through Make.',
  `Lead ID: ${leadData.metaLeadId}`,
  leadData.formId ? `Form ID: ${leadData.formId}` : '',
  leadData.pageId ? `Page ID: ${leadData.pageId}` : '',
  leadData.adId ? `Ad ID: ${leadData.adId}` : '',
  leadData.createdTime ? `Meta created: ${leadData.createdTime}` : '',
].filter(Boolean).join(' ');

export const upsertMakeMetaLead = async (leadData: MakeMetaLeadInput): Promise<MakeMetaUpsertResult> => {
  const existingByMetaId = await Lead.findOne({ metaLeadId: leadData.metaLeadId });
  if (existingByMetaId) {
    let changed = false;
    if (leadData.metaAttributes && leadData.metaAttributes.length > 0) {
      existingByMetaId.set('metaAttributes', leadData.metaAttributes);
      changed = true;
    }
    if (leadData.rawPayload && Object.keys(leadData.rawPayload).length > 0) {
      existingByMetaId.metaRawPayload = {
        ...(existingByMetaId.metaRawPayload || {}),
        ...leadData.rawPayload,
      };
      changed = true;
    }
    if (changed) {
      await existingByMetaId.save();
    }
    return { outcome: 'duplicate', lead: existingByMetaId };
  }

  const existingRetargeting = await RetargetingLead.findOne({ metaLeadId: leadData.metaLeadId });
  if (existingRetargeting) {
    const linkedLead = await Lead.findById(existingRetargeting.existingLeadId);
    if (!linkedLead) {
      throw new Error('The original CRM lead linked to this retargeting event no longer exists');
    }
    let changed = false;
    if (leadData.metaAttributes && leadData.metaAttributes.length > 0) {
      existingRetargeting.set('metaAttributes', leadData.metaAttributes);
      changed = true;
    }
    if (leadData.rawPayload && Object.keys(leadData.rawPayload).length > 0) {
      existingRetargeting.rawPayload = {
        ...(existingRetargeting.rawPayload || {}),
        ...leadData.rawPayload,
      };
      changed = true;
    }
    if (changed) {
      await existingRetargeting.save();
    }
    return {
      outcome: 'duplicate',
      lead: linkedLead,
      retargetingLead: existingRetargeting.toObject() as unknown as Record<string, unknown>,
    };
  }

  const existingByEmail = emailPattern.test(leadData.email)
    ? await Lead.findOne({ email: leadData.email })
    : null;
  const normalizedPhonePattern = phonePattern.test(leadData.phone)
    ? phoneIdentityPattern(leadData.phone)
    : null;
  const existingByPhone = !existingByEmail && normalizedPhonePattern
    ? await Lead.findOne({ phone: normalizedPhonePattern })
    : null;
  const existingByContact = existingByEmail || existingByPhone;
  const systemUserId = await getSystemUserId();

  if (existingByContact) {
    const emailMatches = emailPattern.test(leadData.email) && existingByContact.email === leadData.email;
    const phoneMatches = phonePattern.test(leadData.phone) &&
      normalizePhoneIdentity(existingByContact.phone) === normalizePhoneIdentity(leadData.phone);
    const matchReason = emailMatches && phoneMatches
      ? 'EMAIL_PHONE_EXISTS'
      : emailMatches
        ? 'EMAIL_EXISTS'
        : 'PHONE_EXISTS';

    const retargetingLead = await RetargetingLead.create({
      metaLeadId: leadData.metaLeadId,
      existingLeadId: existingByContact._id,
      name: leadData.originalName,
      email: leadData.email,
      phone: leadData.phone,
      whatsapp: leadData.whatsapp || '',
      position: leadData.position || '',
      matchReason,
      campaignName: leadData.campaignName || '',
      adsetName: leadData.adsetName || '',
      adName: leadData.adName || '',
      metaFormId: leadData.formId || '',
      metaPageId: leadData.pageId || '',
      metaAdId: leadData.adId || '',
      metaCreatedTime: parseMetaCreatedTime(leadData.createdTime || ''),
      metaAttributes: leadData.metaAttributes || [],
      rawPayload: leadData.rawPayload,
    });

    if (leadData.metaAttributes && leadData.metaAttributes.length > 0 && (!existingByContact.metaAttributes || existingByContact.metaAttributes.length === 0)) {
      existingByContact.set('metaAttributes', leadData.metaAttributes);
      await existingByContact.save().catch((err) => {
        console.error('Could not backfill metaAttributes on existing lead:', err);
      });
    }

    if (systemUserId) {
      await Lead.updateOne(
        { _id: existingByContact._id },
        {
          $push: {
            notes: {
              id: new mongoose.Types.ObjectId().toString(),
              content: `Retargeting enquiry received and linked to this lead. ${buildAuditNote(leadData)}`,
              createdBy: systemUserId,
              createdAt: new Date(),
            }
          }
        }
      ).catch((error) => {
        console.error('Retargeting audit note could not be added:', error);
      });
    }

    return {
      outcome: 'retargeting',
      lead: existingByContact,
      retargetingLead: retargetingLead.toObject() as unknown as Record<string, unknown>,
    };
  }

  const contactValues = crmContactValues(leadData);
  const lead = new Lead({
    name: contactValues.name,
    email: contactValues.email,
    phone: contactValues.phone,
    whatsapp: leadData.whatsapp && phonePattern.test(leadData.whatsapp)
      ? leadData.whatsapp
      : contactValues.phone,
    position: leadData.position || '',
    folder: leadData.folder || 'Meta Lead Ads',
    source: 'Meta',
    status: 'New',
    priority: 'Medium',
    campaignName: leadData.campaignName || '',
    adsetName: leadData.adsetName || '',
    adName: leadData.adName || '',
    metaLeadId: leadData.metaLeadId,
    metaFormId: leadData.formId || '',
    metaPageId: leadData.pageId || '',
    metaAdId: leadData.adId || '',
    metaCreatedTime: parseMetaCreatedTime(leadData.createdTime || ''),
    metaOriginalName: leadData.originalName,
    metaOriginalEmail: leadData.originalEmail,
    metaOriginalPhone: leadData.originalPhone,
    metaAttributes: leadData.metaAttributes || [],
    metaRawPayload: leadData.rawPayload,
    assignedBy: systemUserId,
  });

  if (systemUserId) {
    lead.notes.push({
      id: new mongoose.Types.ObjectId().toString(),
      content: buildAuditNote(leadData),
      createdBy: systemUserId,
      createdAt: new Date(),
    });
  }

  await lead.save();
  return { outcome: 'created', lead };
};

export const buildMetaFeedbackPayload = (
  lead: ILead,
  previousStatus?: string,
  eventTime: Date = new Date()
): MetaFeedbackPayload => {
  const payload: MetaFeedbackPayload = {
    eventName: lead.status,
    eventTime: Math.floor(eventTime.getTime() / 1000),
    leadId: lead.metaLeadId || '',
    email: emailPattern.test(lead.metaOriginalEmail || lead.email)
      ? (lead.metaOriginalEmail || lead.email).toLowerCase()
      : '',
    phoneNumber: phonePattern.test(lead.metaOriginalPhone || lead.phone)
      ? (lead.metaOriginalPhone || lead.phone).replace(/\D/g, '')
      : '',
    leadEventSource: process.env.MAKE_META_LEAD_EVENT_SOURCE || 'Lead Manager CRM',
    crmLeadId: String(lead._id),
    status: lead.status,
  };

  if (previousStatus) payload.previousStatus = previousStatus;
  if (lead.campaignName) payload.campaignName = lead.campaignName;
  if (lead.adsetName) payload.adsetName = lead.adsetName;
  if (lead.adName) payload.adName = lead.adName;

  return payload;
};

const saveFeedbackResult = async (lead: ILead, error?: string): Promise<void> => {
  const sentAt = new Date();
  const update = error
    ? { metaFeedbackLastError: error }
    : {
        metaFeedbackLastStatus: lead.status,
        metaFeedbackLastSentAt: sentAt,
        metaFeedbackLastError: '',
      };

  await Lead.updateOne({ _id: lead._id }, { $set: update });

  if (error) {
    lead.metaFeedbackLastError = error;
  } else {
    lead.metaFeedbackLastStatus = lead.status;
    lead.metaFeedbackLastSentAt = sentAt;
    lead.metaFeedbackLastError = '';
  }
};

export const sendMetaStatusFeedback = async (
  lead: ILead,
  previousStatus?: string,
  eventTime?: Date
): Promise<MetaFeedbackResult> => {
  if (!lead.metaLeadId) return { sent: false, skipped: true };

  const webhookUrl = process.env.MAKE_META_FEEDBACK_WEBHOOK_URL?.trim();
  if (!webhookUrl) return { sent: false, skipped: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7500);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const webhookApiKey = process.env.MAKE_META_FEEDBACK_API_KEY?.trim();
    if (webhookApiKey) headers['x-make-apikey'] = webhookApiKey;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildMetaFeedbackPayload(lead, previousStatus, eventTime)),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Make feedback webhook returned HTTP ${response.status}`);
    }

    await saveFeedbackResult(lead);
    return { sent: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Make feedback webhook error';
    console.error('Meta feedback delivery failed:', message);
    await saveFeedbackResult(lead, message).catch((saveError) => {
      console.error('Meta feedback error state could not be saved:', saveError);
    });
    return { sent: false, skipped: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
};
