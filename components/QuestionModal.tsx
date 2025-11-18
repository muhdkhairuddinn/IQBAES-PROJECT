import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { LoadingSpinner } from './LoadingSpinner';
import { BankQuestion, Question, QuestionType, Course } from '../types';
import { generateQuestionWithAI } from '../services/geminiService';

interface QuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (question: Omit<BankQuestion, 'id'> | BankQuestion) => void;
  questionToEdit: BankQuestion | null;
  courses?: Course[];
  defaultCourseId?: string;
}

// Define a local editable type that includes UI-only 'answer'
type EditableQuestion = {
  question?: string;
  text?: string;
  type: QuestionType;
  options?: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  topic?: string;
  points: number;
  answer?: string | boolean;
};

// Helper functions to convert between UI string values and QuestionType enum
const stringToQuestionType = (str: string): QuestionType => {
  switch (str) {
    case 'multiple_choice': return QuestionType.MultipleChoice;
    case 'true_false': return QuestionType.TrueFalse;
    case 'short_answer': return QuestionType.ShortAnswer;
    default: return QuestionType.MultipleChoice;
  }
};

const questionTypeToString = (type: QuestionType): string => {
  switch (type) {
    case QuestionType.MultipleChoice: return 'multiple_choice';
    case QuestionType.TrueFalse: return 'true_false';
    case QuestionType.ShortAnswer: return 'short_answer';
    default: return 'multiple_choice';
  }
};

const emptyQuestion: EditableQuestion = {
  question: '',
  type: QuestionType.MultipleChoice,
  options: ['', '', '', ''],
  answer: undefined,
  difficulty: 'medium',
  topic: '',
  points: 5,
};

