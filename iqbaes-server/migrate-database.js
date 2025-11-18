import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Import old models
import User from './models/User.js';
import Log from './models/Log.js';

// Import new models
import UserSecurity from './models/UserSecurity.js';
import UserEnrollments from './models/UserEnrollments.js';
import SecurityLogs from './models/SecurityLogs.js';
import AuthenticationLogs from './models/AuthenticationLogs.js';
import AuditLogs from './models/AuditLogs.js';
import SystemLogs from './models/SystemLogs.js';
import AlertResolutions from './models/AlertResolutions.js';

dotenv.config();

class DatabaseMigration {
  constructor() {
    this.stats = {
      usersProcessed: 0,
      userSecurityCreated: 0,
      userEnrollmentsCreated: 0,
      logsProcessed: 0,
      securityLogsCreated: 0,
      authLogsCreated: 0,
      auditLogsCreated: 0,
      systemLogsCreated: 0,
      alertsCreated: 0,
      errors: []
    };
  }

  async connect() {
    try {
      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
      if (!mongoUri) {
        throw new Error('MongoDB URI not found in environment variables');
      }
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      process.exit(1);
    }
  }

  async migrateUsers() {
    console.log('\n🔄 Starting User data migration...');
    
    try {
      const users = await User.find({}).lean();
      console.log(`Found ${users.length} users to migrate`);

      for (const user of users) {
        this.stats.usersProcessed++;
        
        try {
          // Create UserSecurity record if user has security fields
          if (user.loginAttempts !== undefined || user.lockUntil || user.lastLogin || user.passwordChangedAt || user.isActive !== undefined) {
            const userSecurity = new UserSecurity({
              userId: user._id,
              loginAttempts: user.loginAttempts || 0,
              lockUntil: user.lockUntil,
              lastLogin: user.lastLogin,
              passwordChangedAt: user.passwordChangedAt,
              isActive: user.isActive !== undefined ? user.isActive : true,
              twoFactorEnabled: false,
              sessionTokens: []
            });
            
            await userSecurity.save();
            this.stats.userSecurityCreated++;
          }

          // Create UserEnrollments records if user has enrolledCourseIds
          if (user.enrolledCourseIds && user.enrolledCourseIds.length > 0) {
            for (const courseId of user.enrolledCourseIds) {
              const enrollment = new UserEnrollments({
                userId: user._id,
                courseId: courseId,
                enrolledAt: user.createdAt || new Date(),
                status: 'active',
                progress: {
                  examsCompleted: 0,
                  totalExams: 0,
                  averageScore: 0
                }
              });
              
              await enrollment.save();
              this.stats.userEnrollmentsCreated++;
            }
          }

          // Update User document to remove migrated fields
          await User.updateOne(
            { _id: user._id },
            { 
              $unset: {
                loginAttempts: 1,
                lockUntil: 1,
                lastLogin: 1,
                passwordChangedAt: 1,
                isActive: 1,
                enrolledCourseIds: 1
              }
            }
          );

        } catch (error) {
          console.error(`Error migrating user ${user._id}:`, error.message);
          this.stats.errors.push(`User ${user._id}: ${error.message}`);
        }
      }

      console.log(`✅ User migration completed: ${this.stats.userSecurityCreated} UserSecurity records, ${this.stats.userEnrollmentsCreated} UserEnrollments records`);
    } catch (error) {
      console.error('❌ User migration failed:', error);
      throw error;
    }
  }

