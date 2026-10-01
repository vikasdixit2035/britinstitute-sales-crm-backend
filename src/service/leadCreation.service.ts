import mongoose from 'mongoose';
import type { SaveOptions } from 'mongoose';
import Lead from '../models/Lead';
import type { ILead } from '../types';

export type DuplicateMatchReason = NonNullable<ILead['duplicateMatchReason']>;
export interface DuplicateMatch {
  lead: ILead;
  reason: DuplicateMatchReason;
}

export interface LeadCreationFields extends Record<string, unknown> {
  name: string;
  email: string;
  phone: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const exactTextPattern = (value: string): RegExp =>
  new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

export const normalizePhoneIdentity = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
export const duplicateLabelForSequence = (sequence: number): string =>
  sequence === 1 ? 'Duplicate' : `Duplicate_${sequence}`;

export const findDuplicateLead = async (fields: LeadCreationFields): Promise<DuplicateMatch | null> => {
  const email = fields.email.trim().toLowerCase();
  const digits = normalizePhoneIdentity(fields.phone);
  const name = fields.name.trim();
  const conditions: mongoose.FilterQuery<ILead>[] = [];

  if (emailPattern.test(email) && !email.endsWith('@invalid.local')) {
    conditions.push({ email: exactTextPattern(email) });
  }
  if (digits.length >= 7) {
    // Old imports contain numeric phone values as well as formatted strings.
    conditions.push({ $expr: { $regexMatch: {
      input: { $convert: { input: '$phone', to: 'string', onError: '', onNull: '' } },
      regex: `^\\D*${digits.split('').join('\\D*')}\\D*$`
    } } });
  }
  let lead = conditions.length
    ? await Lead.findOne({ $or: conditions }).sort({ createdAt: 1, _id: 1 })
    : null;
  // Prefer a contact match; exact names are a fallback when contact details changed.
  if (!lead && name.length >= 2 && name !== 'Unknown Meta Lead') {
    lead = await Lead.findOne({ name: exactTextPattern(name) }).sort({ createdAt: 1, _id: 1 });
  }
  if (!lead) return null;

  const emailMatches = emailPattern.test(email) && lead.email.trim().toLowerCase() === email;
  const phoneMatches = digits.length >= 7 && normalizePhoneIdentity(lead.phone) === digits;
  const reason: DuplicateMatchReason = emailMatches && phoneMatches
    ? 'EMAIL_PHONE_EXISTS'
    : emailMatches ? 'EMAIL_EXISTS' : phoneMatches ? 'PHONE_EXISTS' : 'NAME_EXISTS';
  return { lead, reason };
};

export const createLeadWithDuplicateLink = async (
  fields: LeadCreationFields,
  options: { match?: DuplicateMatch; saveOptions?: SaveOptions } = {}
): Promise<ILead> => {
  const match = options.match || await findDuplicateLead(fields);
  let original = match?.lead;
  const visited = new Set<string>();
  while (original?.duplicateOf && !visited.has(String(original._id))) {
    visited.add(String(original._id));
    const parent = await Lead.findById(original.duplicateOf);
    if (!parent) break;
    original = parent;
  }

  // Duplicate metadata is determined here, never accepted from an intake body.
  const {
    duplicateOf: _duplicateOf, duplicateSequence: _duplicateSequence,
    duplicateLabel: _duplicateLabel, duplicateMatchReason: _duplicateReason,
    ...input
  } = fields;
  const lead = new Lead({ ...input, name: fields.name.trim(), email: fields.email.trim().toLowerCase(), phone: fields.phone.trim() });

  if (original && match) {
    lead.set('assignedTo', undefined);
    lead.assignmentHistory = [];
    lead.status = 'New';
    lead.duplicateOf = new mongoose.Types.ObjectId(String(original._id));
    lead.duplicateMatchReason = match.reason;
  }

  const auditUser = fields.assignedBy;
  let duplicateNote: ILead['notes'][number] | undefined;
  if (original && auditUser && mongoose.isValidObjectId(String(auditUser))) {
    lead.notes.push({
      id: new mongoose.Types.ObjectId().toString(),
      content: 'Duplicate enquiry',
      createdBy: new mongoose.Types.ObjectId(String(auditUser)),
      createdAt: new Date()
    });
    duplicateNote = lead.notes[lead.notes.length - 1];
  }

  for (let attempt = 0; ; attempt += 1) {
    if (original) {
      const latest = await Lead.findOne({ duplicateOf: original._id }).sort({ duplicateSequence: -1 }).select('duplicateSequence');
      lead.duplicateSequence = (latest?.duplicateSequence || 0) + 1;
      lead.duplicateLabel = duplicateLabelForSequence(lead.duplicateSequence);
      if (duplicateNote) {
        duplicateNote.content = `${lead.duplicateLabel} of older lead ${String(original._id)} (${lead.duplicateMatchReason}).`;
      }
    }
    try {
      await lead.save(options.saveOptions);
      return lead;
    } catch (error: unknown) {
      const mongoError = error as { code?: number; keyPattern?: Record<string, unknown> };
      if (!original || mongoError.code !== 11000 || !mongoError.keyPattern?.duplicateOf || attempt >= 4) throw error;
    }
  }
};
