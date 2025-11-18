# IQBAES Server Project Structure

## 📁 Current Project Organization

```
iqbaes-server/
├── 📁 models/                    # Database Models (Mongoose Schemas)
│   ├── User.js                   # ✅ User profile data
│   ├── UserSecurity.js           # ✅ Authentication & security
│   ├── UserEnrollments.js        # ✅ Course enrollments
│   ├── Course.js                 # ✅ Course information
│   ├── Exam.js                   # ✅ Examination data
│   ├── Submission.js             # ✅ Student submissions
│   ├── BankQuestion.js           # ✅ Question repository
│   ├── Feedback.js               # ✅ User feedback
│   ├── SystemLogs.js             # ✅ System logging
│   └── Log.js                    # ⚠️  Legacy - to be removed
│
├── 📁 controllers/               # Business Logic Controllers
│   ├── authController.js         # 🔄 Needs update for new models
│   ├── userController.js         # 🔄 Needs update for new models
│   ├── courseController.js       # 🔄 Needs update for new models
│   ├── examController.js         # 🔄 Needs update for new models
│   ├── submissionController.js   # 🔄 Needs update for new models
│   └── feedbackController.js     # 🔄 Needs update for new models
│
├── 📁 routes/                    # API Route Definitions
│   ├── auth.js                   # Authentication routes
│   ├── users.js                  # User management routes
│   ├── courses.js                # Course management routes
│   ├── exams.js                  # Exam management routes
│   ├── submissions.js            # Submission routes
│   └── feedback.js               # Feedback routes
│
├── 📁 middleware/                # Custom Middleware
│   ├── auth.js                   # Authentication middleware
│   ├── validation.js             # Input validation
│   └── errorHandler.js           # Error handling
│
├── 📁 utils/                     # Utility Functions
│   ├── database.js               # Database connection
│   ├── encryption.js             # Password hashing
│   └── validation.js             # Data validation helpers
│
├── 📁 scripts/                   # Database Management Scripts
│   ├── migrate-database.js       # ✅ Migration script
│   ├── backup-database.js        # ✅ Backup utility
│   ├── check-database.js         # ✅ Database status checker
│   ├── cleanup-database.js       # ✅ Interactive cleanup
│   ├── auto-cleanup.js           # ✅ Automated cleanup
│   ├── clean-empty-collections.js # ✅ Remove empty collections
│   └── auto-migrate.js           # ✅ Automated migration
│
├── 📁 config/                    # Configuration Files
│   ├── database.js               # Database configuration
│   ├── auth.js                   # Authentication config
│   └── app.js                    # Application settings
│
├── 📁 tests/                     # Test Files
│   ├── models/                   # Model tests
│   ├── controllers/              # Controller tests
│   └── routes/                   # Route tests
│
├── 📄 package.json               # ✅ Dependencies & scripts
├── 📄 .env                       # Environment variables
├── 📄 server.js                  # Main application entry
├── 📄 DATABASE_SCHEMA.md         # ✅ Database documentation
├── 📄 DATABASE_ERD_VISUAL.md     # ✅ Visual database structure
└── 📄 PROJECT_STRUCTURE.md       # ✅ This file
```

## 🎯 Model Architecture (New Normalized Structure)

### Core Models
```
┌─────────────────┐
│   User.js       │ → Basic user profile information
├─────────────────┤
│ - _id           │
│ - username      │
│ - email         │
│ - fullName      │
│ - role          │
│ - isActive      │
│ - createdAt     │
│ - updatedAt     │
└─────────────────┘

┌─────────────────┐
│UserSecurity.js  │ → Authentication & security data
├─────────────────┤
│ - userId (FK)   │
│ - password      │
│ - lastLogin     │
│ - loginAttempts │
│ - isLocked      │
│ - resetToken    │
│ - twoFactorEnabled │
└─────────────────┘

┌─────────────────┐
│UserEnrollments.js│ → Course enrollment relationships
├─────────────────┤
│ - userId (FK)   │
│ - courseId (FK) │
│ - enrolledAt    │
│ - status        │
│ - progress      │
│ - grade         │
└─────────────────┘
```

