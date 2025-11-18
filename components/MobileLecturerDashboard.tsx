import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import { Exam, ExamSubmission, User, Question, Course } from '../types';

interface MobileLecturerDashboardProps {
  exams: Exam[];
  courses: Course[];
  bankQuestions: Question[];
  submissions: ExamSubmission[];
  users: User[];
  addExam: (exam: Exam) => void;
  updateExam: (exam: Exam) => void;
  deleteExam: (examId: string) => void;
  addQuestionToBank: (question: Question) => void;
  updateQuestionInBank: (question: Question) => void;
  deleteQuestionFromBank: (questionId: string) => void;
}

export const MobileLecturerDashboard: React.FC<MobileLecturerDashboardProps> = ({
  exams,
  courses,
  bankQuestions,
  submissions,
  users,
  addExam,
  updateExam,
  deleteExam,
  addQuestionToBank,
  updateQuestionInBank,
  deleteQuestionFromBank
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'pending' | 'recent'>('overview');
  const [pendingSubmissions, setPendingSubmissions] = useState<ExamSubmission[]>([]);

  useEffect(() => {
    // Filter pending submissions (those that need manual grading)
    const pending = submissions.filter(sub => 
      sub.results.some(result => 
        result.question.type === 'Essay' && !result.lecturerOverridePoints
      )
    );
    setPendingSubmissions(pending);
  }, [submissions]);

  const getUserName = (userId: string) => {
    return users.find(u => u.id === userId)?.name || 'Unknown User';
  };

  const getExamTitle = (examId: string) => {
    return exams.find(e => e.id === examId)?.title || 'Unknown Exam';
  };

  const handleQuickGrade = (submissionId: string, approve: boolean) => {
    // Quick approve/reject functionality - navigate to grading page
    console.log(`Quick ${approve ? 'approve' : 'reject'} submission:`, submissionId);
    window.location.hash = `#/lecturer/grade/${submissionId}`;
  };

  const handleCreateExam = () => {
    // Navigate to exam creation
    console.log('Create new exam');
    // You can implement a modal or navigate to create exam page
  };

  const handleViewResults = (examId: string) => {
    window.location.hash = `#/lecturer/results/${examId}`;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
      
      {/* Mobile Header */}
      <div className="bg-indigo-600 text-white p-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">IQBAES Lecturer</h1>
          <div className="flex space-x-2">
            {/* Manual Install Button for iOS */}
            <button 
              onClick={() => {
                if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
                  alert('To install: Tap the Share button (⬆️) in Safari, then "Add to Home Screen"');
                } else {
                  alert('To install: Look for "Install" or "Add to Home Screen" in your browser menu');
                }
              }}
              className="p-2 rounded-full bg-indigo-500 active:bg-indigo-700 transition-colors"
            >
              <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-5 h-5" />
            </button>
            <button 
              className="p-2 rounded-full bg-indigo-500 active:bg-indigo-700 transition-colors"
              onClick={() => console.log('Notifications')}
            >
              <Icon path="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{pendingSubmissions.length}</div>
            <div className="text-sm opacity-90">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{exams.length}</div>
            <div className="text-sm opacity-90">Active Exams</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{submissions.length}</div>
            <div className="text-sm opacity-90">Total Submissions</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-slate-200">
        <div className="flex">
          {[
            { key: 'overview', label: 'Overview', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z' },
            { key: 'pending', label: 'Pending', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
            { key: 'recent', label: 'Recent', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex-1 py-3 px-4 text-center border-b-2 transition-colors active:bg-slate-100 ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-slate-500'
              }`}
            >
              <Icon path={tab.icon} className="w-5 h-5 mx-auto mb-1" />
              <div className="text-xs font-medium">{tab.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 pb-20">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setActiveTab('pending')}
                  className="bg-indigo-100 text-indigo-700 p-3 rounded-lg text-center active:bg-indigo-200 transition-colors"
                >
                  <Icon path="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6 mx-auto mb-1" />
                  <div className="text-sm font-medium">Grade All</div>
                </button>
                <button 
                  onClick={handleCreateExam}
                  className="bg-green-100 text-green-700 p-3 rounded-lg text-center active:bg-green-200 transition-colors"
                >
                  <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-6 h-6 mx-auto mb-1" />
                  <div className="text-sm font-medium">New Exam</div>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Recent Activity</h3>
              <div className="space-y-3">
                {submissions.slice(0, 3).map(submission => (
                  <div key={submission.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
                    <div>
                      <div className="font-medium text-sm">{getUserName(submission.userId)}</div>
                      <div className="text-xs text-slate-500">{getExamTitle(submission.examId)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-indigo-600">
                        {Math.round((submission.totalPointsAwarded / submission.totalPointsPossible) * 100)}%
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(submission.submittedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Exams */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Active Exams</h3>
              <div className="space-y-3">
                {exams.slice(0, 3).map(exam => (
                  <div key={exam.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
                    <div>
                      <div className="font-medium text-sm">{exam.title}</div>
                      <div className="text-xs text-slate-500">
                        {courses.find(c => c.id === exam.courseId)?.name || 'Unknown Course'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleViewResults(exam.id)}
                      className="text-indigo-600 text-sm font-medium active:text-indigo-800"
                    >
                      View Results
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="space-y-3">
            {pendingSubmissions.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Icon path="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No pending submissions!</p>
              </div>
            ) : (
              pendingSubmissions.map(submission => (
                <div key={submission.id} className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-semibold text-slate-800">{getUserName(submission.userId)}</div>
                      <div className="text-sm text-slate-500">{getExamTitle(submission.examId)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {submission.results.filter(r => r.question.type === 'Essay').length} essays
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(submission.submittedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  {/* Quick Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleQuickGrade(submission.id, true)}
                      className="flex-1 bg-green-100 text-green-700 py-2 px-3 rounded-lg text-sm font-medium active:bg-green-200 transition-colors"
                    >
                      Quick Approve
                    </button>
                    <button
                      onClick={() => handleQuickGrade(submission.id, false)}
                      className="flex-1 bg-indigo-100 text-indigo-700 py-2 px-3 rounded-lg text-sm font-medium active:bg-indigo-200 transition-colors"
                    >
                      Review Details
                    </button>
                    <button
                      onClick={() => handleQuickGrade(submission.id, false)}
                      className="flex-1 bg-red-100 text-red-700 py-2 px-3 rounded-lg text-sm font-medium active:bg-red-200 transition-colors"
                    >
                      Request Revision
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'recent' && (
          <div className="space-y-3">
            {submissions.slice(0, 10).map(submission => (
              <div key={submission.id} className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-800">{getUserName(submission.userId)}</div>
                    <div className="text-sm text-slate-500">{getExamTitle(submission.examId)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-indigo-600">
                      {Math.round((submission.totalPointsAwarded / submission.totalPointsPossible) * 100)}%
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(submission.submittedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2">
        <div className="flex justify-around">
          {[
            { icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z', label: 'Dashboard', action: () => window.location.hash = '#/' },
            { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Grade', action: () => setActiveTab('pending') },
            { icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', label: 'Analytics', action: () => console.log('Analytics') },
            { icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', label: 'Profile', action: () => console.log('Profile') }
          ].map((item, index) => (
            <button 
              key={index} 
              onClick={item.action}
              className="flex flex-col items-center py-2 px-3 text-slate-500 active:text-indigo-600 active:bg-slate-100 rounded-lg transition-colors"
            >
              <Icon path={item.icon} className="w-6 h-6 mb-1" />
              <span className="text-xs">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};