import Feedback from '../models/Feedback.js';
import User from '../models/User.js';

// @desc    Create new feedback/bug report
// @route   POST /api/feedback
// @access  Private
const createFeedback = async (req, res) => {
  try {
    const {
      type,
      priority,
      title,
      description,
      stepsToReproduce,
      expectedBehavior,
      actualBehavior,
      browserInfo,
      screenResolution
    } = req.body;

    // Get user info from the authenticated user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const feedback = await Feedback.create({
      userId: req.user.id,
      userName: user.name,
      userRole: user.role,
      type,
      priority: priority || 'medium',
      title,
      description,
      stepsToReproduce,
      expectedBehavior,
      actualBehavior,
      browserInfo,
      screenResolution
    });

    res.status(201).json({
      message: 'Feedback submitted successfully',
      feedback
    });
  } catch (error) {
    console.error('Error creating feedback:', error);
    res.status(500).json({ message: 'Failed to submit feedback', details: error.message });
  }
};

// @desc    Get all feedback (admin only)
// @route   GET /api/feedback
// @access  Private/Admin
const getAllFeedback = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, priority } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (priority) filter.priority = priority;

    const skip = (page - 1) * limit;
    
    const feedback = await Feedback.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('assignedTo', 'name username');

    const total = await Feedback.countDocuments(filter);

    // Transform _id to id for frontend compatibility
    const transformedFeedback = feedback.map(item => {
      const transformed = item.toObject();
      transformed.id = transformed._id.toString();
      delete transformed._id;
      delete transformed.__v;
      return transformed;
    });

    res.json({
      feedback: transformedFeedback,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ message: 'Failed to fetch feedback', details: error.message });
  }
};

// @desc    Get user's own feedback
// @route   GET /api/feedback/my
// @access  Private
const getMyFeedback = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const feedback = await Feedback.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Feedback.countDocuments({ userId: req.user.id });

    // Transform _id to id for frontend compatibility
    const transformedFeedback = feedback.map(item => {
      const transformed = item.toObject();
      transformed.id = transformed._id.toString();
      delete transformed._id;
      delete transformed.__v;
      return transformed;
    });

    res.json({
      feedback: transformedFeedback,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching user feedback:', error);
    res.status(500).json({ message: 'Failed to fetch your feedback', details: error.message });
  }
};

// @desc    Add comment to feedback (admin only)
// @route   POST /api/feedback/:id/comment
// @access  Private/Admin
const addComment = async (req, res) => {
  try {
    const { message, type = 'progress_update' } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: 'Comment message is required' });
    }

    // Get admin user info
    const admin = await User.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    // Add new comment
    const newComment = {
      adminId: req.user.id,
      adminName: admin.name,
      message: message.trim(),
      type,
      createdAt: new Date()
    };

    feedback.comments.push(newComment);
    feedback.hasUnreadResponse = true;
    feedback.lastResponseAt = new Date();

    await feedback.save();

    // Transform _id to id for frontend compatibility
    const transformedFeedback = feedback.toObject();
    transformedFeedback.id = transformedFeedback._id.toString();
    delete transformedFeedback._id;
    delete transformedFeedback.__v;

    res.json({
      message: 'Comment added successfully',
      feedback: transformedFeedback
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Failed to add comment', details: error.message });
  }
};

