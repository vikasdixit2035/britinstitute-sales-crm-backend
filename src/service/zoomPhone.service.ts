import Lead from '../models/Lead';
import User from '../models/User';
import ZoomPhoneNumberAssignment from '../models/ZoomPhoneNumberAssignment';
import type { ILead } from '../types';
import { getTalkTimeRange, sumZoomTalkTime, type TalkTimeCall } from './zoomTalkTime';

const ZOOM_API_BASE_URL = 'https://api.zoom.us/v2';
const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token';
const MAX_ZOOM_PAGE_SIZE = 300;
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_ANALYTICS_MAX_PAGES = 5;

interface ZoomTokenCache {
  accessToken: string;
  expiresAt: number;
}

export interface ZoomPhoneQuery {
  from?: string;
  to?: string;
  type?: string;
  nextPageToken?: string;
  pageSize?: number;
  maxPages?: number;
  includeRecordings?: boolean;
}

export interface ZoomPhoneOwner {
  id?: string;
  name?: string;
  email?: string;
  extension_number?: string;
  phone_number?: string;
  type?: string;
}

export interface ZoomPhoneCrmUserMatch {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ZoomPhoneCrmLeadMatch {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface ZoomPhoneCallLog {
  id?: string;
  call_id?: string;
  source?: 'call_log' | 'metrics' | 'recording';
  call_type?: string;
  direction?: string;
  duration?: number;
  date_time?: string;
  answer_start_time?: string;
  call_end_time?: string;
  caller_number?: string;
  callee_number?: string;
  caller_did_number?: string;
  callee_did_number?: string;
  caller_phone_number?: string;
  callee_phone_number?: string;
  caller_email?: string;
  callee_email?: string;
  user_email?: string;
  caller_name?: string;
  callee_name?: string;
  result?: string;
  path?: string;
  recording_id?: string;
  recording_type?: string;
  owner?: ZoomPhoneOwner;
  user_id?: string;
  site?: {
    id?: string;
    name?: string;
  };
  matched_user?: ZoomPhoneCrmUserMatch;
  matched_lead?: ZoomPhoneCrmLeadMatch;
}

export interface ZoomPhoneRecording {
  id?: string;
  call_id?: string;
  call_log_id?: string;
  call_history_id?: string;
  call_element_id?: string;
  caller_number?: string;
  caller_number_type?: string;
  callee_number?: string;
  callee_number_type?: string;
  caller_email?: string;
  callee_email?: string;
  user_email?: string;
  caller_name?: string;
  callee_name?: string;
  direction?: string;
  duration?: number;
  date_time?: string;
  end_time?: string;
  download_url?: string;
  file_url?: string;
  transcript_download_url?: string;
  recording_type?: string;
  owner?: ZoomPhoneOwner;
  site?: {
    id?: string;
    name?: string;
  };
  disclaimer_status?: string;
  matched_user?: ZoomPhoneCrmUserMatch;
  matched_lead?: ZoomPhoneCrmLeadMatch;
}

interface ZoomCallLogsResponse {
  call_logs?: ZoomPhoneCallLog[];
  from?: string;
  to?: string;
  next_page_token?: string;
  page_count?: number;
  page_size?: number;
  total_records?: number;
}

interface ZoomRecordingsResponse {
  recordings?: ZoomPhoneRecording[];
  next_page_token?: string;
  page_count?: number;
  page_size?: number;
  total_records?: number;
}

export interface ZoomPhoneNumber {
  id?: string;
  number?: string;
  display_number?: string;
  source?: string;
  status?: string;
  capability?: string[];
  assignee?: {
    id?: string;
    name?: string;
    extension_number?: string;
    extension_type?: string;
    type?: string;
  };
  location?: string;
  emergency_address?: {
    address_line1?: string;
    city?: string;
    state_code?: string;
    country?: string;
    zip?: string;
  };
  site?: {
    id?: string;
    name?: string;
  };
}

export interface ZoomPhoneUser {
  id?: string;
  phone_user_id?: string;
  email?: string;
  name?: string;
  extension_id?: string;
  extension_number?: string;
  status?: string;
  activation_status?: string;
  calling_plans?: Array<{
    type?: string;
    name?: string;
    billing_account_id?: string;
  }>;
  phone_numbers?: ZoomPhoneNumber[];
}

interface ZoomPhoneNumbersResponse {
  phone_numbers?: ZoomPhoneNumber[];
  next_page_token?: string;
  page_size?: number;
  total_records?: number;
}

interface ZoomPhoneUsersResponse {
  users?: ZoomPhoneUser[];
  next_page_token?: string;
  page_size?: number;
  total_records?: number;
}

export interface ZoomPhoneInventoryResponse {
  phone_numbers: ZoomPhoneNumber[];
  users: ZoomPhoneUser[];
  summary: {
    total_numbers: number;
    assigned_numbers: number;
    unassigned_numbers: number;
    available_numbers: number;
    busy_numbers: number;
    inactive_numbers: number;
    total_users: number;
    active_users: number;
    inactive_users: number;
  };
  number_status_breakdown: ZoomPhoneAnalyticsBreakdown[];
  user_status_breakdown: ZoomPhoneAnalyticsBreakdown[];
  capability_breakdown: ZoomPhoneAnalyticsBreakdown[];
  pages_scanned: {
    numbers: number;
    users: number;
  };
}

export interface ZoomPhoneMetricParty {
  phone_number?: string;
  extension_number?: string;
  email?: string;
  device_type?: string;
  site_id?: string;
  site_name?: string;
  name?: string;
}

export interface ZoomPhoneMetricCall {
  call_id?: string;
  direction?: string;
  duration?: number;
  date_time?: string;
  status?: string;
  result?: string;
  caller?: ZoomPhoneMetricParty;
  callee?: ZoomPhoneMetricParty;
  call_type?: string;
  owner?: ZoomPhoneOwner;
  matched_user?: ZoomPhoneCrmUserMatch;
  matched_lead?: ZoomPhoneCrmLeadMatch;
  connected_number?: string;
  zoom_account?: string;
  live_status?: 'on_call' | 'available' | 'recent';
}

interface ZoomPhoneMetricsResponse {
  call_logs?: ZoomPhoneMetricCall[];
  next_page_token?: string;
  page_count?: number;
  page_size?: number;
  total_records?: number;
}

export interface ZoomPhoneLiveUser extends ZoomPhoneUser {
  matched_user?: ZoomPhoneCrmUserMatch;
  connected_numbers: string[];
  live_status: 'on_call' | 'available';
  active_call_id?: string;
}

export interface ZoomPhoneLiveStatusResponse {
  active_calls: ZoomPhoneMetricCall[];
  recent_calls: ZoomPhoneMetricCall[];
  phone_users: ZoomPhoneLiveUser[];
  inventory: ZoomPhoneInventoryResponse;
  updated_at: string;
}

export interface ZoomPhoneAnalyticsCall extends ZoomPhoneCallLog {
  normalized_direction: string;
  normalized_status: string;
  started_at?: string;
  agent_name: string;
  display_phone?: string;
  recording_count: number;
  has_recording: boolean;
  recording_download_url?: string;
}

export interface ZoomPhoneAgentAnalytics {
  agent: string;
  extension_number?: string;
  phone_number?: string;
  total_calls: number;
  incoming_calls: number;
  outgoing_calls: number;
  connected_calls: number;
  missed_calls: number;
  recorded_calls: number;
  total_talk_time: number;
  average_call_duration: number;
  answer_rate: number;
}

export interface ZoomPhoneDailyAnalytics {
  date: string;
  total_calls: number;
  incoming_calls: number;
  outgoing_calls: number;
  connected_calls: number;
  missed_calls: number;
  recorded_calls: number;
  total_talk_time: number;
}

export interface ZoomPhoneAnalyticsBreakdown {
  label: string;
  count: number;
  percentage: number;
}

export interface ZoomPhoneAnalyticsResponse {
  from: string;
  to: string;
  page_size: number;
  pages_scanned: number;
  total_records_scanned: number;
  call_logs: ZoomPhoneAnalyticsCall[];
  recordings: ZoomPhoneRecording[];
  recordings_error?: string;
  summary: {
    total_calls: number;
    incoming_calls: number;
    outgoing_calls: number;
    missed_calls: number;
    connected_calls: number;
    voicemail_calls: number;
    recorded_calls: number;
    answer_rate: number;
    average_call_duration: number;
    total_talk_time: number;
  };
  agent_stats: ZoomPhoneAgentAnalytics[];
  daily_stats: ZoomPhoneDailyAnalytics[];
  status_breakdown: ZoomPhoneAnalyticsBreakdown[];
  direction_breakdown: ZoomPhoneAnalyticsBreakdown[];
}

export type ZoomPhoneNumberAssignmentSource = 'zoom_inventory' | 'crm_backfill' | 'manual';

export interface ZoomPhoneNumberAssignmentRecord {
  id: string;
  normalizedNumber: string;
  displayNumber?: string;
  zoomNumberId?: string;
  zoomPhoneUserId?: string;
  zoomPhoneUserEmail?: string;
  zoomPhoneUserName?: string;
  crmUser: string;
  crmUserEmail: string;
  crmUserName: string;
  assignedAt: string;
  releasedAt?: string;
  source: ZoomPhoneNumberAssignmentSource;
  createdAt?: string;
  updatedAt?: string;
}

export interface ZoomPhoneNumberAssignmentsResponse {
  assignments: ZoomPhoneNumberAssignmentRecord[];
}

export interface AssignZoomPhoneNumberInput {
  userId: string;
  phoneNumber: string;
  assignedAt?: string;
}

interface ZoomTokenResponse {
  access_token?: string;
  expires_in?: number;
}

let tokenCache: ZoomTokenCache | null = null;

const getMissingConfig = () =>
  ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'].filter((key) => !process.env[key]);

const ensureConfigured = () => {
  const missing = getMissingConfig();
  if (missing.length > 0) {
    const error = new Error(`Zoom Phone is not configured. Missing: ${missing.join(', ')}`);
    (error as Error & { statusCode?: number }).statusCode = 503;
    throw error;
  }
};

const getNumberValue = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
};

const toDateParam = (date: Date) => date.toISOString().slice(0, 10);

const isDateParam = (value: string | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

const toSafeString = (value: unknown) => (value == null ? '' : String(value));

const buildDateRange = (query: ZoomPhoneQuery) => {
  const today = new Date();
  const defaultDays = getNumberValue(
    process.env.ZOOM_PHONE_DEFAULT_FROM_DAYS,
    DEFAULT_LOOKBACK_DAYS,
    1,
    31
  );
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - defaultDays);

  const from = query.from && isDateParam(query.from) ? query.from : toDateParam(defaultFrom);
  const to = query.to && isDateParam(query.to) ? query.to : toDateParam(today);

  return { from, to };
};

const buildPageSize = (pageSize?: number) => {
  const configuredMax = getNumberValue(
    process.env.ZOOM_PHONE_MAX_PAGE_SIZE,
    MAX_ZOOM_PAGE_SIZE,
    1,
    MAX_ZOOM_PAGE_SIZE
  );
  const requested = pageSize && Number.isFinite(pageSize) ? Math.trunc(pageSize) : configuredMax;
  return Math.min(Math.max(requested, 1), configuredMax, MAX_ZOOM_PAGE_SIZE);
};

const getZoomRequestTimeoutMs = () =>
  getNumberValue(process.env.ZOOM_PHONE_REQUEST_TIMEOUT_MS, 30_000, 5_000, 120_000);

const buildAnalyticsMaxPages = (maxPages?: number) => {
  const configuredMax = getNumberValue(
    process.env.ZOOM_PHONE_ANALYTICS_MAX_PAGES,
    DEFAULT_ANALYTICS_MAX_PAGES,
    1,
    20
  );
  const requested = maxPages && Number.isFinite(maxPages) ? Math.trunc(maxPages) : configuredMax;
  return Math.min(Math.max(requested, 1), configuredMax, 20);
};

const buildLeadHistoryMaxPages = (maxPages?: number) => {
  const configuredMax = getNumberValue(
    process.env.ZOOM_PHONE_LEAD_MAX_PAGES,
    8,
    1,
    20
  );
  const requested = maxPages && Number.isFinite(maxPages) ? Math.trunc(maxPages) : configuredMax;
  return Math.min(Math.max(requested, 1), configuredMax, 20);
};

export const normalizePhoneNumber = (value?: unknown) => toSafeString(value).replace(/\D/g, '');

const comparableNumbers = (value?: unknown) => {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  if (normalized.length >= 10) {
    variants.add(normalized.slice(-10));
  }
  return Array.from(variants);
};

export const getLeadZoomNumbers = (lead: ILead) => {
  const numbers = [lead.phone, lead.whatsapp, lead.zoomPhoneNumber]
    .flatMap(comparableNumbers)
    .filter(Boolean);

  return Array.from(new Set(numbers));
};

const getCandidatePhoneValues = (item: ZoomPhoneCallLog | ZoomPhoneRecording) => {
  const record = item as Record<string, unknown>;
  const keys = [
    'caller_number',
    'callee_number',
    'caller_did_number',
    'callee_did_number',
    'caller_phone_number',
    'callee_phone_number'
  ];

  const directValues = keys
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string');

  const owner = record.owner;
  if (owner && typeof owner === 'object') {
    const ownerRecord = owner as Record<string, unknown>;
    ['phone_number', 'extension_number'].forEach((key) => {
      const value = ownerRecord[key];
      if (typeof value === 'string') directValues.push(value);
    });
  }

  return directValues;
};

const phoneMatchesLead = (item: ZoomPhoneCallLog | ZoomPhoneRecording, leadNumbers: string[]) => {
  if (leadNumbers.length === 0) return false;

  const itemNumbers = getCandidatePhoneValues(item).flatMap(comparableNumbers);
  return itemNumbers.some((itemNumber) =>
    leadNumbers.some((leadNumber) => itemNumber === leadNumber || itemNumber.endsWith(leadNumber) || leadNumber.endsWith(itemNumber))
  );
};

type CrmNumberMatch<TMatch> = {
  numbers: string[];
  match: TMatch;
};

type CrmEmailMatch<TMatch> = {
  email: string;
  match: TMatch;
};

type ZoomPhoneAssignmentUserMatch = {
  user: ZoomPhoneCrmUserMatch;
  assignedAt: Date;
  releasedAt?: Date;
};

interface CrmMatchContext {
  users: CrmEmailMatch<ZoomPhoneCrmUserMatch>[];
  numberAssignments: CrmNumberMatch<ZoomPhoneAssignmentUserMatch>[];
  leads: CrmNumberMatch<ZoomPhoneCrmLeadMatch>[];
  zoomUserAliases: Map<string, ZoomPhoneCrmUserMatch>;
}

const toTrimmedString = (value: unknown) => toSafeString(value).trim();

const toIdString = (value: unknown) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) return String(value);
  return '';
};

