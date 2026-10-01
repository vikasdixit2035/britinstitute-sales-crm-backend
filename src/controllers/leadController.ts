import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Lead from '../models/Lead';
import RetargetingLead from '../models/RetargetingLead';
import type { 
  CreateLeadInput, 
  UpdateLeadInput, 
  AssignLeadInput, 
  AddNoteInput
} from '../types';
import { assignLeadsService, countRetargetingLeads, getAdminLeadStatsService, getAllChatsService, getDuplicateAndUncategorizedCountService, getDuplicateLeadsService, getLeadsService, getMyLeadsService, importLeadsFromGoogleSheetService, searchLeadsService } from '../service/lead.service';
import { sendError } from '../utils/sendError';
import { getLeadDateFilter } from '../utils/leadDateFilter';
import { sendMetaStatusFeedback } from '../service/makeMeta.service';
import { parseStatusReminder, replaceLeadStatusReminder } from '../service/statusReminder.service';
import { createLeadWithDuplicateLink } from '../service/leadCreation.service';




export const getLeads = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const pageNum = parseInt((req.query.page as string) || '1', 10);
    const limitNum = parseInt((req.query.limit as string) || '10', 10);

    //  Duplicate folder flow (UNCHANGED)
    if (req.query.folder === 'Duplicatelll') {
      const { leads, total } = await getDuplicateLeadsService(req);

      const totalPages = Math.ceil(total / limitNum);

      res.status(200).json({
        success: true,
        message: 'Duplicate leads retrieved successfully',
        data: leads,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages
        }
      });
      return;
    }

    // Normal leads flow (UNCHANGED)
    const { leads, total } = await getLeadsService(req);
    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      success: true,
      message: 'Leads retrieved successfully--;',
      data: leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get leads error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve leads',
      errors: [
        error instanceof Error
          ? error.message
          : 'Unknown error occurred'
      ]
    });
  }
};


export const searchLeads = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { leads, total } = await searchLeadsService(req);

    res.status(200).json({
      success: true,
      message: 'Leads searched successfully',
      data: leads,
      total
    });
  } catch (error) {
    console.error('Search leads error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to search leads',
      errors: [
        error instanceof Error ? error.message : 'Unknown error occurred'
      ]
    });
  }
};





