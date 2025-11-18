import { gradeShortAnswer } from './gemini.js';

const gradeSubmission = async (exam, answers) => {
  const results = [];
  let totalPointsAwarded = 0;
  const totalPointsPossible = exam.questions.reduce((acc, q) => acc + q.points, 0);

  for (const question of exam.questions) {
    const userAnswer = answers.find(a => a.questionId === question.id);
    let isCorrect = false;
    let pointsAwarded = 0;
    let gradingJustification = '';

    if (userAnswer && userAnswer.answer !== null) {
      switch (question.type) {
        case 'MCQ':
        case 'TF':
          // For MCQ, compare the selected option index with correctAnswer
          // For TF, userAnswer.answer should be the selected option index
          isCorrect = parseInt(userAnswer.answer) === question.correctAnswer;
          pointsAwarded = isCorrect ? question.points : 0;
          break;
        case 'SA':
          try {
            const aiGrade = await gradeShortAnswer(question, userAnswer.answer);
            isCorrect = aiGrade.isCorrect;
            pointsAwarded = aiGrade.pointsAwarded;
            gradingJustification = aiGrade.justification;
          } catch (error) {
            console.error(`AI grading failed for question ${question.id}:`, error);
            // Fallback to simple comparison if AI fails
            // For SA questions, the correct answer should be stored in options[correctAnswer] or a separate field
            const correctAnswer = question.options && question.correctAnswer !== undefined 
              ? question.options[question.correctAnswer] 
              : question.correctAnswer;
            isCorrect = String(userAnswer.answer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
            pointsAwarded = isCorrect ? question.points : 0;
            gradingJustification = 'AI grader was unavailable. Result based on simple text comparison.';
          }
          break;
        default:
          break;
      }
    }

    results.push({
      question: question.toObject(),
      userAnswer: userAnswer || { questionId: question.id, answer: null },
      isCorrect,
      pointsAwarded,
      gradingJustification,
    });
    totalPointsAwarded += pointsAwarded;
  }

  return { results, totalPointsAwarded, totalPointsPossible };
};

export { gradeSubmission };
