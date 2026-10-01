import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Lead from '../models/Lead';
import { createLeadWithDuplicateLink } from '../service/leadCreation.service';
import type { 
  ExcelUploadResult,
  LeadSource, 
  LeadPriority,
  ExcelFileAnalysis,
  ExcelSheetInfo,
  SheetPreviewData,
  ImportValidationResult,
  FieldMapping,
} from '../types';

// Valid enum values
const validSources: LeadSource[] = ['Website', 'Social Media', 'Referral', 'Import', 'Manual', 'Cold Call', 'Email Campaign'];
const validPriorities: LeadPriority[] = ['High', 'Medium', 'Low'];

// Utility function to convert scientific notation to regular numbers
const convertScientificNotation = (value: any): string => {
  if (typeof value === 'number') {
    // Convert number to string without scientific notation
    return value.toLocaleString('fullwide', { useGrouping: false });
  }
  
  if (typeof value === 'string') {
    // Check if it's in scientific notation format (e.g., "4.47879E+11")
    const scientificMatch = value.match(/^([+-]?\d*\.?\d+)[eE]([+-]?\d+)$/);
    if (scientificMatch) {
      const number = parseFloat(value);
      if (!isNaN(number)) {
        return number.toLocaleString('fullwide', { useGrouping: false });
      }
    }
  }
  
  return String(value).trim();
};

// Utility function to clean up phone numbers
const cleanPhoneNumber = (phone: string): string => {
  if (!phone) return phone;
  
  // Remove any unwanted characters but keep valid phone number characters
  let cleaned = phone.replace(/[^\d\+\-\(\)\s\.]/g, '');
  
  // If it starts with multiple zeros, likely an international number that lost its +
  if (cleaned.match(/^00\d/)) {
    cleaned = '+' + cleaned.substring(2);
  }
  
  return cleaned.trim();
};

// Utility function to clean up uploaded files
const cleanupUploadedFile = (filePath: string | undefined) => {
  if (filePath) {
    try {
      fs.unlinkSync(filePath);
      console.log('🗑️ Cleaned up uploaded file:', filePath);
    } catch (error) {
      console.error('Error deleting uploaded file:', error);
    }
  }
};

// ============================================================================
// SMART EXCEL IMPORT SYSTEM
// ============================================================================

/**
 * Analyze an uploaded Excel file and return information about all sheets
 */
export const analyzeExcelFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const uploadedFile = req.file;

    if (!uploadedFile) {
      res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
      return;
    }

    const filePath = uploadedFile.path;
    const fileExtension = path.extname(uploadedFile.originalname).toLowerCase();
    let workbook: XLSX.WorkBook;
    
    try {
      if (fileExtension === '.csv') {
        const csvData = fs.readFileSync(filePath, 'utf8');
        workbook = XLSX.read(csvData, { type: 'string' });
      } else {
        workbook = XLSX.readFile(filePath);
      }
    } catch (fileError) {
      fs.unlinkSync(filePath);
      res.status(400).json({
        success: false,
        message: 'Failed to read the uploaded file',
        errors: ['The file appears to be corrupted or in an unsupported format']
      });
      return;
    }

    const sheets: ExcelSheetInfo[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      
      // Get range to determine if sheet has data
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      const hasData = range.e.r > 0; // More than just header row
      
      // Extract column headers from first row
      const headers: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        const cell = worksheet[cellAddress];
        headers.push(cell ? String(cell.v).trim() : `Column ${col + 1}`);
      }

      sheets.push({
        name: sheetName,
        rowCount: hasData ? range.e.r : 0, // Total rows minus header
        columnHeaders: headers,
        hasData
      });
    }

    const analysis: ExcelFileAnalysis = {
      fileName: uploadedFile.originalname,
      fileSize: uploadedFile.size,
      sheets,
      uploadedAt: new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      message: 'File analyzed successfully',
      data: analysis
    });

  } catch (error) {
    console.error('File analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze Excel file',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  } finally {
    cleanupUploadedFile(req.file?.path);
  }
};