const toIsoString = (value: unknown) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const toDateValue = (value?: string | Date) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const buildUserMatch = (user: Record<string, unknown>): ZoomPhoneCrmUserMatch => {
  const match: ZoomPhoneCrmUserMatch = {
    id: toIdString(user._id),
    name: toTrimmedString(user.name) || toTrimmedString(user.email) || 'CRM user'
  };
  const email = toTrimmedString(user.email);
  const phone = toTrimmedString(user.phone);
  const createdAt = toIsoString(user.createdAt);
  const updatedAt = toIsoString(user.updatedAt);
  match.isActive = user.isActive !== false;
  if (email) match.email = email;
  if (phone) match.phone = phone;
  if (createdAt) match.createdAt = createdAt;
  if (updatedAt) match.updatedAt = updatedAt;
  return match;
};

const buildLeadMatch = (lead: Record<string, unknown>): ZoomPhoneCrmLeadMatch => {
  const match: ZoomPhoneCrmLeadMatch = {
    id: toIdString(lead._id),
    name: toTrimmedString(lead.name) || toTrimmedString(lead.email) || 'CRM lead'
  };
  const email = toTrimmedString(lead.email);
  const phone = toTrimmedString(lead.phone);
  if (email) match.email = email;
  if (phone) match.phone = phone;
  return match;
};

const buildNumberMatch = <TMatch>(
  values: Array<string | undefined>,
  match: TMatch
): CrmNumberMatch<TMatch> => ({
  match,
  numbers: Array.from(new Set(values.flatMap(comparableNumbers))).filter(Boolean)
});

const normalizeEmail = (value?: unknown) => toSafeString(value).trim().toLowerCase();

const buildEmailMatch = <TMatch>(
  email: string | undefined,
  match: TMatch
): CrmEmailMatch<TMatch> | undefined => {
  const normalizedEmail = normalizeEmail(email);
  return normalizedEmail ? { email: normalizedEmail, match } : undefined;
};

const normalizeAliasKey = (value?: unknown) => toSafeString(value).toLowerCase().replace(/[^a-z0-9@.+]/g, '');

const addZoomAlias = (
  aliases: Map<string, ZoomPhoneCrmUserMatch>,
  value: string | undefined,
  match: ZoomPhoneCrmUserMatch | undefined
) => {
  if (!value || !match) return;
  const key = normalizeAliasKey(value);
  if (key) aliases.set(key, match);
};

const findZoomAliasMatch = (values: Array<string | undefined>, context: CrmMatchContext) => {
  for (const value of values) {
    const key = normalizeAliasKey(value);
    if (key && context.zoomUserAliases.has(key)) {
      return context.zoomUserAliases.get(key);
    }
  }
  return undefined;
};

const findEmailMatch = <TMatch>(
  values: Array<string | undefined>,
  matches: CrmEmailMatch<TMatch>[]
): TMatch | undefined => {
  const normalizedValues = Array.from(new Set(values.map(normalizeEmail).filter(Boolean)));
  if (normalizedValues.length === 0) return undefined;

  return matches.find((candidate) => normalizedValues.includes(candidate.email))?.match;
};

const getAssignmentStartDate = (match: ZoomPhoneCrmUserMatch, now: Date) => {
  const createdAt = toDateValue(match.createdAt);
  return createdAt && createdAt.getTime() <= now.getTime() ? createdAt : now;
};

const assignmentUserPayload = (match: ZoomPhoneCrmUserMatch) => ({
  crmUser: match.id,
  crmUserEmail: normalizeEmail(match.email),
  crmUserName: match.name
});

const isDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: number }).code === 11000;

type ZoomPhoneNumberAssignmentLike = {
  _id?: unknown;
  normalizedNumber?: string;
  displayNumber?: string;
  zoomNumberId?: string;
  zoomPhoneUserId?: string;
  zoomPhoneUserEmail?: string;
  zoomPhoneUserName?: string;
  crmUser?: unknown;
  crmUserEmail?: string;
  crmUserName?: string;
  assignedAt?: Date;
  releasedAt?: Date;
  source?: ZoomPhoneNumberAssignmentSource;
  createdAt?: Date;
  updatedAt?: Date;
};

const serializeZoomPhoneNumberAssignment = (
  assignment: ZoomPhoneNumberAssignmentLike
): ZoomPhoneNumberAssignmentRecord => {
  const record: ZoomPhoneNumberAssignmentRecord = {
    id: toIdString(assignment._id),
    normalizedNumber: assignment.normalizedNumber || '',
    crmUser: toIdString(assignment.crmUser),
    crmUserEmail: assignment.crmUserEmail || '',
    crmUserName: assignment.crmUserName || '',
    assignedAt: toIsoString(assignment.assignedAt),
    source: assignment.source || 'zoom_inventory'
  };

  const displayNumber = toTrimmedString(assignment.displayNumber);
  const zoomNumberId = toTrimmedString(assignment.zoomNumberId);
  const zoomPhoneUserId = toTrimmedString(assignment.zoomPhoneUserId);
  const zoomPhoneUserEmail = normalizeEmail(assignment.zoomPhoneUserEmail);
  const zoomPhoneUserName = toTrimmedString(assignment.zoomPhoneUserName);
  const releasedAt = toIsoString(assignment.releasedAt);
  const createdAt = toIsoString(assignment.createdAt);
  const updatedAt = toIsoString(assignment.updatedAt);

  if (displayNumber) record.displayNumber = displayNumber;
  if (zoomNumberId) record.zoomNumberId = zoomNumberId;
  if (zoomPhoneUserId) record.zoomPhoneUserId = zoomPhoneUserId;
  if (zoomPhoneUserEmail) record.zoomPhoneUserEmail = zoomPhoneUserEmail;
  if (zoomPhoneUserName) record.zoomPhoneUserName = zoomPhoneUserName;
  if (releasedAt) record.releasedAt = releasedAt;
  if (createdAt) record.createdAt = createdAt;
  if (updatedAt) record.updatedAt = updatedAt;

  return record;
};

const buildAssignmentDisplayNumber = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith('+') ? trimmed : `+${normalizePhoneNumber(trimmed)}`;
};