// @desc    Update feedback status/response (admin only) - Enhanced
// @route   PUT /api/feedback/:id
// @access  Private/Admin
const updateFeedback = async (req, res) => {
  try {
    const { status, adminResponse, assignedTo, priority } = req.body;
    
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    // Get admin user info for comments
    const admin = await User.findById(req.user.id);
    
    const updateData = {};
    let hasChanges = false;

    // Handle status change
    if (status && status !== feedback.status) {
      updateData.status = status;
      hasChanges = true;
      
      // Add automatic status change comment
      if (admin) {
        const statusComment = {
          adminId: req.user.id,
          adminName: admin.name,
          message: `Status changed from "${feedback.status.replace('_', ' ')}" to "${status.replace('_', ' ')}"`,
          type: 'status_change',
          createdAt: new Date()
        };
        feedback.comments.push(statusComment);
      }
    }

    // Handle admin response
    if (adminResponse && adminResponse.trim()) {
      updateData.adminResponse = adminResponse.trim();
      hasChanges = true;
      
      // Add admin response as comment
      if (admin) {
        const responseComment = {
          adminId: req.user.id,
          adminName: admin.name,
          message: adminResponse.trim(),
          type: 'admin_response',
          createdAt: new Date()
        };
        feedback.comments.push(responseComment);
      }
    }

    if (assignedTo) {
      updateData.assignedTo = assignedTo;
      hasChanges = true;
    }
    
    if (priority && priority !== feedback.priority) {
      updateData.priority = priority;
      hasChanges = true;
    }
    
    if (status === 'resolved' || status === 'closed') {
      updateData.resolvedAt = new Date();
    }

    if (hasChanges) {
      updateData.hasUnreadResponse = true;
      updateData.lastResponseAt = new Date();
    }

    // Apply updates
    Object.assign(feedback, updateData);
    await feedback.save();

    const populatedFeedback = await Feedback.findById(feedback._id)
      .populate('assignedTo', 'name username');

    // Transform _id to id for frontend compatibility
    const transformedFeedback = populatedFeedback.toObject();
    transformedFeedback.id = transformedFeedback._id.toString();
    delete transformedFeedback._id;
    delete transformedFeedback.__v;

    res.json({
      message: 'Feedback updated successfully',
      feedback: transformedFeedback
    });
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ message: 'Failed to update feedback', details: error.message });
  }
};

// @desc    Get feedback statistics (admin only)
// @route   GET /api/feedback/stats
// @access  Private/Admin
const getFeedbackStats = async (req, res) => {
  try {
    const stats = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ['$priority', 'critical'] }, 1, 0] } },
          high: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
          bugs: { $sum: { $cond: [{ $eq: ['$type', 'bug'] }, 1, 0] } },
          features: { $sum: { $cond: [{ $eq: ['$type', 'feature_request'] }, 1, 0] } }
        }
      }
    ]);

    const typeStats = await Feedback.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      overview: stats[0] || {},
      byType: typeStats
    });
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    res.status(500).json({ message: 'Failed to fetch feedback statistics', details: error.message });
  }
};

// @desc    Mark feedback notifications as read
// @route   PUT /api/feedback/:id/mark-read
// @access  Private
const markFeedbackAsRead = async (req, res) => {
  try {
    const feedback = await Feedback.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { hasUnreadResponse: false },
      { new: true }
    );

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found or access denied' });
    }

    res.json({ message: 'Feedback marked as read' });
  } catch (error) {
    console.error('Error marking feedback as read:', error);
    res.status(500).json({ message: 'Failed to mark feedback as read' });
  }
};

// @desc    Get unread feedback count for user
// @route   GET /api/feedback/unread-count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const count = await Feedback.countDocuments({
      userId: req.user.id,
      hasUnreadResponse: true
    });

    res.json({ unreadCount: count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Failed to get unread count' });
  }
};

// @desc    Delete feedback
// @route   DELETE /api/feedback/:id
// @access  Private (users can delete their own feedback, admins can delete any)
const deleteFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    // Check if user owns the feedback or is admin
    if (feedback.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this feedback' });
    }

    await Feedback.findByIdAndDelete(req.params.id);

    res.json({ message: 'Feedback deleted successfully' });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(500).json({ message: 'Failed to delete feedback', details: error.message });
  }
};

export {
  createFeedback,
  getAllFeedback,
  getMyFeedback,
  updateFeedback,
  getFeedbackStats,
  markFeedbackAsRead,
  getUnreadCount,
  addComment,
  deleteFeedback
};