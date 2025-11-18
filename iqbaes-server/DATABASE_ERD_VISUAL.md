# IQBAES Database Entity Relationship Diagram

## 🎯 Visual Database Structure

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     USERS       │    │  USERSECURITIES │    │ USERENROLLMENTS │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ _id (PK)        │◄──►│ userId (FK)     │    │ userId (FK)     │◄──┐
│ username        │    │ password        │    │ courseId (FK)   │   │
│ email           │    │ lastLogin       │    │ enrolledAt      │   │
│ fullName        │    │ loginAttempts   │    │ status          │   │
│ role            │    │ isLocked        │    │ progress        │   │
│ isActive        │    │ resetToken      │    │ grade           │   │
│ createdAt       │    │ twoFactorEnabled│    └─────────────────┘   │
│ updatedAt       │    └─────────────────┘                        │
└─────────────────┘                                               │
        │                                                         │
        │ 1:M                                                     │
        ▼                                                         │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│   FEEDBACKS     │    │   SYSTEMLOGS    │    │    COURSES      │ │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤ │
│ _id (PK)        │    │ _id (PK)        │    │ _id (PK)        │◄┘
│ userId (FK)     │    │ userId (FK)     │    │ courseCode      │
│ type            │    │ level           │    │ courseName      │
│ title           │    │ message         │    │ description     │
│ description     │    │ module          │    │ lecturerId (FK) │
│ priority        │    │ metadata        │    │ credits         │
│ status          │    │ timestamp       │    │ semester        │
└─────────────────┘    └─────────────────┘    │ isActive        │
                                              └─────────────────┘
                                                      │
                                                      │ 1:M
                                                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  BANKQUESTIONS  │    │     EXAMS       │    │  SUBMISSIONS    │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ _id (PK)        │    │ _id (PK)        │    │ _id (PK)        │
│ question        │    │ examTitle       │    │ examId (FK)     │
│ questionType    │    │ courseId (FK)   │    │ studentId (FK)  │
│ options         │    │ lecturerId (FK) │    │ answers[]       │
│ correctAnswer   │    │ startTime       │    │ totalScore      │
│ marks           │    │ endTime         │    │ percentage      │
│ difficulty      │    │ duration        │    │ submittedAt     │
│ courseId (FK)   │    │ totalMarks      │    │ timeSpent       │
│ topic           │    │ antiCheatEnabled│    │ status          │
│ createdBy (FK)  │    └─────────────────┘    └─────────────────┘
└─────────────────┘            │ 1:M                    ▲
        ▲                      └────────────────────────┘
        │ M:1
        └──────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    BACKUP COLLECTION                        │
├─────────────────────────────────────────────────────────────┤
│  logs_backup_2025-08-25T17-57-07-908Z (35 documents)       │
│  - Original log data before migration                       │
│  - Kept for rollback and reference purposes                 │
└─────────────────────────────────────────────────────────────┘
```

## 🔗 Relationship Summary

### Core User Management
```
USERS (1) ←→ (1) USERSECURITIES
├── One user has one security record
└── Security data isolated for better protection

USERS (1) ←→ (M) USERENROLLMENTS ←→ (M) COURSES (1)
├── Many-to-many relationship through junction table
├── One user can enroll in multiple courses
└── One course can have multiple students
```

### Academic System
```
COURSES (1) ←→ (M) EXAMS
├── One course can have multiple exams
└── Each exam belongs to one course

EXAMS (1) ←→ (M) SUBMISSIONS
├── One exam can have multiple submissions
└── Each submission belongs to one exam

USERS (1) ←→ (M) SUBMISSIONS
├── One student can have multiple submissions
└── Each submission belongs to one student
```

### Question Bank
```
COURSES (1) ←→ (M) BANKQUESTIONS
├── One course can have multiple questions
└── Each question belongs to one course

USERS (1) ←→ (M) BANKQUESTIONS (as creator)
├── One lecturer can create multiple questions
└── Each question has one creator
```

### System Management
```
USERS (1) ←→ (M) FEEDBACKS
├── One user can submit multiple feedbacks
└── Each feedback belongs to one user

USERS (1) ←→ (M) SYSTEMLOGS
├── One user can generate multiple logs
└── Each log can be associated with one user (optional)
```

## 📊 Data Flow Diagram

```
    STUDENT LOGIN
         │
         ▼
    ┌─────────┐    ┌──────────────┐
    │  USERS  │───►│USERSECURITIES│
    └─────────┘    └──────────────┘
         │
         ▼
 ┌───────────────┐    ┌─────────┐
 │USERENROLLMENTS│───►│COURSES  │
 └───────────────┘    └─────────┘
         │                 │
         ▼                 ▼
    ┌─────────┐    ┌──────────────┐
    │  EXAMS  │◄───│BANKQUESTIONS │
    └─────────┘    └──────────────┘
         │
         ▼
  ┌─────────────┐
  │SUBMISSIONS  │
  └─────────────┘
         │
         ▼
   ┌─────────────┐    ┌──────────┐
   │SYSTEMLOGS   │    │FEEDBACKS │
   └─────────────┘    └──────────┘
```

## 🎯 Collection Purposes

| Collection | Primary Purpose | Key Features |
|------------|----------------|-------------|
| **users** | User accounts | Basic profile info |
| **usersecurities** | Authentication | Passwords, tokens, 2FA |
| **userenrollments** | Course registration | Student-course relationships |
| **courses** | Course catalog | Course details, lecturer assignment |
| **exams** | Examination management | Exam scheduling, settings |
| **submissions** | Student answers | Exam responses, grading |
| **bankquestions** | Question repository | Reusable questions by course |
| **feedbacks** | User feedback | Bug reports, feature requests |
| **systemlogs** | System monitoring | Activity tracking, debugging |
| **logs_backup** | Data preservation | Migration backup |

## 🔍 Query Patterns

### Common Queries:

1. **Get student's enrolled courses:**
   ```javascript
   // Find user enrollments → get course details
   userenrollments.find({userId: studentId})
   ```

2. **Get exam submissions for grading:**
   ```javascript
   // Find submissions by exam → get student details
   submissions.find({examId: examId})
   ```

3. **Get course questions for exam:**
   ```javascript
   // Find questions by course → filter by difficulty
   bankquestions.find({courseId: courseId})
   ```

4. **User authentication:**
   ```javascript
   // Find user → check security credentials
   users.findOne({email: email})
   usersecurities.findOne({userId: userId})
   ```

## 🚀 Performance Optimizations

### Recommended Indexes:
```javascript
// Users
db.users.createIndex({"email": 1})
db.users.createIndex({"username": 1})

// User Securities
db.usersecurities.createIndex({"userId": 1})

// User Enrollments
db.userenrollments.createIndex({"userId": 1})
db.userenrollments.createIndex({"courseId": 1})
db.userenrollments.createIndex({"userId": 1, "courseId": 1})

// Exams
db.exams.createIndex({"courseId": 1})
db.exams.createIndex({"startTime": 1})

// Submissions
db.submissions.createIndex({"examId": 1})
db.submissions.createIndex({"studentId": 1})
db.submissions.createIndex({"examId": 1, "studentId": 1})

// Bank Questions
db.bankquestions.createIndex({"courseId": 1})
db.bankquestions.createIndex({"difficulty": 1})
```

---

**Database Design**: Normalized 3NF  
**Total Collections**: 10 active + 1 backup  
**Total Documents**: 799  
**Relationships**: Properly defined with foreign keys  
**Status**: Production Ready ✅