const assertValidAssignmentDate = (value?: string) => {
  const assignedAt = toDateValue(value) || new Date();
  if (assignedAt.getTime() > Date.now() + 60_000) {
    const error = new Error('Assignment date cannot be in the future');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  return assignedAt;
};

const getInventoryNumberDetails = (phoneUser: ZoomPhoneUser, inventory: ZoomPhoneInventoryResponse) => {
  const directNumbers = (phoneUser.phone_numbers || []).map((phoneNumber) => ({
    displayNumber: phoneNumber.display_number || phoneNumber.number || '',
    zoomNumberId: phoneNumber.id
  }));
  const assignedNumbers = inventory.phone_numbers
    .filter((phoneNumber) => {
      const assignee = phoneNumber.assignee;
      if (!assignee) return false;
      return (
        assignee.id === phoneUser.id ||
        assignee.id === phoneUser.phone_user_id ||
        assignee.extension_number === phoneUser.extension_number ||
        assignee.name === phoneUser.name
      );
    })
    .map((phoneNumber) => ({
      displayNumber: phoneNumber.display_number || phoneNumber.number || '',
      zoomNumberId: phoneNumber.id
    }));

  const byNumber = new Map<string, { displayNumber: string; zoomNumberId?: string }>();
  [...directNumbers, ...assignedNumbers].forEach((item) => {
    const normalizedNumber = normalizePhoneNumber(item.displayNumber);
    if (!normalizedNumber || byNumber.has(normalizedNumber)) return;
    const detail: { displayNumber: string; zoomNumberId?: string } = {
      displayNumber: item.displayNumber
    };
    if (item.zoomNumberId) detail.zoomNumberId = item.zoomNumberId;
    byNumber.set(normalizedNumber, detail);
  });

  return Array.from(byNumber.entries()).map(([normalizedNumber, detail]) => ({
    normalizedNumber,
    ...detail
  }));
};

const syncZoomPhoneNumberAssignments = async (
  inventory: ZoomPhoneInventoryResponse | undefined,
  userEmailMatches: CrmEmailMatch<ZoomPhoneCrmUserMatch>[],
  userNumberMatches: CrmNumberMatch<ZoomPhoneCrmUserMatch>[]
) => {
  if (!inventory) return;

  const now = new Date();
  const currentAssignments = new Map<
    string,
    {
      detail: { normalizedNumber: string; displayNumber: string; zoomNumberId?: string };
      phoneUser: ZoomPhoneUser;
      match: ZoomPhoneCrmUserMatch;
    }
  >();

  inventory.users.forEach((phoneUser) => {
    const matchedUser = findEmailMatch([phoneUser.email], userEmailMatches);
    if (!matchedUser) return;

    getInventoryNumberDetails(phoneUser, inventory).forEach((detail) => {
      currentAssignments.set(detail.normalizedNumber, {
        detail,
        phoneUser,
        match: matchedUser
      });
    });
  });

  for (const { detail, phoneUser, match } of currentAssignments.values()) {
    const activeAssignment = await ZoomPhoneNumberAssignment.findOne({
      normalizedNumber: detail.normalizedNumber,
      releasedAt: { $exists: false }
    }).lean();
    const activeUserId = activeAssignment?.crmUser ? String(activeAssignment.crmUser) : '';
    const assignmentStart =
      activeAssignment && activeUserId !== match.id ? now : getAssignmentStartDate(match, now);

    if (activeAssignment && activeUserId && activeUserId !== match.id) {
      await ZoomPhoneNumberAssignment.updateOne(
        { _id: activeAssignment._id },
        { $set: { releasedAt: assignmentStart } }
      );
    }

    const payload = assignmentUserPayload(match);
    const activeAssignmentFilter = {
      normalizedNumber: detail.normalizedNumber,
      releasedAt: { $exists: false }
    };
    const activeAssignmentUpdate = {
      $setOnInsert: {
        normalizedNumber: detail.normalizedNumber,
        assignedAt: assignmentStart,
        source: 'zoom_inventory'
      },
      $set: {
        displayNumber: detail.displayNumber,
        zoomNumberId: detail.zoomNumberId,
        zoomPhoneUserId: phoneUser.id || phoneUser.phone_user_id,
        zoomPhoneUserEmail: normalizeEmail(phoneUser.email),
        zoomPhoneUserName: phoneUser.name,
        ...payload
      }
    };

    try {
      await ZoomPhoneNumberAssignment.findOneAndUpdate(
        activeAssignmentFilter,
        activeAssignmentUpdate,
        { upsert: true, new: true }
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      await ZoomPhoneNumberAssignment.updateOne(activeAssignmentFilter, { $set: activeAssignmentUpdate.$set });
    }

    await ZoomPhoneNumberAssignment.updateMany(
      {
        normalizedNumber: detail.normalizedNumber,
        crmUser: { $ne: match.id },
        releasedAt: { $exists: false }
      },
      { $set: { releasedAt: assignmentStart } }
    );

    const previousUsers = userNumberMatches
      .filter((candidate) =>
        candidate.match.id !== match.id &&
        candidate.match.isActive === false &&
        candidate.numbers.some((candidateNumber) => phoneVariantsMatch(candidateNumber, detail.normalizedNumber))
      )
      .map((candidate) => candidate.match);

    for (const previousUser of previousUsers) {
      const previousAssignedAt = getAssignmentStartDate(previousUser, assignmentStart);
      if (previousAssignedAt.getTime() >= assignmentStart.getTime()) continue;

      const previousPayload = assignmentUserPayload(previousUser);
      await ZoomPhoneNumberAssignment.updateOne(
        {
          normalizedNumber: detail.normalizedNumber,
          crmUser: previousUser.id,
          releasedAt: assignmentStart
        },
        {
          $setOnInsert: {
            normalizedNumber: detail.normalizedNumber,
            displayNumber: detail.displayNumber,
            zoomNumberId: detail.zoomNumberId,
            assignedAt: previousAssignedAt,
            releasedAt: assignmentStart,
            source: 'crm_backfill',
            ...previousPayload
          }
        },
        { upsert: true }
      );
    }
  }
};

const buildCrmMatchContext = async (inventory?: ZoomPhoneInventoryResponse): Promise<CrmMatchContext> => {
  const [users, leads] = await Promise.all([
    User.find({}).select('_id name email phone isActive createdAt updatedAt').lean(),
    Lead.find({}).select('_id name email phone whatsapp zoomPhoneNumber').lean()
  ]);

  const crmUsers = users.map((user) => buildUserMatch(user as Record<string, unknown>));
  const userMatches = crmUsers
    .map((match) => buildEmailMatch(match.email, match))
    .filter((item): item is CrmEmailMatch<ZoomPhoneCrmUserMatch> => Boolean(item));
  const userNumberMatches = crmUsers
    .map((match) => buildNumberMatch([match.phone], match))
    .filter((item) => item.numbers.length > 0);

  const leadMatches = leads
    .map((lead) => {
      const record = lead as Record<string, unknown>;
      const match = buildLeadMatch(record);
      return buildNumberMatch(
        [
          toTrimmedString(record.phone),
          toTrimmedString(record.whatsapp),
          toTrimmedString(record.zoomPhoneNumber)
        ],
        match
      );
    })
    .filter((item) => item.numbers.length > 0);

  await syncZoomPhoneNumberAssignments(inventory, userMatches, userNumberMatches);

  const crmUsersById = new Map(crmUsers.map((match) => [match.id, match]));
  const assignments = await ZoomPhoneNumberAssignment.find({}).lean();
  const orphanedAssignmentIds = assignments
    .filter((assignment) => !crmUsersById.has(String(assignment.crmUser)))
    .map((assignment) => assignment._id);

  if (orphanedAssignmentIds.length > 0) {
    await ZoomPhoneNumberAssignment.deleteMany({ _id: { $in: orphanedAssignmentIds } });
  }

  const numberAssignments = assignments
    .filter((assignment) => crmUsersById.has(String(assignment.crmUser)))
    .map((assignment) => {
      const crmUserId = String(assignment.crmUser);
      const assignmentUser = crmUsersById.get(crmUserId);
      if (!assignmentUser) return undefined;
      const assignmentMatch: ZoomPhoneAssignmentUserMatch = {
        user: assignmentUser,
        assignedAt: assignment.assignedAt
      };
      if (assignment.releasedAt) assignmentMatch.releasedAt = assignment.releasedAt;
      return buildNumberMatch([assignment.normalizedNumber, assignment.displayNumber], assignmentMatch);
    })
    .filter((item): item is CrmNumberMatch<ZoomPhoneAssignmentUserMatch> => Boolean(item))
    .filter((item) => item.numbers.length > 0);

  const zoomUserAliases = new Map<string, ZoomPhoneCrmUserMatch>();

  if (inventory) {
    inventory.users.forEach((phoneUser) => {
      const matchedUser = findEmailMatch([phoneUser.email], userMatches);

      addZoomAlias(zoomUserAliases, phoneUser.id, matchedUser);
      addZoomAlias(zoomUserAliases, phoneUser.phone_user_id, matchedUser);
      addZoomAlias(zoomUserAliases, phoneUser.email, matchedUser);
    });
  }

  return {
    users: userMatches,
    numberAssignments,
    leads: leadMatches,
    zoomUserAliases
  };
};

const phoneVariantsMatch = (first: string, second: string) => {
  if (!first || !second) return false;
  if (first === second) return true;
  return first.length >= 7 && second.length >= 7 && (first.endsWith(second) || second.endsWith(first));
};

const findPhoneMatch = <TMatch>(
  values: Array<string | undefined>,
  matches: CrmNumberMatch<TMatch>[]
): TMatch | undefined => {
  const variants = Array.from(new Set(values.flatMap(comparableNumbers))).filter(Boolean);
  if (variants.length === 0) return undefined;

  return matches.find((candidate) =>
    variants.some((variant) => candidate.numbers.some((storedNumber) => phoneVariantsMatch(variant, storedNumber)))
  )?.match;
};

const getZoomRecordDate = (item: ZoomPhoneCallLog | ZoomPhoneRecording | ZoomPhoneMetricCall) =>
  item.date_time ||
  (item as ZoomPhoneCallLog).answer_start_time ||
  (item as ZoomPhoneCallLog).call_end_time ||
  (item as ZoomPhoneRecording).end_time ||
  '';

const getZoomRecordTimestamp = (item: ZoomPhoneCallLog | ZoomPhoneRecording | ZoomPhoneMetricCall) => {
  const recordDate = getZoomRecordDate(item);
  if (!recordDate) return undefined;
  const timestamp = new Date(recordDate).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

const findAssignedUserByNumberAtTime = (
  values: Array<string | undefined>,
  item: ZoomPhoneCallLog | ZoomPhoneRecording | ZoomPhoneMetricCall,
  context: CrmMatchContext
): ZoomPhoneCrmUserMatch | undefined => {
  const recordTimestamp = getZoomRecordTimestamp(item);
  const variants = Array.from(new Set(values.flatMap(comparableNumbers))).filter(Boolean);
  if (!recordTimestamp || variants.length === 0) return undefined;

  const matchedAssignments = context.numberAssignments
    .filter((assignment) => {
      const assignedAt = assignment.match.assignedAt.getTime();
      const releasedAt = assignment.match.releasedAt?.getTime();
      return (
        assignedAt <= recordTimestamp &&
        (!releasedAt || recordTimestamp < releasedAt) &&
        variants.some((variant) => assignment.numbers.some((storedNumber) => phoneVariantsMatch(variant, storedNumber)))
      );
    })
    .sort((first, second) => second.match.assignedAt.getTime() - first.match.assignedAt.getTime());

  return matchedAssignments[0]?.match.user;
};

const isEmailValue = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const collectEmailValues = (value: unknown, depth = 0): string[] => {
  if (!value || depth > 2) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return isEmailValue(trimmed) ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectEmailValues(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) => {
      if (key.toLowerCase().includes('email') && typeof nestedValue === 'string') {
        const trimmed = nestedValue.trim();
        return isEmailValue(trimmed) ? [trimmed] : [];
      }
      return collectEmailValues(nestedValue, depth + 1);
    });
  }

  return [];
};

const getAgentIdentityEmailValues = (item: ZoomPhoneCallLog | ZoomPhoneRecording) => {
  const direction = normalizeDirection(item);
  const owner = item.owner;
  const record = item as Record<string, unknown>;
  const allEmails = collectEmailValues(item);
  const emails = {
    caller: toTrimmedString(record.caller_email),
    callee: toTrimmedString(record.callee_email),
    user: toTrimmedString(record.user_email),
    owner: owner?.email
  };

  if (direction === 'Outgoing') {
    return [emails.caller, emails.owner, emails.user, ...allEmails];
  }

  if (direction === 'Incoming') {
    return [emails.callee, emails.owner, emails.user, ...allEmails];
  }

  return [emails.owner, emails.user, emails.caller, emails.callee, ...allEmails];
};

const getAgentIdentityZoomAliasValues = (item: ZoomPhoneCallLog | ZoomPhoneRecording) => {
  const owner = item.owner;
  const call = item as ZoomPhoneCallLog;
  return [call.user_id, owner?.id, owner?.email, call.user_email];
};

const getAgentIdentityNumberValues = (item: ZoomPhoneCallLog | ZoomPhoneRecording) => {
  const direction = normalizeDirection(item);
  const owner = item.owner;
  const call = item as ZoomPhoneCallLog;
  const ownerNumbers = [owner?.extension_number, owner?.phone_number];

  if (direction === 'Outgoing') {
    return [...ownerNumbers, item.caller_number, call.caller_phone_number, call.caller_did_number];
  }

  if (direction === 'Incoming') {
    return [...ownerNumbers, item.callee_number, call.callee_phone_number, call.callee_did_number];
  }

  return [
    ...ownerNumbers,
    item.caller_number,
    item.callee_number,
    call.caller_phone_number,
    call.callee_phone_number,
    call.caller_did_number,
    call.callee_did_number
  ];
};

const enrichZoomPhoneItem = <TItem extends ZoomPhoneCallLog | ZoomPhoneRecording>(
  item: TItem,
  context: CrmMatchContext
): TItem => {
  const enriched = { ...item } as TItem;
  const phoneValues = getCandidatePhoneValues(item);
  const zoomAliasValues = getAgentIdentityZoomAliasValues(item);
  const agentNumberValues = getAgentIdentityNumberValues(item);
  const matchedUser =
    findEmailMatch(getAgentIdentityEmailValues(item), context.users) ||
    findZoomAliasMatch(zoomAliasValues, context) ||
    findAssignedUserByNumberAtTime(agentNumberValues, item, context);
  const matchedLead = findPhoneMatch(phoneValues, context.leads);

  if (matchedUser) enriched.matched_user = matchedUser;
  if (matchedLead) enriched.matched_lead = matchedLead;

  return enriched;
};

const buildZoomQuery = (query: ZoomPhoneQuery) => {
  const dateRange = buildDateRange(query);
  const zoomQuery: Record<string, string> = {
    from: dateRange.from,
    to: dateRange.to,
    page_size: String(buildPageSize(query.pageSize))
  };

  if (query.type) zoomQuery.type = query.type;
  if (query.nextPageToken) zoomQuery.next_page_token = query.nextPageToken;

  return zoomQuery;
};

const buildZoomPageQuery = (query: ZoomPhoneQuery) => {
  const zoomQuery: Record<string, string> = {
    page_size: String(buildPageSize(query.pageSize))
  };

  if (query.nextPageToken) zoomQuery.next_page_token = query.nextPageToken;

  return zoomQuery;
};

const titleCase = (value?: unknown) => {
  const normalized = toSafeString(value).replace(/[_-]+/g, ' ').trim();
  if (!normalized) return 'Unknown';
  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const getCallStartedAt = (call: ZoomPhoneCallLog) =>
  call.date_time || call.answer_start_time || call.call_end_time || undefined;

const getCallDuration = (call: ZoomPhoneCallLog | ZoomPhoneRecording) => {
  const duration = Number(call.duration || 0);
  return Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : 0;
};

const normalizeDirection = (call: ZoomPhoneCallLog | ZoomPhoneRecording) => {
  const directionText = [call.direction, (call as ZoomPhoneCallLog).call_type, (call as ZoomPhoneCallLog).path]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (directionText.includes('incoming') || directionText.includes('inbound')) return 'Incoming';
  if (directionText.includes('outgoing') || directionText.includes('outbound')) return 'Outgoing';
  return 'Unknown';
};

const normalizeStatus = (call: ZoomPhoneCallLog) => {
  const statusText = [call.result, call.call_type, call.path].filter(Boolean).join(' ').toLowerCase();
  const duration = getCallDuration(call);

  if (statusText.includes('missed') || statusText.includes('no answer') || statusText.includes('unanswered')) {
    return 'Missed';
  }

  if (statusText.includes('voicemail') || statusText.includes('voice mail')) return 'Voicemail';
  if (statusText.includes('busy')) return 'Busy';
  if (statusText.includes('failed') || statusText.includes('error')) return 'Failed';
  if (statusText.includes('blocked')) return 'Blocked';
  if (
    duration > 0 ||
    statusText.includes('answered') ||
    statusText.includes('connected') ||
    statusText.includes('completed')
  ) {
    return 'Connected';
  }

  return titleCase(call.result || call.call_type || 'Unknown');
};

const getCallAgentName = (call: ZoomPhoneCallLog) =>
  call.owner?.name ||
  call.caller_name ||
  call.callee_name ||
  call.owner?.extension_number ||
  call.owner?.phone_number ||
  call.user_id ||
  'Unassigned';

const getDisplayPhone = (call: ZoomPhoneCallLog) =>
  call.caller_number ||
  call.callee_number ||
  call.caller_phone_number ||
  call.callee_phone_number ||
  call.caller_did_number ||
  call.callee_did_number ||
  call.owner?.phone_number ||
  '';

const getIdentityValues = (item: ZoomPhoneCallLog | ZoomPhoneRecording) => {
  const record = item as Record<string, unknown>;
  return ['id', 'call_id', 'call_log_id', 'call_element_id', 'recording_id']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
};

const buildRecordingIndex = (recordings: ZoomPhoneRecording[]) => {
  const index = new Map<string, ZoomPhoneRecording[]>();

  recordings.forEach((recording) => {
    getIdentityValues(recording).forEach((key) => {
      const existing = index.get(key) || [];
      existing.push(recording);
      index.set(key, existing);
    });
  });

  return index;
};

const getRecordingsForCall = (call: ZoomPhoneCallLog, index: Map<string, ZoomPhoneRecording[]>) => {
  const matches = new Map<string, ZoomPhoneRecording>();

  getIdentityValues(call).forEach((key) => {
    (index.get(key) || []).forEach((recording) => {
      const recordingKey = getRecordingIdentity(recording);
      if (recordingKey) matches.set(recordingKey, recording);
    });
  });

  return Array.from(matches.values());
};

const getRecordingIdentity = (recording: ZoomPhoneRecording) =>
  recording.id || recording.call_id || recording.call_log_id || recording.call_element_id || '';

const buildCallLogFromRecording = (recording: ZoomPhoneRecording): ZoomPhoneCallLog => {
  const callLog = {
    id: recording.call_log_id || recording.call_history_id || recording.call_id || recording.id,
    call_id: recording.call_id,
    source: 'recording' as const,
    direction: recording.direction,
    duration: recording.duration,
    date_time: recording.date_time,
    call_end_time: recording.end_time,
    caller_number: recording.caller_number,
    callee_number: recording.callee_number,
    caller_email: recording.caller_email,
    callee_email: recording.callee_email,
    user_email: recording.user_email,
    caller_name: recording.caller_name,
    callee_name: recording.callee_name,
    result: 'Recorded',
    recording_id: recording.id,
    recording_type: recording.recording_type,
    owner: recording.owner,
    site: recording.site,
    matched_user: recording.matched_user,
    matched_lead: recording.matched_lead
  };

  return Object.fromEntries(
    Object.entries(callLog).filter(([, value]) => value !== undefined && value !== '')
  ) as ZoomPhoneCallLog;
};

const getMetricAgentParty = (call: ZoomPhoneMetricCall) => {
  const direction = (call.direction || call.call_type || '').toLowerCase();
  if (direction.includes('out')) return call.caller;
  if (direction.includes('in')) return call.callee;
  return call.caller || call.callee;
};

const buildCallLogFromMetric = (call: ZoomPhoneMetricCall): ZoomPhoneCallLog => {
  const agentParty = getMetricAgentParty(call);
  const callLog = {
    id: call.call_id,
    call_id: call.call_id,
    source: 'metrics' as const,
    call_type: call.call_type,
    direction: call.direction,
    duration: call.duration,
    date_time: call.date_time,
    caller_number: call.caller?.phone_number || call.caller?.extension_number,
    callee_number: call.callee?.phone_number || call.callee?.extension_number,
    caller_email: call.caller?.email,
    callee_email: call.callee?.email,
    user_email: agentParty?.email || call.owner?.email,
    caller_name: call.caller?.name,
    callee_name: call.callee?.name,
    result: call.result || call.status,
    owner: call.owner || {
      name: agentParty?.name,
      email: agentParty?.email,
      extension_number: agentParty?.extension_number ? String(agentParty.extension_number) : undefined,
      phone_number: agentParty?.phone_number
    },
    matched_user: call.matched_user,
    matched_lead: call.matched_lead,
    site: call.owner
      ? undefined
      : agentParty?.site_id || agentParty?.site_name
        ? {
            id: agentParty.site_id,
            name: agentParty.site_name
          }
        : undefined
  };

  return Object.fromEntries(
    Object.entries(callLog).filter(([, value]) => value !== undefined && value !== '')
  ) as ZoomPhoneCallLog;
};

const normalizeZoomCallLog = (rawCall: Record<string, unknown>): ZoomPhoneCallLog => {
  const directionRaw = toSafeString(rawCall.direction || rawCall.call_type);
  const direction = directionRaw
    ? directionRaw.charAt(0).toUpperCase() + directionRaw.slice(1).toLowerCase()
    : 'Unknown';
  const isOutbound = direction.toLowerCase().includes('out');
  const callerNumber = toTrimmedString(rawCall.caller_number || rawCall.caller_did_number || rawCall.caller_phone_number || rawCall.caller_ext_number);
  const calleeNumber = toTrimmedString(rawCall.callee_number || rawCall.callee_did_number || rawCall.callee_phone_number || rawCall.callee_ext_number);
  const callerEmail = toTrimmedString(rawCall.caller_email);
  const calleeEmail = toTrimmedString(rawCall.callee_email);
  const userEmail = toTrimmedString(rawCall.user_email) || (isOutbound ? callerEmail : calleeEmail);
  const callerName = toTrimmedString(rawCall.caller_name);
  const calleeName = toTrimmedString(rawCall.callee_name);
  const ownerRecord = (rawCall.owner && typeof rawCall.owner === 'object' ? rawCall.owner : {}) as Record<string, unknown>;

  const log: ZoomPhoneCallLog = {
    id: toTrimmedString(rawCall.call_id || rawCall.call_history_uuid || rawCall.id),
    call_id: toTrimmedString(rawCall.call_id),
    source: (rawCall.source as 'call_log' | 'metrics' | 'recording') || 'call_log',
    call_type: toTrimmedString(rawCall.call_type),
    direction,
    duration: getCallDuration(rawCall as ZoomPhoneCallLog),
    date_time: toTrimmedString(rawCall.date_time || rawCall.start_time),
    answer_start_time: toTrimmedString(rawCall.answer_start_time || rawCall.answer_time),
    call_end_time: toTrimmedString(rawCall.call_end_time || rawCall.end_time),
    caller_number: callerNumber,
    callee_number: calleeNumber,
    caller_did_number: toTrimmedString(rawCall.caller_did_number),
    callee_did_number: toTrimmedString(rawCall.callee_did_number),
    caller_phone_number: toTrimmedString(rawCall.caller_phone_number || rawCall.caller_did_number),
    callee_phone_number: toTrimmedString(rawCall.callee_phone_number || rawCall.callee_did_number),
    caller_name: callerName,
    callee_name: calleeName,
    caller_email: callerEmail,
    callee_email: calleeEmail,
    user_email: userEmail,
    result: toTrimmedString(rawCall.result || rawCall.call_result),
    recording_id: toTrimmedString(rawCall.recording_id),
    recording_type: toTrimmedString(rawCall.recording_type || rawCall.recording_status),
    user_id: toTrimmedString(rawCall.user_id || (isOutbound ? rawCall.caller_user_id : rawCall.callee_user_id)),
    owner: {
      id: toTrimmedString(ownerRecord.id || (isOutbound ? rawCall.caller_user_id : rawCall.callee_user_id)),
      name: toTrimmedString(ownerRecord.name || (isOutbound ? callerName : calleeName)),
      email: toTrimmedString(ownerRecord.email || (isOutbound ? callerEmail : calleeEmail)),
      extension_number: toTrimmedString(ownerRecord.extension_number || (isOutbound ? rawCall.caller_ext_number : rawCall.callee_ext_number)),
      phone_number: toTrimmedString(ownerRecord.phone_number || (isOutbound ? callerNumber : calleeNumber))
    }
  };

  return Object.fromEntries(
    Object.entries(log).filter(([, value]) => value !== undefined && value !== '')
  ) as ZoomPhoneCallLog;
};

const percentage = (part: number, total: number) => (total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0);

const buildBreakdown = (items: string[], total: number): ZoomPhoneAnalyticsBreakdown[] => {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(item || 'Unknown', (counts.get(item || 'Unknown') || 0) + 1));

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percentage: percentage(count, total)
    }))
    .sort((a, b) => b.count - a.count);
};

