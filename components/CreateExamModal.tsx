import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { LoadingSpinner } from './LoadingSpinner';
import { Exam, Question, QuestionType, Course, BankQuestion } from '../types';
import { generateQuestionWithAI } from '../services/geminiService';
import { BulkGenerateModal } from './BulkGenerateModal';
import { ImportFromBankModal } from './ImportFromBankModal';

interface CreateExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (exam: Exam) => void;
  lecturerCourses: Course[];
  examToEdit: Exam | null;
  questionBank: BankQuestion[];
  initialCourseId?: string;
}

// UI-only question type to allow 'answer' while editing before submit
type UIQuestion = Omit<Question, 'id' | 'correctAnswer' | 'options'> & {
  answer?: string | boolean;
  options?: (string | boolean)[];
};

const emptyQuestion: UIQuestion = {
  question: '',
  type: QuestionType.MultipleChoice,
  options: ['', '', '', ''],
  answer: '',
  difficulty: 'medium',
  topic: '',
  points: 5,
};

// Helper to format date for datetime-local input
const toDateTimeLocal = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
};


export const CreateExamModal: React.FC<CreateExamModalProps> = ({ isOpen, onClose, onSave, lecturerCourses, examToEdit, questionBank, initialCourseId }) => {
  const defaultCourseId = initialCourseId && lecturerCourses.some(c => c.id === initialCourseId)
    ? initialCourseId
    : (lecturerCourses.length > 0 ? lecturerCourses[0].id : '');
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState(defaultCourseId);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [questions, setQuestions] = useState<UIQuestion[]>([emptyQuestion]);
  const [isGeneratingAI, setIsGeneratingAI] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Filter bank questions by selected course
  const filteredBankQuestions = useMemo(() => {
    return questionBank.filter(q => q.courseId === courseId);
  }, [questionBank, courseId]);

  const isEditing = examToEdit !== null;

  useEffect(() => {
    if (isOpen) {
        setValidationError(null); // Clear validation errors when modal opens
        if (isEditing) {
            setTitle(examToEdit.title);
            setCourseId(examToEdit.courseId);
            setDurationMinutes(examToEdit.durationMinutes);
            
            // Convert database format (correctAnswer index) to UI format (answer value)
            const convertedQuestions: UIQuestion[] = examToEdit.questions.map((q) => {
              const { id, correctAnswer, ...rest } = q;
              let answer: string | boolean = '';
              let options: (string | boolean)[] = [];
              
              // Ensure question text is available (handle both 'question' and 'text' fields)
              const questionText = (q as any).question || (q as any).text || '';
              
              if (q.type === QuestionType.TrueFalse) {
                // For TF: convert correctAnswer index (0 or 1) to boolean
                answer = correctAnswer === 0 ? true : false;
                options = [true, false];
              } else if (q.type === QuestionType.ShortAnswer) {
                // For SA: get answer from options[0]
                answer = q.options && q.options.length > 0 ? q.options[0] : '';
                options = [];
              } else {
                // For MCQ: get answer from options[correctAnswer]
                options = q.options || [];
                if (typeof correctAnswer === 'number' && correctAnswer >= 0 && correctAnswer < options.length) {
                  answer = options[correctAnswer] || '';
                } else {
                  answer = '';
                }
              }
              
              return {
                ...rest,
                question: questionText,
                answer,
                options,
              } as UIQuestion;
            });
            
            setQuestions(convertedQuestions);
            setAvailableFrom(toDateTimeLocal(examToEdit.availableFrom));
            setAvailableUntil(toDateTimeLocal(examToEdit.availableUntil));
        } else {
            setTitle('');
            const initialId = (initialCourseId && lecturerCourses.some(c => c.id === initialCourseId))
              ? initialCourseId
              : (lecturerCourses.length > 0 ? lecturerCourses[0].id : '');
            setCourseId(initialId);
            setDurationMinutes(60);
            setQuestions([emptyQuestion]);
            
            // Set default availability dates
            const now = new Date();
            const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            setAvailableFrom(toDateTimeLocal(now.toISOString()));
            setAvailableUntil(toDateTimeLocal(sevenDaysLater.toISOString()));
        }
    }
  }, [isOpen, examToEdit, isEditing, lecturerCourses, initialCourseId]);

  const handleSaveFromBank = (importedQuestions: BankQuestion[]) => {
      // Convert bank questions from database format (correctAnswer index) to UI format (answer value)
      const formattedQuestions: UIQuestion[] = importedQuestions.map((q) => {
        const { id, courseId, correctAnswer, ...rest } = q;
        let answer: string | boolean = '';
        let options: (string | boolean)[] = [];
        
        // Ensure question text is available (handle both 'question' and 'text' fields)
        const questionText = (q as any).question || (q as any).text || '';
        
        if (q.type === QuestionType.TrueFalse) {
          // For TF: convert correctAnswer index (0 or 1) to boolean
          answer = correctAnswer === 0 ? true : false;
          options = [true, false];
        } else if (q.type === QuestionType.ShortAnswer) {
          // For SA: get answer from options[0]
          answer = q.options && q.options.length > 0 ? q.options[0] : '';
          options = [];
        } else {
          // For MCQ: get answer from options[correctAnswer]
          options = q.options || [];
          if (typeof correctAnswer === 'number' && correctAnswer >= 0 && correctAnswer < options.length) {
            answer = options[correctAnswer] || '';
          } else {
            answer = '';
          }
        }
        
        return {
          ...rest,
          question: questionText,
          answer,
          options,
        } as UIQuestion;
      });
      
      setQuestions(prev => {
           if (prev.length === 1 && (prev[0].question === '' || !prev[0].question) && !prev[0].topic) {
              return formattedQuestions;
          }
          return [...prev, ...formattedQuestions];
      });
      setIsImportModalOpen(false);
  }

  const handleSaveBulkQuestions = (newBulkQuestions: (Partial<Question> & { answer?: string | boolean })[]) => {
      if (newBulkQuestions.length === 0) return;

      const formattedQuestions: UIQuestion[] = newBulkQuestions.map(q => {
          const isTF = q.type === QuestionType.TrueFalse || (q as any).type === 'TF';
          const normalizedAnswer = isTF ? String((q as any).answer).toLowerCase() === 'true' : (q as any).answer || '';
          const normalizedOptions = isTF
            ? [true, false]
            : (q.options || (q.type === QuestionType.MultipleChoice ? ['', '', '', ''] : []));
          return {
              question: (q as any).question || (q as any).text || '',
              type: (q.type as QuestionType) || QuestionType.MultipleChoice,
              options: normalizedOptions as (string | boolean)[],
              answer: normalizedAnswer,
              difficulty: (q.difficulty as 'easy'|'medium'|'hard') || 'medium',
              topic: q.topic || '',
              points: q.points || 5,
          };
      });
      
      setQuestions(prev => {
          if (prev.length === 1 && (!prev[0].question || prev[0].question === '') && !prev[0].topic) {
              return formattedQuestions;
          }
          return [...prev, ...formattedQuestions];
      });
  };

  const handleQuestionChange = (index: number, field: keyof UIQuestion, value: any) => {
    const newQuestions = [...questions];
    const questionToUpdate = { ...newQuestions[index] };

    if (field === 'type') {
        if(value === QuestionType.MultipleChoice) {
            questionToUpdate.options = questionToUpdate.options?.length ? questionToUpdate.options : ['', '', '', ''];
        } else if (value === QuestionType.TrueFalse) {
            questionToUpdate.options = [true, false];
            questionToUpdate.answer = true;
        } else {
            questionToUpdate.options = [];
        }
    }

    if (field === 'points') {
      value = parseInt(value, 10) || 0;
    }

    (questionToUpdate as any)[field] = value;
    newQuestions[index] = questionToUpdate;
    setQuestions(newQuestions);
  };

  const handleAIGenerate = async (qIndex: number) => {
    const question = questions[qIndex];
    if (!question.topic) {
      setAiError("Please enter a topic before generating with AI.");
      return;
    }
    setAiError(null);
    setIsGeneratingAI(qIndex);
    try {
      const aiQuestion = await generateQuestionWithAI(question.topic, question.type, question.difficulty);
      const normalized: any = { ...aiQuestion };
      const isTF = question.type === QuestionType.TrueFalse || normalized.type === QuestionType.TrueFalse;
      if (isTF) {
        normalized.type = QuestionType.TrueFalse;
        normalized.options = [true, false];
        normalized.answer = String(normalized.answer).toLowerCase() === 'true';
      }
      const newQuestions = [...questions];
      newQuestions[qIndex] = { ...newQuestions[qIndex], ...normalized };
      setQuestions(newQuestions);
    } catch(err: any) {
        setAiError(err.message || 'An unknown error occurred.');
    } finally {
        setIsGeneratingAI(null);
    }
  }

  const handleOptionChange = (qIndex: number, oIndex: number, value: string) => {
    const newQuestions = [...questions];
    const options = [...(newQuestions[qIndex].options || [])];
    options[oIndex] = value;
    newQuestions[qIndex].options = options;
    setQuestions(newQuestions);
  };

  const addOption = (qIndex: number) => {
    const newQuestions = [...questions];
    const options = [...(newQuestions[qIndex].options || []), ''];
    newQuestions[qIndex].options = options;
    setQuestions(newQuestions);
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    const newQuestions = [...questions];
    const options = [...(newQuestions[qIndex].options || [])];
    options.splice(oIndex, 1);
    newQuestions[qIndex].options = options;
    setQuestions(newQuestions);
  };

  const addQuestion = () => {
    setQuestions([...questions, {...emptyQuestion, topic: questions[questions.length-1]?.topic || ''}]);
  };

  const removeQuestion = (index: number) => {
    const newQuestions = [...questions];
    newQuestions.splice(index, 1);
    setQuestions(newQuestions);
  };

  const handleSubmit = () => {
    setValidationError(null); // Clear previous errors
    
    if (!title || !courseId) {
        setValidationError("Please fill in the exam title and select a course.");
        return;
    }
    
    // Validate that all questions have content
    if (questions.length === 0 || questions.every(q => !q.question || !q.question.trim())) {
        setValidationError("Please add at least one question with question text.");
        return;
    }
    
    // Validate availability dates
    if (availableFrom && availableUntil) {
      const fromDate = new Date(availableFrom);
      const untilDate = new Date(availableUntil);
      
      if (untilDate <= fromDate) {
        setValidationError("Available Until date must be after Available From date.");
        return;
      }
    }
    
    try {
      // Validate and process questions
      const finalQuestions: Question[] = questions
        .filter((q) => q.question && q.question.trim().length > 0) // Filter out questions with no text
        .map((q, originalIndex) => {
          const questionIndex = originalIndex + 1;
          const questionText = (q.question || q.text || '').trim();
          
          // Validate question text
          if (!questionText) {
            throw new Error(`Question ${questionIndex}: Question text is required.`);
          }
          
          const originalId = (isEditing && examToEdit!.questions[originalIndex]?.id) 
            ? examToEdit!.questions[originalIndex].id 
            : `q-${Date.now()}-${originalIndex}`;
          
          let optionsOut: string[] = [];
          let correctAnswerOut = 0;
          
          if (q.type === QuestionType.TrueFalse) {
            optionsOut = ['True', 'False'];
            correctAnswerOut = q.answer === true ? 0 : 1;
          } else if (q.type === QuestionType.ShortAnswer) {
            // For ShortAnswer, ensure we have a non-empty answer
            const answer = String(q.answer || '').trim();
            if (!answer) {
              throw new Error(`Question ${questionIndex}: Short Answer questions must have a correct answer.`);
            }
            optionsOut = [answer];
            correctAnswerOut = 0;
          } else {
            // For Multiple Choice, filter out empty options
            const opts = (q.options || []) as (string | boolean)[];
            // Filter out empty strings and whitespace-only strings, and preserve original indices
            const validOptions: { value: string; originalIndex: number }[] = [];
            opts.forEach((opt, optIndex) => {
              const trimmed = String(opt).trim();
              if (trimmed.length > 0) {
                validOptions.push({ value: trimmed, originalIndex: optIndex });
              }
            });
            
            // Validate that we have at least 2 options for MCQ
            if (validOptions.length < 2) {
              throw new Error(`Question ${questionIndex}: Multiple Choice questions must have at least 2 non-empty options.`);
            }
            
            // Extract just the values for the options array
            optionsOut = validOptions.map(o => o.value);
            
            // Find the correct answer - match against the original answer value
            const ans = String(q.answer ?? '').trim();
            const foundIndex = optionsOut.findIndex(o => o === ans);
            
            // If the selected answer was removed (empty option), default to first option
            if (foundIndex < 0) {
              console.warn(`Question ${questionIndex}: Selected answer "${ans}" not found in valid options. Defaulting to first option.`);
              correctAnswerOut = 0;
            } else {
              correctAnswerOut = foundIndex;
            }
          }
          
          return {
            id: originalId,
            type: q.type,
            question: questionText,
            options: optionsOut,
            correctAnswer: correctAnswerOut,
            difficulty: q.difficulty || 'medium',
            topic: q.topic || '',
            points: q.points || 1,
          } as Question;
        });
      
      // Validate that we have at least one valid question
      if (finalQuestions.length === 0) {
        throw new Error("Please add at least one valid question with question text.");
      }

      const newExam: Exam = {
        id: isEditing ? examToEdit!.id : `exam-${Date.now()}`,
        title,
        courseId,
        durationMinutes,
        questions: finalQuestions,
        questionCount: finalQuestions.length,
        availableFrom: availableFrom ? new Date(availableFrom).toISOString() : undefined,
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : undefined,
      };
      // mark for cross-tab success toast
      try { sessionStorage.setItem('iqbaes-last-action', isEditing ? 'exam-updated' : 'exam-created'); } catch {}
      onSave(newExam);
      onClose();
    } catch (error: any) {
      // Catch validation errors from question processing
      setValidationError(error.message || "Please check all questions are filled correctly.");
    }
  };

  return (
    <>
      <BulkGenerateModal 
        isOpen={isBulkModalOpen} 
        onClose={() => setIsBulkModalOpen(false)} 
        onSave={handleSaveBulkQuestions} 
        initialTopic={questions[0]?.topic || ''}
      />
      <ImportFromBankModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSave={handleSaveFromBank}
        questionBank={filteredBankQuestions}
      />
      <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        title={isEditing ? 'Edit Exam' : 'Create New Exam'}
        footer={
          <div className="flex justify-end p-6 space-x-4">
            <button onClick={onClose} className="px-6 py-3 text-base text-slate-600 font-semibold rounded-none hover:bg-slate-100 transition-colors">Cancel</button>
            <button onClick={handleSubmit} className="px-8 py-3 text-base bg-indigo-600 text-white font-bold rounded-none shadow-md hover:bg-indigo-700 transition-all">{isEditing ? 'Save Changes' : 'Create Exam'}</button>
          </div>
        }
      >
        <div className="space-y-6">
        {validationError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-none">
            <div className="flex">
              <div className="flex-shrink-0">
                <Icon name="exclamation-triangle" className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">{validationError}</p>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-4 border-b pb-6">
            {/* Horizontal layout: metadata left, main inputs right */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="md:col-span-1 space-y-4">
                <div>
                  <label className="block text-base font-medium text-slate-700 mb-2">Course</label>
                  <select value={courseId} onChange={e => setCourseId(e.target.value)} className="mt-1 block w-full pl-4 pr-10 py-3 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-none bg-white border">
                    {lecturerCourses.map(course => (
                      <option key={course.id} value={course.id}>{course.code} - {course.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-base font-medium text-slate-700 mb-2">Duration (Minutes)</label>
                  <input type="number" value={durationMinutes} onChange={e => setDurationMinutes(parseInt(e.target.value, 10))} className="mt-1 block w-full px-4 py-3 text-base border border-slate-300 rounded-none shadow-sm" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-base font-medium text-slate-700 mb-2">Exam Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="mt-1 block w-full px-4 py-3 text-base border border-slate-300 rounded-none shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="available-from" className="block text-base font-medium text-slate-700 mb-2">Available From</label>
                    <input id="available-from" type="datetime-local" value={availableFrom} onChange={e => setAvailableFrom(e.target.value)} className="mt-1 block w-full px-4 py-3 text-base border border-slate-300 rounded-none shadow-sm" />
                  </div>
                  <div>
                      <label htmlFor="available-until" className="block text-base font-medium text-slate-700 mb-2">Available Until</label>
                    <input id="available-until" type="datetime-local" value={availableUntil} onChange={e => setAvailableUntil(e.target.value)} className="mt-1 block w-full px-4 py-3 text-base border border-slate-300 rounded-none shadow-sm" />
                </div>
            </div>
        </div>
        
        {/* Action Buttons */}
        <div className="bg-slate-50 p-4 rounded-none border border-slate-200 mb-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Question Management</h3>
                <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-full">{questions.length} question{questions.length !== 1 ? 's' : ''} added</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button 
                    onClick={() => setIsBulkModalOpen(true)} 
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold py-3 px-4 rounded-none hover:from-purple-700 hover:to-indigo-700 flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow-md"
                >
                    <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-4 h-4 mr-2" />
                    <div className="text-left">
                        <div className="text-sm">AI Bulk Generate</div>
                        <div className="text-xs opacity-80">Create multiple questions</div>
                    </div>
                </button>
                <button 
                    onClick={() => setIsImportModalOpen(true)} 
                    disabled={!courseId || filteredBankQuestions.length === 0}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold py-3 px-4 rounded-none hover:from-green-700 hover:to-emerald-700 flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow-md disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed"
                >
                    <Icon path="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v3.776" className="w-4 h-4 mr-2" />
                    <div className="text-left">
                        <div className="text-sm">Import from Bank</div>
                        <div className="text-xs opacity-80">{!courseId ? 'Select a course first' : filteredBankQuestions.length === 0 ? 'No questions in this course' : 'Use existing questions'}</div>
                    </div>
                </button>
                <button 
                     onClick={addQuestion} 
                     className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold py-3 px-4 rounded-none hover:from-blue-700 hover:to-cyan-700 flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow-md"
                 >
                    <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-4 h-4 mr-2" />
                    <div className="text-left">
                        <div className="text-sm">Add Question</div>
                        <div className="text-xs opacity-80">Create manually</div>
                    </div>
                </button>
            </div>
            {(!courseId) && (<p className="text-xs text-slate-500 mt-2">Select a course to import from bank.</p>)}
            {(courseId && filteredBankQuestions.length === 0) && (<p className="text-xs text-slate-500 mt-2">No bank questions found for the selected course.</p>)}
        </div>
        
        {questions.map((q, qIndex) => (
          <div key={qIndex} className="p-4 border rounded-none bg-slate-50 relative space-y-3">
            <div className="flex justify-between items-start">
                <h4 className="font-semibold text-slate-800 pt-1">Question {qIndex + 1}</h4>
                {questions.length > 1 && (
                    <button onClick={() => removeQuestion(qIndex)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100">
                        <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5"/>
                    </button>
                )}
            </div>
            
            <textarea value={q.question} onChange={e => handleQuestionChange(qIndex, 'question', e.target.value)} placeholder="Question Text" className="w-full p-2 border border-slate-300 rounded-none" rows={3}/>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select value={q.type} onChange={e => handleQuestionChange(qIndex, 'type', e.target.value as QuestionType)} className="md:col-span-1 p-2 border border-slate-300 rounded-none bg-white">
                    <option value={QuestionType.MultipleChoice}>Multiple Choice</option>
                    <option value={QuestionType.TrueFalse}>True/False</option>
                    <option value={QuestionType.ShortAnswer}>Short Answer</option>
                </select>
                <select value={q.difficulty} onChange={e => handleQuestionChange(qIndex, 'difficulty', e.target.value as 'easy'|'medium'|'hard')} className="md:col-span-1 p-2 border border-slate-300 rounded-none bg-white">
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                </select>
                 <div>
                    <label htmlFor={`points-${qIndex}`} className="sr-only">Points</label>
                    <input id={`points-${qIndex}`} type="number" value={q.points} onChange={e => handleQuestionChange(qIndex, 'points', e.target.value)} className="w-full p-2 border border-slate-300 rounded-none" placeholder="Points" />
                </div>
            </div>
            
            <div className="p-3 bg-indigo-50 rounded-none border border-indigo-200 space-y-2">
                <div className="flex items-center space-x-2">
                    <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-5 h-5 text-indigo-500" />
                    <label className="text-sm font-medium text-slate-700">AI Generation Topic</label>
                </div>
                <div className="flex items-center space-x-2">
                    <input type="text" value={q.topic} onChange={e => handleQuestionChange(qIndex, 'topic', e.target.value)} placeholder="e.g., Database Normalization" className="flex-grow p-2 border border-slate-300 rounded-none"/>
                    <button onClick={() => handleAIGenerate(qIndex)} disabled={isGeneratingAI !== null} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-none hover:bg-indigo-700 flex items-center disabled:bg-indigo-400">
                        {isGeneratingAI === qIndex ? <LoadingSpinner size="h-5 w-5" color="border-white" /> : '✨ Generate'}
                    </button>
                </div>
                 {aiError && isGeneratingAI === qIndex && <p className="text-xs text-red-600">{aiError}</p>}
            </div>
            
            {q.type === QuestionType.MultipleChoice && q.options && (
                <div className="pl-4 border-l-2 border-slate-300 space-y-2">
                    <label className="text-sm font-medium text-slate-700">Options</label>
                    {q.options.map((opt, oIndex) => (
                        <div key={oIndex} className="flex items-center space-x-2">
                            <input type="radio" name={`q-answer-${qIndex}`} value={opt} checked={q.answer === opt} onChange={() => handleQuestionChange(qIndex, 'answer', opt)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"/>
                            <input type="text" value={opt} onChange={e => handleOptionChange(qIndex, oIndex, e.target.value)} placeholder={`Option ${oIndex + 1}`} className="flex-grow p-2 border border-slate-300 rounded-none"/>
                            {q.options && q.options.length > 2 && <button onClick={() => removeOption(qIndex, oIndex)} className="text-red-500 p-1 rounded-full hover:bg-red-100"><Icon path="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5"/></button>}
                        </div>
                    ))}
                    {q.options.length < 5 && <button onClick={() => addOption(qIndex)} className="text-sm text-indigo-600 font-semibold">+ Add Option</button>}
                </div>
            )}

            {q.type === QuestionType.TrueFalse && (
                <div>
                     <label className="text-sm font-medium text-slate-700 block mb-2">Correct Answer</label>
                     <div className="flex space-x-4">
                        <label className="flex items-center"><input type="radio" name={`q-answer-${qIndex}`} checked={q.answer === true} onChange={() => handleQuestionChange(qIndex, 'answer', true)} className="h-4 w-4 text-indigo-600"/> <span className="ml-2">True</span></label>
                        <label className="flex items-center"><input type="radio" name={`q-answer-${qIndex}`} checked={q.answer === false} onChange={() => handleQuestionChange(qIndex, 'answer', false)} className="h-4 w-4 text-indigo-600"/> <span className="ml-2">False</span></label>
                     </div>
                </div>
            )}
            
            {q.type === QuestionType.ShortAnswer && (
                 <div>
                    <label className="text-sm font-medium text-slate-700">Correct Answer</label>
                    <input type="text" value={q.answer as string} onChange={e => handleQuestionChange(qIndex, 'answer', e.target.value)} placeholder="Correct Answer" className="w-full p-2 border border-slate-300 rounded-none mt-1"/>
                </div>
            )}

          </div>
        ))}
        <button onClick={addQuestion} className="w-full text-center py-2 border-2 border-dashed rounded-none text-indigo-600 border-indigo-300 hover:bg-indigo-50 transition">
          + Add another question
        </button>
        </div>
      </Modal>
    </>
  );
};
