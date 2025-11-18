
import { GoogleGenAI, Type } from '@google/genai';

// Don't check the API key immediately - wait until it's actually needed
let ai;
let apiKeyChecked = false;

const initializeAI = () => {
    if (!apiKeyChecked) {
        console.log("[Gemini] API_KEY:", process.env.GEMINI_API_KEY ? "DETECTED" : "NOT FOUND");
        if (!process.env.GEMINI_API_KEY) {
            console.error("[Gemini] WARNING: No API key found. AI features will not work.");
        }
        apiKeyChecked = true;
    }
    
    if (!ai && process.env.GEMINI_API_KEY) {
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    
    return ai;
};

const getJsonFromResponse = (response) => {
    const text = response.text.trim();
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
        try {
            return JSON.parse(jsonMatch[1]);
        } catch (e) {
            console.error("Failed to parse JSON from markdown block:", e);
            throw new Error("AI returned malformed JSON.");
        }
    }
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Failed to parse raw JSON from response text:", e);
        throw new Error("AI returned a non-JSON response.");
    }
};

const generateQuestion = async (topic, type, difficulty) => {
    const aiInstance = initializeAI();
    if (!aiInstance) {
        throw new Error("Gemini API key is not configured");
    }

    const questionSchema = {
        type: Type.OBJECT,
        properties: {
            question: { type: Type.STRING, description: "The question text." },
            options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "An array of 4 distinct options for MCQ, or an empty array for other types." },
            answer: { type: Type.STRING, description: "The correct answer. For TF, it should be 'true' or 'false'." },
            points: { type: Type.INTEGER, description: "Points for the question, defaulting to 5." },
            topic: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ['easy', 'medium', 'hard'] },
        },
        required: ['question', 'answer', 'points', 'topic', 'difficulty']
    };

    const prompt = `Generate a single ${type} question about "${topic}" with ${difficulty} difficulty. For MCQ, provide exactly 4 distinct options. For TF, the answer should be a string 'true' or 'false'. For SA, the answer should be a concise phrase. Set the topic to "${topic}".`;
    
    const result = await aiInstance.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: questionSchema,
        },
    });

    return getJsonFromResponse(result);
};

const generateBulkQuestions = async (topic, count, difficulty, types) => {
    const aiInstance = initializeAI();
    if (!aiInstance) {
        throw new Error("Gemini API key is not configured");
    }

    const questionSchema = {
        type: Type.OBJECT,
        properties: {
            question: { type: Type.STRING },
            type: { type: Type.STRING, enum: types },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            answer: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: [difficulty] },
            topic: { type: Type.STRING },
            points: { type: Type.INTEGER },
        },
        required: ['question', 'type', 'answer', 'difficulty', 'topic', 'points']
    };

    const prompt = `Generate an array of ${count} questions about "${topic}" with ${difficulty} difficulty. The questions should be a mix of the following types: ${types.join(', ')}. For each question:
- For MCQ, provide exactly 4 distinct options.
- For TF, the answer must be a string 'true' or 'false'.
- For SA, the answer should be a concise phrase.
- Set the topic field for each question to "${topic}".`;

    const result = await aiInstance.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    questions: {
                        type: Type.ARRAY,
                        items: questionSchema
                    }
                }
            },
        },
    });

    return getJsonFromResponse(result).questions;
};

const generateExplanation = async (question, userAnswer, isCorrect) => {
    const aiInstance = initializeAI();
    if (!aiInstance) {
        throw new Error("Gemini API key is not configured");
    }

    const prompt = `A student answered a question.
Question: "${question.question || question.text}"
Correct Answer: "${question.options && question.correctAnswer !== undefined ? question.options[question.correctAnswer] : question.correctAnswer}"
Student's Answer: "${userAnswer}"
The student was ${isCorrect ? 'correct' : 'incorrect'}.
Provide a concise, helpful explanation for the student in markdown format. If the student was correct, briefly reinforce why. If incorrect, explain the correct answer and why their answer was wrong.`;
    
    const response = await aiInstance.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });
    return response.text;
};

const generatePerformanceInsights = async (results, studentName) => {
    const aiInstance = initializeAI();
    if (!aiInstance) {
        throw new Error("Gemini API key is not configured");
    }

    try {
        // Sanitize the results to create a clean prompt, removing Mongoose metadata.
        const simplifiedResults = results.map(r => ({
            questionText: r.question.question || r.question.text,
            topic: r.question.topic || 'General',
            isCorrect: r.isCorrect,
            pointsAwarded: r.lecturerOverridePoints !== undefined ? r.lecturerOverridePoints : r.pointsAwarded,
            pointsPossible: r.question.points,
        }));

        const prompt = `Analyze the exam results for a student named ${studentName}.
The results are provided as a clean JSON array: ${JSON.stringify(simplifiedResults, null, 2)}.
Based on this data, provide personalized performance insights in markdown format.
Identify the student's strongest and weakest topics based on the percentage of points earned.
Provide 2-3 actionable study recommendations.
Keep the tone encouraging. Start with "### Overall Performance".`;
        
        console.log("[Gemini] Generating performance insights for:", studentName);
        
        const response = await aiInstance.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        
        console.log("[Gemini] Performance insights generated successfully");
        return response.text;
    } catch (error) {
        console.error("[Gemini] Error in generatePerformanceInsights:", error);
        throw error;
    }
};

const gradeShortAnswer = async (question, studentAnswer) => {
    const aiInstance = initializeAI();
    if (!aiInstance) {
        throw new Error("Gemini API key is not configured");
    }

    const gradeSchema = {
        type: Type.OBJECT,
        properties: {
            isCorrect: { type: Type.BOOLEAN },
            pointsAwarded: { type: Type.INTEGER },
            justification: { type: Type.STRING }
        },
        required: ['isCorrect', 'pointsAwarded', 'justification']
    };

    const prompt = `Grade the following short answer.
Question: "${question.question || question.text}"
Full points: ${question.points}
Correct Answer (for reference): "${question.options && question.correctAnswer !== undefined ? question.options[question.correctAnswer] : question.correctAnswer}"
Student's Answer: "${studentAnswer}"
Determine if the student's answer is correct. Award partial credit if appropriate. Provide a brief justification for your grading decision.`;

    const result = await aiInstance.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: gradeSchema
        }
    });

    return getJsonFromResponse(result);
};

export {
  generateQuestion,
  generateBulkQuestions,
  generateExplanation,
  generatePerformanceInsights,
  gradeShortAnswer,
};