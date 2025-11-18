import React, { useMemo, useState } from 'react';
import { Course, ExamSubmission, Exam } from '../types';
import { Icon } from './Icon';

interface PerformanceAnalyticsProps {
    submissions: ExamSubmission[];
    courses: Course[];
    allExams: Exam[];
}

const StatCard: React.FC<{ title: string; value: string | number; change?: string; }> = ({ title, value, change }) => (
    <div className="bg-white p-5 rounded-xl shadow-md">
        <p className="text-sm text-slate-500">{title}</p>
        <div className="flex justify-between items-baseline">
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            {change && <p className="text-sm font-semibold text-green-500">{change}</p>}
        </div>
    </div>
);

// A simple placeholder for a charting library
const BarChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
    if (data.length === 0) return <p className="text-center text-slate-500 py-8">Not enough data for topic analysis.</p>;

    const maxValue = Math.max(...data.map(d => d.value), 100);
    return (
        <div className="h-64 flex items-end space-x-2 p-4 border border-slate-200 rounded-lg bg-slate-50">
            {data.map((item, index) => (
                <div key={index} className="flex-1 flex flex-col items-center group">
                    <div 
                        className="w-full bg-indigo-400 hover:bg-indigo-600 rounded-t-md transition-all"
                        style={{ height: `${(item.value / maxValue) * 100}%` }}
                    >
                         <span className="text-xs font-bold text-white opacity-0 group-hover:opacity-100 flex justify-center pt-1">{Math.round(item.value)}%</span>
                    </div>
                    <span className="text-xs text-slate-600 mt-2 text-center transform -rotate-45 h-16">{item.label}</span>
                </div>
            ))}
        </div>
    );
};

const LineChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
     if (data.length < 2) return <p className="text-center text-slate-500 py-8">Take at least two exams in a course to see your score trend.</p>;
    
    // This is a simplified SVG line chart representation
    const points = data.map((point, i) => `${(i / (data.length - 1)) * 100},${100 - point.value}`).join(' ');

    return (
        <div className="h-64 p-4 border border-slate-200 rounded-lg bg-slate-50">
             <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                <polyline
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points}
                />
                {data.map((point, i) => (
                    <circle key={i} cx={`${(i / (data.length - 1)) * 100}`} cy={`${100 - point.value}`} r="2" fill="#4f46e5" />
                ))}
            </svg>
        </div>
    );
};

export const PerformanceAnalytics: React.FC<PerformanceAnalyticsProps> = ({ submissions, courses, allExams }) => {
    
    const [selectedCourseId, setSelectedCourseId] = useState<string>(courses.length > 0 ? courses[0].id : '');

    const filteredSubmissions = useMemo(() => {
        return submissions
            .filter(s => s.courseId === selectedCourseId)
            .sort((a,b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
    }, [submissions, selectedCourseId]);

    const { overallAverage, submissionCount, topicProficiency, scoreTrend, strongestTopics, weakestTopics } = useMemo(() => {
        if (filteredSubmissions.length === 0) {
            return { overallAverage: 0, submissionCount: 0, topicProficiency: [], scoreTrend: [], strongestTopics: [], weakestTopics: [] };
        }

        const totalPercentage = filteredSubmissions.reduce((acc, s) => {
            const percentage = s.totalPointsPossible > 0 ? (s.totalPointsAwarded / s.totalPointsPossible) * 100 : 0;
            return acc + percentage;
        }, 0);
        
        const overallAverage = totalPercentage / filteredSubmissions.length;
        
        const topics: { [topic: string]: { total: number; correct: number } } = {};
        
        filteredSubmissions.forEach(sub => {
            sub.results.forEach(res => {
                const topic = res.question.topic || res.question.category || 'General';
                if (!topics[topic]) topics[topic] = { total: 0, correct: 0 };
                topics[topic].total++;
                if (res.isCorrect) topics[topic].correct++;
            });
        });

        const topicProficiency = Object.entries(topics).map(([label, stats]) => ({
            label,
            value: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
        })).sort((a, b) => b.value - a.value);

        const scoreTrend = filteredSubmissions.map(s => {
            const exam = allExams.find(e => e.id === s.examId);
            return {
                label: exam?.title || new Date(s.submittedAt).toLocaleDateString(),
                value: s.totalPointsPossible > 0 ? (s.totalPointsAwarded / s.totalPointsPossible) * 100 : 0
            }
        });

        const strongestTopics = [...topicProficiency].slice(0, 3);
        const weakestTopics = [...topicProficiency].sort((a,b) => a.value - b.value).slice(0, 3);
        
        return { overallAverage, submissionCount: filteredSubmissions.length, topicProficiency, scoreTrend, strongestTopics, weakestTopics };

    }, [filteredSubmissions, allExams]);

    return (
        <div className="mt-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Performance Analytics</h2>
            
             <div className="mb-6">
                <label htmlFor="course-filter-analytics" className="sr-only">Filter by course</label>
                <select
                    id="course-filter-analytics"
                    value={selectedCourseId}
                    onChange={e => setSelectedCourseId(e.target.value)}
                    className="p-2 border border-slate-300 rounded-md bg-white focus:ring-indigo-500 focus:border-indigo-500"
                >
                    {courses.map(course => (
                        <option key={course.id} value={course.id}>{course.code} - {course.name}</option>
                    ))}
                </select>
            </div>
            
            {filteredSubmissions.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl shadow-md">
                    <Icon path="M10.5 6a7.5 7.5 0 100 15 7.5 7.5 0 000-15zM10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" className="mx-auto h-12 w-12 text-slate-400" />
                    <h3 className="mt-2 text-lg font-medium text-slate-900">No Data Available</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Complete an exam in this course to see your performance analytics.
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatCard title="Overall Average" value={`${Math.round(overallAverage)}%`} />
                        <StatCard title="Exams Taken" value={submissionCount} />
                        <StatCard title="Strongest Topic" value={strongestTopics[0]?.label || 'N/A'} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-md">
                            <h3 className="font-bold text-lg text-slate-800 mb-4">Topic Proficiency (%)</h3>
                            <BarChart data={topicProficiency} />
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-md">
                            <h3 className="font-bold text-lg text-slate-800 mb-4">Score Trend (%)</h3>
                            <LineChart data={scoreTrend} />
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-md">
                        <h3 className="font-bold text-lg text-slate-800 mb-4">Summary & Recommendations</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="font-semibold text-green-700">Top 3 Strongest Topics</h4>
                                <ul className="list-disc list-inside mt-2 text-sm text-slate-600 space-y-1">
                                    {strongestTopics.map(t => <li key={t.label}>{t.label} ({Math.round(t.value)}%)</li>)}
                                </ul>
                            </div>
                             <div>
                                <h4 className="font-semibold text-red-700">Top 3 Weakest Topics</h4>
                                <ul className="list-disc list-inside mt-2 text-sm text-slate-600 space-y-1">
                                    {weakestTopics.map(t => <li key={t.label}>{t.label} ({Math.round(t.value)}%)</li>)}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};