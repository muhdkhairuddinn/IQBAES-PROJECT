import React, { useMemo, useState, useEffect } from 'react';
import { Exam, ExamSubmission, User, Course } from '../types';
import { Icon } from './Icon';

interface LecturerAnalyticsDashboardProps {
  exams: Exam[];
  submissions: ExamSubmission[];
  users: User[];
  courses: Course[];
}

interface AnalyticsData {
  totalStudents: number;
  averageScore: number;
  completionRate: number;
  questionDifficulty: Array<{
    questionId: string;
    text: string;
    topic: string;
    correctRate: number;
    difficulty: number;
  }>;
  studentPerformance: Array<{
    studentId: string;
    name: string;
    averageScore: number;
    trend: 'up' | 'down' | 'stable';
    submissionCount: number;
  }>;
  totalSubmissions: number;
}

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: string;
  color: string;
  subtitle?: string;
}> = ({ title, value, icon, color, subtitle }) => (
  <div className="bg-white p-6 rounded-xl shadow-md">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className={`text-3xl font-bold text-${color}-600`}>{value}</p>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        )}
      </div>
      <div className={`p-3 rounded-full bg-${color}-100`}>
        <Icon path={icon} className={`w-6 h-6 text-${color}-600`} />
      </div>
    </div>
  </div>
);

const ProgressBar: React.FC<{ value: number; max: number; color?: string }> = ({ 
  value, 
  max, 
  color = 'indigo' 
}) => (
  <div className="w-full bg-slate-200 rounded-full h-2">
    <div 
      className={`bg-${color}-500 h-2 rounded-full transition-all duration-300`}
      style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
    />
  </div>
);

