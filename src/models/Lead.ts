import mongoose, { Schema } from 'mongoose';
import type { ILead, ILeadNote, ILeadModel, LeadSource, LeadStatus, LeadPriority, IUser } from '../types';

const optionalPhoneValidator = (value?: string) => !value || /^[\+]?[\d\s\-\(\)\.]{7,25}$/.test(value);

const leadNoteSchema = new Schema<ILeadNote>({
  id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  content: {
    type: String,
    required: [true, 'Note content is required'],
    trim: true,
    maxlength: [1000, 'Note cannot exceed 1000 characters']
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const leadSchema = new Schema<ILead>({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please enter a valid email address'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    trim: true,
    match: [
      /^[\+]?[\d\s\-\(\)\.]{7,25}$/,
      'Please enter a valid phone number'
    ]
  },
  whatsapp: {
    type: String,
    trim: true,
    validate: {
      validator: optionalPhoneValidator,
      message: 'Please enter a valid WhatsApp number'
    }
  },
  zoomPhoneNumber: {
    type: String,
    trim: true,
    validate: {
      validator: optionalPhoneValidator,
      message: 'Please enter a valid Zoom Phone number'
    }
  },
  position: {
    type: String,
    trim: true,
    maxlength: [100, 'Position cannot exceed 100 characters']
  },
  folder: {
    type: String,
    trim: true,
    maxlength: [100, 'Folder name cannot exceed 100 characters'],
    default: ''
  },
  source: {
    type: String,
    enum: ['Website', 'Social Media', 'Referral', 'Import', 'Manual', 'Cold Call', 'Email Campaign', 'strategy_call_modal', 'data_analytics_landing_page', 'Meta'] as LeadSource[],
    required: [true, 'Source is required'],
    default: 'Manual'
  },
  campaignName: {
    type: String,
    trim: true,
    required: false,
    default: ''
  },
  adsetName: {
    type: String,
    trim: true,
    required: false,
    default: ''
  },
  adName: {
    type: String,
    trim: true,
    required: false,
    default: ''
  },
  metaLeadId: {
    type: String,
    trim: true,
    required: false,
    default: ''
  },
  metaFormId: {
    type: String,
    trim: true,
    required: false,
    default: ''
  },
  metaPageId: {
    type: String,
    trim: true,
    required: false,
    default: ''
  },
  metaAdId: {
    type: String,
    trim: true,
    required: false,
    default: ''
  },
  metaCreatedTime: {
    type: Date,
    required: false
  },
  metaOriginalName: {
    type: String,
    required: false,
    default: ''
  },
  metaOriginalEmail: {
    type: String,
    required: false,
    default: ''
  },
  metaOriginalPhone: {
    type: String,
    required: false,
    default: ''
  },
  metaAttributes: [
    {
      _id: false,
      key: { type: String, trim: true },
      label: { type: String, trim: true },
      value: { type: String, trim: true },
      rawValue: { type: String, trim: true }
    }
  ],
  metaRawPayload: {
    type: Schema.Types.Mixed,
    required: false
  },
  metaFeedbackLastStatus: {
    type: String,
    trim: true,
    required: false,
    default: ''
  },
  metaFeedbackLastSentAt: {
    type: Date,
    required: false
  },
  metaFeedbackLastError: {
    type: String,
    trim: true,
    required: false,
    default: ''
  },
  status: {
    type: String,
    default: 'New',
    required: true,
    trim: true,
    maxlength: [50, 'Status cannot exceed 50 characters']
  },
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'] as LeadPriority[],
    default: 'Medium',
    required: true
  },

  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  lastContactedAt: {
    type: Date
  },
  lastContactedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  lastContactedByName: {
    type: String,
    trim: true
  },
  lastContactedByEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  lastContactedZoomCallId: {
    type: String,
    trim: true
  },

  /* =======================
     Assignment History
  ======================= */
  assignmentHistory: [
    {
      assignedTo: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      assignedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      assignedAt: {
        type: Date,
        default: Date.now
      },
      source: {
        type: String,
        enum: ['Manual', 'Bulk', 'Import', 'Reimport', 'System'],
        default: 'Manual'
      }
    }
  ],

  notes: [leadNoteSchema],

  leadScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  }
},
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/* =======================
   Indexes
======================= */

leadSchema.index({ email: 1 }, { unique: true });
leadSchema.index({ phone: 1 }, { unique: true });
leadSchema.index(
  { metaLeadId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      metaLeadId: { $type: 'string', $gt: '' }
    }
  }
);
leadSchema.index({ zoomPhoneNumber: 1 }, { sparse: true });
leadSchema.index({ status: 1 });
leadSchema.index({ source: 1 });
leadSchema.index({ priority: 1 });
leadSchema.index({ folder: 1 });
leadSchema.index({ assignedTo: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ updatedAt: -1 });
leadSchema.index({ lastContactedAt: -1 });
leadSchema.index({ createdAt: 1 });

// Compound indexes
leadSchema.index({ status: 1, assignedTo: 1 });
leadSchema.index({ source: 1, createdAt: -1 });
leadSchema.index({ priority: 1, status: 1 });
leadSchema.index({ folder: 1, status: 1 });
leadSchema.index({ folder: 1, assignedTo: 1 });

leadSchema.index({
  name: 'text',
  email: 'text',
  phone: 'text',
  whatsapp: 'text',
  zoomPhoneNumber: 'text',
  position: 'text',
  folder: 'text'
});

/* =======================
   Virtual Populates
======================= */

leadSchema.virtual('assignedToUser', {
  ref: 'User',
  localField: 'assignedTo',
  foreignField: '_id',
  justOne: true
});

leadSchema.virtual('assignedByUser', {
  ref: 'User',
  localField: 'assignedBy',
  foreignField: '_id',
  justOne: true
});

