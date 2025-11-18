import mongoose from 'mongoose';
import Exam from '../models/Exam.js';
import SystemLogs from '../models/SystemLogs.js';
import { v4 as uuidv4 } from 'uuid';

// @desc    Get all exams for a user
// @route   GET /api/exams
// @access  Private
const getExams = async (req, res) => {
  try {
    console.log('Getting exams for user:', req.user.username);
    
    let exams;
    if (req.user.role === 'admin') {
      // Admin can see all exams
      exams = await Exam.find({}).populate('courseId', 'name');
    } else {
      // Get user's enrolled courses
      const UserEnrollments = mongoose.model('UserEnrollments');
      const enrollments = await UserEnrollments.find({
        userId: req.user.id || req.user._id,
        status: 'active'
      });
      const enrolledCourseIds = enrollments.map(e => e.courseId);
      
      if (req.user.role === 'lecturer') {
        // Lecturer can see exams for their enrolled courses
        exams = await Exam.find({ 
          courseId: { $in: enrolledCourseIds } 
        }).populate('courseId', 'name');
      } else {
        // Students can see exams for their enrolled courses that are currently available
        const now = new Date();
        exams = await Exam.find({ 
           courseId: { $in: enrolledCourseIds },
           $and: [
             {
               $or: [
                 { availableFrom: { $exists: false } },
                 { availableFrom: null },
                 { availableFrom: { $lte: now } }
               ]
             },
             {
               $or: [
                 { availableUntil: { $exists: false } },
                 { availableUntil: null },
                 { availableUntil: { $gte: now } }
               ]
             }
           ]
         }).populate('courseId', 'name').select('-questions'); // Don't send questions to students in list view
         
         // Additional client-side filtering to ensure expired exams are not returned
         // This handles edge cases where date comparisons might not work correctly
         const beforeFilter = exams.length;
         exams = exams.filter(exam => {
           let shouldInclude = true;
           
           if (exam.availableUntil) {
             const until = new Date(exam.availableUntil);
             // If exam has expired (now > availableUntil), exclude it
             if (now > until) {
               console.log(`⏰ Filtering out expired exam: ${exam.title} (expired at ${until.toISOString()}, now is ${now.toISOString()})`);
               shouldInclude = false;
             }
           }
           
           if (shouldInclude && exam.availableFrom) {
             const from = new Date(exam.availableFrom);
             // If exam hasn't started yet (now < availableFrom), exclude it
             if (now < from) {
               console.log(`⏰ Filtering out future exam: ${exam.title} (starts at ${from.toISOString()}, now is ${now.toISOString()})`);
               shouldInclude = false;
             }
           }
           
           return shouldInclude;
         });
         
         if (beforeFilter !== exams.length) {
           console.log(`📊 Filtered ${beforeFilter - exams.length} expired/future exam(s) from ${beforeFilter} total exams`);
         }
       }
    }

    console.log(`Found ${exams.length} exams for user ${req.user.username}`);
    res.json(exams);
  } catch (error) {
    console.error('Error getting exams:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Get a single exam by ID
// @route   GET /api/exams/:id
// @access  Private
const getExam = async (req, res) => {
  try {
    console.log('Getting exam:', req.params.id, 'for user:', req.user.username);
    
    const exam = await Exam.findById(req.params.id).populate('courseId', 'name');
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Check if user has access to this exam
    if (req.user.role !== 'admin') {
      const UserEnrollments = mongoose.model('UserEnrollments');
      const enrollment = await UserEnrollments.findOne({
        userId: req.user.id || req.user._id,
        courseId: exam.courseId,
        status: 'active'
      });
      
      if (!enrollment) {
        return res.status(403).json({ message: 'Not authorized to access this exam' });
      }
    }

    // Check if exam is available for students
    if (req.user.role === 'student') {
      const now = new Date();
      if (exam.availableFrom && exam.availableFrom > now) {
        return res.status(403).json({ message: 'Exam not yet available' });
      }
      if (exam.availableUntil && exam.availableUntil < now) {
        return res.status(403).json({ message: 'Exam no longer available' });
      }
    }

    res.json(exam);
  } catch (error) {
    console.error('Error getting exam:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Add a new exam
// @route   POST /api/exams
// @access  Private/Lecturer
const addExam = async (req, res) => {
  try {
    const { title, courseId, durationMinutes, questions, availableFrom, availableUntil } = req.body;
    
    const processedQuestions = (questions && Array.isArray(questions)) ? questions.map(q => ({ ...q, id: q.id || uuidv4() })) : [];

    const exam = new Exam({
      title,
      courseId,
      durationMinutes,
      questions: processedQuestions,
      questionCount: processedQuestions.length,
      availableFrom: availableFrom ? new Date(availableFrom) : undefined,
      availableUntil: availableUntil ? new Date(availableUntil) : undefined,
    });
    const createdExam = await exam.save();
    
    // Log exam creation to database
    try {
      const examCreatedLog = new SystemLogs({
        userId: req.user.id,
        userName: req.user.username,
        type: 'exam_created',
        message: `Exam created: ${title} (ID: ${createdExam._id})`,
        details: {
          examId: createdExam._id,
          examTitle: title,
          courseId: createdExam.courseId,
          questionCount: createdExam.questionCount
        },
        timestamp: new Date(),
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      });
      await examCreatedLog.save();
    } catch (logError) {
      console.error('Failed to log exam creation:', logError);
    }
    
    res.status(201).json(createdExam.toJSON());
  } catch (error) {
    res.status(400).json({ message: 'Invalid exam data', details: error.message });
  }
};

// @desc    Update an exam
// @route   PUT /api/exams/:id
// @access  Private/Lecturer
const updateExam = async (req, res) => {
  try {
    const { title, courseId, durationMinutes, questions, availableFrom, availableUntil } = req.body;
    const exam = await Exam.findById(req.params.id);

    if (exam) {
      // Check if user is authorized to edit this exam
      if (req.user.role !== 'admin') {
        const UserEnrollments = mongoose.model('UserEnrollments');
        const enrollment = await UserEnrollments.findOne({
          userId: req.user.id || req.user._id,
          courseId: exam.courseId,
          status: 'active'
        });
        
        if (!enrollment) {
          return res.status(403).json({ message: 'Not authorized to edit this exam' });
        }
      }

      // Process and validate questions - clean up empty options
      const processedQuestions = (questions && Array.isArray(questions)) 
        ? questions.map((q, index) => {
            // Ensure question has required fields
            if (!q.question || !q.question.trim()) {
              throw new Error(`Question ${index + 1}: Question text is required.`);
            }
            
            // Clean up options - filter out empty strings
            let cleanOptions = [];
            let correctAnswerIndex = 0;
            
            // Normalize question type
            const questionType = (q.type || 'MCQ').toUpperCase();
            
            if (questionType === 'TF' || questionType === 'TRUEFALSE') {
              // True/False questions always have ['True', 'False']
              cleanOptions = ['True', 'False'];
              // For TF, correctAnswer should be 0 (True) or 1 (False)
              correctAnswerIndex = (q.correctAnswer !== undefined && q.correctAnswer !== null) 
                ? Math.max(0, Math.min(parseInt(q.correctAnswer), 1)) 
                : 0;
            } else if (questionType === 'SA' || questionType === 'SHORTANSWER') {
              // Short Answer - options should contain the answer
              if (q.options && Array.isArray(q.options) && q.options.length > 0) {
                // Get the first non-empty option as the answer
                const answerOption = q.options.find(opt => opt && String(opt).trim().length > 0);
                if (!answerOption || !String(answerOption).trim()) {
                  throw new Error(`Question ${index + 1}: Short Answer questions must have a correct answer.`);
                }
                cleanOptions = [String(answerOption).trim()];
              } else {
                throw new Error(`Question ${index + 1}: Short Answer questions must have a correct answer.`);
              }
              correctAnswerIndex = 0;
            } else {
              // Multiple Choice (MCQ) - filter out empty options
              if (!q.options || !Array.isArray(q.options)) {
                throw new Error(`Question ${index + 1}: Multiple Choice questions must have options.`);
              }
              
              // Filter out empty/whitespace-only options
              cleanOptions = q.options
                .map(opt => String(opt).trim())
                .filter(opt => opt.length > 0);
              
              // Validate minimum options
              if (cleanOptions.length < 2) {
                throw new Error(`Question ${index + 1}: Multiple Choice questions must have at least 2 non-empty options.`);
              }
              
              // Adjust correctAnswer index - find the selected answer in the cleaned options
              if (q.correctAnswer !== undefined && q.correctAnswer !== null) {
                const originalIndex = parseInt(q.correctAnswer);
                if (originalIndex >= 0 && originalIndex < q.options.length) {
                  const originalAnswer = String(q.options[originalIndex]).trim();
                  const newIndex = cleanOptions.findIndex(opt => opt === originalAnswer);
                  if (newIndex >= 0) {
                    correctAnswerIndex = newIndex;
                  } else {
                    // If original answer was removed (empty option), default to first option
                    correctAnswerIndex = 0;
                  }
                } else {
                  correctAnswerIndex = 0;
                }
              } else {
                correctAnswerIndex = 0;
              }
            }
            
            // Ensure correctAnswer is within valid range
            correctAnswerIndex = Math.max(0, Math.min(correctAnswerIndex, cleanOptions.length - 1));
            
            return {
              ...q,
              id: q.id || uuidv4(),
              type: questionType === 'TF' || questionType === 'TRUEFALSE' ? 'TF' 
                  : questionType === 'SA' || questionType === 'SHORTANSWER' ? 'SA' 
                  : 'MCQ',
              question: String(q.question).trim(),
              options: cleanOptions,
              correctAnswer: correctAnswerIndex,
              difficulty: q.difficulty || 'medium',
              points: q.points || 1,
            };
          })
        : [];

      exam.title = title;
      exam.courseId = courseId;
      exam.durationMinutes = durationMinutes;
      exam.questions = processedQuestions;
      exam.questionCount = processedQuestions.length;
      exam.availableFrom = availableFrom ? new Date(availableFrom) : undefined;
      exam.availableUntil = availableUntil ? new Date(availableUntil) : undefined;
      
      const updatedExam = await exam.save();
      
      // Log exam update to database
      try {
        const examUpdatedLog = new SystemLogs({
          type: 'exam_updated',
          userId: req.user.id,
          userName: req.user.username,
          level: 'info',
          message: `Exam updated: ${title} (ID: ${exam._id})`,
          details: {
            module: 'exam',
            examId: exam._id,
            examTitle: title,
            ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown'
          }
        });
        await examUpdatedLog.save();
      } catch (logError) {
        console.error('Failed to log exam update:', logError);
      }
      
      res.json(updatedExam.toJSON());
    } else {
      res.status(404).json({ message: 'Exam not found' });
    }
  } catch (error) {
    console.error('Exam update error:', error);
    res.status(400).json({ message: 'Error updating exam', details: error.message });
  }
};

// @desc    Delete an exam
// @route   DELETE /api/exams/:id
// @access  Private/Lecturer
const deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (exam) {
      // Check if user is authorized to delete this exam
      if (req.user.role !== 'admin') {
        const UserEnrollments = mongoose.model('UserEnrollments');
        const enrollment = await UserEnrollments.findOne({
          userId: req.user.id || req.user._id,
          courseId: exam.courseId,
          status: 'active'
        });
        
        if (!enrollment) {
          return res.status(403).json({ message: 'Not authorized to delete this exam' });
        }
      }
      
      // Store exam details before deletion for logging
      const examTitle = exam.title;
      const examId = exam._id;
      
      await Exam.deleteOne({ _id: req.params.id });
      
      // Log exam deletion to database
      try {
        const examDeletedLog = new SystemLogs({
          userId: req.user.id,
          userName: req.user.username,
          type: 'exam_deleted',
          message: `Exam deleted: ${examTitle} (ID: ${examId})`,
          details: {
            examId: examId,
            examTitle: examTitle
          },
          timestamp: new Date(),
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown'
        });
        await examDeletedLog.save();
      } catch (logError) {
        console.error('Failed to log exam deletion:', logError);
      }
      
      res.json({ message: 'Exam removed' });
    } else {
      res.status(404).json({ message: 'Exam not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

export { getExams, getExam, addExam, updateExam, deleteExam };