const fetchZoomPages = async <TResponse extends { next_page_token?: string }, TItem>(
  endpoint: string,
  listKey: keyof TResponse,
  query: ZoomPhoneQuery,
  includeDateRange = true,
  maxPagesOverride?: number
) => {
  const maxPages = maxPagesOverride ?? buildAnalyticsMaxPages(query.maxPages);
  const items: TItem[] = [];
  let pagesScanned = 0;
  let nextPageToken = query.nextPageToken;
  let lastResponse: TResponse | null = null;

  do {
    const pageQuery: ZoomPhoneQuery = {
      ...query,
      pageSize: query.pageSize || MAX_ZOOM_PAGE_SIZE
    };

    if (nextPageToken) {
      pageQuery.nextPageToken = nextPageToken;
    }

    const response = await requestZoomJson<TResponse>(
      endpoint,
      includeDateRange ? buildZoomQuery(pageQuery) : buildZoomPageQuery(pageQuery)
    );

    const record = response as Record<string, unknown>;
    const pageItems = record[listKey as string] || record.call_logs || record.call_history || record.recordings || record.users;
    if (Array.isArray(pageItems)) {
      items.push(...(pageItems as TItem[]));
    }

    pagesScanned += 1;
    nextPageToken = response.next_page_token;
    lastResponse = response;
  } while (nextPageToken && pagesScanned < maxPages);

  return {
    items,
    pagesScanned,
    nextPageToken,
    lastResponse
  };
};