/**
 * Get preview data from a specific sheet
 */
export const getSheetPreview = async (req: Request, res: Response): Promise<void> => {
  try {
    const uploadedFile = req.file;
    const { sheetName, previewRows = 5 } = req.body;

    if (!uploadedFile) {
      res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
      return;
    }

    if (!sheetName) {
      res.status(400).json({
        success: false,
        message: 'Sheet name is required'
      });
      return;
    }

    const filePath = uploadedFile.path;
    const fileExtension = path.extname(uploadedFile.originalname).toLowerCase();
    let workbook: XLSX.WorkBook;
    
    try {
      if (fileExtension === '.csv') {
        const csvData = fs.readFileSync(filePath, 'utf8');
        workbook = XLSX.read(csvData, { type: 'string' });
    } else {
        workbook = XLSX.readFile(filePath);
      }
    } catch (fileError) {
      fs.unlinkSync(filePath);
      res.status(400).json({
        success: false,
        message: 'Failed to read the uploaded file'
      });
      return;
    }

    if (!workbook.Sheets[sheetName]) {
      res.status(400).json({
        success: false,
        message: `Sheet "${sheetName}" not found in the file`
      });
      return;
    }

    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to array format to get raw data
    const sheetData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      raw: true, // Keep raw values to avoid scientific notation
      defval: '' 
    });

    if (sheetData.length === 0) {
      res.status(400).json({
        success: false,
        message: 'The selected sheet appears to be empty'
      });
      return;
    }

    const headers = sheetData[0] as string[];
    const dataRows = sheetData.slice(1);
    const sampleRows = dataRows.slice(0, parseInt(previewRows as string, 10))
      .map(row => (row as any[]).map((cell, index) => {
        let converted = convertScientificNotation(cell);
        // Clean phone numbers if the header suggests it's a phone field
        const header = headers[index]?.toLowerCase() || '';
        if (header.includes('phone') || header.includes('contact') || header.includes('mobile')) {
          converted = cleanPhoneNumber(converted);
        }
        return converted;
      }));

    const previewData: SheetPreviewData = {
      headers: headers.map(h => String(h).trim()),
      sampleRows,
      totalRows: dataRows.length
    };

    res.status(200).json({
      success: true,
      message: 'Sheet preview generated successfully',
      data: previewData
    });

  } catch (error) {
    console.error('Sheet preview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate sheet preview',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  } finally {
    cleanupUploadedFile(req.file?.path);
  }
};

/**
 * Import leads using smart field mapping
 */
