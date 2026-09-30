import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { connectDatabase } from './utils/database';
import routes from './routes';
import { 
  errorHandler, 
  notFoundHandler, 
  createRateLimiter, 
  requestLogger,
  bodyParserErrorHandler,
  securityHeaders,
  healthCheck,
  corsOptions
} from './middleware';
import User from './models/User';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// 🚨 IMPORTANT: create HTTP server ONCE
const httpServer = http.createServer(app);

// ================= SOCKET.IO SETUP =================
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
import { runZoomPhoneSync } from './corn';

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('join', (userId: string) => {
    socket.join(userId); // room = userId
    console.log(`👤 User joined room: ${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', socket.id);
  });
});
// ==================================================

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false // Allow embedding for development
}));
app.use(cors(corsOptions));
app.use(securityHeaders);

// Rate limiting - applies to all /api routes but skips authenticated users
const limiter = createRateLimiter(
  Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100 // 100 requests per window
);
app.use('/api', limiter);

// Compression & logging
app.use(compression());
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
  app.use(requestLogger);
} else {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ 
  limit: process.env.UPLOAD_MAX_SIZE || '10mb',
  strict: true
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.UPLOAD_MAX_SIZE || '10mb' 
}));
app.use(bodyParserErrorHandler);

// Static file serving for uploads (create uploads directory if it doesn't exist)
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Health check endpoint
app.get('/health', healthCheck);

// API routes
app.use(process.env.API_PREFIX || '/api', routes);

// Temporary route for testing
app.get('/api/test', (_req, res) => {
  res.json({
    success: true,
    message: 'Lead Manager API is working!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Lead Manager API',
    version: '1.0.0',
    status: 'Running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      api: '/api',
      test: '/api/test'
    }
  });
});


// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Function to ensure system user exists
const ensureSystemUser = async (): Promise<void> => {
  try {
    const systemUser = await User.findOne({ email: 'system@leadmanager.com' });
    
    if (!systemUser) {
      console.log('🔧 Creating system user...');
      await User.create({
        name: 'System',
        email: 'system@leadmanager.com',
        password: 'system123456', // let pre-save hook hash it
        role: 'admin',
        isActive: true
      });
      console.log('✅ System user created successfully');
    } else {
      console.log('✅ System user already exists');
    }
  } catch (error) {
    console.error('❌ Failed to ensure system user exists:', error);
  }
};


// const gracefulShutdown = (signal: string) => {
//   console.log(`📴 Received ${signal}, shutting down gracefully`);
  
//   // Close server
//   server.close((err: Error | undefined) => {
//     if (err) {
//       console.error('❌ Error during server close:', err);
//       process.exit(1);
//     }
    
//     console.log('📴 HTTP server closed');
//     process.exit(0);
//   });
  
//   // Force close after 10 seconds
//   setTimeout(() => {
//     console.error('❌ Forced shutdown after timeout');
//     process.exit(1);
//   }, 10000);
// };

// // Start server
// const startServer = async (): Promise<any> => {
//   try {
//     // Connect to database
//     await connectDatabase();
    
//     // Ensure system user exists
//     await ensureSystemUser();



// ================= SERVER START =================
let server: http.Server;

const startServer = async () => {
  try {
    await connectDatabase();
    await ensureSystemUser();
    void runZoomPhoneSync();

    server = httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 API Base URL: http://localhost:${PORT}${process.env.API_PREFIX || '/api'}`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🧪 Test Endpoint: http://localhost:${PORT}/api/test`);
      }
    });

        // Set keep-alive timeout
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // Handle graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// ================= GRACEFUL SHUTDOWN =================
const shutdown = () => {
  console.log('📴 Shutting down...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

// Safety
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// Start
startServer();

export default app;
