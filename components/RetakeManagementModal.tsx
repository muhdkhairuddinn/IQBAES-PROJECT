import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { ExamSubmission, User, Exam, Course } from '../types';
import { Icon } from './Icon';
import { useAuth } from '../contexts/AuthContext';

interface RetakeManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  exams: Exam[];
  submissions: ExamSubmission[];
  users: User[];
  courses: Course[];
}

export const RetakeManagementModal: React.FC<RetakeManagementModalProps> = ({
  isOpen,
  onClose,
  exams,
  submissions,
  users,
  courses
}) => {
  const { allowRetake, allowRetakeForStudent, revokeRetake, refreshData } = useAuth();
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSubmission, setCurrentSubmission] = useState<ExamSubmission | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successPopupData, setSuccessPopupData] = useState<{
    studentName: string;
    examName: string;
    maxAttempts: number;
    action: 'granted' | 'revoked';
  } | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<{
    submissionId: string;
    studentName: string;
    examName: string;
  } | null>(null);
  const popupTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper: get course name from courseId (object or string)
  const getCourseName = (courseId: any) => {
    if (typeof courseId === 'object' && courseId?.name) {
      return courseId.name;
    }
    return courses.find(c => String(c.id) === String(courseId))?.name || 'Unknown Course';
  };

  // Reset state when modal opens/closes
  // IMPORTANT: Only reset when modal CLOSES (isOpen becomes false), not when it opens
  // This prevents the popup from being cleared when the modal is already open
  useEffect(() => {
    if (!isOpen) {
      // Modal is closing - reset all state
      setSelectedExam('');
      setSelectedStudent('');
      setMaxAttempts(2);
      setCurrentSubmission(null);
      setSuccessMessage('');
      setShowSuccessPopup(false);
      setSuccessPopupData(null);
      setShowRevokeConfirm(false);
      setPendingRevoke(null);
    }
  }, [isOpen]);

  // Clear success message after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Auto-close success popup after 5 seconds
  // Clear any existing timer when popup state changes
  useEffect(() => {
    // Clear any existing timer
    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
      popupTimerRef.current = null;
    }
    
    // Set new timer only if popup is showing
    if (showSuccessPopup && successPopupData) {
      popupTimerRef.current = setTimeout(() => {
        setShowSuccessPopup(false);
        setSuccessPopupData(null);
        popupTimerRef.current = null;
      }, 5000);
    }
    
    // Cleanup on unmount
    return () => {
      if (popupTimerRef.current) {
        clearTimeout(popupTimerRef.current);
        popupTimerRef.current = null;
      }
    };
  }, [showSuccessPopup, successPopupData]);

  // Get all enrolled students for the selected exam's course
  const getStudentsForExam = () => {
    if (!selectedExam) return [];
    
    const selectedExamData = exams.find(e => String(e.id) === String(selectedExam));
    if (!selectedExamData) return [];
    
    // Get all students enrolled in the exam's course
    const enrolledStudents = users.filter(user => 
      user.role === 'student' && 
      (user.enrolledCourseIds?.includes(selectedExamData.courseId) || false)
    );
    
    return enrolledStudents;
  };

  // Get current submission for selected student and exam
  useEffect(() => {
    if (selectedExam && selectedStudent) {
      const studentSubmissions = submissions.filter(sub => {
        const examMatch = String(sub.examId) === String(selectedExam);
        const userIdFromSub = typeof sub.userId === 'object' && sub.userId?.id ? sub.userId.id : sub.userId;
        const userMatch = String(userIdFromSub) === String(selectedStudent);
        return examMatch && userMatch;
      });
      
      // Get the latest submission
      const latest = studentSubmissions.sort((a, b) => 
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      )[0];
      
      // Update current submission - this will trigger UI updates
      setCurrentSubmission(latest || null);
      
      // Set appropriate maxAttempts based on current submission
      if (latest) {
        const currentAttempts = latest.attemptNumber || 1;
        const currentMaxAttempts = latest.maxAttempts || 1;
        // If student has exhausted attempts, set maxAttempts to currentAttempts + 1
        // Otherwise, keep the current maxAttempts or default to 2
        if (currentAttempts >= currentMaxAttempts) {
          const newMaxAttempts = Math.max(2, currentAttempts + 1);
          setMaxAttempts(newMaxAttempts);
        } else {
          const newMaxAttempts = Math.max(2, currentMaxAttempts);
          setMaxAttempts(newMaxAttempts);
        }
      } else {
        setMaxAttempts(2); // Default for new students
      }
    } else {
      setCurrentSubmission(null);
      setMaxAttempts(2); // Reset to default
    }
  }, [selectedExam, selectedStudent, submissions]);

  const handleAllowRetake = async () => {
    setIsLoading(true);
    setSuccessMessage('');
    
    // Clear any existing popup timer
    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
      popupTimerRef.current = null;
    }
    
    // Ensure any existing popup is closed before showing new one
    setShowSuccessPopup(false);
    setSuccessPopupData(null);
    
    try {
      // Get student and exam names before making the API call
      const studentName = users.find(u => String(u.id) === String(selectedStudent))?.name || 'Student';
      const examName = exams.find(e => String(e.id) === String(selectedExam))?.title || 'Exam';
      
      console.log('🟢 Starting retake grant process...', {
        studentName,
        examName,
        selectedStudent,
        selectedExam,
        currentSubmission: currentSubmission ? { id: currentSubmission.id, flagged: (currentSubmission as any).flagged, isRetakeAllowed: currentSubmission.isRetakeAllowed } : null,
        maxAttempts
      });
      
      let result;
      // If no submission exists, use the new endpoint that creates one automatically
      if (!currentSubmission) {
        console.log('  → Using allowRetakeForStudent (no submission exists)');
        result = await allowRetakeForStudent(selectedExam, selectedStudent, maxAttempts);
        console.log('  → Result:', result);
        console.log('  → Submission from result:', result?.submission ? {
          id: result.submission.id,
          isRetakeAllowed: result.submission.isRetakeAllowed,
          flagged: result.submission.flagged,
          maxAttempts: result.submission.maxAttempts,
          attemptNumber: result.submission.attemptNumber
        } : 'No submission in result');
      } else {
        console.log('  → Using allowRetake (submission exists)', currentSubmission.id);
        result = await allowRetake(currentSubmission.id, maxAttempts);
        console.log('  → Result:', result);
        console.log('  → Submission from result:', result?.submission ? {
          id: result.submission.id,
          isRetakeAllowed: result.submission.isRetakeAllowed,
          flagged: result.submission.flagged,
          maxAttempts: result.submission.maxAttempts,
          attemptNumber: result.submission.attemptNumber
        } : 'No submission in result');
      }
      
      // Prepare popup data
      const popupData = {
        studentName,
        examName,
        maxAttempts,
        action: 'granted' as const
      };
      
      console.log('  → Setting popup data and showing popup');
      // Show popup immediately - don't wait for refresh
      setSuccessPopupData(popupData);
      setShowSuccessPopup(true);
      
      // Force refresh all data in the background (this updates submissions state)
      // Do this AFTER showing the popup so user sees immediate feedback
      console.log('  → Refreshing data in background...');
      refreshData().then(() => {
        console.log('  → Data refresh completed');
        // Re-verify popup state after a brief delay to ensure state has propagated
        setTimeout(() => {
          console.log('  → Popup state check after refresh (delayed):', { 
            showSuccessPopup, 
            hasData: !!successPopupData,
            popupData: successPopupData
          });
        }, 100);
      }).catch(err => {
        console.error('  → Error during data refresh:', err);
      });
      
      // DON'T reset selections after granting - keep student selected so user can see the change
      // The UI will automatically update to show the granted state

    } catch (error: any) {
      console.error('❌ Error allowing retake:', error);
      console.error('  - Error details:', error?.message, error?.stack);
      
      // Hide popup if there was an error
      setShowSuccessPopup(false);
      setSuccessPopupData(null);
      
      const errorMessage = error?.message || 'Failed to grant retake permission. Please try again.';
      alert(`❌ ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeRetake = () => {
    if (!currentSubmission) {
      console.error('❌ Cannot revoke: currentSubmission is null');
      alert('❌ No submission found. Please refresh and try again.');
      return;
    }
    
    // Validate submission ID exists
    if (!currentSubmission.id) {
      console.error('❌ Cannot revoke: currentSubmission.id is missing', currentSubmission);
      alert('❌ Invalid submission. Please refresh and try again.');
      return;
    }
    
    console.log('🔍 Preparing to revoke retake:', {
      submissionId: currentSubmission.id,
      selectedStudent,
      selectedExam,
      currentSubmission: {
        id: currentSubmission.id,
        isRetakeAllowed: currentSubmission.isRetakeAllowed,
        flagged: (currentSubmission as any).flagged
      }
    });
    
    // Get student and exam names for confirmation
    const studentName = users.find(u => String(u.id) === String(selectedStudent))?.name || 'Student';
    const examName = exams.find(e => String(e.id) === String(selectedExam))?.title || 'Exam';
    
    // Show confirmation popup
    setPendingRevoke({
      submissionId: currentSubmission.id,
      studentName,
      examName
    });
    setShowRevokeConfirm(true);
  };

  const confirmRevokeRetake = async () => {
    if (!pendingRevoke) {
      console.error('❌ Cannot revoke: pendingRevoke is null');
      return;
    }
    
    // Validate submission ID
    if (!pendingRevoke.submissionId) {
      console.error('❌ Cannot revoke: submissionId is missing', pendingRevoke);
      alert('❌ Invalid submission ID. Please refresh and try again.');
      return;
    }
    
    setIsLoading(true);
    setSuccessMessage('');
    setShowRevokeConfirm(false);
    
    // Store revoke data before API call to avoid losing it
    const revokeData = { ...pendingRevoke };
    
    console.log('🔍 Revoking retake permission:', {
      submissionId: revokeData.submissionId,
      studentName: revokeData.studentName,
      examName: revokeData.examName
    });
    
    try {
      // Step 1: Clear any existing popup timer and close any existing popup
      if (popupTimerRef.current) {
        clearTimeout(popupTimerRef.current);
        popupTimerRef.current = null;
      }
      setShowSuccessPopup(false);
      setSuccessPopupData(null);
      
      // Step 2: Revoke retake permission
      // Send submissionId, userId, and examId to handle cases where submission was deleted
      console.log('  → Calling revokeRetake API...', {
        submissionId: revokeData.submissionId,
        userId: selectedStudent,
        examId: selectedExam
      });
      await revokeRetake(revokeData.submissionId, selectedStudent, selectedExam);
      console.log('  → Revoke API call succeeded');
      
      // Step 3: Force refresh all data IMMEDIATELY to get updated submission
      console.log('  → Refreshing data...');
      await refreshData();
      console.log('  → Data refresh completed');
      
      // Step 4: Show success popup AFTER refresh (ensures currentSubmission is updated)
      setSuccessPopupData({
        studentName: revokeData.studentName,
        examName: revokeData.examName,
        maxAttempts: 0,
        action: 'revoked' as const
      });
      setShowSuccessPopup(true);
      
      // Step 5: Clear pending revoke
      setPendingRevoke(null);

    } catch (error: any) {
      console.error('❌ Error revoking retake:', error);
      console.error('  - Error message:', error?.message);
      console.error('  - Error details:', error?.response || error);
      
      // Hide popup on error
      setShowSuccessPopup(false);
      setSuccessPopupData(null);
      
      // Show user-friendly error message
      const errorMessage = error?.message || 'Failed to revoke retake permission. Please try again.';
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        alert('❌ Submission not found. The submission may have been deleted. Please refresh and try again.');
        // Force refresh to update the UI
        refreshData().catch(err => {
          console.error('Error refreshing data after error:', err);
        });
      } else {
        alert(`❌ ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const cancelRevokeRetake = () => {
    setShowRevokeConfirm(false);
    setPendingRevoke(null);
  };

  const studentsForExam = getStudentsForExam();
  const selectedStudentData = users.find(u => String(u.id) === String(selectedStudent));
  const selectedExamData = exams.find(e => String(e.id) === String(selectedExam));
  
  // Check how many students have actually submitted
  const studentsWithSubmissions = studentsForExam.filter(student => {
    return submissions.some(sub => {
      const examMatch = String(sub.examId) === String(selectedExam);
      const userIdFromSub = typeof sub.userId === 'object' && sub.userId?.id ? sub.userId.id : sub.userId;
      const userMatch = String(userIdFromSub) === String(student.id);
      return examMatch && userMatch;
    });
  });

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Manage Exam Retakes">
        <div className="space-y-6">
          
                  {/* Success Message */}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <div className="flex items-start">
                <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm text-green-700">
                  <p className="font-medium">{successMessage}</p>
                  <p className="mt-1 text-xs">
                    📝 The student will see the exam in their dashboard automatically (within 30 seconds) or when they refresh their browser.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <div className="flex items-start">
              <Icon path="M11.25 11.25l.041-.20a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">Enhanced Retake Management:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Select an exam to see ALL enrolled students (not just those who submitted)</li>
                  <li>Grant retake permissions to any enrolled student, even without prior submissions</li>
                  <li>Retake exams appear in student dashboard regardless of exam schedule</li>
                  <li>Students see changes automatically within 30 seconds or on page refresh</li>
                </ul>
              </div>
            </div>
          </div>

        {/* Exam Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Select Exam
          </label>
          <select
            value={selectedExam}
            onChange={(e) => {
              setSelectedExam(e.target.value);
              setSelectedStudent('');
              setSuccessMessage('');
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Choose an exam...</option>
            {exams.map(exam => (
              <option key={exam.id} value={exam.id}>
                {exam.title}
              </option>
            ))}
          </select>
        </div>

        {/* Student Selection */}
        {selectedExam && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Student 
              <span className="text-slate-500 font-normal">
                ({studentsForExam.length} enrolled, {studentsWithSubmissions.length} have submitted)
              </span>
            </label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Choose a student...</option>
              {studentsForExam.map(student => {
                const hasSubmitted = studentsWithSubmissions.some(s => s.id === student.id);
                return (
                  <option key={student.id} value={student.id}>
                    {student.name} ({student.username || student.email || 'No contact'})
                    {hasSubmitted ? ' ✓' : ' (No submission yet)'}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Student and Submission Info */}
        {selectedStudentData && selectedExamData && (
          <div className="bg-slate-50 p-4 rounded-lg">
            <h3 className="font-semibold text-slate-800 mb-3">
              {currentSubmission ? 'Submission Details' : 'Student Details'}
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-600">Student: <span className="font-medium">{selectedStudentData.name}</span></p>
                <p className="text-slate-600">Exam: <span className="font-medium">{selectedExamData.title}</span></p>
                {currentSubmission ? (
                  <p className="text-slate-600">Attempt: <span className="font-medium">{currentSubmission.attemptNumber || 1}</span></p>
                ) : (
                  <p className="text-slate-600">Status: <span className="font-medium text-orange-600">No submission yet</span></p>
                )}
              </div>
              <div>
                {currentSubmission ? (
                  <>
                    <p className="text-slate-600">Max Attempts: <span className="font-medium">{currentSubmission.maxAttempts || 1}</span></p>
                    <p className="text-slate-600">
                      Score: <span className="font-medium">{Math.round((currentSubmission.totalPointsAwarded / currentSubmission.totalPointsPossible) * 100)}%</span>
                    </p>
                    <p className="text-slate-600">
                      Submitted: <span className="font-medium">{new Date(currentSubmission.submittedAt).toLocaleDateString()}</span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-slate-600">Course: <span className="font-medium">{getCourseName(selectedExamData.courseId)}</span></p>
                    <p className="text-slate-600">
                      Action: <span className="font-medium text-blue-600">Will create initial submission</span>
                    </p>
                    <p className="text-slate-600">
                      Note: <span className="font-medium text-xs">Placeholder submission will be created</span>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Current Retake Status */}
        {selectedStudentData && selectedExamData && (
          <div className="bg-white border border-slate-200 p-4 rounded-lg">
            <h3 className="font-semibold text-slate-800 mb-2">Current Retake Status</h3>
            <div className="flex items-center space-x-2">
              {currentSubmission?.isRetakeAllowed ? (
                <>
                  <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 text-green-500" />
                  <span className="text-green-600 font-medium">✅ Retake Permission Granted</span>
                </>
              ) : (
                <>
                  <Icon path="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 text-red-500" />
                  <span className="text-red-600 font-medium">❌ No Retake Permission</span>
                </>
              )}
            </div>
            {!currentSubmission?.isRetakeAllowed && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Maximum Attempts {currentSubmission ? '(including original attempt)' : '(total attempts allowed)'}
                  </label>
                  <select
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {/* Show options starting from current attempt + 1 if student has submissions */}
                    {currentSubmission ? (
                      Array.from({ length: 8 }, (_, i) => {
                        const attemptCount = Math.max(2, (currentSubmission.attemptNumber || 1) + 1) + i;
                        return (
                          <option key={attemptCount} value={attemptCount}>
                            {attemptCount} attempts ({attemptCount - 1} retakes)
                          </option>
                        );
                      })
                    ) : (
                      <>
                        <option value={2}>2 attempts (1 retake)</option>
                        <option value={3}>3 attempts (2 retakes)</option>
                        <option value={4}>4 attempts (3 retakes)</option>
                        <option value={5}>5 attempts (4 retakes)</option>
                      </>
                    )}
                  </select>
                  {currentSubmission ? (
                    <p className="text-xs text-slate-500 mt-1">
                      Student has already used {currentSubmission.attemptNumber || 1} attempt(s). 
                      {(currentSubmission.attemptNumber || 1) >= (currentSubmission.maxAttempts || 1) ? 
                        'All attempts exhausted - granting additional attempts.' : 
                        `${(currentSubmission.maxAttempts || 1) - (currentSubmission.attemptNumber || 1)} attempts remaining.`
                      }
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">
                      Student will be able to take the exam {maxAttempts} time(s)
                    </p>
                  )}
                </div>
                <button
                  onClick={handleAllowRetake}
                  disabled={isLoading}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-medium transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Icon path="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="w-4 h-4 mr-2 animate-spin" />
                      {currentSubmission ? 'Granting Permission...' : 'Creating Submission & Granting Permission...'}
                    </>
                  ) : (
                    <>
                      <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 mr-2" />
                      Grant Retake Permission
                    </>
                  )}
                </button>
              </div>
            )}

            {currentSubmission?.isRetakeAllowed && (
              <button
                onClick={handleRevokeRetake}
                disabled={isLoading}
                className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-medium transition-colors"
              >
                {isLoading ? (
                  <>
                    <Icon path="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="w-4 h-4 mr-2 animate-spin" />
                    Revoking Permission...
                  </>
                ) : (
                  <>
                    <Icon path="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 mr-2" />
                    Revoke Retake Permission
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Instructions */}
        {!selectedExam && (
          <div className="text-center text-slate-500 py-8">
            <Icon path="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" className="w-8 h-8 mx-auto mb-2" />
            <p>Select an exam to manage retake permissions for enrolled students.</p>
          </div>
        )}

        {selectedExam && studentsForExam.length === 0 && (
          <div className="text-center text-slate-500 py-8">
            <Icon path="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" className="w-8 h-8 mx-auto mb-2" />
            <p>No students are enrolled in this exam's course.</p>
          </div>
        )}

        {selectedExam && !selectedStudent && studentsForExam.length > 0 && (
          <div className="text-center text-slate-500 py-4">
            <p>Select a student to manage their retake permissions.</p>
            <p className="text-xs mt-1">
              You can now grant retake permissions to any enrolled student, even if they haven't submitted the exam yet.
            </p>
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end pt-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-6 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors"
          >
            Close
          </button>
        </div>
        </div>
      </Modal>

      {/* Revoke Confirmation Popup Modal */}
      {showRevokeConfirm && pendingRevoke && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            maxWidth: '500px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              backgroundColor: '#fef2f2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-8 h-8 text-red-600" />
            </div>
            
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937', textAlign: 'center' }}>
              Confirm Revoke Retake Permission
            </h3>
            
            <div style={{ fontSize: '1rem', color: '#374151', marginBottom: '1.5rem', lineHeight: '1.6' }}>
              <p style={{ 
                marginBottom: '1rem',
                padding: '1rem',
                backgroundColor: '#fef2f2',
                borderRadius: '8px',
                border: '2px solid #fecaca'
              }}>
                Are you sure you want to revoke retake permission for <strong style={{ color: '#dc2626' }}>{pendingRevoke.studentName}</strong>?
              </p>
              
              <div style={{ 
                padding: '0.75rem',
                backgroundColor: '#fffbeb',
                borderRadius: '6px',
                border: '1px solid #fde68a'
              }}>
                <p style={{ fontSize: '0.9375rem', color: '#92400e', marginBottom: '0.5rem' }}>
                  <strong>📝 Exam:</strong> {pendingRevoke.examName}
                </p>
                <p style={{ fontSize: '0.875rem', color: '#78350f', margin: 0 }}>
                  ⚠️ This will remove the student's retake permission. The permission can be restored at any time by granting it again.
                </p>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelRevokeRetake}
                disabled={isLoading}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontWeight: '500',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRevokeRetake}
                disabled={isLoading}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  borderRadius: '6px',
                  border: 'none',
                  fontWeight: '500',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.5 : 1
                }}
              >
                {isLoading ? 'Revoking...' : 'Yes, Revoke Permission'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Popup Modal */}
      {showSuccessPopup && successPopupData && (
        <div 
          style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            maxWidth: '500px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              backgroundColor: successPopupData.action === 'granted' ? '#dcfce7' : '#fef2f2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              fontSize: '2rem'
            }}>
              {successPopupData.action === 'granted' ? '✅' : '❌'}
            </div>
            
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.25rem', color: '#1f2937', textAlign: 'center' }}>
              {successPopupData.action === 'granted' ? '✅ Success!' : '❌ Permission Revoked'}
            </h3>
            
            <div style={{ fontSize: '1rem', color: '#374151', marginBottom: '1.5rem', lineHeight: '1.6' }}>
              <p style={{ 
                fontSize: '1.125rem', 
                fontWeight: '600', 
                color: '#1f2937',
                marginBottom: '1rem',
                padding: '0.75rem',
                backgroundColor: successPopupData.action === 'granted' ? '#f0fdf4' : '#fef2f2',
                borderRadius: '8px',
                border: `2px solid ${successPopupData.action === 'granted' ? '#bbf7d0' : '#fecaca'}`,
                textAlign: 'center'
              }}>
                Permission to retake for <strong style={{ color: '#2563eb' }}>{successPopupData.studentName}</strong> has been {successPopupData.action === 'granted' ? 'granted' : 'revoked'}.
              </p>
              
              <p style={{ 
                fontSize: '0.9375rem', 
                color: '#4b5563',
                marginBottom: '0.75rem',
                textAlign: 'center'
              }}>
                📝 Exam: <strong>{successPopupData.examName}</strong>
              </p>
              
              {successPopupData.action === 'granted' && (
                <div style={{ 
                  fontSize: '0.875rem', 
                  backgroundColor: '#dcfce7', 
                  padding: '0.875rem', 
                  borderRadius: '8px',
                  border: '2px solid #bbf7d0',
                  marginTop: '1rem'
                }}>
                  <p style={{ marginBottom: '0.5rem', fontWeight: '600', color: '#166534' }}>
                    📊 Maximum Attempts: <strong>{successPopupData.maxAttempts}</strong>
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#166534', lineHeight: '1.5' }}>
                    🎯 The exam will appear in <strong>{successPopupData.studentName}'s</strong> dashboard automatically within 30 seconds or when they refresh their browser.
                  </p>
                </div>
              )}
              {successPopupData.action === 'revoked' && (
                <div style={{ 
                  fontSize: '0.875rem', 
                  backgroundColor: '#fef2f2', 
                  padding: '0.875rem', 
                  borderRadius: '8px',
                  border: '2px solid #fecaca',
                  marginTop: '1rem',
                  textAlign: 'center'
                }}>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#991b1b', lineHeight: '1.5' }}>
                    You can grant permission again by selecting this student and clicking "Grant Retake Permission".
                  </p>
                </div>
              )}
            </div>
            
            <button
              onClick={() => {
                // Clear timer when manually closing
                if (popupTimerRef.current) {
                  clearTimeout(popupTimerRef.current);
                  popupTimerRef.current = null;
                }
                setShowSuccessPopup(false);
                setSuccessPopupData(null);
              }}
              style={{
                width: '100%',
                backgroundColor: successPopupData.action === 'granted' ? '#16a34a' : '#dc2626',
                color: 'white',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                border: 'none',
                fontWeight: '500',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default RetakeManagementModal;