export const getLeadById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const lead = await Lead.findById(id)
      .populate('assignedToUser', 'name email')
      .populate('assignedByUser', 'name email')
      .populate('duplicateOf', 'name email phone status folder')
      .populate('notes.createdBy', 'name email');

    if (!lead) {
      res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
      return;
    }

    // Check if user can access this lead
    if (req.user?.role !== 'admin' && String(lead.assignedTo) !== String(req.user?.userId)) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    const populatedDuplicateOf = lead.duplicateOf as unknown as { _id?: mongoose.Types.ObjectId } | undefined;
    const duplicateRootId = populatedDuplicateOf?._id || lead.duplicateOf || lead._id;
    const duplicateLinks = await Lead.find({ duplicateOf: duplicateRootId })
      .sort({ duplicateSequence: 1, createdAt: 1 })
      .select('_id name status duplicateSequence duplicateLabel')
      .lean();

    res.status(200).json({
      success: true,
      message: 'Lead retrieved successfully',
      data: {
        ...lead.toObject(),
        duplicateLinks
      }
    });
  } catch (error) {
    console.error('Get lead by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve lead',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};

export const createLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const leadData: CreateLeadInput = req.body;

    // Validate required fields - only name, email, and phone are required
    const requiredFields = ['name', 'email', 'phone'];
    const missingFields = requiredFields.filter(field => !leadData[field as keyof CreateLeadInput]);
    
    if (missingFields.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields',
        errors: [`Required fields: ${missingFields.join(', ')}`]
      });
      return;
    }

    const {notes, ...leadFields} = leadData;
    const lead = await createLeadWithDuplicateLink({
      ...leadFields,
      status: 'New',
      assignedBy: req.user?.userId,
      notes: notes ? [{
        id: new mongoose.Types.ObjectId().toString(),
        content: notes,
        createdBy: new mongoose.Types.ObjectId(req.user?.userId || ''),
        createdAt: new Date()
      }] : []
    });

    // Populate the response
    await lead.populate('assignedByUser', 'name email');

    res.status(201).json({
      success: true,
      message: lead.duplicateOf
        ? `${lead.duplicateLabel} lead created, unassigned and linked to the older lead`
        : 'Lead created successfully',
      data: lead
    });
  } catch (error: any) {
    console.error('Create lead error:', error);
    
    // Handle MongoDB duplicate key errors
    const duplicateError = (Lead as any).getDuplicateError(error);
    if (duplicateError) {
      res.status(400).json({
        success: false,
        message: 'Duplicate lead detected',
        errors: [duplicateError]
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create lead',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};

export const updateLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData: UpdateLeadInput = req.body;

    const lead = await Lead.findById(id);
    if (!lead) {
      res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
      return;
    }

    const previousStatus = lead.status;
    const requestedStatus = typeof updateData.status === 'string' ? updateData.status.trim() : undefined;
    const statusWillChange = Boolean(requestedStatus && requestedStatus !== previousStatus);
    let parsedStatusReminder: ReturnType<typeof parseStatusReminder> = null;
    if (statusWillChange && requestedStatus) {
      try {
        parsedStatusReminder = parseStatusReminder(requestedStatus, updateData.statusReminder);
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error instanceof Error ? error.message : 'Invalid reminder schedule'
        });
        return;
      }
      updateData.status = requestedStatus;
    }

    // Check if user can update this lead
    if (req.user?.role !== 'admin' && String(lead.assignedTo) !== String(req.user?.userId)) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    // Check for duplicates if email or phone is being updated
    if (updateData.email && updateData.email.toLowerCase().trim() !== lead.email) {
      const existingEmail = await Lead.findOne({ 
        email: updateData.email.toLowerCase().trim(),
        _id: { $ne: id }
      });
      if (existingEmail) {
        res.status(400).json({
          success: false,
          message: 'Duplicate lead detected',
          errors: [`A lead with email "${updateData.email}" already exists`],
          data: {
            existingLead: {
              _id: existingEmail._id,
              name: existingEmail.name,
              email: existingEmail.email,
              phone: existingEmail.phone
            }
          }
        });
        return;
      }
    }
    
    if (updateData.phone && updateData.phone.trim() !== lead.phone) {
      const existingPhone = await Lead.findOne({ 
        phone: updateData.phone.trim(),
        _id: { $ne: id }
      });
      if (existingPhone) {
        res.status(400).json({
          success: false,
          message: 'Duplicate lead detected',
          errors: [`A lead with phone number "${updateData.phone}" already exists`],
          data: {
            existingLead: {
              _id: existingPhone._id,
              name: existingPhone.name,
              email: existingPhone.email,
              phone: existingPhone.phone
            }
          }
        });
        return;
      }
    }
    if (Array.isArray(req.body.notes)) {
      req.body.notes = req.body.notes.filter((n: any) => n.content && n.createdBy);
      if (req.body.notes.length === 0) {
        delete req.body.notes;
      }
    }
    // Update allowed fields
    const allowedFields = [
      'name',
      'email',
      'phone',
      'whatsapp',
      'zoomPhoneNumber',
      'position',
      'folder',
      'source',
      'status',
      'priority'
    ];
    allowedFields.forEach(field => {
      if (updateData[field as keyof UpdateLeadInput] !== undefined) {
        (lead as any)[field] = updateData[field as keyof UpdateLeadInput];
      }
    });

    await lead.save({ validateModifiedOnly: true });

    if (statusWillChange) {
      await replaceLeadStatusReminder({
        leadId: lead._id,
        leadName: lead.name,
        userId: lead.assignedTo || req.user!.userId,
        schedule: parsedStatusReminder
      });
    }

    if (previousStatus !== lead.status && lead.metaLeadId) {
      await sendMetaStatusFeedback(lead, previousStatus);
    }

    // Populate the response
    await lead.populate('assignedToUser', 'name email');
    await lead.populate('assignedByUser', 'name email');

    res.status(200).json({
      success: true,
      message: 'Lead updated successfully',
      data: lead
    });
  } catch (error: any) {
    console.error('Update lead error:', error);
    
    // Handle MongoDB duplicate key errors
    const duplicateError = (Lead as any).getDuplicateError(error);
    if (duplicateError) {
      res.status(400).json({
        success: false,
        message: 'Duplicate lead detected',
        errors: [duplicateError]
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to update lead',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};

export const deleteLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Only admins can delete leads
    if (req.user?.role !== 'admin') {
      res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
      return;
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
      return;
    }

    await Promise.all([
      Lead.findByIdAndDelete(id),
      RetargetingLead.deleteMany({ existingLeadId: lead._id })
    ]);

    res.status(200).json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete lead',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};

export const assignLeads = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // ✅ Admin check
    if (req.user?.role !== 'admin') {
      const err: any = new Error('Admin access required');
      err.statusCode = 403;
      throw err;
    }

    const payload = req.body as AssignLeadInput;

    const result = await assignLeadsService(
      payload,
      req.user!.userId.toString()
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} leads assigned successfully`,
      data: result.leads
    });
  } catch (error) {
    console.error('Assign leads error:', error);
    sendError(res, error, 500);
  }
};

export const unassignLeads = async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadIds }: { leadIds: string[] } = req.body;

    // Only admins can unassign leads
    if (req.user?.role !== 'admin') {
      res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
      return;
    }

    // Validate input
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Lead IDs are required',
        errors: ['Please provide an array of lead IDs']
      });
      return;
    }

    // Update leads to unassign them
    const result = await Lead.updateMany(
      { _id: { $in: leadIds } },
      { 
        $unset: { 
          assignedTo: 1,
          assignedBy: 1
        },
        updatedAt: new Date()
      }
    );

    // Get updated leads
    const updatedLeads = await Lead.find({ _id: { $in: leadIds } })
      .populate('assignedToUser', 'name email')
      .populate('assignedByUser', 'name email');

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} leads unassigned successfully`,
      data: updatedLeads
    });
  } catch (error) {
    console.error('Unassign leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unassign leads',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};

export const bulkUpdateStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadIds, status, statusReminder }: {
      leadIds: string[];
      status: string;
      statusReminder?: UpdateLeadInput['statusReminder'];
    } = req.body;

    // Validate input
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Lead IDs are required',
        errors: ['Please provide an array of lead IDs']
      });
      return;
    }

    if (!status || typeof status !== 'string' || status.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Status is required',
        errors: ['Please provide a valid status']
      });
      return;
    }

    const normalizedStatus = status.trim();
    const changedLeads = await Lead.find({
      _id: { $in: leadIds },
      status: { $ne: normalizedStatus }
    });
    let parsedStatusReminder: ReturnType<typeof parseStatusReminder> = null;
    if (changedLeads.length > 0) {
      try {
        parsedStatusReminder = parseStatusReminder(normalizedStatus, statusReminder);
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error instanceof Error ? error.message : 'Invalid reminder schedule'
        });
        return;
      }
    }

    // Update leads' status
    const result = await Lead.updateMany(
      { _id: { $in: leadIds }, status: { $ne: normalizedStatus } },
      { 
        $set: { 
          status: normalizedStatus,
          // folder:status.trim(),
          updatedAt: new Date()
        }
      }
    );

    // Fetch updated leads
    const updatedLeads = await Lead.find({ _id: { $in: leadIds } })
      .populate('assignedToUser', 'name email')
      .populate('assignedByUser', 'name email');

    await Promise.all(changedLeads.map((lead) => replaceLeadStatusReminder({
      leadId: lead._id,
      leadName: lead.name,
      userId: lead.assignedTo || req.user!.userId,
      schedule: parsedStatusReminder
    })));

    await Promise.all(changedLeads.filter((lead) => lead.metaLeadId).map(async (lead) => {
      const previousStatus = lead.status;
      lead.status = normalizedStatus;
      await sendMetaStatusFeedback(lead, previousStatus);
    }));

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} lead${result.modifiedCount !== 1 ? 's' : ''} updated to "${status}"`,
      data: updatedLeads
    });
  } catch (error) {
    console.error('Bulk update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update lead statuses',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};

export const addNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadId, content }: AddNoteInput = req.body;

    // Validate input
    if (!leadId || !content) {
      res.status(400).json({
        success: false,
        message: 'Lead ID and note content are required',
        errors: ['Please provide both lead ID and note content']
      });
      return;
    }

    if (content.trim().length < 1) {
      res.status(400).json({
        success: false,
        message: 'Note content cannot be empty',
        errors: ['Please provide valid note content']
      });
      return;
    }

    const lead = await Lead.findById(leadId);
    if (!lead) {
      res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
      return;
    }

    // Check if user can add notes to this lead
    if (req.user?.role !== 'admin' && String(lead.assignedTo) !== String(req.user?.userId)) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    // Add note using the model method
    if (!req.user?.userId) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
        errors: ['Please provide a valid user ID']
      });
      return;
    }

    // --- FIX STARTS HERE ---
    // Clean up existing notes array to remove any invalid/empty objects that block saving
    if (lead.notes && Array.isArray(lead.notes)) {
      lead.notes = lead.notes.filter(note => note && note.content && note.createdBy) as any;
    }
    
    // Call the method to add the new note
    await lead.addNote(content.trim(), new mongoose.Types.ObjectId(req.user.userId));
    // --- FIX ENDS HERE ---

    // Populate the response
    await lead.populate('assignedToUser', 'name email');
    await lead.populate('assignedByUser', 'name email');
    await lead.populate('notes.createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Note added successfully',
      data: lead
    });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add note',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};


export const getMyLeads = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const result = await getMyLeadsService(req);

    const totalPages = Math.ceil(result.total / result.limit);

    res.status(200).json({
      success: true,
      message: 'My leads retrieved successfully',
      data: result.leads,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get my leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve your leads',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};


// Get distinct folders for filtering
export const getDistinctFolders = async (req: Request, res: Response): Promise<void> => {
  try {
    // Build filter based on user role
    const filter: any = {};
    
    // If user is not admin, only show folders from their assigned leads
    if (req.user?.role !== 'admin') {
      filter.assignedTo = req.user?.userId;
    }

    // Get distinct folders, excluding empty ones
    const folders = await Lead.distinct('folder', {
      ...filter,
      folder: { $nin: ['', null], $exists: true }
    });

    // Sort folders alphabetically
    folders.sort((a, b) => a.localeCompare(b));

    res.status(200).json({
      success: true,
      message: 'Distinct folders retrieved successfully',
      data: folders
    });
  } catch (error) {
    console.error('Get distinct folders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve distinct folders',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};

// Get stats for all leads assigned to the current user (independent of filters or pagination)
export const getMyLeadsStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter = {
      assignedTo: req.user?.userId,
      ...getLeadDateFilter(req.query as Record<string, unknown>)
    };
    const leads = await Lead.find(filter).lean();

    const total = leads.length;
    const newLeads = leads.filter(lead => lead.status === 'New').length;
    const inProgress = leads.filter(lead =>
      ['Contacted', 'Interested', 'Follow-up', 'Qualified', 'Proposal Sent', 'Negotiating'].includes(lead.status)
    ).length;
    const closed = leads.filter(lead =>
      ['Sales Done', 'DNP'].includes(lead.status)
    ).length;

    res.status(200).json({
      success: true,
      message: 'My leads stats retrieved successfully',
      data: { total, newLeads, inProgress, closed }
    });
  } catch (error) {
    console.error('Get my leads stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve your leads stats',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};

// Get folder counts for leads (optimized for performance)
// Get folder and status counts for leads (Optimized)



// Change return type to Promise<any> to allow returning the sendError response




export const getFolderCounts = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, { message: 'User not authenticated' }, 401);

    const userObjectId = new mongoose.Types.ObjectId(userId as string);

    const dateFilter = getLeadDateFilter(req.query as Record<string, unknown>);

    const [statsData, retargetingCount] = await Promise.all([Lead.aggregate([
      { $match: { assignedTo: userObjectId, ...dateFilter } },
      {
        $facet: {
          // Count every single lead assigned to this user
          totalLeads: [{ $count: "count" }],
          // Group by folder as usual
          folderCounts: [
            {
              $group: {
                _id: "$folder",
                count: { $sum: 1 }
              }
            }
          ],
          statusCounts: [
            {
              $group: {
                _id: { $ifNull: ['$status', 'Unknown'] },
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]), countRetargetingLeads(dateFilter, userId)]);

    const result = {
      folderStats: {} as Record<string, number>,
      statusStats: {} as Record<string, number>
    };

    if (statsData[0]) {
      // 1. Process standard folders (exclude empty/null from the main list if you want)
      statsData[0].folderCounts.forEach((item: any) => {
        if (item._id && item._id !== "") {
          result.folderStats[item._id] = item.count;
        }
      });

      // 2. Set "Uncategorized" to the TOTAL count of all leads
      const totalCount = statsData[0].totalLeads[0]?.count || 0;
      result.folderStats['Uncategorized'] = totalCount;

      // 3. Process Statuses
      statsData[0].statusCounts.forEach((item: any) => {
        result.statusStats[item._id] = item.count;
      });
    }
    if (retargetingCount > 0) result.folderStats.Retargeting = retargetingCount;

    return res.status(200).json({
      success: true,
      message: 'Lead statistics retrieved successfully',
      data: result
    });

  } catch (error) {
    console.error('Get stats error:', error);
    return sendError(res, error, 500);
  }
};


;





export const getFolderCountsForAdmin = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) return sendError(res, { message: 'User not authenticated' }, 401);

    // 1. Build the filter based on Role
    let baseFilter: any = {};

    if (userRole !== 'admin') {
      // If NOT admin, strictly filter by their ID
      const userObjectId = new mongoose.Types.ObjectId(userId as string);
      baseFilter = { 
        $or: [
          { assignedTo: userObjectId },
          { assignedTo: String(userId) }
        ]
      };
    } 
    // If user IS admin, baseFilter remains {}, which matches ALL leads in the DB
    baseFilter = {
      ...baseFilter,
      ...getLeadDateFilter(req.query as Record<string, unknown>)
    };

    const [statsData, retargetingCount] = await Promise.all([Lead.aggregate([
      { $match: baseFilter }, // Filter applied here
      {
        $facet: {
          totalLeads: [{ $count: "count" }],
          folderCounts: [
            {
              $group: {
                _id: "$folder",
                count: { $sum: 1 }
              }
            }
          ],
          statusCounts: [
            {
              $group: {
                _id: { $ifNull: ['$status', 'Unknown'] },
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]), countRetargetingLeads(
      getLeadDateFilter(req.query as Record<string, unknown>),
      userRole === 'admin' ? undefined : userId
    )]);

    const result = {
      folderStats: {} as Record<string, number>,
      statusStats: {} as Record<string, number>
    };

    if (statsData[0]) {
      // Process Folders
      statsData[0].folderCounts.forEach((item: any) => {
        if (item._id && String(item._id).trim() !== "") {
          result.folderStats[item._id] = item.count;
        }
      });

      // Set "Uncategorized" as the TOTAL count
      const totalCount = statsData[0].totalLeads[0]?.count || 0;
      result.folderStats['Uncategorized'] = totalCount;

      // Process Statuses
      statsData[0].statusCounts.forEach((item: any) => {
        result.statusStats[item._id] = item.count;
      });
    }
    if (retargetingCount > 0) result.folderStats.Retargeting = retargetingCount;

    return res.status(200).json({
      success: true,
      message: 'Lead statistics retrieved successfully',
      data: result
    });

  } catch (error) {
    console.error('Get stats error:', error);
    return sendError(res, error, 500);
  }
};

export const importLeadsFromGoogleSheet = async (
  req: Request,
  res: Response
) => {
  try {
    const { sheetUrl } = req.body;

    const result = await importLeadsFromGoogleSheetService(sheetUrl);

    return res.status(200).json({
      success: true,
      message: 'Google Sheet processed successfully',
      ...result,
      note: 'Duplicate leads moved to duplicate collection'
    });
  } catch (error) {
    return sendError(res, error);
  }
};


export const getDuplicateAndUncategorizedCounts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const counts = await getDuplicateAndUncategorizedCountService(req);

    res.status(200).json({
      success: true,
      message: 'Lead counts retrieved successfully',
      data: counts
    });
  } catch (error) {
    console.error('Get lead counts error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve lead counts',
      errors: [
        error instanceof Error
          ? error.message
          : 'Unknown error occurred'
      ]
    });
  }
};




export const getAllChats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // RBAC Check: Ensure only admins can access all chats
    if (req.user?.role !== 'admin') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const result = await getAllChatsService(req);
    const totalPages = Math.ceil(result.total / result.limit);

    res.status(200).json({
      success: true,
      message: 'All user chats retrieved successfully',
      data: result.chats,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get all chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve chat history',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};


export const getAdminLeadStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Only Admin can see global lead influx
    if (req.user?.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Admin access required' });
      return;
    }

    const stats = await getAdminLeadStatsService(req.query);

    res.status(200).json({
      success: true,
      message: 'Admin lead statistics retrieved successfully',
      data: stats
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve stats',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};