const normalizeInventoryStatus = (value?: unknown) => (toSafeString(value) || 'unknown').replace(/[_-]+/g, ' ').toLowerCase();

const hasAssignedNumber = (number: ZoomPhoneNumber) => Boolean(number.assignee?.id || number.assignee?.name);

const buildInventoryResponse = (
  phoneNumbers: ZoomPhoneNumber[],
  users: ZoomPhoneUser[],
  numberPagesScanned: number,
  userPagesScanned: number
): ZoomPhoneInventoryResponse => {
  const assignedNumbers = phoneNumbers.filter(hasAssignedNumber).length;
  const statusValues = phoneNumbers.map((number) => normalizeInventoryStatus(number.status));
  const userStatusValues = users.map((user) => normalizeInventoryStatus(user.activation_status || user.status));
  const capabilityValues = phoneNumbers.flatMap((number) => number.capability || []);
  const availableNumbers = phoneNumbers.filter((number) => normalizeInventoryStatus(number.status).includes('available')).length;
  const busyNumbers = phoneNumbers.filter((number) => normalizeInventoryStatus(number.status).includes('busy')).length;
  const inactiveNumbers = phoneNumbers.filter((number) => {
    const status = normalizeInventoryStatus(number.status);
    return status.includes('inactive') || status.includes('disabled') || status.includes('suspend');
  }).length;
  const activeUsers = users.filter((user) => {
    const status = normalizeInventoryStatus(user.activation_status || user.status);
    return status.includes('activated') || status.includes('activate') || status.includes('active');
  }).length;

  return {
    phone_numbers: phoneNumbers,
    users,
    summary: {
      total_numbers: phoneNumbers.length,
      assigned_numbers: assignedNumbers,
      unassigned_numbers: Math.max(phoneNumbers.length - assignedNumbers, 0),
      available_numbers: availableNumbers,
      busy_numbers: busyNumbers,
      inactive_numbers: inactiveNumbers,
      total_users: users.length,
      active_users: activeUsers,
      inactive_users: Math.max(users.length - activeUsers, 0)
    },
    number_status_breakdown: buildBreakdown(statusValues, phoneNumbers.length),
    user_status_breakdown: buildBreakdown(userStatusValues, users.length),
    capability_breakdown: buildBreakdown(capabilityValues, capabilityValues.length),
    pages_scanned: {
      numbers: numberPagesScanned,
      users: userPagesScanned
    }
  };
};

const fetchInventoryData = async (query: ZoomPhoneQuery) => {
  const [numberPages, userPages] = await Promise.all([
    fetchZoomPages<ZoomPhoneNumbersResponse, ZoomPhoneNumber>('/phone/numbers', 'phone_numbers', query, false),
    fetchZoomPages<ZoomPhoneUsersResponse, ZoomPhoneUser>('/phone/users', 'users', query, false)
  ]);

  return buildInventoryResponse(numberPages.items, userPages.items, numberPages.pagesScanned, userPages.pagesScanned);
};

const getMetricPartyNumberValues = (party?: ZoomPhoneMetricParty) =>
  [party?.phone_number, party?.extension_number].filter((value): value is string => Boolean(value));

const getMetricPhoneValues = (call: ZoomPhoneMetricCall) => [
  ...getMetricPartyNumberValues(call.caller),
  ...getMetricPartyNumberValues(call.callee),
  call.owner?.phone_number,
  call.owner?.extension_number
];

const getLikelyAgentEmailValues = (call: ZoomPhoneMetricCall) => {
  const allEmails = collectEmailValues(call);
  const direction = (call.direction || call.call_type || '').toLowerCase();
  if (direction.includes('out')) return [call.caller?.email, call.owner?.email, ...allEmails];
  if (direction.includes('in')) return [call.callee?.email, call.owner?.email, ...allEmails];
  return [call.owner?.email, call.caller?.email, call.callee?.email, ...allEmails];
};

const getLikelyAgentZoomAliasValues = (call: ZoomPhoneMetricCall) => {
  const agentParty = getMetricAgentParty(call);
  return [call.owner?.id, call.owner?.email, agentParty?.email];
};

const getLikelyAgentNumberValues = (call: ZoomPhoneMetricCall) => {
  const direction = (call.direction || call.call_type || '').toLowerCase();
  const ownerNumbers = [call.owner?.phone_number, call.owner?.extension_number];
  if (direction.includes('out')) return [...ownerNumbers, ...getMetricPartyNumberValues(call.caller)];
  if (direction.includes('in')) return [...ownerNumbers, ...getMetricPartyNumberValues(call.callee)];
  return [...ownerNumbers, ...getMetricPartyNumberValues(call.caller), ...getMetricPartyNumberValues(call.callee)];
};

const getLikelyConnectedNumber = (call: ZoomPhoneMetricCall) => {
  const direction = (call.direction || call.call_type || '').toLowerCase();
  if (direction.includes('out')) return call.callee?.phone_number || call.callee?.extension_number || '';
  if (direction.includes('in')) return call.caller?.phone_number || call.caller?.extension_number || '';
  return call.callee?.phone_number || call.caller?.phone_number || '';
};

const getLikelyZoomAccountNumber = (call: ZoomPhoneMetricCall) => {
  const direction = (call.direction || call.call_type || '').toLowerCase();
  if (direction.includes('out')) return call.caller?.phone_number || call.caller?.extension_number || '';
  if (direction.includes('in')) return call.callee?.phone_number || call.callee?.extension_number || '';
  return call.caller?.phone_number || call.callee?.phone_number || call.owner?.phone_number || '';
};

const isLiveMetricCall = (call: ZoomPhoneMetricCall) => {
  const statusText = [call.status, call.result, call.call_type, call.direction]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const duration = Number(call.duration);
  const startedAt = new Date(call.date_time || 0).getTime();
  const isVeryRecent = Number.isFinite(startedAt) && Date.now() - startedAt <= 15 * 60 * 1000;
  const isCompleted =
    statusText.includes('miss') ||
    statusText.includes('voicemail') ||
    statusText.includes('no answer') ||
    statusText.includes('complete') ||
    statusText.includes('answered') ||
    statusText.includes('connect');

  return (
    statusText.includes('ring') ||
    statusText.includes('active') ||
    statusText.includes('progress') ||
    statusText.includes('ongoing') ||
    statusText.includes('hold') ||
    statusText.includes('park') ||
    ((!Number.isFinite(duration) || duration <= 0) && isVeryRecent && !isCompleted)
  );
};

const enrichMetricCall = (call: ZoomPhoneMetricCall, context: CrmMatchContext): ZoomPhoneMetricCall => {
  const enriched: ZoomPhoneMetricCall = { ...call };
  const matchedUser =
    findEmailMatch(getLikelyAgentEmailValues(call), context.users) ||
    findZoomAliasMatch(getLikelyAgentZoomAliasValues(call), context) ||
    findAssignedUserByNumberAtTime(getLikelyAgentNumberValues(call), call, context);

  if (matchedUser) enriched.matched_user = matchedUser;

  const connectedNumber = getLikelyConnectedNumber(call);
  const zoomAccount = getLikelyZoomAccountNumber(call);
  if (connectedNumber) enriched.connected_number = connectedNumber;
  if (zoomAccount) enriched.zoom_account = zoomAccount;
  const matchedLead = findPhoneMatch([connectedNumber], context.leads);
  if (matchedLead) enriched.matched_lead = matchedLead;
  enriched.live_status = isLiveMetricCall(call) ? 'on_call' : 'recent';

  return enriched;
};

const getInventoryUserNumbers = (phoneUser: ZoomPhoneUser, inventory: ZoomPhoneInventoryResponse) => {
  const directNumbers = (phoneUser.phone_numbers || []).map((phoneNumber) => phoneNumber.display_number || phoneNumber.number);
  const assignedNumbers = inventory.phone_numbers
    .filter((phoneNumber) => {
      const assignee = phoneNumber.assignee;
      if (!assignee) return false;
      return (
        assignee.id === phoneUser.id ||
        assignee.id === phoneUser.phone_user_id ||
        assignee.extension_number === phoneUser.extension_number ||
        assignee.name === phoneUser.name
      );
    })
    .map((phoneNumber) => phoneNumber.display_number || phoneNumber.number);

  return Array.from(new Set([...directNumbers, ...assignedNumbers].filter((value): value is string => Boolean(value))));
};

const matchInventoryUser = (
  phoneUser: ZoomPhoneUser,
  context: CrmMatchContext
): ZoomPhoneCrmUserMatch | undefined => findEmailMatch([phoneUser.email], context.users);