export const importWithMapping = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get system user for import notes
    const User = mongoose.model('User');
    const systemUser = await User.findOne({ email: 'system@leadmanager.com' });
    if (!systemUser) {
      res.status(500).json({
        success: false,
        message: 'System user not found for import operations',
        errors: ['Please run the seed script to create the system user']
      });
      return;
    }
    
    const uploadedFile = req.file;
  
    if (!uploadedFile) {
      res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
      return;
    }

    // Parse form data - fieldMappings comes as JSON string via FormData
    const sheetName = req.body.sheetName;
    const skipEmptyRows = req.body.skipEmptyRows === 'true';
    const startFromRow = parseInt(req.body.startFromRow, 10) || 2;
    
    let fieldMappings: FieldMapping[];
    
    try {
      fieldMappings = JSON.parse(req.body.fieldMappings) as FieldMapping[];
    } catch (parseError) {
      res.status(400).json({
        success: false,
        message: 'Invalid field mappings format',
        errors: ['Field mappings must be valid JSON']
      });
      return;
    }

    if (!sheetName || !fieldMappings || fieldMappings.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Sheet name and field mappings are required'
      });
      return;
    }

    // Validate that required fields are mapped
    const requiredFields = ['name', 'email', 'phone'];
    const mappedFields = fieldMappings.map(m => m.leadField);
    const missingRequired = requiredFields.filter(field => !mappedFields.includes(field));

    if (missingRequired.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Required fields must be mapped',
        errors: [`Missing mappings for: ${missingRequired.join(', ')}`]
      });
      return;
    }

    const filePath = uploadedFile.path;
    const fileExtension = path.extname(uploadedFile.originalname).toLowerCase();
    let workbook: XLSX.WorkBook;
    
    try {
      if (fileExtension === '.csv') {
        const csvData = fs.readFileSync(filePath, 'utf8');
        workbook = XLSX.read(csvData, { type: 'string' });
      } else {
        workbook = XLSX.readFile(filePath);
      }
    } catch (fileError) {
      fs.unlinkSync(filePath);
      res.status(400).json({
        success: false,
        message: 'Failed to read the uploaded file'
      });
      return;
    }

    if (!workbook.Sheets[sheetName]) {
      res.status(400).json({
        success: false,
        message: `Sheet "${sheetName}" not found`
      });
      return;
    }

    const worksheet = workbook.Sheets[sheetName];
    const sheetData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      raw: true, // Keep raw values to avoid scientific notation
      defval: '' 
    });

    if (sheetData.length < startFromRow) {
      res.status(400).json({
        success: false,
        message: 'Not enough data rows in the sheet'
      });
      return;
    }

    const headers = sheetData[0] as string[];
    const dataRows = sheetData.slice(startFromRow - 1);

    // Create column index mapping
    const columnIndexMap: { [key: string]: number } = {};
    headers.forEach((header, index) => {
      columnIndexMap[header.trim()] = index;
    });

    const validationResults: ImportValidationResult[] = [];
    const validLeads: any[] = [];
    const createdLeads: any[] = [];

    // Process each row
    for (let i = 0; i < dataRows.length; i++) {
      const rowData = dataRows[i] as string[];
      const rowNumber = startFromRow + i;

      // Skip empty rows if requested
      if (skipEmptyRows && rowData.every(cell => !cell || String(cell).trim() === '')) {
        continue;
      }

      // Map Excel columns to lead fields
      const mappedData: any = {};
      const rowErrors: Array<{ field: string; message: string; value: any }> = [];

      for (const mapping of fieldMappings) {
        // Skip notes field as it's handled separately
        if (mapping.leadField === 'notes') {
          continue;
        }
        
        const columnIndex = columnIndexMap[mapping.excelColumn];
        let value = '';

        if (columnIndex !== undefined && rowData[columnIndex] !== undefined) {
          // Use scientific notation conversion for better data handling
          value = convertScientificNotation(rowData[columnIndex]);
          
          // Apply phone number cleanup for phone fields
          if (mapping.leadField === 'phone') {
            value = cleanPhoneNumber(value);
          }
        } else if (mapping.defaultValue) {
          value = mapping.defaultValue;
        }

        mappedData[mapping.leadField] = value;

        // Validate required fields
        if (mapping.isRequired && (!value || value === '')) {
          rowErrors.push({
            field: mapping.leadField,
            message: `${mapping.leadField} is required`,
            value: value
          });
        }
      }

      // Process notes from the notes field mapping
      const notes: Array<{ content: string; createdBy: mongoose.Types.ObjectId }> = [];
      const notesMapping = fieldMappings.find(m => m.leadField === 'notes');
      if (notesMapping && notesMapping.excelColumn) {
        const noteColumns = notesMapping.excelColumn.split(',').map(col => col.trim());
        for (const excelColumn of noteColumns) {
          const columnIndex = columnIndexMap[excelColumn];
          if (columnIndex !== undefined && rowData[columnIndex] !== undefined) {
            const noteContent = convertScientificNotation(rowData[columnIndex]);
            if (noteContent && noteContent.trim() !== '') {
              notes.push({
                content: noteContent.trim(),
                createdBy: systemUser._id
              });
            }
          }
        }
      }

      // Always set notes to an array (empty if no notes)
      mappedData.notes = notes;

      // Additional validations
      if (mappedData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mappedData.email)) {
        rowErrors.push({
            field: 'email',
          message: 'Invalid email format',
          value: mappedData.email
        });
      }

      // Validate source and priority if provided
      if (mappedData.source && !validSources.includes(mappedData.source as LeadSource)) {
        mappedData.source = 'Import'; // Default fallback
      }

      if (mappedData.priority && !validPriorities.includes(mappedData.priority as LeadPriority)) {
        mappedData.priority = 'Medium'; // Default fallback
      }

      // Set defaults for missing optional fields
      mappedData.source = mappedData.source || 'Import';
      mappedData.priority = mappedData.priority || 'Medium';
      mappedData.status = 'New';
      mappedData.position = mappedData.position || '';
      mappedData.folder = mappedData.folder || '';

      const validationResult: ImportValidationResult = {
        isValid: rowErrors.length === 0,
        rowNumber,
        data: mappedData,
        errors: rowErrors
      };

      validationResults.push(validationResult);

      if (validationResult.isValid) {
        validLeads.push(mappedData);
      }
    }

    // Create leads in database with duplicate detection
    const errors: Array<{ row: number; field: string; message: string }> = [];

    for (const leadData of validLeads) {
      try {
        const savedLead = await createLeadWithDuplicateLink({ ...leadData, assignedBy: systemUser._id });
        createdLeads.push(savedLead);
        
      } catch (error: any) {
        const validationError = validationResults.find(vr => vr.data === leadData);
        const rowNumber = validationError?.rowNumber || 0;
        
        // Handle MongoDB duplicate key errors
        const duplicateError = (Lead as any).getDuplicateError(error);
        if (duplicateError) {
          errors.push({
            row: rowNumber,
            field: 'duplicate',
            message: duplicateError
          });
        } else {
        errors.push({
            row: rowNumber,
            field: 'general',
            message: error.message || 'Failed to create lead'
        });
      }
    }
    }

    // Add validation errors to errors array
    validationResults.forEach(vr => {
      if (!vr.isValid) {
        vr.errors.forEach(err => {
          errors.push({
            row: vr.rowNumber,
            field: err.field,
            message: err.message
          });
        });
      }
    });

    const result: ExcelUploadResult = {
      success: true,
      message: `Successfully imported ${createdLeads.length} leads`,
      data: {
        totalRows: dataRows.length,
        successfulImports: createdLeads.length,
        failedImports: errors.length,
        errors,
        leads: createdLeads
      }
    };

    res.status(200).json(result);

  } catch (error) {
    console.error('Dynamic import error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import leads',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  } finally {
    // Clean up uploaded file
    cleanupUploadedFile(req.file?.path);
  }
};

