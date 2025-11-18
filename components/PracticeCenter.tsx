import React, { useState } from 'react';
import { Course } from '../types';
import { Icon } from './Icon';

interface PracticeCenterProps {
    courses: Course[];
    onGenerate: (courseId: string, questionCount: number, difficulty: 'easy' | 'medium' | 'hard' | 'mix', focusOnWeaknesses: boolean) => void;
}

export const PracticeCenter: React.FC<PracticeCenterProps> = ({ courses, onGenerate }) => {
    const [selectedCourseId, setSelectedCourseId] = useState<string>(courses.length > 0 ? courses[0].id : '');
    const [questionCount, setQuestionCount] = useState<number>(5);
    const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mix'>('mix');

    const handleGenerate = (focus: boolean) => {
        if (!selectedCourseId) {
            alert("Please select a course first.");
            return;
        }
        onGenerate(selectedCourseId, questionCount, difficulty, focus);
    };

    if (courses.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-2xl shadow-md mt-6">
                <Icon path="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-medium text-slate-900">No Courses Enrolled</h3>
                <p className="mt-1 text-sm text-slate-500">
                    You need to be enrolled in a course to use the practice center.
                </p>
            </div>
        );
    }
    
    return (
        <div className="mt-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Practice Center</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="bg-white p-6 rounded-2xl shadow-md space-y-4">
                    <h3 className="text-xl font-bold text-slate-800">Generate a Custom Quiz</h3>
                    <p className="text-sm text-slate-500">Create a practice quiz based on your own settings.</p>

                    <div>
                        <label htmlFor="course-select" className="block text-sm font-medium text-slate-700">Course</label>
                        <select id="course-select" value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white">
                            {courses.map(course => (
                                <option key={course.id} value={course.id}>{course.code} - {course.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="question-count" className="block text-sm font-medium text-slate-700">Questions</label>
                            <select id="question-count" value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white">
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={15}>15</option>
                            </select>
                        </div>
                        <div>
                             <label htmlFor="difficulty" className="block text-sm font-medium text-slate-700">Difficulty</label>
                            <select id="difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as any)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white">
                                <option value="mix">Mix</option>
                                <option value="easy">Easy</option>
                                <option value="medium">Medium</option>
                                <option value="hard">Hard</option>
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={() => handleGenerate(false)}
                        className="w-full bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-indigo-700 transition-all flex items-center justify-center"
                    >
                        <Icon path="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 mr-2"/>
                        Start Custom Practice
                    </button>
                </div>

                 <div className="bg-purple-600 text-white p-6 rounded-2xl shadow-lg flex flex-col justify-center items-center text-center">
                    <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-12 h-12 mb-3"/>
                    <h3 className="text-xl font-bold">AI-Powered Focus Mode</h3>
                    <p className="text-sm text-purple-200 mt-2 mb-4">Let our AI analyze your past performance and create a targeted quiz to help you improve on your weakest topics.</p>
                     <button
                        onClick={() => handleGenerate(true)}
                        className="w-full bg-white text-purple-600 font-bold py-3 px-6 rounded-lg shadow-md hover:bg-purple-100 transition-all flex items-center justify-center"
                    >
                        ✨ Focus on Weaknesses
                    </button>
                </div>

            </div>
        </div>
    );
};
