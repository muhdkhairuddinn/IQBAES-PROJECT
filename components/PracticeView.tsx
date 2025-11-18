import React, { useState, useCallback } from 'react';
import { Exam, Question, QuestionType, UserAnswer } from '../types';
import { Icon } from './Icon';
import { getAIExplanation } from '../services/geminiService';
import { LoadingSpinner } from './LoadingSpinner';

interface PracticeQuestionCardProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  onNext: (isCorrect: boolean) => void;
}

const PracticeQuestionCard: React.FC<PracticeQuestionCardProps> = ({ question, questionNumber, totalQuestions, onNext }) => {
    const [selectedAnswer, setSelectedAnswer] = useState<string | boolean | null>(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const [explanation, setExplanation] = useState<string | null>(null);
    const [isExplanationLoading, setIsExplanationLoading] = useState(false);
    
    const correctAnswer = question.options && question.correctAnswer !== undefined 
    ? question.options[question.correctAnswer] 
    : question.correctAnswer;
  const isCorrect = selectedAnswer !== null && String(selectedAnswer).toLowerCase() === String(correctAnswer).toLowerCase();

    const handleAnswerSubmit = useCallback(async () => {
        if (selectedAnswer === null) return;
        setIsAnswered(true);
        setIsExplanationLoading(true);
        const aiExplanation = await getAIExplanation(question, selectedAnswer, isCorrect);
        setExplanation(aiExplanation);
        setIsExplanationLoading(false);
    }, [selectedAnswer, question, isCorrect]);

    const handleNextClick = () => {
        onNext(isCorrect);
        // Reset state for next question
        setSelectedAnswer(null);
        setIsAnswered(false);
        setExplanation(null);
        setIsExplanationLoading(false);
    };

    const getOptionClass = (option: string | boolean, answerType: 'selected' | 'correct' | 'incorrect', optionIndex?: number) => {
        if (!isAnswered) {
             return selectedAnswer === option ? 'bg-indigo-100 border-indigo-500' : 'bg-white hover:bg-slate-50 border-slate-200';
        }
        
        const isSelected = String(selectedAnswer).toLowerCase() === String(option).toLowerCase();
        const isActuallyCorrect = optionIndex !== undefined ? question.correctAnswer === optionIndex : false;

        if (isActuallyCorrect) return 'bg-green-100 border-green-500';
        if (isSelected && !isActuallyCorrect) return 'bg-red-100 border-red-500';
        return 'bg-white border-slate-200 opacity-70';
    };

    const renderQuestionBody = () => {
        console.log('🔍 PracticeView - Question data:', {
            id: question.id,
            type: question.type,
            text: question.text?.substring(0, 50),
            options: question.options,
            optionsLength: question.options?.length
        });
        
        switch(question.type) {
            case QuestionType.MultipleChoice:
                return (
                    <div className="space-y-3 mt-4">
                        {question.options?.map((option, index) => (
                            <label key={index} className={`flex items-center p-4 rounded-lg border-2 transition-colors ${isAnswered ? 'cursor-default' : 'cursor-pointer'} ${getOptionClass(option, 'selected', index)}`}>
                                <input type="radio" name={question.id} value={option} checked={selectedAnswer === option} onChange={e => setSelectedAnswer(e.target.value)} disabled={isAnswered} className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 disabled:opacity-50"/>
                                <span className="ml-4 text-slate-700">{option}</span>
                            </label>
                        ))}
                    </div>
                );
            case QuestionType.TrueFalse:
                 return (
                    <div className="flex space-x-4 mt-4">
                        {[true, false].map((option, index) => (
                             <label key={String(option)} className={`flex-1 flex items-center justify-center p-4 rounded-lg border-2 transition-colors ${isAnswered ? 'cursor-default' : 'cursor-pointer'} ${getOptionClass(option, 'selected', index)}`}>
                                <input type="radio" name={question.id} value={String(option)} checked={selectedAnswer === option} onChange={() => setSelectedAnswer(option)} disabled={isAnswered} className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 disabled:opacity-50"/>
                                <span className="ml-4 text-slate-700 font-semibold">{option ? 'True' : 'False'}</span>
                            </label>
                        ))}
                    </div>
                );
            case QuestionType.ShortAnswer:
                return (
                     <div className="mt-4">
                        <textarea
                            value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
                            onChange={e => setSelectedAnswer(e.target.value)}
                            disabled={isAnswered}
                            className="w-full p-3 border-2 border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition disabled:bg-slate-50"
                            placeholder="Type your answer here..."
                            rows={4}
                        />
                     </div>
                )
            default:
                return null;
        }
    }

    return (
        <div className="bg-white p-8 rounded-2xl shadow-lg">
            <p className="text-sm font-semibold text-indigo-600">Practice Question {questionNumber} of {totalQuestions}</p>
            <p className="mt-2 text-xl text-slate-800">{question.question || question.text}</p>
            {renderQuestionBody()}

            {isAnswered && (
                <div className="mt-6">
                    {isExplanationLoading ? (
                        <div className="flex items-center space-x-2 text-slate-500"><LoadingSpinner size="h-5 w-5"/><span>Generating explanation...</span></div>
                    ) : (
                         explanation && (
                            <div className={`prose prose-sm max-w-none prose-slate mt-2 p-4 rounded-lg border ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                <h4 className={`prose-h4:mb-2 font-semibold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>AI Explanation:</h4>
                                <div dangerouslySetInnerHTML={{ __html: explanation.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                            </div>
                        )
                    )}
                </div>
            )}

            <div className="mt-6 pt-6 border-t border-slate-200 flex justify-end">
                {!isAnswered ? (
                    <button
                        onClick={handleAnswerSubmit}
                        disabled={selectedAnswer === null}
                        className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300"
                    >
                        Check Answer
                    </button>
                ) : (
                    <button
                        onClick={handleNextClick}
                        className="bg-indigo-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-indigo-700 transition-colors flex items-center shadow-lg"
                    >
                        {questionNumber === totalQuestions ? 'Finish Practice' : 'Next Question'}
                        <Icon path="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" className="w-5 h-5 ml-2"/>
                    </button>
                )}
            </div>
        </div>
    );
};


export const PracticeView: React.FC<{ quiz: Exam, courseName: string, onFinish: () => void }> = ({ quiz, courseName, onFinish }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const handleNext = (wasCorrect: boolean) => {
    if(wasCorrect) {
        setCorrectCount(prev => prev + 1);
    }
    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
        setIsFinished(true);
    }
  };

  if(isFinished) {
      const score = quiz.questions.length > 0 ? Math.round((correctCount / quiz.questions.length) * 100) : 0;
      return (
          <div className="bg-slate-100 min-h-screen flex flex-col items-center justify-center p-4">
              <div className="text-center bg-white p-10 rounded-2xl shadow-lg max-w-lg">
                  <Icon path="M16.5 18.75h-9a9 9 0 100-12h9a9 9 0 000 12z" className="w-16 h-16 text-green-500 mx-auto mb-4"/>
                  <h1 className="text-3xl font-bold text-slate-800">Practice Complete!</h1>
                  <p className="text-slate-500 mt-2">Great work! You scored {correctCount} out of {quiz.questions.length}.</p>
                  <p className={`text-6xl font-bold my-4 ${score >= 80 ? 'text-green-500' : score >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>{score}%</p>
                  <p className="text-slate-600">Keep practicing to master the material.</p>
                  <button onClick={onFinish} className="mt-8 bg-indigo-600 text-white font-bold py-3 px-8 rounded-lg shadow-md hover:bg-indigo-700 transition-all">
                      Back to Dashboard
                  </button>
              </div>
          </div>
      )
  }

  return (
    <div className="bg-slate-100 min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-4xl mx-auto flex justify-between items-center p-4 bg-white rounded-2xl shadow-md mb-6">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">{quiz.title}</h1>
            <p className="text-slate-500">{courseName}</p>
        </div>
         <div className="text-right">
             <p className="font-semibold text-slate-800">Score: {correctCount}/{currentQuestionIndex}</p>
        </div>
      </header>
      
      <main className="w-full max-w-4xl flex-grow">
          <PracticeQuestionCard
            question={quiz.questions[currentQuestionIndex]}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={quiz.questions.length}
            onNext={handleNext}
          />
      </main>
    </div>
  );
};