export const QuestionModal: React.FC<QuestionModalProps> = ({ isOpen, onClose, onSave, questionToEdit, courses = [], defaultCourseId }) => {
  const [questionData, setQuestionData] = useState<EditableQuestion>(emptyQuestion);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  
  const isEditing = questionToEdit !== null;

  useEffect(() => {
    if (isOpen) {
        if (isEditing) {
            const { id, courseId, ...editableData } = questionToEdit;
            setSelectedCourseId(courseId || '');
            
            // Transform data from database format to UI format
            let answer = (editableData as any).answer || '';
            let options = editableData.options || ['', '', '', ''];
            
            if (editableData.type === QuestionType.TrueFalse) {
                // For TF questions: convert correctAnswer index back to boolean
                answer = editableData.correctAnswer === 0 ? true : false;
                options = ['True', 'False']; // Ensure consistent options
            } else if (editableData.type === QuestionType.ShortAnswer) {
                // For SA questions: get answer from options[0]
                answer = editableData.options?.[0] || '';
                options = []; // Clear options for SA in UI
            } else if (editableData.type === QuestionType.MultipleChoice) {
                // For MCQ: set answer to the option at correctAnswer index
                const opts = editableData.options || ['', '', '', ''];
                options = opts;
                if (typeof editableData.correctAnswer === 'number' && editableData.correctAnswer >= 0 && editableData.correctAnswer < opts.length) {
                    answer = opts[editableData.correctAnswer];
                } else {
                    answer = '';
                }
            }
            
            setQuestionData({
                ...editableData,
                answer,
                options
            });
        } else {
            setQuestionData(emptyQuestion);
            setSelectedCourseId(defaultCourseId || '');
        }
    }
  }, [isOpen, questionToEdit, isEditing, defaultCourseId]);

  const handleDataChange = (field: keyof EditableQuestion, value: any) => {
    const newData = { ...questionData };
    if (field === 'type') {
        // Convert UI string value to QuestionType enum
        const questionType = stringToQuestionType(value);
        newData.type = questionType;
        
        if (questionType === QuestionType.MultipleChoice) { 
          // Always reset to 4 empty options when switching to Multiple Choice
          newData.options = ['', '', '', ''];
          newData.answer = undefined;
        }
        else if (questionType === QuestionType.TrueFalse) { 
          newData.answer = undefined; 
          newData.options = ['True','False']; 
        }
        else { // Short Answer
          newData.options = []; 
          newData.answer = undefined; 
        }
    } else {
      // Only set field value if it's not 'type' (since we handle type above)
      if (field === 'points') value = parseInt(value, 10) || 0;
      (newData as any)[field] = value;
    }
    setFormError(null);
    setQuestionData(newData);
  };
  
  const handleAIGenerate = async () => {
    if (!questionData.topic) {
      setAiError("Please enter a topic before generating with AI.");
      return;
    }
    setAiError(null);
    setIsGeneratingAI(true);
    try {
      const aiQuestion = await generateQuestionWithAI(questionData.topic, questionData.type, questionData.difficulty);
      const normalized: any = { ...aiQuestion };
      const isTF = questionData.type === QuestionType.TrueFalse || normalized.type === QuestionType.TrueFalse || (normalized.type as any) === 'TF';
      if (isTF) {
        normalized.type = QuestionType.TrueFalse;
        normalized.options = ['True','False'];
        const rawAns = normalized.answer;
        if (rawAns !== undefined && rawAns !== null && String(rawAns).trim() !== '') {
          normalized.answer = String(rawAns).toLowerCase() === 'true';
        } else {
          normalized.answer = undefined;
        }
      } else if (questionData.type === QuestionType.MultipleChoice) {
        // Ensure at least 4 options and a default answer
        const opts = Array.isArray(normalized.options) ? normalized.options : [];
        while (opts.length < 4) opts.push('');
        normalized.options = opts.slice(0, 4);
        if (!normalized.answer || typeof normalized.answer !== 'string') {
          const firstNonEmpty = normalized.options.find((o: string) => String(o).trim() !== '');
          if (firstNonEmpty) normalized.answer = firstNonEmpty;
        }
      } else if (questionData.type === QuestionType.ShortAnswer) {
        if (!normalized.answer || typeof normalized.answer !== 'string') {
          normalized.answer = '';
        }
      }
      setQuestionData(prev => ({ ...prev, ...normalized }));
    } catch(err: any) {
        setAiError(err.message || 'An unknown error occurred.');
    } finally {
        setIsGeneratingAI(false);
    }
  };
  
  const handleOptionChange = (oIndex: number, value: string) => {
    const options = [...(questionData.options || [])];
    options[oIndex] = value;
    handleDataChange('options', options);
  };
  
  const handleSubmit = () => {
    setFormError(null);
    // Validation: require TF answer selection
    if (questionData.type === QuestionType.TrueFalse && typeof questionData.answer !== 'boolean') {
      setFormError('Please select True or False as the correct answer.');
      return;
    }
  
    // Validation: require MCQ answer selection
    if (questionData.type === QuestionType.MultipleChoice) {
      const opts = (questionData.options || []).map(o => String(o));
      const ans = typeof questionData.answer === 'string' ? questionData.answer.trim() : '';
      const idx = opts.findIndex(o => o === ans);
      if (!ans || idx < 0) {
        setFormError('Please select the correct option as the answer.');
        return;
      }
    }
  
    // Transform data based on question type to match database format
    const finalData: any = { ...questionData };
    
    if (questionData.type === QuestionType.TrueFalse) {
      // For True/False questions: options=['True', 'False'], correctAnswer=0 or 1
      finalData.options = ['True', 'False'];
      finalData.correctAnswer = questionData.answer === true || questionData.answer === 'true' ? 0 : 1;
    } else if (questionData.type === QuestionType.ShortAnswer) {
      // For Short Answer questions: options=[answer], correctAnswer=0
      finalData.options = [String(questionData.answer || '')];
      finalData.correctAnswer = 0;
    } else {
      // For MCQ: derive correctAnswer index from selected answer
      const opts = finalData.options || [];
      const idx = opts.findIndex((opt: string) => opt === finalData.answer);
      finalData.correctAnswer = idx >= 0 ? idx : 0;
    }

    // Ensure backend-compatible fields
    if (finalData.topic && !finalData.category) {
      finalData.category = finalData.topic;
    }
    if (!finalData.question && finalData.text) {
      finalData.question = finalData.text;
    }
    delete finalData.answer; // UI-only field

    // Require course selection
    finalData.courseId = selectedCourseId;
    if (!finalData.courseId) {
      setFormError('Please select a course before saving.');
      return;
    }

    if (isEditing) {
        // mark for cross-tab success toast
        try { sessionStorage.setItem('iqbaes-last-action', 'question-updated'); } catch {}
        onSave({ ...questionToEdit!, ...finalData });
    } else {
        // mark for cross-tab success toast
        try { sessionStorage.setItem('iqbaes-last-action', 'question-created'); } catch {}
        onSave(finalData as Omit<BankQuestion, 'id'>);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Question' : 'Add Question to Bank'} zIndex={60}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto p-2 pr-4">
        {/* Course Selector */}
        {/* Horizontal layout: metadata left, main inputs right */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div className="md:col-span-1">
            <label className="text-base font-medium text-slate-700 block mb-2">Course</label>
            <select 
              value={selectedCourseId}
              onChange={e => setSelectedCourseId(e.target.value)}
              className={`w-full px-4 py-3 text-base border rounded-none bg-white ${!selectedCourseId ? 'border-red-300' : 'border-slate-300'}`}
            >
              <option value="">Select a course...</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Metadata stack */}
            <div className="mt-4 space-y-3">
               <div>
                 <label className="text-base font-medium text-slate-700 block mb-2">Type</label>
                 <select value={questionTypeToString(questionData.type)} onChange={e => handleDataChange('type', e.target.value)} className="w-full px-4 py-3 text-base border border-slate-300 rounded-none">
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True / False</option>
                  <option value="short_answer">Short Answer</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                 <div>
                   <label className="text-base font-medium text-slate-700 block mb-2">Difficulty</label>
                   <select value={questionData.difficulty} onChange={e => handleDataChange('difficulty', e.target.value)} className="w-full px-4 py-3 text-base border border-slate-300 rounded-none">
                     <option value="easy">Easy</option>
                     <option value="medium">Medium</option>
                     <option value="hard">Hard</option>
                   </select>
                 </div>
                 <div>
                   <label className="text-base font-medium text-slate-700 block mb-2">Points</label>
                   <input type="number" value={questionData.points} onChange={e => handleDataChange('points', Number(e.target.value))} className="w-full px-4 py-3 text-base border border-slate-300 rounded-none"/>
                </div>
              </div>
            </div>
          </div>
           <div className="md:col-span-2">
             <label className="block text-base font-medium text-slate-700 mb-2">Question Text</label>
             <textarea value={questionData.question} onChange={e => handleDataChange('question', e.target.value)} placeholder="Question Text" className="w-full px-4 py-3 text-base border border-slate-300 rounded-none" rows={4}/>
          </div>
        </div>
        {/* Removed duplicate metadata row (now handled on the left column) */}
        
        {/* AI Generation Section */}
        <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-none border border-indigo-200 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-5 h-5 text-indigo-500" />
                    <label className="text-sm font-medium text-slate-700">AI Question Generator</label>
                </div>
                <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-full">Powered by AI</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Topic/Subject</label>
                     <input 
                         type="text" 
                         value={questionData.topic} 
                         onChange={e => handleDataChange('topic', e.target.value)} 
                         placeholder="e.g., Database Normalization, Loops in Python" 
                         className="w-full px-4 py-3 text-base border border-slate-300 rounded-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
                <div className="flex items-end">
                    <button 
                        onClick={handleAIGenerate} 
                        disabled={isGeneratingAI || !questionData.topic?.trim()} 
                        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-2 px-4 rounded-none hover:from-indigo-700 hover:to-purple-700 flex items-center justify-center disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200"
                    >
                        {isGeneratingAI ? (
                            <>
                                <LoadingSpinner size="h-4 w-4" color="border-white" />
                                <span className="ml-2">Generating...</span>
                            </>
                        ) : (
                            <>
                                <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-4 h-4 mr-2" />
                                Generate Question
                            </>
                        )}
                    </button>
                </div>
            </div>
            
            {aiError && (
                <div className="flex items-center space-x-2 p-2 bg-red-50 border border-red-200 rounded-none">
                    <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-4 h-4 text-red-500" />
                    <p className="text-xs text-red-600">{aiError}</p>
                </div>
            )}
            
            <div className="text-xs text-slate-500 bg-white/50 p-2 rounded border">
                💡 <strong>Tip:</strong> Be specific with your topic for better AI-generated questions. 
                The AI will create a question based on your selected type and difficulty level.
            </div>
        </div>
        
        {questionData.type === QuestionType.MultipleChoice && questionData.options && (
            <div className="pl-4 border-l-2 border-slate-300 space-y-3 mt-4">
                <label className="text-base font-medium text-slate-700 block mb-3">Options & Correct Answer</label>
                {questionData.options.map((opt, oIndex) => (
                    <div key={oIndex} className="flex items-center space-x-3">
                        <input 
                          type="radio" 
                          name="q-answer-mcq" 
                          value={opt} 
                          checked={typeof questionData.answer === 'string' && questionData.answer === opt} 
                          onChange={() => handleDataChange('answer', opt)} 
                          className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                        />
                        <input 
                          type="text" 
                          value={opt} 
                          onChange={e => handleOptionChange(oIndex, e.target.value)} 
                          placeholder={`Option ${oIndex + 1}`} 
                          className="flex-grow px-4 py-3 text-base border border-slate-300 rounded-none"
                        />
                    </div>
                ))}
            </div>
        )}

        {questionData.type === QuestionType.TrueFalse && (
             <div className="pl-4 border-l-2 border-slate-300 space-y-3 mt-4">
                  <label className="text-base font-medium text-slate-700 block mb-3">Correct Answer</label>
                  <div className="flex space-x-6">
                     <label className="flex items-center space-x-2 cursor-pointer">
                       <input 
                         type="radio" 
                         name="q-answer-tf" 
                         checked={questionData.answer === true} 
                         onChange={() => handleDataChange('answer', true)} 
                         className="h-5 w-5 text-indigo-600 focus:ring-indigo-500"
                       /> 
                       <span className="text-base text-slate-700">True</span>
                     </label>
                     <label className="flex items-center space-x-2 cursor-pointer">
                       <input 
                         type="radio" 
                         name="q-answer-tf" 
                         checked={questionData.answer === false} 
                         onChange={() => handleDataChange('answer', false)} 
                         className="h-5 w-5 text-indigo-600 focus:ring-indigo-500"
                       /> 
                       <span className="text-base text-slate-700">False</span>
                     </label>
                  </div>
             </div>
         )}
         
         {questionData.type === QuestionType.ShortAnswer && (
              <div className="pl-4 border-l-2 border-slate-300 space-y-3 mt-4">
                 <label className="text-base font-medium text-slate-700 block mb-2">Correct Answer</label>
                 <input 
                   type="text" 
                   value={(questionData.answer as string) || ''} 
                   onChange={e => handleDataChange('answer', e.target.value)} 
                   placeholder="Enter the correct answer..." 
                   className="w-full px-4 py-3 text-base border border-slate-300 rounded-none"
                 />
             </div>
         )}
         
         {formError && (
           <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">{formError}</div>
         )}
      </div>
      <div className="flex justify-end p-6 border-t mt-6 space-x-4">
        <button onClick={onClose} className="px-6 py-3 text-base text-slate-600 font-semibold rounded-none hover:bg-slate-100">Cancel</button>
        <button onClick={handleSubmit} disabled={!selectedCourseId} className={`px-8 py-3 text-base bg-indigo-600 text-white font-bold rounded-none shadow-md hover:bg-indigo-700 ${!selectedCourseId ? 'opacity-60 cursor-not-allowed' : ''}`}>{isEditing ? 'Save Changes' : 'Save Question'}</button>
      </div>
    </Modal>
  );
};