export const LecturerAnalyticsDashboard: React.FC<LecturerAnalyticsDashboardProps> = ({
  exams,
  submissions,
  users,
  courses
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // API fetch helper with authentication
  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem('iqbaes-token');
    const headers = new Headers(options.headers || {});
    headers.append('Content-Type', 'application/json');
    if (token) {
      headers.append('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`/api${url}`, { ...options, headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred.' }));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }

    return response.json();
  };

  // Fetch analytics data from API
  const fetchAnalyticsData = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (selectedCourseId !== 'all') params.append('courseId', selectedCourseId);
      if (timeRange !== 'all') params.append('timeRange', timeRange);

      const data = await apiFetch(`/submissions/analytics?${params}`);
      
      // Check if backend returned a message (no data found)
      if (data.message) {
        console.log('Analytics message:', data.message);
        // Show user-friendly message when no data is found
        alert(data.message);
      }
      
      // Validate response structure and provide defaults
      const validatedData = {
        totalStudents: data.totalStudents || 0,
        averageScore: data.averageScore || 0,
        completionRate: data.completionRate || 0,
        questionDifficulty: Array.isArray(data.questionDifficulty) ? data.questionDifficulty : [],
        studentPerformance: Array.isArray(data.studentPerformance) ? data.studentPerformance : [],
        totalSubmissions: data.totalSubmissions || 0
      };
      
      setAnalyticsData(validatedData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      // Fallback to local calculation if API fails
      setAnalyticsData(calculateLocalAnalytics());
    } finally {
      setIsLoading(false);
    }
  };

  // Fallback local calculation (same as before but simplified)
  const calculateLocalAnalytics = (): AnalyticsData => {
    // Filter submissions based on course and time range
    let filteredSubmissions = submissions;
    
    if (selectedCourseId !== 'all') {
      filteredSubmissions = submissions.filter(s => {
        const exam = exams.find(e => e.id === s.examId);
        return exam?.courseId === selectedCourseId;
      });
    }

    if (timeRange !== 'all') {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      filteredSubmissions = filteredSubmissions.filter(s => 
        new Date(s.submittedAt) >= cutoffDate
      );
    }

    // Calculate total unique students
    const uniqueStudents = new Set(filteredSubmissions.map(s => s.userId)).size;

    // Calculate average score
    const totalScore = filteredSubmissions.reduce((acc, s) => 
      acc + (s.totalPointsPossible > 0 ? (s.totalPointsAwarded / s.totalPointsPossible) * 100 : 0), 0
    );
    const averageScore = filteredSubmissions.length > 0 ? totalScore / filteredSubmissions.length : 0;

    // Question difficulty analysis
    const questionStats: { [questionId: string]: { correct: number; total: number; text: string; topic: string } } = {};
    
    filteredSubmissions.forEach(submission => {
      submission.results.forEach(result => {
        const qId = result.question.id;
        if (!questionStats[qId]) {
          questionStats[qId] = { 
            correct: 0, 
            total: 0, 
            text: result.question.text || result.question.question,
            topic: result.question.topic || 'General'
          };
        }
        questionStats[qId].total++;
        
        // Check if answer is correct based on lecturerOverridePoints or original isCorrect
        const isAnswerCorrect = result.lecturerOverridePoints !== undefined 
          ? result.lecturerOverridePoints > (result.question.points * 0.5)
          : result.isCorrect;
          
        if (isAnswerCorrect) questionStats[qId].correct++;
      });
    });

    const questionDifficulty = Object.entries(questionStats).map(([questionId, stats]) => ({
      questionId,
      text: stats.text,
      topic: stats.topic,
      correctRate: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
      difficulty: stats.total > 0 ? 100 - ((stats.correct / stats.total) * 100) : 0
    })).sort((a, b) => b.difficulty - a.difficulty);

    // Student performance analysis
    const studentStats: { [studentId: string]: number[] } = {};
    filteredSubmissions.forEach(submission => {
      if (!studentStats[submission.userId]) {
        studentStats[submission.userId] = [];
      }
      const score = submission.totalPointsPossible > 0 ? 
        (submission.totalPointsAwarded / submission.totalPointsPossible) * 100 : 0;
      studentStats[submission.userId].push(score);
    });

    const studentPerformance = Object.entries(studentStats).map(([studentId, scores]) => {
      const user = users.find(u => u.id === studentId);
      const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      
      // Simple trend calculation
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (scores.length >= 2) {
        const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
        const secondHalf = scores.slice(Math.floor(scores.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        
        if (secondAvg > firstAvg + 5) trend = 'up';
        else if (secondAvg < firstAvg - 5) trend = 'down';
      }

      return {
        studentId,
        name: user?.name || 'Unknown User',
        averageScore,
        trend,
        submissionCount: scores.length
      };
    }).sort((a, b) => b.averageScore - a.averageScore);

    return {
      totalStudents: uniqueStudents,
      averageScore,
      completionRate: 100, // Simplified for now
      questionDifficulty,
      studentPerformance,
      totalSubmissions: filteredSubmissions.length
    };
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, [selectedCourseId, timeRange]);

  if (!analyticsData) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-3 mb-6">
            <img src="/fcom.png" alt="FCOM Logo" className="h-10 w-10 object-contain"/>
            <h1 className="text-3xl font-bold text-slate-800">Analytics Dashboard</h1>
          </div>
          {isLoading && (
            <div className="flex items-center text-sm text-slate-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 mr-2"></div>
              Updating...
            </div>
          )}
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="all">All Courses</option>
            {courses.map(course => (
              <option key={course.id} value={course.id}>
                {course.code} - {course.name}
              </option>
            ))}
          </select>
          
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Students"
            value={analyticsData.totalStudents}
            icon="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            color="blue"
          />
          
          <StatCard
            title="Average Score"
            value={`${Math.round(analyticsData.averageScore)}%`}
            icon="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            color="green"
          />
          
          <StatCard
            title="Completion Rate"
            value={`${Math.round(analyticsData.completionRate)}%`}
            icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            color="indigo"
          />
          
          <StatCard
            title="Total Submissions"
            value={analyticsData.totalSubmissions}
            icon="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            color="purple"
          />
        </div>

        {/* Question Difficulty Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">📈 Question Difficulty Analysis</h2>
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {analyticsData.questionDifficulty?.slice(0, 10).map((question, index) => (
                <div key={question.questionId} className="border-b border-slate-100 pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800 line-clamp-2">
                        {question.text.length > 60 ? `${question.text.substring(0, 60)}...` : question.text}
                      </p>
                      <p className="text-xs text-slate-500">{question.topic}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-bold text-red-600">{Math.round(question.difficulty)}% difficulty</p>
                      <p className="text-xs text-slate-500">{Math.round(question.correctRate)}% correct</p>
                    </div>
                  </div>
                  <ProgressBar value={question.difficulty} max={100} color="red" />
                </div>
              ))}
            </div>
          </div>

          {/* Student Performance */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">👥 Student Performance</h2>
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {analyticsData.studentPerformance?.slice(0, 10).map((student, index) => (
                <div key={student.studentId} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                      index < 3 ? 'bg-yellow-500' : 'bg-slate-400'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{student.name}</p>
                      <p className="text-xs text-slate-500">{student.submissionCount} submissions</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg font-bold text-slate-800">{Math.round(student.averageScore)}%</span>
                    <div className={`w-4 h-4 ${
                      student.trend === 'up' ? 'text-green-500' : 
                      student.trend === 'down' ? 'text-red-500' : 'text-slate-400'
                    }`}>
                      {student.trend === 'up' && <Icon path="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" className="w-4 h-4" />}
                      {student.trend === 'down' && <Icon path="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.511l-5.511-3.182" className="w-4 h-4" />}
                      {student.trend === 'stable' && <Icon path="M5 12h14" className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};