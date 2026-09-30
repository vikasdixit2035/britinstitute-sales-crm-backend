import mongoose, { Schema } from 'mongoose';

const retargetingLeadSchema = new Schema(
  {
    metaLeadId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true
    },
    existingLeadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true
    },
    name: {
      type: String,
      trim: true,
      default: ''
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: ''
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    whatsapp: {
      type: String,
      trim: true,
      default: ''
    },
    position: {
      type: String,
      trim: true,
      default: ''
    },
    folder: {
      type: String,
      default: 'Retargeting',
      immutable: true
    },
    label: {
      type: String,
      default: 'Retargeting',
      immutable: true
    },
    source: {
      type: String,
      default: 'Meta',
      immutable: true
    },
    matchReason: {
      type: String,
      enum: ['EMAIL_EXISTS', 'PHONE_EXISTS', 'EMAIL_PHONE_EXISTS'],
      required: true
    },
    campaignName: { type: String, trim: true, default: '' },
    adsetName: { type: String, trim: true, default: '' },
    adName: { type: String, trim: true, default: '' },
    metaFormId: { type: String, trim: true, default: '' },
    metaPageId: { type: String, trim: true, default: '' },
    metaAdId: { type: String, trim: true, default: '' },
    metaCreatedTime: { type: Date },
    metaAttributes: [
      {
        _id: false,
        key: { type: String, trim: true },
        label: { type: String, trim: true },
        value: { type: String, trim: true },
        rawValue: { type: String, trim: true }
      }
    ],
    rawPayload: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

retargetingLeadSchema.index({ existingLeadId: 1, createdAt: -1 });
retargetingLeadSchema.index({ createdAt: -1 });
retargetingLeadSchema.index({ name: 'text', email: 'text', phone: 'text' });

const RetargetingLead = mongoose.model('RetargetingLead', retargetingLeadSchema);

export default RetargetingLead;
