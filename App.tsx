import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { StudentDashboard } from './components/Dashboard';
import { LecturerDashboard } from './components/LecturerDashboard';
import { MobileLecturerDashboard } from './components/MobileLecturerDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { ExamView } from './components/ExamView';
import { ResultsView } from './components/ResultsView';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';
import { useAuth } from './contexts/AuthContext';
import { Exam, UserAnswer, ExamSubmission, Role, User, Question, QuestionType, Result } from './types';
import { Icon } from './components/Icon';
import { LoadingSpinner } from './components/LoadingSpinner';
import { LecturerExamResults } from './components/LecturerExamResults';
import { PracticeView } from './components/PracticeView';
import { ManualGradeModal } from './components/ManualGradeModal';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import FeedbackButton from './components/FeedbackButton';
import MyFeedbackView from './components/MyFeedbackView';
import { ToastProvider } from './components/Toast';
import { ExamSessionProvider } from './contexts/ExamSessionContext';


const App: React.FC = () => {
    const { 
        user, logout, isLoading,
        exams: allExams, courses: allCourses, submissions, logs, users: allUsers,
        bankQuestions, addQuestionToBank, updateQuestionInBank, deleteQuestionFromBank,
        addExam, updateExam, deleteExam,
        submitAndGradeExam, addLog, startExamSession, addUser, addCourse, deleteCourse, deleteUser, updateUser, updateCourse,
        updateSubmissionResult, bulkGradeSubmissions
    } = useAuth();

    const [activeExam, setActiveExam] = useState<Exam | null>(null);
    const [activePracticeQuiz, setActivePracticeQuiz] = useState<Exam | null>(null);
    const [isGrading, setIsGrading] = useState(false);
    const [lastSubmission, setLastSubmission] = useState<ExamSubmission | null>(null);
    const [gradingSubmission, setGradingSubmission] = useState<ExamSubmission | null>(null);

    // This is the single source of truth for routing.
    // CRITICAL: Initialize hash from window.location.hash to preserve route on refresh
    // Always preserve the actual hash if it exists (even if empty), so routes like #/exam/123 persist
    const getInitialHash = () => {
      const currentHash = window.location.hash;
      // Preserve the actual hash - if it's empty or '#', we'll handle it in the view logic
      // This ensures routes like #/exam/123 are preserved on refresh
      return currentHash || '#';
    };
    
    const [hash, setHash] = useState(getInitialHash());

    // Effect to handle routing from hash changes
    useEffect(() => {
        const handleHashChange = () => {
          const newHash = window.location.hash;
          // Always update state to match window.location.hash
          // The view logic will handle empty hash appropriately
          setHash(newHash || '#');
        };
        window.addEventListener('hashchange', handleHashChange);
        
        // CRITICAL: If hash is empty or just '#' and user is authenticated, set to '/'
        // This ensures authenticated users see the dashboard when refreshing with no hash
        if ((!window.location.hash || window.location.hash === '#') && user && !isLoading) {
          window.location.hash = '#/';
          setHash('#/');
        }
        
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [user, isLoading]);

    // Effect to load the active exam based on the URL
    useEffect(() => {
        if (lastSubmission) return; // Don't change view if we just submitted
        const pathSegments = hash.replace('#', '').split('/').filter(Boolean);
        const currentView = pathSegments[0];
        const currentId = pathSegments[1];

        if (currentView === 'exam' && currentId) {
            if (!activeExam || activeExam.id !== currentId) {
                const examToLoad = allExams.find(e => e.id === currentId);
                if (examToLoad && user?.enrolledCourseIds?.includes(examToLoad.courseId)) {
                    setActiveExam(examToLoad);
                } else {
                    window.location.hash = '#/';
                }
            }
        } else if (activeExam && currentView !== 'exam') {
            setActiveExam(null);
        }
    }, [hash, allExams, user, lastSubmission]); // Removed activeExam from dependencies
    
    const userCourses = useMemo(() => {
        if (!user || !user.enrolledCourseIds) {
            return [];
        }
        
        const filtered = allCourses.filter(course => {
            return user.enrolledCourseIds.includes(course.id);
        });
        
        return filtered;
    }, [user, allCourses]);

    const handleStartExam = useCallback((examId: string) => {
        const examToStart = allExams.find(e => e.id === examId);
        if (examToStart && user) {
            // Use the backend startExamSession to properly capture IP address
            startExamSession(examId, examToStart.title);
            
            window.location.hash = `#/exam/${examId}`;
        }
    }, [allExams, user, startExamSession]);

    const handleSubmitExam = useCallback(async (answers: UserAnswer[], exam: Exam) => {
        if (isGrading || !user) return;
    
        setIsGrading(true);
        try {
            const newSubmission = await submitAndGradeExam(exam, answers);
            setLastSubmission(newSubmission);
        } catch (error) {
            console.error("Submission failed", error);
            alert("There was an error submitting your exam. Please try again.");
        } finally {
            setIsGrading(false);
        }
    }, [isGrading, user, submitAndGradeExam]);


    const handleRestart = useCallback(() => {
        setLastSubmission(null);
        window.location.hash = '#/';
    }, []);

    const handleGeneratePracticeQuiz = useCallback((courseId: string, questionCount: number, difficulty: 'easy' | 'medium' | 'hard' | 'mix', focusOnWeaknesses: boolean) => {
      console.log('🎯 Practice Quiz Generation Started:', { courseId, questionCount, difficulty, focusOnWeaknesses });
      console.log('📚 Available bank questions:', bankQuestions.length);
      console.log('👤 Current user:', user?.id);
      console.log('📊 Available submissions:', submissions.length);
      
      if (!user) {
        console.log('❌ No user found');
        return;
      }
      
      let eligibleQuestions: Question[] = [];

      if (focusOnWeaknesses) {
          console.log('🎯 Focus on weaknesses mode activated');
          const studentSubmissions = submissions.filter(s => s.userId === user.id && s.courseId === courseId);
          console.log('📝 Student submissions for course:', studentSubmissions.length);
          
          const topicPerformance: { [topic: string]: { total: number; correct: number } } = {};
          
          studentSubmissions.forEach(sub => {
              sub.results.forEach(res => {
                  const topic = res.question.topic || 'General';
                  if (!topicPerformance[topic]) {
                      topicPerformance[topic] = { total: 0, correct: 0 };
                  }
                  topicPerformance[topic].total++;
                  if (res.isCorrect) {
                      topicPerformance[topic].correct++;
                  }
              });
          });

          console.log('📈 Topic performance:', topicPerformance);

          const weakTopics = Object.entries(topicPerformance)
              .map(([topic, stats]) => ({ topic, score: stats.total > 0 ? (stats.correct / stats.total) : 1 }))
              .filter(item => item.score < 0.7) // Consider topics with < 70% score as weak
              .sort((a, b) => a.score - b.score)
              .map(item => item.topic);
          
          console.log('📉 Weak topics identified:', weakTopics);
          
          if(weakTopics.length > 0) {
              eligibleQuestions = bankQuestions.filter(q => q.courseId === courseId && weakTopics.includes(q.topic || ''));
              console.log('🎯 Questions matching weak topics:', eligibleQuestions.length);
          }
      } 
      
      if (eligibleQuestions.length < questionCount) {
          console.log('🔄 Need more questions, adding general questions...');
          // Fallback or supplement with general questions
          const generalQuestions = bankQuestions.filter(q => {
            const isForCourse = q.courseId === courseId;
            const isCorrectDifficulty = difficulty === 'mix' || q.difficulty === difficulty;
            return isForCourse && isCorrectDifficulty && !eligibleQuestions.some(eq => eq.id === q.id);
          });
          console.log('📚 General questions found:', generalQuestions.length);
          eligibleQuestions.push(...generalQuestions);
      }

      console.log('✅ Total eligible questions:', eligibleQuestions.length);

      const shuffled = eligibleQuestions.sort(() => 0.5 - Math.random());
      const selectedQuestions = shuffled.slice(0, questionCount);

      console.log('🎲 Selected questions:', selectedQuestions.length);
      console.log('🔍 First question structure:', selectedQuestions[0]);

      if (selectedQuestions.length === 0) {
          console.log('❌ No questions available for practice quiz');
          alert("Not enough questions in the bank for this course to generate a practice quiz.");
          return;
      }

      const practiceQuiz: Exam = {
          id: `practice-${Date.now()}`,
          title: `Practice Quiz: ${focusOnWeaknesses ? 'Weakest Areas' : difficulty}`,
          courseId: courseId,
          durationMinutes: 999, // No timer for practice
          questionCount: selectedQuestions.length,
          questions: selectedQuestions,
      };
      
      console.log('🎉 Practice quiz created:', practiceQuiz);
      setActivePracticeQuiz(practiceQuiz);
      window.location.hash = '#/practice';
    }, [user, submissions, bankQuestions]);

    const handleSaveManualGrade = (submissionId: string, updatedResults: Result[]) => {
      const submission = submissions.find(s => s.id === submissionId);
      if (submission) {
        updateSubmissionResult(submissionId, updatedResults);
      }
      setGradingSubmission(null);
    };

    const handleBulkGrade = async (submissionIds: string[], grades: { [questionId: string]: number }) => {
      try {
        console.log('Starting bulk grade with:', { submissionIds, grades });
        await bulkGradeSubmissions(submissionIds, grades);
        console.log('Bulk grade completed successfully');
      } catch (error) {
        console.error('Error in handleBulkGrade:', error);
        throw error; // Re-throw so the modal can catch it
      }
    };

    const RoleBadge: React.FC<{role: Role}> = ({role}) => {
      const roleConfig: {[key in Role]: {colors: string, icon: string, label: string}} = {
        student: {
            colors: 'bg-blue-100 text-blue-800',
            icon: 'M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z',
            label: 'Student'
        },
        lecturer: {
            colors: 'bg-purple-100 text-purple-800',
            icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
            label: 'Lecturer'
        },
        admin: {
            colors: 'bg-yellow-100 text-yellow-800',
            icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
            label: 'Admin'
        },
      };
      
      const config = roleConfig[role];
      
      return (
          <span className={`px-2 py-0.5 inline-flex items-center text-xs leading-5 font-semibold rounded-full capitalize ${config.colors}`}>
              <Icon path={config.icon} className="w-3 h-3 mr-1" />
              {config.label}
          </span>
      );
    }
    
    // State for navigation warning modal during exams
    const [showNavWarning, setShowNavWarning] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
    
    // Check if user is currently taking an exam
    const isTakingExam = useMemo(() => {
        const pathSegments = hash.replace('#', '').split('/').filter(Boolean);
        return pathSegments[0] === 'exam' && pathSegments[1];
    }, [hash]);
    
    // Handler for navigation clicks during exam
    const handleNavigationClick = useCallback((e: React.MouseEvent, navigationAction: () => void) => {
        if (isTakingExam && user?.role === 'student') {
            e.preventDefault();
            e.stopPropagation();
            
            // IMPORTANT: Set the legitimate navigation flag IMMEDIATELY when modal opens
            // This ensures anti-cheat is disabled BEFORE any user actions that might trigger violations
            sessionStorage.setItem('iqbaes-legitimate-navigation', 'true');
            window.dispatchEvent(new CustomEvent('iqbaes-legitimate-navigation', { detail: true }));
            console.log('🟢 Legitimate navigation flag set (modal opened)');
            
            setPendingNavigation(() => navigationAction);
            setShowNavWarning(true);
        } else {
            navigationAction();
        }
    }, [isTakingExam, user]);
    
    const confirmNavigation = useCallback(() => {
        // Flag is already set when modal opens, but ensure it's still set
        sessionStorage.setItem('iqbaes-legitimate-navigation', 'true');
        window.dispatchEvent(new CustomEvent('iqbaes-legitimate-navigation', { detail: true }));
        console.log('✅ Confirming navigation - flag already set');
        
        // Wait longer to ensure anti-cheat hook fully detects the flag and stops monitoring
        // Also gives time for any pending violations to be ignored
        setTimeout(() => {
            if (pendingNavigation) {
                console.log('🚀 Executing navigation...');
                pendingNavigation();
            }
            setShowNavWarning(false);
            setPendingNavigation(null);
            // Clear the flag after navigation completes (10 seconds to be safe)
            setTimeout(() => {
                sessionStorage.removeItem('iqbaes-legitimate-navigation');
                window.dispatchEvent(new CustomEvent('iqbaes-legitimate-navigation', { detail: false }));
                console.log('🧹 Legitimate navigation flag cleared');
            }, 10000); // Clear flag after 10 seconds
        }, 150); // Reduced to 150ms - enough time for React state updates and pending events/timeouts
    }, [pendingNavigation]);
    
    const cancelNavigation = useCallback(() => {
        // IMPORTANT: Clear the flag when user cancels navigation
        // This re-enables anti-cheat if user decides to stay in exam
        sessionStorage.removeItem('iqbaes-legitimate-navigation');
        window.dispatchEvent(new CustomEvent('iqbaes-legitimate-navigation', { detail: false }));
        console.log('❌ Navigation cancelled - flag cleared, anti-cheat re-enabled');
        setShowNavWarning(false);
        setPendingNavigation(null);
    }, []);

    const Layout: React.FC<{ children: React.ReactNode, user: User }> = ({ children, user }) => (
        <div className="min-h-screen bg-slate-50">
              {/* Navigation Warning Modal */}
              {showNavWarning && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-[10000] flex items-center justify-center p-4" data-leave-exam-modal="true">
                  <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
                    <div className="flex items-start mb-4">
                      <div className="flex-shrink-0">
                        <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-12 h-12 text-amber-600" />
                      </div>
                      <div className="ml-4 flex-1">
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">⚠️ Leave Exam?</h2>
                        <p className="text-base text-gray-700 mb-4">
                          Are you sure you want to leave the exam?
                        </p>
                        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded mb-4">
                          <p className="text-sm text-amber-700">
                            <strong>Warning:</strong> Leaving the exam may result in:
                          </p>
                          <ul className="list-disc list-inside text-sm text-amber-600 mt-2 space-y-1">
                            <li>Your exam progress may be affected</li>
                            <li>You may not be able to return to the exam</li>
                            <li>Your answers may be auto-submitted</li>
                          </ul>
                        </div>
                        <div className="flex justify-end space-x-3">
                          <button
                            onClick={cancelNavigation}
                            className="px-6 py-2 text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 font-medium transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={confirmNavigation}
                            className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors"
                          >
                            Yes, Leave Exam
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bg-white shadow-sm border-b border-slate-200 relative z-50">
                  <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between relative z-50">
                      <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                                  <span className="text-white font-bold text-sm">IQ</span>
                              </div>
                              <span className="text-xl font-bold text-slate-800">IQBAES</span>
                          </div>
                          {user && (
                              <div className="hidden sm:flex items-center space-x-6">
                                  <div className="text-sm text-slate-500">
                                      Intelligent Question Bank & Automated Exam System
                                  </div>
                                  <button 
                                      onClick={(e) => handleNavigationClick(e, () => {
                                        setLastSubmission(null);
                                        window.location.hash = '#/';
                                      })}
                                      className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 transition-colors cursor-pointer"
                                  >
                                      <Icon path="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" className="w-4 h-4" />
                                      <span>My Dashboard</span>
                                  </button>
                                  {user.role !== 'admin' && (
                                      <a 
                                          href="#/feedback"
                                          onClick={(e) => handleNavigationClick(e, () => {
                                            window.location.hash = '#/feedback';
                                          })}
                                          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 transition-colors"
                                      >
                                          <Icon path="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.691 1.309 3.061 2.927 3.237.423.037.893.037 1.316 0A3.75 3.75 0 018.25 14.75c0-2.069 1.681-3.75 3.75-3.75s3.75 1.681 3.75 3.75c0 .647-.17 1.255-.466 1.782.423.037.893.037 1.316 0 1.618-.176 2.927-1.546 2.927-3.237C19.5 11.199 16.997 9.75 14.25 9.75h-4.5C7.003 9.75 4.5 11.199 4.5 13.26z" className="w-4 h-4" />
                                          <span>My Feedback</span>
                                      </a>
                                  )}
                              </div>
                          )}
                      </div>
                      <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <span className="text-slate-700 font-semibold block">{user.name}</span>
                            <RoleBadge role={user.role} />
                          </div>
                          <button onClick={logout} className="text-sm font-medium text-slate-500 hover:text-indigo-600 flex items-center space-x-1">
                            <Icon path="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" className="w-5 h-5"/>
                            <span>Logout</span>
                          </button>
                      </div>
                  </nav>
              </div>
              <main>
                {isGrading && (
                    <div className="fixed inset-0 bg-slate-900 bg-opacity-75 z-50 flex flex-col justify-center items-center">
                        <LoadingSpinner size="h-16 w-16" color="border-white" />
                        <p className="text-white text-xl font-semibold mt-4">Submitting & Grading with AI...</p>
                        <p className="text-slate-300">Please wait a moment.</p>
                    </div>
                )}
                 {gradingSubmission && (
                  <ManualGradeModal 
                    submission={gradingSubmission} 
                    studentName={allUsers.find(u => u.id === gradingSubmission.userId)?.name || 'Student'}
                    onClose={() => setGradingSubmission(null)}
                    onSave={handleSaveManualGrade}
                  />
                )}
                {children}
                {/* Add floating feedback button for students and lecturers */}
                {user && (user.role === 'student' || user.role === 'lecturer') && <FeedbackButton />}
              </main>
        </div>
    );
    
    const pathSegments = hash.replace('#', '').split('/').filter(Boolean);
    // CRITICAL: If view is empty and user is authenticated, default to empty string (dashboard)
    // If view is empty and user is NOT authenticated, default to 'login'
    const view = pathSegments[0] || (user ? '' : 'login');

    // PRIORITY: Always show reset password page when URL contains reset-password, even during loading
    if (view === 'reset-password') {
        return <ResetPasswordPage />;
    }

    if (isLoading) {
      return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="h-12 w-12" /></div>
    }

    if (!user) {
        if (view === 'register') {
            return <RegisterPage />;
        }
        return <LoginPage />;
    }
    
    // --- STATE-DRIVEN VIEW LOGIC ---
    if (lastSubmission) {
        return (
            <Layout user={user}>
                <ResultsView submission={lastSubmission} onRestart={handleRestart} user={user} />
            </Layout>
        );
    }

    // Add this function to detect mobile devices
    // Only check user agent for actual mobile devices, not window size
    // This prevents desktop/laptop users from getting mobile interface when minimizing window
    const isMobileDevice = () => {
      // Only check user agent - don't check window size
      // This ensures desktop/laptop users always get desktop interface, even with small windows
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      // Removed: window.innerWidth <= 768 - this was causing desktop users to get mobile view when minimizing
    };

    // In your render function, add mobile detection for lecturers
    const renderContent = () => {
        switch(view) {
            case 'exam': {
                if (activeExam) {
                    const course = allCourses.find(c => c.id === activeExam.courseId);
                    return <ExamView exam={activeExam} courseName={course?.name || ''} user={user} addLog={addLog} onSubmit={handleSubmitExam} />;
                }
                return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="h-12 w-12" /></div>;
            }

            case 'practice': {
                if (activePracticeQuiz) {
                    const course = allCourses.find(c => c.id === activePracticeQuiz.courseId);
                    return <PracticeView quiz={activePracticeQuiz} courseName={course?.name || ''} onFinish={() => window.location.hash = '#/'}/>
                }
                window.location.hash = '#/';
                return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="h-12 w-12" /></div>;
            }

            case 'lecturer': {
                const subView = pathSegments[1];
                if (subView === 'results') {
                    const examId = pathSegments[2];
                    if (user.role !== 'lecturer') {
                        window.location.hash = '#/';
                        return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="h-12 w-12" /></div>;
                    }
                    
                    const exam = allExams.find(e => e.id === examId);
                    if (!exam || !user.enrolledCourseIds?.includes(exam.courseId)) {
                        window.location.hash = '#/';
                        return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="h-12 w-12" /></div>;
                    }
                    
                    const examSubmissions = submissions.filter(s => s.examId === examId);
                    const course = allCourses.find(c => c.id === exam.courseId);
                    
                    return <LecturerExamResults 
                        exam={exam}
                        submissions={examSubmissions}
                        users={allUsers.filter(u => u.role === 'student')}
                        onGradeSubmission={(submissionId) => {
                            const submission = submissions.find(s => s.id === submissionId);
                            if (submission) {
                                setGradingSubmission(submission);
                            }
                        }}
                    />;
                }
                // If not a recognized subview, redirect to dashboard
                window.location.hash = '#/';
                return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="h-12 w-12" /></div>;
            }

            case 'results': {
                const submissionId = pathSegments[1];
                if (!submissionId) {
                    window.location.hash = '#/';
                    return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="h-12 w-12" /></div>;
                }
                
                const submission = submissions.find(s => s.id === submissionId);
                if (!submission || (user.role === 'student' && submission.userId !== user.id)) {
                    window.location.hash = '#/';
                    return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="h-12 w-12" /></div>;
                }
                
                return <ResultsView submission={submission} onRestart={handleRestart} user={user} />;
            }

            case 'feedback': {
                if (user.role === 'student' || user.role === 'lecturer') {
                    return (
                        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
                            <MyFeedbackView />
                        </div>
                    );
                }
                window.location.hash = '#/';
                return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="h-12 w-12" /></div>;
            }

            default: {
                // Handle role-based routing
                switch(user.role) {
                    case 'student': {
                        const studentSubmissions = submissions.filter(s => s.userId === user.id);
                        const now = new Date();
                        
                        const availableExams = allExams.filter(exam => {
                            const isEnrolled = user.enrolledCourseIds?.includes(exam.courseId) || false;
                            if (!isEnrolled) return false;
                            
                            const examSubmissions = studentSubmissions.filter(s => s.examId === exam.id);
                            
                            // Check if exam is within availability dates (for all cases, including retakes)
                            const isWithinSchedule = (() => {
                                if (!exam.availableFrom && !exam.availableUntil) {
                                    return true; // No date restrictions
                                }
                                const from = exam.availableFrom ? new Date(exam.availableFrom) : null;
                                const until = exam.availableUntil ? new Date(exam.availableUntil) : null;
                                
                                // Exam must have started (if availableFrom is set)
                                if (from && now < from) {
                                    return false;
                                }
                                
                                // Exam must not have expired (if availableUntil is set)
                                if (until && now > until) {
                                    return false;
                                }
                                
                                return true;
                            })();
                            
                            // If exam is expired, don't show it (unless student has retake permission that overrides expiration)
                            // IMPORTANT: If isRetakeAllowed is true, it means a lecturer/admin explicitly granted permission
                            // This overrides any previous flagged status (flagged is cleared when granting retake)
                            // So we only check isRetakeAllowed, not the flagged status
                            // NOTE: Placeholder submissions can have isRetakeAllowed: true, which is used to show retake option
                            const hasRetakePermission = examSubmissions.some(sub => 
                                Boolean(sub.isRetakeAllowed)
                            );
                            
                            // If student has retake permission, allow retake if within schedule and hasn't exceeded max attempts
                            if (hasRetakePermission) {
                                // Sort submissions by submittedAt to get the most recent one (could be a placeholder)
                                const sortedSubmissions = examSubmissions.sort((a, b) => 
                                    new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
                                );
                                const mostRecentSubmission = sortedSubmissions[0];
                                
                                // Calculate attempt number - only count non-placeholder submissions
                                // Placeholder submissions don't count as attempts since the student hasn't taken the exam yet
                                const nonPlaceholderSubmissions = examSubmissions.filter(sub => !Boolean((sub as any).isPlaceholder));
                                
                                // Debug logging
                                console.log(`🔍 Exam ${exam.title} (${exam.id}):`, {
                                    hasRetakePermission,
                                    isWithinSchedule,
                                    mostRecentSubmission: mostRecentSubmission ? {
                                        id: mostRecentSubmission.id,
                                        isRetakeAllowed: mostRecentSubmission.isRetakeAllowed,
                                        flagged: (mostRecentSubmission as any).flagged,
                                        maxAttempts: mostRecentSubmission.maxAttempts,
                                        attemptNumber: mostRecentSubmission.attemptNumber,
                                        submittedAt: mostRecentSubmission.submittedAt,
                                        isPlaceholder: Boolean((mostRecentSubmission as any).isPlaceholder)
                                    } : null,
                                    allSubmissions: examSubmissions.map(sub => ({
                                        id: sub.id,
                                        isRetakeAllowed: sub.isRetakeAllowed,
                                        flagged: (sub as any).flagged,
                                        maxAttempts: sub.maxAttempts,
                                        attemptNumber: sub.attemptNumber,
                                        isPlaceholder: Boolean((sub as any).isPlaceholder)
                                    })),
                                    nonPlaceholderCount: nonPlaceholderSubmissions.length
                                });
                                
                                // Get maxAttempts and currentAttempts from the most recent NON-PLACEHOLDER submission
                                // Only count non-placeholder submissions for attempt calculation
                                const mostRecentNonPlaceholder = nonPlaceholderSubmissions.length > 0 
                                    ? nonPlaceholderSubmissions[0] 
                                    : null;
                                
                                const maxAttempts = mostRecentNonPlaceholder?.maxAttempts || Math.max(...nonPlaceholderSubmissions.map(sub => sub.maxAttempts || 2), 2);
                                // CRITICAL: Only count non-placeholder submissions for currentAttempts
                                // This ensures placeholders don't inflate the attempt count
                                const currentAttempts = mostRecentNonPlaceholder?.attemptNumber || nonPlaceholderSubmissions.length;
                                const canRetake = currentAttempts < maxAttempts;
                                
                                console.log(`📊 Retake check for ${exam.title}:`, {
                                    maxAttempts,
                                    currentAttempts,
                                    canRetake,
                                    isWithinSchedule,
                                    willShow: canRetake // Show if canRetake is true, regardless of schedule
                                });
                                
                                // IMPORTANT: If retake permission was explicitly granted by lecturer/admin,
                                // show the exam EVEN IF it's expired. This allows lecturers to grant retakes
                                // for expired exams. Only check if max attempts haven't been exceeded.
                                // The schedule check is bypassed when retake permission is granted.
                                return canRetake;
                            }
                            
                            // If no submissions, only show if within schedule
                            if (examSubmissions.length === 0) {
                                return isWithinSchedule;
                            }
                            
                            // If student has submitted and no retake permission, don't show
                            return false;
                        });
                        
                        console.log('=== FINAL AVAILABLE EXAMS ===');
                        console.log('Available exams:', availableExams.map(e => ({ id: e.id, title: e.title })));
                        
                        return <StudentDashboard 
                            exams={availableExams} 
                            allExams={allExams}
                            courses={userCourses} 
                            submissions={studentSubmissions} 
                            onStartExam={handleStartExam}
                            onGeneratePracticeQuiz={handleGeneratePracticeQuiz}
                        />;
                    }
                    case 'lecturer': {
                        const lecturerExams = allExams.filter(exam => user.enrolledCourseIds?.includes(exam.courseId) || false);
                        const lecturerBankQuestions = bankQuestions.filter(q => user.enrolledCourseIds?.includes(q.courseId) || false);
                        
                        // Check if mobile device and render mobile interface
                        if (isMobileDevice()) {
                            return <MobileLecturerDashboard 
                                exams={lecturerExams} 
                                courses={userCourses} 
                                bankQuestions={lecturerBankQuestions}
                                submissions={submissions}
                                users={allUsers}
                                addExam={addExam} 
                                updateExam={updateExam} 
                                deleteExam={deleteExam} 
                                addQuestionToBank={addQuestionToBank}
                                updateQuestionInBank={updateQuestionInBank}
                                deleteQuestionFromBank={deleteQuestionFromBank}
                            />;
                        }
                        
                        return <LecturerDashboard 
                            exams={lecturerExams} 
                            courses={userCourses} 
                            bankQuestions={lecturerBankQuestions}
                            submissions={submissions}
                            users={allUsers}
                            addExam={addExam} 
                            updateExam={updateExam} 
                            deleteExam={deleteExam} 
                            addQuestionToBank={addQuestionToBank}
                            updateQuestionInBank={updateQuestionInBank}
                            deleteQuestionFromBank={deleteQuestionFromBank}
                            onBulkGrade={handleBulkGrade}
                        />;
                    }
                    case 'admin':
                        return <AdminDashboard />;
                    default:
                        return <div>Invalid user role.</div>;
                }
            }
        }
    };
    
    return (
        <ExamSessionProvider>
            <ToastProvider>
                <Layout user={user}>{renderContent()}</Layout>
            </ToastProvider>
        </ExamSessionProvider>
    );
};

export default App;