  async migrateLogs() {
    console.log('\n🔄 Starting Log data migration...');
    
    try {
      const logs = await Log.find({}).lean();
      console.log(`Found ${logs.length} logs to migrate`);

      for (const log of logs) {
        this.stats.logsProcessed++;
        
        try {
          const baseLogData = {
            userId: log.userId,
            userName: log.userName,
            details: log.details,
            examId: log.examId,
            examTitle: log.examTitle,
            timestamp: log.timestamp || log.createdAt,
            ipAddress: log.ipAddress,
            userAgent: log.userAgent
          };

          // Determine log type and migrate to appropriate collection
          switch (log.type) {
            case 'violation':
            case 'unauthorized_access_attempt':
            case 'suspicious_activity':
            case 'ai_detection':
              await this.createSecurityLog(log, baseLogData);
              break;

            case 'login':
            case 'logout':
            case 'password_reset_request':
            case 'password_reset_success':
            case 'account_locked':
            case 'account_unlocked':
              await this.createAuthenticationLog(log, baseLogData);
              break;

            case 'user_created':
            case 'user_updated':
            case 'user_deleted':
            case 'course_created':
            case 'course_updated':
            case 'exam_created':
            case 'exam_updated':
            case 'submission_graded':
            case 'question_bank_updated':
              await this.createAuditLog(log, baseLogData);
              break;

            case 'system_startup':
            case 'system_shutdown':
            case 'database_connection':
            case 'api_request':
            case 'error':
            case 'performance_alert':
              await this.createSystemLog(log, baseLogData);
              break;

            default:
              // Default to system log for unknown types
              await this.createSystemLog(log, baseLogData);
              break;
          }

          // Create AlertResolution if log has alert-related fields
          if (log.alertResolved !== undefined || log.resolvedBy || log.flaggedForReview) {
            await this.createAlertResolution(log);
          }

        } catch (error) {
          console.error(`Error migrating log ${log._id}:`, error.message);
          this.stats.errors.push(`Log ${log._id}: ${error.message}`);
        }
      }

      console.log(`✅ Log migration completed:`);
      console.log(`   - SecurityLogs: ${this.stats.securityLogsCreated}`);
      console.log(`   - AuthenticationLogs: ${this.stats.authLogsCreated}`);
      console.log(`   - AuditLogs: ${this.stats.auditLogsCreated}`);
      console.log(`   - SystemLogs: ${this.stats.systemLogsCreated}`);
      console.log(`   - AlertResolutions: ${this.stats.alertsCreated}`);
    } catch (error) {
      console.error('❌ Log migration failed:', error);
      throw error;
    }
  }

  async createSecurityLog(log, baseData) {
    const securityLog = new SecurityLogs({
      ...baseData,
      type: log.type,
      severity: this.determineSeverity(log.type),
      violationType: log.violationType,
      confidence: log.confidence || 0.8,
      aiDetection: {
        model: log.aiModel || 'legacy',
        confidence: log.confidence || 0.8,
        features: log.features || []
      },
      sessionInfo: {
        sessionId: log.sessionId,
        duration: log.sessionDuration
      },
      actionTaken: log.actionTaken || 'logged'
    });
    
    await securityLog.save();
    this.stats.securityLogsCreated++;
  }

  async createAuthenticationLog(log, baseData) {
    const authLog = new AuthenticationLogs({
      ...baseData,
      type: log.type,
      status: log.type.includes('success') ? 'success' : (log.type.includes('failed') ? 'failed' : 'info'),
      authMethod: 'password',
      sessionInfo: {
        sessionId: log.sessionId,
        duration: log.sessionDuration
      },
      riskAssessment: {
        score: log.riskScore || 0.1,
        factors: log.riskFactors || []
      },
      actionTaken: log.actionTaken || 'none'
    });
    
    await authLog.save();
    this.stats.authLogsCreated++;
  }

  async createAuditLog(log, baseData) {
    const auditLog = new AuditLogs({
      ...baseData,
      type: log.type,
      action: this.extractAction(log.type),
      resource: this.extractResource(log.type),
      resourceId: log.examId || log.courseId || log.userId,
      changeTracking: {
        before: log.beforeState,
        after: log.afterState,
        changedFields: log.changedFields || []
      },
      context: {
        examId: log.examId,
        courseId: log.courseId,
        targetUserId: log.targetUserId
      },
      impact: {
        level: this.determineImpactLevel(log.type),
        affectedUsers: log.affectedUsers || 0
      }
    });
    
    await auditLog.save();
    this.stats.auditLogsCreated++;
  }

  async createSystemLog(log, baseData) {
    const systemLog = new SystemLogs({
      ...baseData,
      type: log.type,
      level: this.determineLogLevel(log.type),
      message: log.message || log.details,
      userContext: log.userId ? {
        userId: log.userId,
        userName: log.userName,
        role: log.userRole
      } : null,
      requestContext: {
        method: log.method,
        url: log.url,
        statusCode: log.statusCode,
        responseTime: log.responseTime
      },
      errorInfo: log.error ? {
        name: log.error.name,
        message: log.error.message,
        stack: log.error.stack
      } : null
    });
    
    await systemLog.save();
    this.stats.systemLogsCreated++;
  }