const buildLiveStatusResponse = async (query: ZoomPhoneQuery): Promise<ZoomPhoneLiveStatusResponse> => {
  const inventory = await fetchInventoryData(query);
  const context = await buildCrmMatchContext(inventory);
  const metricPages = await fetchZoomPages<ZoomPhoneMetricsResponse, ZoomPhoneMetricCall>(
    '/phone/metrics/call_logs',
    'call_logs',
    {
      ...query,
      from: query.from || toDateParam(new Date()),
      to: query.to || toDateParam(new Date()),
      pageSize: query.pageSize || 100,
      maxPages: query.maxPages || 2
    }
  );

  const recentCalls = metricPages.items
    .map((call) => enrichMetricCall(call, context))
    .sort((a, b) => new Date(b.date_time || 0).getTime() - new Date(a.date_time || 0).getTime());
  const activeCalls = recentCalls.filter((call) => call.live_status === 'on_call');

  const phoneUsers = inventory.users.map((phoneUser) => {
    const connectedNumbers = getInventoryUserNumbers(phoneUser, inventory);
    const liveUser: ZoomPhoneLiveUser = {
      ...phoneUser,
      connected_numbers: connectedNumbers,
      live_status: 'available'
    };
    const matchedUser = matchInventoryUser(phoneUser, context);
    if (matchedUser) liveUser.matched_user = matchedUser;

    const activeCall = activeCalls.find((call) => {
      if (matchedUser && call.matched_user?.id === matchedUser.id) return true;
      return findPhoneMatch(getMetricPhoneValues(call), [
        {
          numbers: connectedNumbers.flatMap(comparableNumbers),
          match: true
        }
      ]);
    });

    if (activeCall) {
      liveUser.live_status = 'on_call';
      if (activeCall.call_id) liveUser.active_call_id = activeCall.call_id;
    }

    return liveUser;
  });

  return {
    active_calls: activeCalls,
    recent_calls: recentCalls.slice(0, 25),
    phone_users: phoneUsers,
    inventory,
    updated_at: new Date().toISOString()
  };
};

const buildAnalyticsResponse = (
  query: ZoomPhoneQuery,
  callLogs: ZoomPhoneCallLog[],
  recordings: ZoomPhoneRecording[],
  pagesScanned: number,
  recordingsError?: string
): ZoomPhoneAnalyticsResponse => {
  const { from, to } = buildDateRange(query);
  const recordingIndex = buildRecordingIndex(recordings);
  const sourceCallLogs = callLogs.length > 0 ? callLogs : recordings.map(buildCallLogFromRecording);
  const normalizedCalls = sourceCallLogs.map((call) => {
    const matchedRecordings = getRecordingsForCall(call, recordingIndex);
    const recordingDownloadUrl = matchedRecordings[0]?.download_url || matchedRecordings[0]?.file_url;
    const startedAt = getCallStartedAt(call);
    const isMetricsCallWithoutResult = call.source === 'metrics' && !call.result && !call.path;
    const normalizedStatus = isMetricsCallWithoutResult
      ? matchedRecordings.length > 0
        ? 'Connected'
        : 'Unknown'
      : normalizeStatus(call);
    const normalizedCall: ZoomPhoneAnalyticsCall = {
      ...call,
      normalized_direction: normalizeDirection(call),
      normalized_status: normalizedStatus,
      agent_name: call.matched_user?.name || getCallAgentName(call),
      display_phone: call.matched_lead?.phone || getDisplayPhone(call),
      recording_count: matchedRecordings.length,
      has_recording: matchedRecordings.length > 0 || Boolean(call.recording_id || call.recording_type)
    };

    if (startedAt) {
      normalizedCall.started_at = startedAt;
    }

    if (recordingDownloadUrl) {
      normalizedCall.recording_download_url = recordingDownloadUrl;
    }

    return normalizedCall;
  });

  const totalCalls = normalizedCalls.length;
  const incomingCalls = normalizedCalls.filter((call) => call.normalized_direction === 'Incoming').length;
  const outgoingCalls = normalizedCalls.filter((call) => call.normalized_direction === 'Outgoing').length;
  const missedCalls = normalizedCalls.filter((call) => call.normalized_status === 'Missed').length;
  const connectedCalls = normalizedCalls.filter((call) => call.normalized_status === 'Connected').length;
  const voicemailCalls = normalizedCalls.filter((call) => call.normalized_status === 'Voicemail').length;
  const recordedCalls = normalizedCalls.filter((call) => call.has_recording).length;
  const totalTalkTime = normalizedCalls.reduce((sum, call) => sum + getCallDuration(call), 0);

  const agentMap = new Map<string, ZoomPhoneAgentAnalytics>();
  const dayMap = new Map<string, ZoomPhoneDailyAnalytics>();

  normalizedCalls.forEach((call) => {
    const duration = getCallDuration(call);
    const agentKey = call.agent_name || 'Unassigned';
    const existingAgentStats = agentMap.get(agentKey);
    const agentStats =
      existingAgentStats ||
      ({
        agent: agentKey,
        total_calls: 0,
        incoming_calls: 0,
        outgoing_calls: 0,
        connected_calls: 0,
        missed_calls: 0,
        recorded_calls: 0,
        total_talk_time: 0,
        average_call_duration: 0,
        answer_rate: 0
      } satisfies ZoomPhoneAgentAnalytics);

    if (!existingAgentStats && call.owner?.extension_number) {
      agentStats.extension_number = call.owner.extension_number;
    }

    if (!existingAgentStats && call.owner?.phone_number) {
      agentStats.phone_number = call.owner.phone_number;
    }

    agentStats.total_calls += 1;
    agentStats.incoming_calls += call.normalized_direction === 'Incoming' ? 1 : 0;
    agentStats.outgoing_calls += call.normalized_direction === 'Outgoing' ? 1 : 0;
    agentStats.connected_calls += call.normalized_status === 'Connected' ? 1 : 0;
    agentStats.missed_calls += call.normalized_status === 'Missed' ? 1 : 0;
    agentStats.recorded_calls += call.has_recording ? 1 : 0;
    agentStats.total_talk_time += duration;
    agentMap.set(agentKey, agentStats);

    const startedAt = call.started_at || to;
    const dateKey = startedAt.slice(0, 10);
    const dayStats =
      dayMap.get(dateKey) ||
      ({
        date: dateKey,
        total_calls: 0,
        incoming_calls: 0,
        outgoing_calls: 0,
        connected_calls: 0,
        missed_calls: 0,
        recorded_calls: 0,
        total_talk_time: 0
      } satisfies ZoomPhoneDailyAnalytics);

    dayStats.total_calls += 1;
    dayStats.incoming_calls += call.normalized_direction === 'Incoming' ? 1 : 0;
    dayStats.outgoing_calls += call.normalized_direction === 'Outgoing' ? 1 : 0;
    dayStats.connected_calls += call.normalized_status === 'Connected' ? 1 : 0;
    dayStats.missed_calls += call.normalized_status === 'Missed' ? 1 : 0;
    dayStats.recorded_calls += call.has_recording ? 1 : 0;
    dayStats.total_talk_time += duration;
    dayMap.set(dateKey, dayStats);
  });

  const agentStats = Array.from(agentMap.values())
    .map((agent) => ({
      ...agent,
      average_call_duration:
        agent.connected_calls > 0 ? Math.round(agent.total_talk_time / agent.connected_calls) : 0,
      answer_rate: percentage(agent.connected_calls, agent.total_calls)
    }))
    .sort((a, b) => b.total_calls - a.total_calls);

  const response: ZoomPhoneAnalyticsResponse = {
    from,
    to,
    page_size: buildPageSize(query.pageSize),
    pages_scanned: pagesScanned,
    total_records_scanned: totalCalls,
    call_logs: normalizedCalls.sort((a, b) => {
      const first = new Date(a.started_at || 0).getTime();
      const second = new Date(b.started_at || 0).getTime();
      return second - first;
    }),
    recordings,
    summary: {
      total_calls: totalCalls,
      incoming_calls: incomingCalls,
      outgoing_calls: outgoingCalls,
      missed_calls: missedCalls,
      connected_calls: connectedCalls,
      voicemail_calls: voicemailCalls,
      recorded_calls: recordedCalls,
      answer_rate: percentage(connectedCalls, totalCalls),
      average_call_duration: connectedCalls > 0 ? Math.round(totalTalkTime / connectedCalls) : 0,
      total_talk_time: totalTalkTime
    },
    agent_stats: agentStats,
    daily_stats: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    status_breakdown: buildBreakdown(
      normalizedCalls.map((call) => call.normalized_status),
      totalCalls
    ),
    direction_breakdown: buildBreakdown(
      normalizedCalls.map((call) => call.normalized_direction),
      totalCalls
    )
  };

  if (recordingsError) {
    response.recordings_error = recordingsError;
  }

  return response;
};

const getZoomAccessToken = async () => {
  ensureConfigured();

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID as string;
  const clientId = process.env.ZOOM_CLIENT_ID as string;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET as string;

  const url = new URL(ZOOM_OAUTH_URL);
  url.searchParams.set('grant_type', 'account_credentials');
  url.searchParams.set('account_id', accountId);

  const response = await fetch(url.toString(), {
    method: 'POST',
    signal: AbortSignal.timeout(getZoomRequestTimeoutMs()),
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    }
  });

  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Zoom authentication failed (${response.status}): ${details.slice(0, 300)}`);
    (error as Error & { statusCode?: number }).statusCode = response.status;
    throw error;
  }

  const data = (await response.json()) as ZoomTokenResponse;
  if (!data.access_token) {
    const error = new Error('Zoom authentication did not return an access token');
    (error as Error & { statusCode?: number }).statusCode = 502;
    throw error;
  }

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000
  };

  return data.access_token;
};

const requestZoomJson = async <T>(endpoint: string, query?: Record<string, string>, retry = true): Promise<T> => {
  const token = await getZoomAccessToken();
  const url = new URL(`${ZOOM_API_BASE_URL}${endpoint}`);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(getZoomRequestTimeoutMs()),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  if (response.status === 401 && retry) {
    tokenCache = null;
    return requestZoomJson<T>(endpoint, query, false);
  }

  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Zoom Phone API request failed (${response.status}): ${details.slice(0, 300)}`);
    (error as Error & { statusCode?: number }).statusCode = response.status;
    throw error;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
};

const requestZoomFile = async (
  urlOrEndpoint: string,
  range?: string,
  retry = true
): Promise<Response> => {
  const token = await getZoomAccessToken();

  const isAbsolute = /^https?:\/\//i.test(urlOrEndpoint);
  const url = isAbsolute
    ? urlOrEndpoint
    : `${ZOOM_API_BASE_URL}${urlOrEndpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`
  };

  if (range) {
    headers.Range = range;
  }

  const response = await fetch(url, {
    headers
  });

  if (response.status === 401 && retry) {
    tokenCache = null;
    return requestZoomFile(urlOrEndpoint, range, false);
  }

  if (!response.ok && response.status !== 206) {
    const details = await response.text();

    const error = new Error(
      `Zoom recording download failed (${response.status}): ${details.slice(
        0,
        300
      )}`
    );

    (error as Error & { statusCode?: number }).statusCode = response.status;
    throw error;
  }

  return response;
};

