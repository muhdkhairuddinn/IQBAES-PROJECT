import { Question, Result, QuestionType } from '../types';

// Helper for making API calls to our own backend's AI service
const fetchFromAIservice = async (endpoint: string, body: object) => {
    // In a real app, this might share a helper with AuthContext
    const token = sessionStorage.getItem('iqbaes-token');
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (token) {
        headers.append('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`/api/ai${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'An unknown AI service error occurred.' }));
        throw new Error(errorData.message);
    }
    return response.json();
};

export const getAIExplanation = async (question: Question, userAnswer: string | boolean | null, isCorrect: boolean): Promise<string> => {
  try {
    const response = await fetchFromAIservice('/explanation', { question, userAnswer, isCorrect });
    return response.explanation;
  } catch (error) {
    console.error("Error fetching AI explanation from backend:", error);
    return "Could not generate an explanation at this time. Please try again later.";
  }
};

export const getAIPerformanceInsights = async (results: Result[], studentName: string): Promise<string> => {
    try {
        const response = await fetchFromAIservice('/performance-insights', { results, studentName });
        return response.insights;
    } catch (error) {
        console.error("Error fetching AI performance insights from backend:", error);
        return "Could not generate performance insights at this time. Please try again later.";
    }
};

export const generateQuestionWithAI = async (topic: string, type: QuestionType, difficulty: string): Promise<Partial<Question>> => {
  try {
    const response = await fetchFromAIservice('/generate-question', { topic, type, difficulty });
    return response.question as Partial<Question>;
  } catch (error) {
      console.error("Error generating AI question from backend:", error);
      throw new Error("Failed to generate question with AI. Please try a different topic or check the API configuration.");
  }
};

export const generateBulkQuestionsWithAI = async (
    topic: string,
    count: number,
    difficulty: string,
    types: QuestionType[]
): Promise<Partial<Question>[]> => {
    try {
        const response = await fetchFromAIservice('/generate-bulk-questions', { topic, count, difficulty, types });
        
        if (!Array.isArray(response.questions)) {
            throw new Error("AI service did not return a valid array of questions.");
        }
        
        return response.questions;
    } catch (error) {
        console.error("Error generating bulk AI questions from backend:", error);
        throw new Error("Failed to generate bulk questions with AI. Please try a different topic or check the API configuration.");
    }
};

export const gradeTextAnswerWithAI = async (
    question: Question,
    studentAnswer: string
): Promise<{ pointsAwarded: number; justification: string; isCorrect: boolean }> => {
    try {
        const response = await fetchFromAIservice('/grade-answer', { question, studentAnswer });
        return response.grade;
    } catch (error) {
        console.error("Error grading with AI from backend:", error);
        // Fallback to simple grading if AI service fails
        const correctAnswer = question.options && question.correctAnswer !== undefined 
    ? question.options[question.correctAnswer] 
    : question.correctAnswer;
  const isCorrectSimple = studentAnswer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
        return {
            isCorrect: isCorrectSimple,
            pointsAwarded: isCorrectSimple ? question.points : 0,
            justification: "AI grader was unavailable. Result based on simple text comparison."
        };
    }
};
