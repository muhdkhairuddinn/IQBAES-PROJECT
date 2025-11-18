import mongoose from 'mongoose';
import { BankQuestion } from '../models/Question.js';
import { v4 as uuidv4 } from 'uuid';

// @desc    Add a question to the bank
// @route   POST /api/bank-questions
// @access  Private/Lecturer
const addQuestionToBank = async (req, res) => {
  try {
    const questionData = req.body;

    // Ensure the user is authorized and course enrollment is valid (existing checks assumed above)

    const payload = {
      ...questionData,
      createdBy: (req.user && (req.user.id || req.user._id)) || undefined,
      category: questionData.category || questionData.topic,
    };

    const question = new BankQuestion(payload);
    const createdQuestion = await question.save();
    res.status(201).json(createdQuestion.toJSON());
  } catch (error) {
    console.error('Error adding bank question:', error);
    res.status(400).json({ message: error.message || 'Failed to add question to bank' });
  }
};

// @desc    Update a question in the bank
// @route   PUT /api/bank-questions/:id
// @access  Private/Lecturer
const updateQuestionInBank = async (req, res) => {
  try {
    const question = await BankQuestion.findById(req.params.id);

    if (question) {
      if (req.user.role !== 'admin') {
        const UserEnrollments = mongoose.model('UserEnrollments');
        const enrollment = await UserEnrollments.findOne({
          userId: req.user.id || req.user._id,
          courseId: question.courseId,
          status: 'active'
        });
        
        if (!enrollment) {
          return res.status(403).json({ message: 'Not authorized for this course' });
        }
      }
      
      Object.assign(question, req.body);
      const updatedQuestion = await question.save();
      res.json(updatedQuestion.toJSON());
    } else {
      res.status(404).json({ message: 'Question not found' });
    }
  } catch (error) {
    res.status(400).json({ message: 'Error updating question', details: error.message });
  }
};

// @desc    Delete a question from the bank
// @route   DELETE /api/bank-questions/:id
// @access  Private/Lecturer
const deleteQuestionFromBank = async (req, res) => {
  try {
    const question = await BankQuestion.findById(req.params.id);
    if (question) {
      if (req.user.role !== 'admin') {
        const UserEnrollments = mongoose.model('UserEnrollments');
        const enrollment = await UserEnrollments.findOne({
          userId: req.user.id || req.user._id,
          courseId: question.courseId,
          status: 'active'
        });
        
        if (!enrollment) {
          return res.status(403).json({ message: 'Not authorized for this course' });
        }
      }
      await BankQuestion.deleteOne({ _id: req.params.id });
      res.json({ message: 'Question removed from bank' });
    } else {
      res.status(404).json({ message: 'Question not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

export { addQuestionToBank, updateQuestionInBank, deleteQuestionFromBank };