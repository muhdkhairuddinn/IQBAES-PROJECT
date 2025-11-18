import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Course, Role, User } from '../types';
import { Icon } from './Icon';

interface EnhancedUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: Omit<User, 'id'> | User) => void;
  allCourses: Course[];
  userToEdit: User | null;
}

export const EnhancedUserModal: React.FC<EnhancedUserModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  allCourses, 
  userToEdit 
}) => {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  
  const [nameError, setNameError] = useState<string>('');
  const [usernameError, setUsernameError] = useState<string>('');

  const isEditing = userToEdit !== null;

  const validateName = (val: string) => {
    const trimmed = val.trim();
    if (trimmed.length < 2 || trimmed.length > 50) return 'Name must be 2–50 characters';
    if (!/^[a-zA-Z\s]+$/.test(trimmed)) return 'Name can only contain letters and spaces';
    return '';
  };

  const validateEmail = (val: string) => {
    const trimmed = val.trim().toLowerCase();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    return isEmail ? '' : 'Username must be a valid email';
  };

  useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        setName(userToEdit.name);
        setUsername(userToEdit.username);
        setRole(userToEdit.role);
        setEnrolledCourseIds(userToEdit.enrolledCourseIds || []);
        setPassword('');
        setConfirmPassword('');
        setChangePassword(false);
        setNameError(validateName(userToEdit.name));
        setUsernameError(validateEmail(userToEdit.username));
      } else {
        setName('');
        setUsername('');
        setRole('student');
        setEnrolledCourseIds([]);
        setPassword('');
        setConfirmPassword('');
        setChangePassword(false);
        setNameError('');
        setUsernameError('');
      }
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  }, [isOpen, userToEdit, isEditing]);

  const handleCourseToggle = (courseId: string) => {
    setEnrolledCourseIds(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    );
  };

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    if (pwd.length < 6) {
      errors.push('Password must be at least 6 characters long');
    }
    if (!/(?=.*[a-z])/.test(pwd)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/(?=.*[A-Z])/.test(pwd)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/(?=.*\d)/.test(pwd)) {
      errors.push('Password must contain at least one number');
    }
    return errors;
  };

  const handleSave = () => {
    // Basic required checks
    const currentNameError = validateName(name);
    const currentUsernameError = validateEmail(username);
    setNameError(currentNameError);
    setUsernameError(currentUsernameError);

    if (currentNameError || currentUsernameError) {
      alert('Please fix validation errors before saving.');
      return;
    }

    if (!name || !username) {
      alert('Please fill in all required fields.');
      return;
    }

    // Password validation for new users or when changing password
    if (!isEditing || changePassword) {
      if (!password) {
        alert('Password is required.');
        return;
      }

      const passwordErrors = validatePassword(password);
      if (passwordErrors.length > 0) {
        alert('Password validation failed:\n' + passwordErrors.join('\n'));
        return;
      }

      if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return;
      }
    }

    const normalizedName = name.trim();
    const normalizedUsername = username.trim().toLowerCase();

    const userData: any = {
      name: normalizedName,
      username: normalizedUsername,
      role,
      enrolledCourseIds
    };

    // Include password only if it's a new user or password is being changed
    if (!isEditing || changePassword) {
      userData.password = password;
    }

    if (isEditing) {
      onSave({ ...userToEdit, ...userData });
    } else {
      onSave(userData);
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    
    // Ensure at least one of each required character type
    result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // Uppercase
    result += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // Lowercase
    result += '0123456789'[Math.floor(Math.random() * 10)]; // Number
    result += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // Special char
    
    // Fill the rest randomly
    for (let i = 4; i < 12; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    
    // Shuffle the result
    const shuffled = result.split('').sort(() => Math.random() - 0.5).join('');
    setPassword(shuffled);
    setConfirmPassword(shuffled);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit User' : 'Add New User'}>
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
        {/* Basic Information */}
        <div className="bg-slate-50 p-6 rounded-none">
          <h3 className="text-xl font-semibold text-slate-800 mb-4">Basic Information</h3>
          
          <div className="space-y-5">
            <div>
              <label className="block text-base font-medium text-slate-700 mb-2">Full Name *</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => { setName(e.target.value); setNameError(validateName(e.target.value)); }} 
                placeholder="e.g., Badrul Hisyam" 
                className="mt-1 block w-full px-4 py-3 text-base border border-slate-300 rounded-none shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" 
              />
              {nameError && (
                <p className="mt-1 text-sm text-red-600">{nameError}</p>
              )}
            </div>
            
            <div>
              <label className="block text-base font-medium text-slate-700 mb-2">Email (Username) *</label>
              <input 
                type="email" 
                value={username} 
                onChange={e => { setUsername(e.target.value); setUsernameError(validateEmail(e.target.value)); }} 
                placeholder="e.g., badrul@test.com" 
                className="mt-1 block w-full px-4 py-3 text-base border border-slate-300 rounded-none shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" 
              />
              {usernameError && (
                <p className="mt-1 text-sm text-red-600">{usernameError}</p>
              )}
            </div>
            
            <div>
              <label className="block text-base font-medium text-slate-700 mb-2">Role *</label>
              <select 
                value={role} 
                onChange={e => setRole(e.target.value as Role)} 
                className="mt-1 block w-full pl-4 pr-10 py-3 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-none bg-white border border-slate-300"
              >
                <option value="student">Student</option>
                <option value="lecturer">Lecturer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        </div>

        {/* Password Section */}
        <div className="bg-slate-50 p-6 rounded-none">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-slate-800">Password Settings</h3>
            {isEditing && (
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={changePassword}
                  onChange={e => setChangePassword(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <span className="text-sm text-slate-600">Change Password</span>
              </label>
            )}
          </div>

          {(!isEditing || changePassword) && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-base font-medium text-slate-700">
                    New Password * 
                    <span className="text-sm text-slate-500 ml-2 font-normal">(min 6 chars, 1 upper, 1 lower, 1 number)</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-none hover:bg-indigo-200 transition-colors"
                  >
                    Generate
                  </button>
                </div>
                <div className="relative mt-1">
                  <input 
                    type={showPassword ? "text" : "password"}
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="Enter new password" 
                    className="block w-full px-4 py-3 pr-12 text-base border border-slate-300 rounded-none shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" 
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <Icon 
                      path={showPassword ? "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" : "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z"}
                      className="h-5 w-5 text-slate-400"
                    />
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-base font-medium text-slate-700 mb-2">Confirm Password *</label>
                <div className="relative mt-1">
                  <input 
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                    placeholder="Confirm new password" 
                    className="block w-full px-4 py-3 pr-12 text-base border border-slate-300 rounded-none shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" 
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <Icon 
                      path={showConfirmPassword ? "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" : "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z"}
                      className="h-5 w-5 text-slate-400"
                    />
                  </button>
                </div>
              </div>

              {password && confirmPassword && password !== confirmPassword && (
                <p className="text-sm text-red-600">Passwords do not match</p>
              )}
            </div>
          )}

          {isEditing && !changePassword && (
            <p className="text-sm text-slate-500 italic">Password will remain unchanged</p>
          )}
        </div>

        {/* Course Enrollment */}
        {role !== 'admin' && (
          <div className="bg-slate-50 p-6 rounded-none">
            <h3 className="text-xl font-semibold text-slate-800 mb-4">Course Enrollment</h3>
            <div className="border border-slate-200 rounded-none p-4 max-h-60 overflow-y-auto bg-white">
              {allCourses.length === 0 ? (
                <p className="text-slate-500 text-center py-4">No courses available</p>
              ) : (
                <div className="space-y-2">
                  {allCourses.map(course => (
                    <label key={course.id} className="flex items-center space-x-4 p-3 rounded-none hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enrolledCourseIds.includes(course.id)}
                        onChange={() => handleCourseToggle(course.id)}
                        className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <div className="flex-1">
                        <span className="font-semibold block text-base text-slate-800">{course.code}</span>
                        <span className="text-sm text-slate-500">{course.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Selected: {enrolledCourseIds.length} course{enrolledCourseIds.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-6 mt-6 border-t space-x-4">
        <button 
          onClick={onClose} 
          className="px-6 py-3 text-base text-slate-600 font-semibold rounded-none hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
        <button 
          onClick={handleSave} 
          className="px-8 py-3 text-base bg-indigo-600 text-white font-bold rounded-none shadow-md hover:bg-indigo-700 transition-colors flex items-center space-x-2"
          disabled={!!nameError || !!usernameError || !name || !username || ((!isEditing || changePassword) && (!!validatePassword(password).length || password !== confirmPassword))}
        >
          <Icon path="M16.5 3.75a1.125 1.125 0 113 0 1.125 1.125 0 01-3 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" className="w-4 h-4" />
          <span>{isEditing ? 'Save Changes' : 'Add User'}</span>
        </button>
      </div>
    </Modal>
  );
};