### Academic Models
```
┌─────────────────┐
│   Course.js     │ → Course catalog
├─────────────────┤
│ - courseCode    │
│ - courseName    │
│ - description   │
│ - lecturerId    │
│ - credits       │
│ - semester      │
│ - isActive      │
└─────────────────┘

┌─────────────────┐
│    Exam.js      │ → Examination management
├─────────────────┤
│ - examTitle     │
│ - courseId (FK) │
│ - lecturerId    │
│ - startTime     │
│ - endTime       │
│ - duration      │
│ - totalMarks    │
│ - antiCheatEnabled │
└─────────────────┘

┌─────────────────┐
│ Submission.js   │ → Student exam responses
├─────────────────┤
│ - examId (FK)   │
│ - studentId (FK)│
│ - answers[]     │
│ - totalScore    │
│ - percentage    │
│ - submittedAt   │
│ - timeSpent     │
│ - status        │
└─────────────────┘

┌─────────────────┐
│BankQuestion.js  │ → Question repository
├─────────────────┤
│ - question      │
│ - questionType  │
│ - options       │
│ - correctAnswer │
│ - marks         │
│ - difficulty    │
│ - courseId (FK) │
│ - topic         │
│ - createdBy     │
└─────────────────┘
```

### System Models
```
┌─────────────────┐
│  Feedback.js    │ → User feedback system
├─────────────────┤
│ - userId (FK)   │
│ - type          │
│ - title         │
│ - description   │
│ - priority      │
│ - status        │
└─────────────────┘

┌─────────────────┐
│ SystemLogs.js   │ → System activity logging
├─────────────────┤
│ - userId (FK)   │
│ - level         │
│ - message       │
│ - module        │
│ - metadata      │
│ - timestamp     │
└─────────────────┘
```

## 🔧 Available Scripts (package.json)

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest",
    
    // Database Management
    "migrate:db": "node auto-migrate.js",
    "backup:db": "node backup-database.js",
    "check:db": "node check-database.js",
    "cleanup:db": "node cleanup-database.js",
    "clean:empty": "node clean-empty-collections.js"
  }
}
```

## 🚀 Quick Commands

### Database Operations
```bash
# Check current database status
npm run check:db

# Clean empty collections
npm run clean:empty

# Create database backup
npm run backup:db

# Run migration (if needed)
npm run migrate:db
```

### Development
```bash
# Start development server
npm run dev

# Run tests
npm test

# Start production server
npm start
```

## 📋 Next Steps (Controller Updates Needed)

### 🔄 Controllers to Update:

1. **authController.js**
   - Update to use `User` + `UserSecurity` models
   - Separate authentication logic

2. **userController.js**
   - Update to use normalized `User` model
   - Handle `UserEnrollments` separately

3. **courseController.js**
   - Update enrollment logic to use `UserEnrollments`
   - Maintain course-student relationships

4. **examController.js**
   - Update to use new `Exam` and `Submission` models
   - Handle question bank integration

5. **submissionController.js**
   - Update to use normalized `Submission` model
   - Improve grading logic

6. **feedbackController.js**
   - Update to use new `Feedback` model
   - Add system logging integration

## 🎯 Benefits of Current Structure

### ✅ Database Benefits:
- **Normalized**: 3NF compliance, no data redundancy
- **Scalable**: Separate collections for different concerns
- **Secure**: Isolated security data in `UserSecurity`
- **Maintainable**: Clear relationships and foreign keys
- **Performance**: Optimized for common query patterns

### ✅ Code Benefits:
- **Modular**: Separated models by domain
- **Clean**: Removed empty collections
- **Documented**: Clear schema documentation
- **Manageable**: Automated scripts for maintenance
- **Testable**: Structured for unit testing

### ✅ Operational Benefits:
- **Backup**: Automated backup system
- **Migration**: Safe data migration tools
- **Monitoring**: System logging in place
- **Cleanup**: Automated cleanup scripts
- **Validation**: Data integrity checks

---

**Status**: Database ✅ Normalized | Controllers 🔄 Pending Updates  
**Next Priority**: Update controllers to use new models  
**Maintenance**: Use provided scripts for database operations