const assertZoomDownloadUrl = (downloadUrl?: string) => {
  if (!downloadUrl) return null;

  try {
    const parsed = new URL(downloadUrl);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || (host !== 'zoom.us' && !host.endsWith('.zoom.us'))) {
      throw new Error('Invalid Zoom recording URL');
    }
    return parsed.toString();
  } catch {
    const error = new Error('Invalid Zoom recording download URL');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
};

let talkTimeUsersCache: { users: ZoomPhoneUser[]; expiresAt: number } | undefined;
let talkTimeUsersPending: Promise<ZoomPhoneUser[]> | undefined;

const getTalkTimePhoneUsers = async () => {
  if (talkTimeUsersCache && talkTimeUsersCache.expiresAt > Date.now()) return talkTimeUsersCache.users;
  if (!talkTimeUsersPending) {
    talkTimeUsersPending = (async () => {
      const pages = await fetchZoomPages<ZoomPhoneUsersResponse, ZoomPhoneUser>(
        '/phone/users', 'users', { maxPages: 20, pageSize: 300 }, false
      );
      if (pages.nextPageToken) {
        throw Object.assign(new Error('Zoom user inventory is incomplete; increase ZOOM_PHONE_ANALYTICS_MAX_PAGES'), { statusCode: 502 });
      }
      talkTimeUsersCache = { users: pages.items, expiresAt: Date.now() + 60_000 };
      return pages.items;
    })().finally(() => { talkTimeUsersPending = undefined; });
  }
  return talkTimeUsersPending;
};

/**
 * Persist the latest completed Zoom Phone contact for each matched CRM lead.
 * Keeping this denormalized on Lead makes list sorting/filtering a local MongoDB
 * query and avoids calling Zoom whenever someone opens the leads page.
 */
export const syncLeadLastContactedFromZoomCalls = async (calls: ZoomPhoneAnalyticsCall[]) => {
  const latestByLead = new Map<string, { call: ZoomPhoneAnalyticsCall; contactedAt: Date }>();

  for (const call of calls) {
    const leadId = call.matched_lead?.id;
    const duration = Number(call.duration || 0);
    const isCompletedContact = call.normalized_status === 'Connected' || duration > 0;
    const rawContactedAt = call.call_end_time || call.started_at || call.answer_start_time || call.date_time;
    if (!leadId || !isCompletedContact || !rawContactedAt) continue;

    const contactedAt = new Date(rawContactedAt);
    if (Number.isNaN(contactedAt.getTime())) continue;
    // Metrics records generally expose only a start time plus duration. In that
    // case store the completion time, which is what "last contacted" represents.
    if (!call.call_end_time && duration > 0) {
      contactedAt.setTime(contactedAt.getTime() + duration * 1000);
    }

    const current = latestByLead.get(leadId);
    if (!current || contactedAt > current.contactedAt) {
      latestByLead.set(leadId, { call, contactedAt });
    }
  }

  if (latestByLead.size === 0) return 0;

  const operations = Array.from(latestByLead.entries()).map(([leadId, { call, contactedAt }]) => {
    const matchedUser = call.matched_user;
    const callId = getIdentityValues(call)[0];
    const directionBasedAgentName =
      call.normalized_direction === 'Outgoing'
        ? call.caller_name
        : call.normalized_direction === 'Incoming'
          ? call.callee_name
          : undefined;
    const setFields: Record<string, unknown> = {
      lastContactedAt: contactedAt,
      lastContactedByName:
        matchedUser?.name || call.owner?.name || directionBasedAgentName || 'Unknown salesperson'
    };

    if (matchedUser?.id) setFields.lastContactedBy = matchedUser.id;
    if (matchedUser?.email) setFields.lastContactedByEmail = matchedUser.email;
    if (callId) setFields.lastContactedZoomCallId = callId;

    const update: Record<string, unknown> = { $set: setFields };
    const unsetFields: Record<string, 1> = {};
    if (!matchedUser?.id) unsetFields.lastContactedBy = 1;
    if (!matchedUser?.email) unsetFields.lastContactedByEmail = 1;
    if (!callId) unsetFields.lastContactedZoomCallId = 1;
    if (Object.keys(unsetFields).length > 0) update.$unset = unsetFields;

    return {
      updateOne: {
        filter: {
          _id: leadId,
          $or: [
            { lastContactedAt: { $exists: false } },
            { lastContactedAt: { $lt: contactedAt } }
          ]
        },
        update
      }
    };
  });

  const result = await Lead.bulkWrite(operations, { ordered: false, timestamps: false });
  return result.modifiedCount;
};