  async createAlertResolution(log) {
    const alert = new AlertResolutions({
      alertId: log._id,
      alertType: 'log_alert',
      userId: log.userId,
      examId: log.examId,
      severity: this.determineSeverity(log.type),
      status: log.alertResolved ? 'resolved' : 'open',
      resolvedBy: log.resolvedBy,
      resolvedAt: log.resolvedAt,
      resolution: log.resolution,
      flaggedBy: log.flaggedBy,
      flaggedAt: log.flaggedAt || log.timestamp,
      notes: [{
        content: log.notes || 'Migrated from legacy log system',
        addedBy: 'system',
        addedAt: new Date()
      }]
    });
    
    await alert.save();
    this.stats.alertsCreated++;
  }

  determineSeverity(type) {
    const highSeverity = ['violation', 'unauthorized_access_attempt', 'account_locked'];
    const mediumSeverity = ['suspicious_activity', 'password_reset_request'];
    
    if (highSeverity.includes(type)) return 'high';
    if (mediumSeverity.includes(type)) return 'medium';
    return 'low';
  }

  determineLogLevel(type) {
    const errorTypes = ['error', 'system_shutdown'];
    const warnTypes = ['performance_alert', 'database_connection'];
    
    if (errorTypes.includes(type)) return 'error';
    if (warnTypes.includes(type)) return 'warn';
    return 'info';
  }

  extractAction(type) {
    if (type.includes('created')) return 'create';
    if (type.includes('updated')) return 'update';
    if (type.includes('deleted')) return 'delete';
    if (type.includes('graded')) return 'grade';
    return 'unknown';
  }

  extractResource(type) {
    if (type.includes('user')) return 'user';
    if (type.includes('course')) return 'course';
    if (type.includes('exam')) return 'exam';
    if (type.includes('submission')) return 'submission';
    if (type.includes('question')) return 'question_bank';
    return 'system';
  }

  determineImpactLevel(type) {
    const highImpact = ['user_deleted', 'course_deleted', 'exam_deleted'];
    const mediumImpact = ['user_created', 'course_created', 'exam_created'];
    
    if (highImpact.includes(type)) return 'high';
    if (mediumImpact.includes(type)) return 'medium';
    return 'low';
  }

  async cleanupOldData() {
    console.log('\n🧹 Cleaning up old data...');
    
    try {
      // Backup old collections before deletion
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Rename old collections as backup
      await mongoose.connection.db.collection('logs').rename(`logs_backup_${timestamp}`);
      console.log('✅ Old logs collection backed up');
      
    } catch (error) {
      console.error('⚠️  Cleanup warning:', error.message);
    }
  }

  async printStats() {
    console.log('\n📊 Migration Statistics:');
    console.log('========================');
    console.log(`Users processed: ${this.stats.usersProcessed}`);
    console.log(`UserSecurity records created: ${this.stats.userSecurityCreated}`);
    console.log(`UserEnrollments records created: ${this.stats.userEnrollmentsCreated}`);
    console.log(`Logs processed: ${this.stats.logsProcessed}`);
    console.log(`SecurityLogs created: ${this.stats.securityLogsCreated}`);
    console.log(`AuthenticationLogs created: ${this.stats.authLogsCreated}`);
    console.log(`AuditLogs created: ${this.stats.auditLogsCreated}`);
    console.log(`SystemLogs created: ${this.stats.systemLogsCreated}`);
    console.log(`AlertResolutions created: ${this.stats.alertsCreated}`);
    
    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      this.stats.errors.forEach(error => console.log(`   - ${error}`));
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Database Migration...');
      
      await this.connect();
      await this.migrateUsers();
      await this.migrateLogs();
      await this.cleanupOldData();
      await this.printStats();
      
      console.log('\n✅ Migration completed successfully!');
      console.log('\n⚠️  IMPORTANT: Please test your application thoroughly before deploying to production.');
      
    } catch (error) {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    } finally {
      await mongoose.disconnect();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const migration = new DatabaseMigration();
  migration.run();
}

export default DatabaseMigration;