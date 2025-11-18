# IQBAES Database Schema Documentation

## 📋 Overview
Dokumentasi lengkap struktur database IQBAES selepas normalization dan cleanup.

## 🗄️ Database Collections (10 Active Collections)

### 1. **users** (61 documents)
**Purpose**: Data asas pengguna sistem
```javascript
{
  _id: ObjectId,
  username: String,
  email: String,
  fullName: String,
  role: String, // 'student', 'lecturer', 'admin'
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### 2. **usersecurities** (61 documents)
**Purpose**: Data keselamatan pengguna (dipisahkan untuk security)
```javascript
{
  _id: ObjectId,
  userId: ObjectId, // Reference to users._id
  password: String, // Hashed
  lastLogin: Date,
  loginAttempts: Number,
  isLocked: Boolean,
  resetToken: String,
  resetTokenExpiry: Date,
  twoFactorEnabled: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### 3. **userenrollments** (263 documents)
**Purpose**: Hubungan many-to-many antara users dan courses
```javascript
{
  _id: ObjectId,
  userId: ObjectId, // Reference to users._id
  courseId: ObjectId, // Reference to courses._id
  enrolledAt: Date,
  status: String, // 'active', 'completed', 'dropped'
  progress: Number, // 0-100
  grade: String,
  createdAt: Date
}
```

### 4. **courses** (8 documents)
**Purpose**: Data kursus/mata pelajaran
```javascript
{
  _id: ObjectId,
  courseCode: String,
  courseName: String,
  description: String,
  lecturerId: ObjectId, // Reference to users._id
  credits: Number,
  semester: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### 5. **exams** (24 documents)
**Purpose**: Data peperiksaan
```javascript
{
  _id: ObjectId,
  examTitle: String,
  courseId: ObjectId, // Reference to courses._id
  lecturerId: ObjectId, // Reference to users._id
  startTime: Date,
  endTime: Date,
  duration: Number, // in minutes
  totalMarks: Number,
  instructions: String,
  isActive: Boolean,
  antiCheatEnabled: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### 6. **submissions** (240 documents)
**Purpose**: Jawapan pelajar untuk peperiksaan
```javascript
{
  _id: ObjectId,
  examId: ObjectId, // Reference to exams._id
  studentId: ObjectId, // Reference to users._id
  answers: [{
    questionId: ObjectId,
    answer: String,
    isCorrect: Boolean,
    marks: Number
  }],
  totalScore: Number,
  percentage: Number,
  submittedAt: Date,
  timeSpent: Number, // in seconds
  status: String, // 'submitted', 'graded', 'pending'
  createdAt: Date
}
```

### 7. **bankquestions** (102 documents)
**Purpose**: Bank soalan untuk peperiksaan
```javascript
{
  _id: ObjectId,
  question: String,
  questionType: String, // 'mcq', 'essay', 'true_false'
  options: [String], // For MCQ
  correctAnswer: String,
  marks: Number,
  difficulty: String, // 'easy', 'medium', 'hard'
  courseId: ObjectId, // Reference to courses._id
  topic: String,
  createdBy: ObjectId, // Reference to users._id
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### 8. **feedbacks** (3 documents)
**Purpose**: Maklum balas dari pengguna
```javascript
{
  _id: ObjectId,
  userId: ObjectId, // Reference to users._id
  type: String, // 'bug', 'feature', 'general'
  title: String,
  description: String,
  priority: String, // 'low', 'medium', 'high'
  status: String, // 'open', 'in_progress', 'resolved'
  createdAt: Date,
  updatedAt: Date
}
```

### 9. **systemlogs** (2 documents)
**Purpose**: Log sistem dan aktiviti penting
```javascript
{
  _id: ObjectId,
  level: String, // 'debug', 'info', 'warn', 'error', 'fatal'
  message: String,
  module: String, // 'auth', 'exam', 'user', 'system'
  userId: ObjectId, // Reference to users._id (optional)
  metadata: Object, // Additional data
  timestamp: Date,
  createdAt: Date
}
```

### 10. **logs_backup_2025-08-25T17-57-07-908Z** (35 documents)
**Purpose**: Backup data log lama sebelum migration
```javascript
{
  _id: ObjectId,
  // Original log structure before normalization
  // Kept for reference and rollback purposes
}
```

## 🔗 Database Relationships

```
users (1) ←→ (M) usersecurities
users (1) ←→ (M) userenrollments ←→ (M) courses (1)
users (1) ←→ (M) exams (lecturer)
courses (1) ←→ (M) exams
exams (1) ←→ (M) submissions ←→ (1) users (student)
courses (1) ←→ (M) bankquestions
users (1) ←→ (M) feedbacks
users (1) ←→ (M) systemlogs
```

## 📊 Data Statistics

| Collection | Documents | Purpose | Status |
|------------|-----------|---------|--------|
| users | 61 | User accounts | ✅ Active |
| usersecurities | 61 | Security data | ✅ Active |
| userenrollments | 263 | Course enrollments | ✅ Active |
| courses | 8 | Course catalog | ✅ Active |
| exams | 24 | Examinations | ✅ Active |
| submissions | 240 | Exam submissions | ✅ Active |
| bankquestions | 102 | Question bank | ✅ Active |
| feedbacks | 3 | User feedback | ✅ Active |
| systemlogs | 2 | System logs | ✅ Active |
| logs_backup | 35 | Backup data | 💾 Backup |
| **TOTAL** | **799** | | |

## 🛠️ Database Management Scripts

### Available NPM Scripts:
```bash
# Check database status
npm run check:db

# Clean empty collections
npm run clean:empty

# Create backup
npm run backup

# Run migration
npm run migrate

# Interactive cleanup
npm run cleanup:db
```

### Key Files:
- `check-database.js` - Database analysis
- `clean-empty-collections.js` - Remove empty collections
- `migrate-database.js` - Data migration
- `backup-database.js` - Create backups

## 🎯 Benefits of Current Structure

### ✅ Normalized Design
- **User data separated**: Basic info vs security data
- **Proper relationships**: Many-to-many handled correctly
- **No data duplication**: Each piece of data stored once

### ✅ Security Improvements
- **Sensitive data isolated**: Passwords in separate collection
- **Access control**: Can limit access to security collection
- **Audit trail**: System logs track all activities

### ✅ Performance Benefits
- **Faster queries**: Smaller collections, better indexing
- **Efficient joins**: Proper foreign key relationships
- **Scalable**: Can handle growth without restructuring

### ✅ Maintainability
- **Clear structure**: Each collection has single responsibility
- **Easy to understand**: Logical data organization
- **Simple updates**: Changes isolated to relevant collections

## 🚨 Important Notes

1. **Backup Available**: Original logs backed up before migration
2. **No Data Loss**: All 799 documents preserved
3. **Clean Structure**: 7 empty collections removed
4. **Ready for Production**: Normalized and optimized

## 🔄 Migration History

- **Before**: 17 collections (many empty, denormalized)
- **After**: 10 collections (clean, normalized)
- **Data Migrated**: Users → Users + UserSecurities + UserEnrollments
- **Logs Backed Up**: Old logs preserved in backup collection
- **Empty Collections Removed**: 7 unused collections cleaned up

---

**Last Updated**: 2025-01-25  
**Database Version**: v2.0 (Post-Migration)  
**Total Documents**: 799  
**Active Collections**: 10