export const zoomPhoneService = {
  getMyTalkTime: async (userId: string, timeZone: string) => {
    ensureConfigured();
    const now = new Date();
    const range = getTalkTimeRange(timeZone, now);
    const [user, assignments, phoneUsers] = await Promise.all([
      User.findById(userId).select('email phone').lean(),
      ZoomPhoneNumberAssignment.find({
        assignedAt: { $lte: now },
        $or: [{ releasedAt: { $exists: false } }, { releasedAt: { $gte: new Date(`${range.queryFrom}T00:00:00Z`) } }]
      }).lean(),
      getTalkTimePhoneUsers()
    ]);
    if (!user) throw Object.assign(new Error('CRM user not found'), { statusCode: 404 });
    const ownAssignments = assignments.filter((assignment) => String(assignment.crmUser) === userId);
    const assignmentMatchesUser = (assignment: typeof assignments[number], phoneUser: ZoomPhoneUser) =>
      Boolean(
        (assignment.zoomPhoneUserId && [phoneUser.id, phoneUser.phone_user_id].includes(assignment.zoomPhoneUserId)) ||
        (assignment.zoomPhoneUserEmail && normalizeEmail(assignment.zoomPhoneUserEmail) === normalizeEmail(phoneUser.email)) ||
        phoneUser.phone_numbers?.some((number) =>
          phoneVariantsMatch(normalizePhoneNumber(number.number || number.display_number), assignment.normalizedNumber))
      );
    const candidates = new Map<string, ZoomPhoneUser>();
    for (const phoneUser of phoneUsers) {
      const id = phoneUser.id || phoneUser.phone_user_id;
      if (id && (normalizeEmail(phoneUser.email) === normalizeEmail(user.email) ||
        ownAssignments.some((assignment) => assignmentMatchesUser(assignment, phoneUser)))) {
        candidates.set(id, phoneUser);
      }
    }
    // Include a previously assigned Zoom account even if it left the current inventory.
    for (const assignment of ownAssignments) {
      const id = assignment.zoomPhoneUserId;
      if (id && !candidates.has(id)) candidates.set(id, { id, email: assignment.zoomPhoneUserEmail || '' });
    }
    const calls: TalkTimeCall[] = [];
    for (const [id, phoneUser] of candidates) {
      let nextPageToken: string | undefined;
      let pages = 0;
      do {
        const query: Record<string, string> = {
          from: range.queryFrom, to: range.queryTo, page_size: '300'
        };
        if (nextPageToken) query.next_page_token = nextPageToken;
        const response = await requestZoomJson<{
          call_elements?: TalkTimeCall[]; call_logs?: TalkTimeCall[]; next_page_token?: string;
        }>(`/phone/users/${encodeURIComponent(id)}/call_history`, query);
        if (!Array.isArray(response.call_elements) && !Array.isArray(response.call_logs)) {
          throw Object.assign(new Error('Zoom returned an unexpected call history response'), { statusCode: 502 });
        }
        for (const call of response.call_elements || response.call_logs || []) {
          const timestamp = Date.parse(call.start_time || call.date_time || call.answer_time || '');
          const activeAssignments = assignments.filter((assignment) =>
            assignment.assignedAt.getTime() <= timestamp &&
            (!assignment.releasedAt || timestamp < assignment.releasedAt.getTime()));
          const agentNumber = /outbound|outgoing/i.test(call.direction || '')
            ? call.caller_did_number : call.callee_did_number;
          const numberAssignments = activeAssignments.filter((assignment) =>
            phoneVariantsMatch(normalizePhoneNumber(agentNumber), assignment.normalizedNumber));
          const relevantAssignments = numberAssignments.length ? numberAssignments
            : activeAssignments.filter((assignment) => assignmentMatchesUser(assignment, phoneUser));
          const owners = new Set(relevantAssignments.map((assignment) => String(assignment.crmUser)));
          const isOwnCall = owners.size ? owners.size === 1 && owners.has(userId)
            : !assignments.some((assignment) => assignmentMatchesUser(assignment, phoneUser)) &&
              normalizeEmail(phoneUser.email) === normalizeEmail(user.email);
          if (isOwnCall) calls.push(call);
        }
        nextPageToken = response.next_page_token;
        pages += 1;
      } while (nextPageToken && pages < 100);
      if (nextPageToken) throw Object.assign(new Error('Zoom call history is incomplete; please retry later'), { statusCode: 502 });
    }
    return { ...sumZoomTalkTime(calls, timeZone, now), linked: candidates.size > 0 };
  },
  getStatus: () => {
    const missing = getMissingConfig();
    return {
      configured: missing.length === 0,
      missing,
      provider: 'Zoom Phone',
      mode: 'server-to-server-oauth'
    };
  },

  getNumberAssignments: async (activeOnly = false): Promise<ZoomPhoneNumberAssignmentsResponse> => {
    const assignments = await ZoomPhoneNumberAssignment.find(activeOnly ? { releasedAt: { $exists: false } } : {})
      .sort({ normalizedNumber: 1, assignedAt: -1 })
      .lean();

    return {
      assignments: assignments.map((assignment) =>
        serializeZoomPhoneNumberAssignment(assignment as ZoomPhoneNumberAssignmentLike)
      )
    };
  },

  assignNumberToUser: async (input: AssignZoomPhoneNumberInput): Promise<ZoomPhoneNumberAssignmentRecord> => {
    const userId = toTrimmedString(input.userId);
    const normalizedNumber = normalizePhoneNumber(input.phoneNumber);

    if (!userId) {
      const error = new Error('User is required');
      (error as Error & { statusCode?: number }).statusCode = 400;
      throw error;
    }

    if (normalizedNumber.length < 7) {
      const error = new Error('A valid Zoom phone number is required');
      (error as Error & { statusCode?: number }).statusCode = 400;
      throw error;
    }

    const assignedAt = assertValidAssignmentDate(input.assignedAt);
    const user = await User.findById(userId).select('_id name email phone isActive createdAt updatedAt').lean();

    if (!user) {
      const error = new Error('User not found');
      (error as Error & { statusCode?: number }).statusCode = 404;
      throw error;
    }

    const userMatch = buildUserMatch(user as Record<string, unknown>);
    const displayNumber = buildAssignmentDisplayNumber(input.phoneNumber);
    const targetUserId = toIdString(user._id);
    const targetUserObjectId = user._id;

    await ZoomPhoneNumberAssignment.updateMany(
      {
        normalizedNumber,
        crmUser: { $ne: targetUserObjectId },
        releasedAt: { $exists: false }
      },
      { $set: { releasedAt: assignedAt } }
    );

    const assignmentUpdate = {
      $setOnInsert: {
        normalizedNumber
      },
      $set: {
        displayNumber,
        assignedAt,
        source: 'manual' as const,
        ...assignmentUserPayload(userMatch)
      }
    };

    try {
      await ZoomPhoneNumberAssignment.findOneAndUpdate(
        {
          normalizedNumber,
          crmUser: targetUserObjectId,
          releasedAt: { $exists: false }
        },
        assignmentUpdate,
        { upsert: true, new: true }
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      await ZoomPhoneNumberAssignment.updateMany(
        {
          normalizedNumber,
          crmUser: { $ne: targetUserObjectId },
          releasedAt: { $exists: false }
        },
        { $set: { releasedAt: assignedAt } }
      );
      await ZoomPhoneNumberAssignment.updateOne(
        {
          normalizedNumber,
          releasedAt: { $exists: false }
        },
        assignmentUpdate,
        { upsert: true }
      );
    }

    await User.updateOne({ _id: targetUserObjectId }, { $set: { phone: displayNumber } });

    const assignment = await ZoomPhoneNumberAssignment.findOne({
      normalizedNumber,
      crmUser: targetUserObjectId,
      releasedAt: { $exists: false }
    }).lean();

    if (!assignment) {
      const error = new Error(`Unable to assign ${displayNumber} to ${userMatch.name}`);
      (error as Error & { statusCode?: number }).statusCode = 409;
      throw error;
    }

    const record = serializeZoomPhoneNumberAssignment(assignment as ZoomPhoneNumberAssignmentLike);
    record.crmUser = targetUserId;
    return record;
  },

  getAccountCallLogs: async (query: ZoomPhoneQuery) => {
    try {
      const historyPages = await fetchZoomPages<ZoomCallLogsResponse, Record<string, unknown>>(
        '/phone/call_history',
        'call_logs',
        query
      );
      if (historyPages.items.length > 0) {
        return {
          call_logs: historyPages.items.map(normalizeZoomCallLog),
          total_records: historyPages.items.length,
          next_page_token: historyPages.nextPageToken
        };
      }
    } catch {
      // fallback to legacy endpoint
    }
    return requestZoomJson<ZoomCallLogsResponse>('/phone/call_logs', buildZoomQuery(query));
  },

  getAccountRecordings: async (query: ZoomPhoneQuery) => {
    const [inventory, response] = await Promise.all([
      fetchInventoryData({ pageSize: 300, maxPages: 2 }).catch(() => undefined),
      requestZoomJson<ZoomRecordingsResponse>('/phone/recordings', buildZoomQuery(query))
    ]);
    const context = await buildCrmMatchContext(inventory);

    return {
      ...response,
      recordings: (response.recordings || []).map((recording) => enrichZoomPhoneItem(recording, context))
    };
  },

  getAccountInventory: async (query: ZoomPhoneQuery) => {
    const inventory = await fetchInventoryData(query);
    await buildCrmMatchContext(inventory);
    return inventory;
  },

  getAccountLiveStatus: async (query: ZoomPhoneQuery) => {
    return buildLiveStatusResponse(query);
  },

  getContactSyncCalls: async (query: ZoomPhoneQuery): Promise<ZoomPhoneAnalyticsCall[]> => {
    // Contact sync only needs CRM users/leads and the existing number-assignment
    // history. Skipping Zoom inventory here keeps startup sync fast and avoids
    // coupling lead contact data to the slower inventory endpoints.
    const [context, metricPages] = await Promise.all([
      buildCrmMatchContext(),
      fetchZoomPages<ZoomPhoneMetricsResponse, ZoomPhoneMetricCall>(
        '/phone/metrics/call_logs',
        'call_logs',
        query
      )
    ]);
    let callLogs = metricPages.items.map((call) => buildCallLogFromMetric(enrichMetricCall(call, context)));
    let pagesScanned = metricPages.pagesScanned;

    if (callLogs.length === 0) {
      const callLogPages = await fetchZoomPages<ZoomCallLogsResponse, ZoomPhoneCallLog>(
        '/phone/call_logs',
        'call_logs',
        query
      );
      callLogs = callLogPages.items.map((call) =>
        enrichZoomPhoneItem({ ...call, source: 'call_log' as const }, context)
      );
      pagesScanned = callLogPages.pagesScanned;
    }

    return buildAnalyticsResponse(query, callLogs, [], pagesScanned).call_logs;
  },

  getAccountAnalytics: async (query: ZoomPhoneQuery) => {
    const [inventory, metricPages] = await Promise.all([
      fetchInventoryData({ pageSize: 300, maxPages: 2 }).catch(() => undefined),
      fetchZoomPages<ZoomPhoneMetricsResponse, ZoomPhoneMetricCall>('/phone/metrics/call_logs', 'call_logs', query)
    ]);
    const context = await buildCrmMatchContext(inventory);
    let callLogs = metricPages.items.map((call) => buildCallLogFromMetric(enrichMetricCall(call, context)));
    let pagesScanned = metricPages.pagesScanned;

    if (callLogs.length === 0) {
      const callLogPages = await fetchZoomPages<ZoomCallLogsResponse, ZoomPhoneCallLog>('/phone/call_logs', 'call_logs', query);
      callLogs = callLogPages.items.map((call) => enrichZoomPhoneItem({ ...call, source: 'call_log' as const }, context));
      pagesScanned = callLogPages.pagesScanned;
    }

    let recordings: ZoomPhoneRecording[] = [];
    let recordingsError: string | undefined;

    if (query.includeRecordings !== false) {
      try {
        const recordingPages = await fetchZoomPages<ZoomRecordingsResponse, ZoomPhoneRecording>(
          '/phone/recordings',
          'recordings',
          query
        );
        recordings = recordingPages.items;
      } catch (error) {
        recordingsError = error instanceof Error ? error.message : 'Unable to retrieve Zoom Phone recordings';
      }
    }

    return buildAnalyticsResponse(
      query,
      callLogs.map((call) => enrichZoomPhoneItem(call, context)),
      recordings.map((recording) => enrichZoomPhoneItem(recording, context)),
      pagesScanned,
      recordingsError
    );
  },

  getLeadCallHistory: async (lead: ILead, query: ZoomPhoneQuery) => {
    const leadMaxPages = buildLeadHistoryMaxPages(query.maxPages);
    const [inventory, historyPages, recordingPages] = await Promise.all([
      fetchInventoryData({ pageSize: 300, maxPages: 2 }).catch(() => undefined),
      fetchZoomPages<ZoomCallLogsResponse, Record<string, unknown>>(
        '/phone/call_history',
        'call_logs',
        query,
        true,
        leadMaxPages
      ).catch(() => ({ items: [] as Record<string, unknown>[], pagesScanned: 0, nextPageToken: undefined })),
      fetchZoomPages<ZoomRecordingsResponse, ZoomPhoneRecording>(
        '/phone/recordings',
        'recordings',
        query,
        true,
        leadMaxPages
      ).catch(() => ({ items: [] as ZoomPhoneRecording[], pagesScanned: 0, nextPageToken: undefined }))
    ]);

    const context = await buildCrmMatchContext(inventory);
    const leadNumbers = getLeadZoomNumbers(lead);

    let rawCalls = historyPages.items;
    if (rawCalls.length === 0) {
      // Fallback 1: metrics call logs
      const metricPages = await fetchZoomPages<ZoomPhoneMetricsResponse, ZoomPhoneMetricCall>(
        '/phone/metrics/call_logs',
        'call_logs',
        query,
        true,
        leadMaxPages
      ).catch(() => ({ items: [] as ZoomPhoneMetricCall[], pagesScanned: 0, nextPageToken: undefined }));

      if (metricPages.items.length > 0) {
        rawCalls = metricPages.items.map((call) =>
          buildCallLogFromMetric(enrichMetricCall(call, context)) as unknown as Record<string, unknown>
        );
      } else {
        // Fallback 2: legacy call_logs
        const legacyResponse = await requestZoomJson<ZoomCallLogsResponse>(
          '/phone/call_logs',
          buildZoomQuery(query)
        ).catch(() => ({ call_logs: [] }));
        rawCalls = (legacyResponse.call_logs || []) as unknown as Record<string, unknown>[];
      }
    }

    let callLogs = rawCalls
      .map(normalizeZoomCallLog)
      .filter((call) => phoneMatchesLead(call, leadNumbers))
      .map((call) => enrichZoomPhoneItem(call, context));

    let recordings = (recordingPages.items || [])
      .filter((recording) => phoneMatchesLead(recording, leadNumbers))
      .map((recording) => enrichZoomPhoneItem(recording, context));

    if (callLogs.length === 0 && recordings.length > 0) {
      callLogs = recordings.map(buildCallLogFromRecording);
    }

    return {
      call_logs: callLogs,
      total_records: callLogs.length,
      recordings,
      matched_numbers: leadNumbers
    };
  },

  getLeadRecordings: async (lead: ILead, query: ZoomPhoneQuery) => {
    const leadMaxPages = buildLeadHistoryMaxPages(query.maxPages);
    const [inventory, recordingPages] = await Promise.all([
      fetchInventoryData({ pageSize: 300, maxPages: 2 }).catch(() => undefined),
      fetchZoomPages<ZoomRecordingsResponse, ZoomPhoneRecording>(
        '/phone/recordings',
        'recordings',
        query,
        true,
        leadMaxPages
      ).catch(() => ({ items: [] as ZoomPhoneRecording[], pagesScanned: 0, nextPageToken: undefined }))
    ]);
    const context = await buildCrmMatchContext(inventory);
    const leadNumbers = getLeadZoomNumbers(lead);
    const recordings = (recordingPages.items || [])
      .filter((recording) => phoneMatchesLead(recording, leadNumbers))
      .map((recording) => enrichZoomPhoneItem(recording, context));

    return {
      recordings,
      total_records: recordings.length,
      matched_numbers: leadNumbers
    };
  },

  getCallLogRecordings: async (lead: ILead, callLogId: string) => {
    const leadMaxPages = buildLeadHistoryMaxPages();
    const [inventory, directResponse, allRecordings] = await Promise.all([
      fetchInventoryData({ pageSize: 300, maxPages: 2 }).catch(() => undefined),
      requestZoomJson<ZoomRecordingsResponse>('/phone/call_logs/' + encodeURIComponent(callLogId) + '/recordings').catch(() => undefined),
      fetchZoomPages<ZoomRecordingsResponse, ZoomPhoneRecording>(
        '/phone/recordings',
        'recordings',
        {},
        false,
        leadMaxPages
      ).catch(() => ({ items: [] as ZoomPhoneRecording[], pagesScanned: 0, nextPageToken: undefined }))
    ]);
    const context = await buildCrmMatchContext(inventory);
    const leadNumbers = getLeadZoomNumbers(lead);

    let rawRecordings = directResponse?.recordings || [];
    if (rawRecordings.length === 0) {
      rawRecordings = allRecordings.items.filter((r) => {
        const id = getRecordingIdentity(r);
        return id === callLogId || r.call_id === callLogId || r.call_log_id === callLogId || r.call_history_id === callLogId;
      });
    }

    const recordings = (rawRecordings || [])
      .filter((recording) => phoneMatchesLead(recording, leadNumbers))
      .map((recording) => enrichZoomPhoneItem(recording, context));

    return {
      recordings,
      total_records: recordings.length,
      matched_numbers: leadNumbers
    };
  },

  downloadRecording: async (
    recordingId: string,
    downloadUrl?: string,
    range?: string
  ) => {
    const safeDownloadUrl = assertZoomDownloadUrl(downloadUrl);
  
    if (safeDownloadUrl) {
      return requestZoomFile(safeDownloadUrl, range);
    }
  
    return requestZoomFile(
      `/phone/recording/download/${encodeURIComponent(recordingId)}`,
      range
    );
  }
};