leadSchema.virtual('lastContactedByUser', {
  ref: 'User',
  localField: 'lastContactedBy',
  foreignField: '_id',
  justOne: true
});

/* =======================
   UI Helper Virtuals
======================= */

leadSchema.virtual('assignmentCount').get(function () {
  return this.assignmentHistory?.length || 0;
});

leadSchema.virtual('wasReassigned').get(function () {
  return (this.assignmentHistory?.length || 0) > 1;
});

/* =======================
   Methods
======================= */

leadSchema.methods.getNotesWithUsers = async function () {
  await this.populate('notes.createdBy', 'name email role');

  return this.notes.map((note: ILeadNote & { createdBy: IUser }) => ({
    id: note.id,
    content: note.content,
    createdAt: note.createdAt,
    createdBy: {
      id: note.createdBy._id,
      name: note.createdBy.name,
      email: note.createdBy.email,
      role: note.createdBy.role
    }
  }));
};
leadSchema.statics.getLeadStats = async function (userId?: string) {
  const baseMatch = userId ? { assignedTo: userId } : {};

  const [
    totalLeads,
    newLeads,
    contactedLeads,
    qualifiedLeads,
    salesDone,
    dnpLeads,
    leadsThisMonth,
    leadsByStatus,
    leadsBySource,
    leadsByFolder
  ] = await Promise.all([
    this.countDocuments(baseMatch),
    this.countDocuments({ ...baseMatch, status: 'New' }),
    this.countDocuments({ ...baseMatch, status: 'Contacted' }),
    this.countDocuments({ ...baseMatch, status: 'Qualified' }),
    this.countDocuments({ ...baseMatch, status: 'Sales Done' }),
    this.countDocuments({ ...baseMatch, status: 'DNP' }),
    this.countDocuments({
      ...baseMatch,
      createdAt: {
        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      }
    }),
    this.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    this.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    this.aggregate([
      { $match: { ...baseMatch, folder: { $ne: '' } } },
      { $group: { _id: '$folder', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ])
  ]);

  const conversionRate = totalLeads > 0 ? (salesDone / totalLeads) * 100 : 0;

  return {
    totalLeads,
    newLeads,
    contactedLeads,
    qualifiedLeads,
    salesDone,
    dnpLeads,
    conversionRate,
    leadsThisMonth,
    leadsByStatus: leadsByStatus.map(item => ({
      status: item._id,
      count: item.count,
      percentage: totalLeads > 0 ? (item.count / totalLeads) * 100 : 0
    })),
    leadsBySource: leadsBySource.map(item => ({
      source: item._id,
      count: item.count,
      percentage: totalLeads > 0 ? (item.count / totalLeads) * 100 : 0
    })),
    leadsByFolder: leadsByFolder.map(item => ({
      folder: item._id,
      count: item.count,
      percentage: totalLeads > 0 ? (item.count / totalLeads) * 100 : 0
    }))
  };
};

// Static method to get top performers (admin only)
leadSchema.statics.getTopPerformers = async function () {
  return this.aggregate([
    {
      $match: {
        assignedTo: { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: '$assignedTo',
        leadsAssigned: { $sum: 1 },
        leadsConverted: {
          $sum: {
            $cond: [{ $eq: ['$status', 'Sales Done'] }, 1, 0]
          }
        }
      }
    },
    {
      $addFields: {
        conversionRate: {
          $cond: [
            { $gt: ['$leadsAssigned', 0] },
            { $multiply: [{ $divide: ['$leadsConverted', '$leadsAssigned'] }, 100] },
            0
          ]
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $project: {
        userId: '$_id',
        userName: '$user.name',
        leadsAssigned: 1,
        leadsConverted: 1,
        conversionRate: { $round: ['$conversionRate', 1] }
      }
    },
    {
      $sort: { conversionRate: -1, leadsConverted: -1 }
    },
    {
      $limit: 5
    }
  ]);
};

// Instance method to add note
// Replace your existing addNote method with this:
leadSchema.methods.addNote = function (content: string, createdBy: mongoose.Types.ObjectId) {
  this.notes.push({
    id: new mongoose.Types.ObjectId().toString(),
    content: content.trim(),
    createdBy: createdBy,
    createdAt: new Date()
  } as ILeadNote);

  // Use validateModifiedOnly: true to skip validation on old/broken notes
  return this.save({ validateModifiedOnly: true });
};

// Pre-save middleware to update lead score based on status
leadSchema.pre<ILead>('save', function (next) {
  if (this.isModified('status')) {
    const scoreMap: Record<LeadStatus, number> = {
      'New': 20,
      'Contacted': 30,
      'Interested': 50,
      'Not Interested': 10,
      'Follow-up': 40,
      'Qualified': 70,
      'Proposal Sent': 80,
      'Negotiating': 90,
      'Sales Done': 100,
      'DNP': 5,
      'Wrong Number': 0
    };

    this.leadScore = scoreMap[this.status] || 50;
  }
  next();
});

// Static method to check for duplicates
leadSchema.statics.findDuplicates = async function (email: string, phone: string, excludeId?: string) {
  const query: any = {
    $or: [
      { email: email.toLowerCase().trim() },
      { phone: phone.trim() }
    ]
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return this.find(query);
};

// Static method to get user-friendly duplicate error
leadSchema.statics.getDuplicateError = function (error: any) {
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    const value = error.keyValue[field];

    if (field === 'email') {
      return `A lead with email "${value}" already exists`;
    } else if (field === 'phone') {
      return `A lead with phone number "${value}" already exists`;
    }
    return 'A lead with this information already exists';
  }
  return null;
};

const Lead = mongoose.model<ILead>('Lead', leadSchema) as ILeadModel;

export default Lead;
