import Course from '../models/Course.js';
import SystemLogs from '../models/SystemLogs.js';

// @desc    Add a new course
// @route   POST /api/courses
// @access  Private/Admin
const addCourse = async (req, res) => {
  try {
    const { code, name } = req.body;
    const course = new Course({ code, name });
    const createdCourse = await course.save();
    res.status(201).json(createdCourse.toJSON());
  } catch (error) {
    res.status(400).json({ message: 'Invalid course data', details: error.message });
  }
};

// @desc    Update a course
// @route   PUT /api/courses/:id
// @access  Private/Admin
const updateCourse = async (req, res) => {
  try {
    const { code, name } = req.body;
    const course = await Course.findById(req.params.id);
    if (course) {
      course.code = code;
      course.name = name;
      const updatedCourse = await course.save();
      
      // Log course update to database
      try {
        const courseUpdatedLog = new SystemLogs({
          userId: req.user.id,
          userName: req.user.username,
          type: 'course_updated',
          message: `Course updated: ${updatedCourse.code} - ${updatedCourse.name}`,
          details: {
            courseId: updatedCourse._id,
            courseCode: updatedCourse.code,
            courseName: updatedCourse.name
          },
          timestamp: new Date(),
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown'
        });
        await courseUpdatedLog.save();
      } catch (logError) {
        console.error('Failed to log course update:', logError);
      }
      
      res.json(updatedCourse.toJSON());
    } else {
      res.status(404).json({ message: 'Course not found' });
    }
  } catch (error) {
    res.status(400).json({ message: 'Error updating course', details: error.message });
  }
};

// @desc    Delete a course
// @route   DELETE /api/courses/:id
// @access  Private/Admin
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (course) {
      const deletedCourseInfo = { code: course.code, name: course.name };
      await Course.deleteOne({ _id: req.params.id });
      
      // Log course deletion to database
      try {
        const courseDeletedLog = new SystemLogs({
          userId: req.user.id,
          userName: req.user.username,
          type: 'course_deleted',
          details: `Course deleted: ${deletedCourseInfo.code} - ${deletedCourseInfo.name}`,
          timestamp: new Date(),
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown'
        });
        await courseDeletedLog.save();
      } catch (logError) {
        console.error('Failed to log course deletion:', logError);
      }
      
      res.json({ message: 'Course removed' });
    } else {
      res.status(404).json({ message: 'Course not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

export { addCourse, updateCourse, deleteCourse };
