import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Result, ExamSubmission, User } from '../types';
import { getAIExplanation, getAIPerformanceInsights } from '../services/geminiService';
import { Icon } from './Icon';
import { LoadingSpinner } from './LoadingSpinner';

interface ResultCardProps {
  result: Result;
  index: number;
  isFlagged?: boolean; // Pass flagged status to disable AI features
}

const ResultCard: React.FC<ResultCardProps> = ({ result, index, isFlagged = false }) => {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchExplanation = useCallback(async () => {
    // Don't allow AI explanation for flagged/invalidated submissions
    if (isFlagged) {
      return;
    }
    
    setIsLoading(true);
    try {
      const aiExplanation = await getAIExplanation(result.question, result.userAnswer.answer, result.isCorrect);
      setExplanation(aiExplanation);
    } catch (error) {
      console.error('Error fetching AI explanation:', error);
    } finally {
      setIsLoading(false);
    }
  }, [result, isFlagged]);

  const { question, userAnswer, isCorrect, pointsAwarded, gradingJustification, lecturerOverridePoints, lecturerFeedback } = result;
  
  const displayPoints = lecturerOverridePoints !== undefined ? lecturerOverridePoints : pointsAwarded;
  const displayCorrectness = lecturerOverridePoints !== undefined ? (lecturerOverridePoints >= pointsAwarded && isCorrect) : isCorrect;

  const correctAnswerText = question.options && question.correctAnswer !== undefined
    ? question.type === 'MCQ' 
        ? question.options[question.correctAnswer]
        : question.type === 'TF'
        ? (question.correctAnswer === 1 ? 'True' : 'False')
        : question.type === 'SA'
        ? question.options[question.correctAnswer]
        : question.type === 'Essay'
        ? 'Manual grading required'
        : 'N/A'
    : 'N/A';
  const isCheatingMessage = String(userAnswer.answer) === 'Cheating is not allowed';
  const userAnswerText = isCheatingMessage 
    ? 'Cheating is not allowed' 
    : (userAnswer.answer === null ? 'Not Answered' : 
        (question.options && typeof userAnswer.answer === 'number' && userAnswer.answer >= 0 && userAnswer.answer < question.options.length
          ? question.options[userAnswer.answer]
          : String(userAnswer.answer)));

  return (
    <div className={`bg-white p-6 rounded-2xl shadow-md border-l-8 ${displayCorrectness ? 'border-green-500' : 'border-red-500'}`}>
      <div className="flex justify-between items-start">
        <p className="font-bold text-lg text-slate-800">Q{index + 1}: {question.question || question.text}</p>
        <span className={`font-bold text-lg ${displayCorrectness ? 'text-green-600' : 'text-red-600'}`}>{displayPoints}/{question.points} Points</span>
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex items-start">
          <Icon path={displayCorrectness ? "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" : "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} className={`w-6 h-6 mr-3 mt-1 flex-shrink-0 ${displayCorrectness ? 'text-green-500' : 'text-red-500'}`} />
          <div className="flex-1">
            <span className="font-semibold text-slate-600">Your Answer: </span>
            {isCheatingMessage ? (
              <div className="mt-1">
                <span className="font-bold text-red-700 bg-red-50 px-3 py-1 rounded border border-red-300 inline-block">
                  ⚠️ {userAnswerText}
                </span>
                <p className="text-xs text-red-600 mt-1 italic">
                  This answer was invalidated due to cheating detection. The exam attempt has been disqualified.
                </p>
              </div>
            ) : (
              <span className={`font-medium ${displayCorrectness ? 'text-green-700' : 'text-red-700'}`}>{userAnswerText}</span>
            )}
          </div>
        </div>
        {!displayCorrectness && (
          <div className="flex items-start">
            <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6 mr-3 mt-1 flex-shrink-0 text-green-500" />
            <div>
              <span className="font-semibold text-slate-600">Correct Answer: </span>
              <span className="font-medium text-green-700">{correctAnswerText}</span>
            </div>
          </div>
        )}
      </div>

      {gradingJustification && (
        <div className="mt-4 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <h4 className="font-semibold text-yellow-800 mb-1">AI Grading Rationale:</h4>
          <p className="text-sm text-yellow-900">{gradingJustification}</p>
        </div>
      )}

      {lecturerFeedback && (
        <div className="mt-4 bg-indigo-50 p-4 rounded-lg border border-indigo-200">
          <h4 className="font-semibold text-indigo-700 mb-1">Lecturer Feedback:</h4>
          <p className="text-sm text-indigo-900 whitespace-pre-wrap">{lecturerFeedback}</p>
        </div>
      )}


      <div className="mt-5">
        {!explanation && !isLoading && (
          <button
            onClick={fetchExplanation}
            disabled={isFlagged}
            title={isFlagged ? "AI explanations are not available for invalidated exam attempts" : "Get AI explanation for this question"}
            className={`font-semibold py-2 px-4 rounded-lg transition-all flex items-center text-sm ${
              isFlagged 
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
            }`}
          >
            <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.555L16.5 21.75l-.398-1.195a3.375 3.375 0 00-2.456-2.456L12.75 18l1.195-.398a3.375 3.375 0 002.456-2.456L16.5 14.25l.398 1.195a3.375 3.375 0 002.456 2.456L20.25 18l-1.195.398a3.375 3.375 0 00-2.456 2.456z" className="w-5 h-5 mr-2" />
            Get AI Explanation
            {isFlagged && (
              <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-4 h-4 ml-2" />
            )}
          </button>
        )}
        {isLoading && !isFlagged && <div className="flex items-center space-x-2 text-slate-500"><LoadingSpinner size="h-5 w-5"/><span>Generating explanation...</span></div>}
        {explanation && !isFlagged && (
          <div className="prose prose-sm max-w-none prose-slate mt-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h4 className="prose-h4:mb-2 font-semibold text-indigo-700">AI Explanation:</h4>
            <div dangerouslySetInnerHTML={{ __html: explanation.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
          </div>
        )}
        {isFlagged && (
          <p className="text-xs text-gray-500 mt-2 italic">
            AI explanations are not available for invalidated exam attempts.
          </p>
        )}
      </div>
    </div>
  );
};

interface ResultsViewProps {
  submission: ExamSubmission;
  onRestart: () => void;
  user: User;
}

export const ResultsView: React.FC<ResultsViewProps> = ({ submission, onRestart, user }) => {
  const [insights, setInsights] = useState<string | null>(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  // Check if submission is flagged/invalidated - MUST be declared early since it's used in callbacks
  // Use optional chaining to safely access submission properties
  const isFlagged = submission ? ((submission as any).flagged === true) : false;
  const flagReason = submission ? ((submission as any).flagReason) : undefined;
  const flaggedAt = submission ? ((submission as any).flaggedAt) : undefined;
  const flaggedBy = submission ? ((submission as any).flaggedBy) : undefined;

  const totalOverriddenPoints = useMemo(() => {
    if (!submission || !submission.results) return 0;
    return submission.results.reduce((acc, res) => {
        return acc + (res.lecturerOverridePoints !== undefined ? res.lecturerOverridePoints : res.pointsAwarded);
    }, 0);
  }, [submission]);

  // Check if penalty was applied (compare totalPointsAwarded with calculated points)
  const hasPenaltyApplied = submission ? (submission.totalPointsAwarded < totalOverriddenPoints) : false;
  // Use totalPointsAwarded (which includes penalty) for final score calculation
  const finalScorePoints = hasPenaltyApplied && submission ? submission.totalPointsAwarded : totalOverriddenPoints;
  const totalPointsPossible = submission ? submission.totalPointsPossible : 0;
  const score = totalPointsPossible > 0 ? Math.round((finalScorePoints / totalPointsPossible) * 100) : 0;
  
  const getScoreColor = () => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
  }

  const handleGenerateInsights = useCallback(async () => {
    // Don't allow AI insights for flagged/invalidated submissions
    if (isFlagged || !submission || !submission.results) {
      return;
    }
    
    setIsGeneratingInsights(true);
    try {
      const aiInsights = await getAIPerformanceInsights(submission.results, user.name);
      setInsights(aiInsights);
    } catch (error) {
      console.error('Error generating AI insights:', error);
    } finally {
      setIsGeneratingInsights(false);
    }
  }, [submission, user.name, isFlagged]);

  // Early return check after all hooks
  if (!submission || submission.results.length === 0) {
      return (
        <div className="flex h-screen items-center justify-center flex-col">
            <LoadingSpinner size="h-12 w-12" />
            <p className="mt-4 text-slate-600">Loading results...</p>
        </div>
      )
  }

  // Calculate penalty details if applied
  const penaltyAmount = hasPenaltyApplied ? totalOverriddenPoints - submission.totalPointsAwarded : 0;
  const penaltyPercent = totalOverriddenPoints > 0 ? Math.round((penaltyAmount / totalOverriddenPoints) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-slate-800">Exam Results</h1>
        <p className="text-slate-500 mt-2">Here's your performance breakdown.</p>
      </header>

      {/* Invalidated/Flagged Notice */}
      {isFlagged && (
        <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-6 h-6 text-red-600" />
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-semibold text-red-800 mb-2">
                ⚠️ Session Invalidated / Disqualified
              </h3>
              <p className="text-red-700 mb-2">
                Your exam session has been invalidated by an administrator. This exam attempt is disqualified.
              </p>
              {flagReason && (
                <p className="text-sm text-red-600 mt-2">
                  <strong>Reason:</strong> {flagReason}
                </p>
              )}
              {flaggedBy && (
                <p className="text-xs text-red-500 mt-1">
                  Action taken by: {flaggedBy}
                  {flaggedAt && ` on ${new Date(flaggedAt).toLocaleString()}`}
                </p>
              )}
              <p className="text-sm text-red-600 mt-3 font-medium">
                Please contact your lecturer or administrator if you believe this is an error.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Penalty Notice */}
      {hasPenaltyApplied && !isFlagged && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-lg mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                📉 Penalty Applied
              </h3>
              <p className="text-yellow-700 mb-2">
                A penalty of <strong>{penaltyPercent}%</strong> ({penaltyAmount} points) has been applied to your score due to violations detected during your exam session.
              </p>
              <p className="text-sm text-yellow-600 mt-2">
                Original score: <strong>{totalOverriddenPoints}</strong> points → Final score: <strong>{submission.totalPointsAwarded}</strong> points
              </p>
              <p className="text-xs text-yellow-500 mt-2">
                Please contact your lecturer if you have questions about this penalty.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-2xl shadow-lg mb-8 text-center">
        <h2 className="text-xl font-semibold text-slate-600">Your Score</h2>
        <p className={`text-7xl font-bold my-2 ${getScoreColor()}`}>{score}%</p>
        <p className="text-slate-500">You scored <span className="font-bold text-slate-700">{finalScorePoints}</span> out of <span className="font-bold text-slate-700">{totalPointsPossible}</span> possible points.</p>
        {hasPenaltyApplied && !isFlagged && (
          <p className="text-sm text-yellow-600 mt-2">
            ⚠️ Score includes {penaltyPercent}% penalty deduction
          </p>
        )}
      </div>

       <div className="bg-white p-6 rounded-2xl shadow-lg mb-8">
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
                <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.555L16.5 21.75l-.398-1.195a3.375 3.375 0 00-2.456-2.456L12.75 18l1.195-.398a3.375 3.375 0 002.456-2.456L16.5 14.25l.398 1.195a3.375 3.375 0 002.456 2.456L20.25 18l-1.195.398a3.375 3.375 0 00-2.456 2.456z" className="w-8 h-8 text-indigo-500" />
                <h2 className="text-2xl font-bold text-slate-800">AI Performance Insights</h2>
            </div>
            {!insights && !isGeneratingInsights && (
                <button
                    onClick={handleGenerateInsights}
                    disabled={isFlagged}
                    title={isFlagged ? "AI insights are not available for invalidated exam attempts" : "Generate personalized feedback"}
                    className={`font-semibold py-2 px-4 rounded-lg transition-all flex items-center text-sm ${
                      isFlagged 
                        ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                    }`}
                >
                    Generate Feedback
                    {isFlagged && (
                      <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-4 h-4 ml-2" />
                    )}
                </button>
            )}
        </div>
        <div className="mt-4">
            {isGeneratingInsights && !isFlagged && (
                <div className="flex items-center space-x-2 text-slate-500"><LoadingSpinner size="h-5 w-5"/><span>Generating your personalized feedback... This may take a moment.</span></div>
            )}
            {insights && !isFlagged && (
                 <div 
                    className="prose prose-sm max-w-none prose-slate mt-2 bg-slate-50 p-4 rounded-lg border border-slate-200"
                    dangerouslySetInnerHTML={{ __html: insights.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/### (.*?)(<br \/>|$)/g, '<h3>$1</h3>') }} 
                 />
            )}
            {!insights && !isGeneratingInsights && !isFlagged && (
                <p className="text-slate-500">Click "Generate Feedback" to get a personalized analysis of your performance and study recommendations from our AI tutor.</p>
            )}
            {isFlagged && (
                <p className="text-sm text-gray-500 italic">
                  AI performance insights are not available for invalidated exam attempts.
                </p>
            )}
        </div>
      </div>


      <div className="space-y-6">
        {submission.results.map((result, index) => (
          <ResultCard key={result.question.id} result={result} index={index} isFlagged={isFlagged} />
        ))}
      </div>
      
      <div className="mt-10 text-center">
        <button
          onClick={onRestart}
          className="bg-indigo-600 text-white font-bold py-3 px-8 rounded-lg shadow-md hover:bg-indigo-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center mx-auto"
        >
          <Icon path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.181-3.183m-4.991-2.695v.001" className="w-5 h-5 mr-2"/>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};