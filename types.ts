export enum QuestionType {
  MultipleChoice = 'MCQ',
  TrueFalse = 'TF',
  ShortAnswer = 'SA',
  Essay = 'Essay',
}

export interface Question {
  id: string;
  type: QuestionType;
  text?: string; // For new format
  question?: string; // For legacy format from database
  options?: string[];
  correctAnswer: number; // Index of correct answer in options array
  difficulty: 'easy' | 'medium' | 'hard';
  topic?: string;
  points: number;
}

export interface BankQuestion extends Question {
  courseId: string;
}

export interface Exam {
  id: string;
  title: string;
  courseId: string;
  durationMinutes: number;
  questionCount: number;
  questions: Question[];
  availableFrom?: string; // ISO Date string
  availableUntil?: string; // ISO Date string
}

export interface UserAnswer {
  questionId: string;
  answer: string | boolean | null;
}

export interface ExamSubmission {
  id: string;
  examId: string;
  courseId: string;
  userId: string;
  totalPointsAwarded: number;
  totalPointsPossible: number;
  submittedAt: string;
  results: Result[];
  // Retake functionality
  attemptNumber?: number;
  isRetakeAllowed?: boolean;
  retakeAllowedBy?: string;
  retakeAllowedAt?: string;
  maxAttempts?: number;
  // Backend-added properties
  score?: number; // Same as totalPointsAwarded
  totalPoints?: number; // Same as totalPointsPossible
  percentage?: number; // Calculated percentage score
}

export interface Result {
  question: Question;
  userAnswer: UserAnswer;
  isCorrect: boolean;
  pointsAwarded: number;
  gradingJustification?: string;
  lecturerOverridePoints?: number;
  lecturerFeedback?: string;
}

export type Role = 'student' | 'lecturer' | 'admin';

export interface Course {
    id: string;
    code: string;
    name: string;
}

export interface User {
  id: string;
  username: string;
  role: Role;
  name: string;
  enrolledCourseIds?: string[];
  password?: string;
}

export type LogType = 'violation' | 'login' | 'logout' | 'submission' | 'submission_updated' | 'exam_access' | 'camera_start' | 'exam_start' | 'ai_proctoring_violation' | 'session_flagged' | 'api_request' | 'application_error' | 'performance_issue' | 'database_error' | 'admin_access' | 'lecturer_access';

export interface Log {
  id: string;
  userId: string;
  userName: string;
  type: LogType;
  details: string;
  examId?: string;
  examTitle?: string;
  timestamp: string;
  message?: string; // Optional message field for formatted log messages
}

// New types for feedback/bug reporting system
export type FeedbackType = 'bug' | 'feature_request' | 'general_feedback' | 'technical_issue';
export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical';
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface FeedbackComment {
  adminId: string;
  adminName: string;
  message: string;
  type: 'progress_update' | 'status_change' | 'admin_response';
  createdAt: string;
}

export interface Feedback {
  id: string;
  userId: string;
  userName: string;
  userRole: 'student' | 'lecturer' | 'admin';
  type: FeedbackType;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  title: string;
  description: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  browserInfo?: string;
  screenResolution?: string;
  attachments?: string[];
  adminResponse?: string;
  comments?: FeedbackComment[];
  assignedTo?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  // Notification fields
  hasUnreadResponse?: boolean;
  lastResponseAt?: string;
  notificationSent?: boolean;
}