/**
 * Get available lead fields for mapping
 */
export const getLeadFields = async (_req: Request, res: Response): Promise<void> => {
  try {
    const leadFields = [
      { 
        name: 'name', 
        label: 'Full Name', 
        type: 'string', 
        required: true,
        description: 'Contact\'s full name'
      },
      { 
        name: 'email', 
        label: 'Email Address', 
        type: 'email', 
        required: true,
        description: 'Valid email address'
      },
      { 
        name: 'phone', 
        label: 'Phone Number', 
        type: 'string', 
        required: true,
        description: 'Contact phone number'
      },
      { 
        name: 'position', 
        label: 'Job Title', 
        type: 'string', 
        required: false,
        description: 'Job title or position'
      },
      { 
        name: 'folder', 
        label: 'Folder', 
        type: 'string', 
        required: false,
        description: 'Folder to organize leads (e.g., UK, USA, Germany)'
      },
      { 
        name: 'source', 
        label: 'Lead Source', 
        type: 'enum', 
        required: false,
        options: validSources,
        defaultValue: 'Import',
        description: 'How the lead was acquired'
      },
      { 
        name: 'priority', 
        label: 'Priority Level', 
        type: 'enum', 
        required: false,
        options: validPriorities,
        defaultValue: 'Medium',
        description: 'Lead priority level'
      }
    ];

    res.status(200).json({
      success: true,
      message: 'Lead fields retrieved successfully',
      data: leadFields
    });

  } catch (error) {
    console.error('Get lead fields error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve lead fields',
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
};
