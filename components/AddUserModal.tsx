import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Course, Role, User } from '../types';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: Omit<User, 'id'> | User) => void;
  allCourses: Course[];
  userToEdit: User | null;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onSave, allCourses, userToEdit }) => {
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [role, setRole] = useState<Role>('student');
    const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);

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
                setEnrolledCourseIds(userToEdit.enrolledCourseIds);
                setNameError(validateName(userToEdit.name));
                setUsernameError(validateEmail(userToEdit.username));
            } else {
                setName('');
                setUsername('');
                setRole('student');
                setEnrolledCourseIds([]);
                setNameError('');
                setUsernameError('');
            }
        }
    }, [isOpen, userToEdit, isEditing]);

    const handleCourseToggle = (courseId: string) => {
        setEnrolledCourseIds(prev =>
            prev.includes(courseId)
                ? prev.filter(id => id !== courseId)
                : [...prev, courseId]
        );
    };

    const handleSave = () => {
        const currentNameError = validateName(name);
        const currentUsernameError = validateEmail(username);
        setNameError(currentNameError);
        setUsernameError(currentUsernameError);

        if (currentNameError || currentUsernameError) {
            alert('Please fix validation errors before saving.');
            return;
        }

        if (name && username) {
            const normalizedName = name.trim();
            const normalizedUsername = username.trim().toLowerCase();

            if (isEditing) {
                onSave({ ...userToEdit, name: normalizedName, username: normalizedUsername, role, enrolledCourseIds });
            } else {
                onSave({ name: normalizedName, username: normalizedUsername, role, enrolledCourseIds });
            }
        } else {
            alert('Please fill in all required fields.');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit User' : 'Add New User'}>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div>
                    <label className="block text-sm font-medium text-slate-700">Full Name</label>
                    <input type="text" value={name} onChange={e => { setName(e.target.value); setNameError(validateName(e.target.value)); }} placeholder="e.g., Badrul Hisyam" className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm" />
                    {nameError && (
                        <p className="mt-1 text-sm text-red-600">{nameError}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">Email (Username)</label>
                    <input type="email" value={username} onChange={e => { setUsername(e.target.value); setUsernameError(validateEmail(e.target.value)); }} placeholder="e.g., badrul@test.com" className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm" />
                    {usernameError && (
                        <p className="mt-1 text-sm text-red-600">{usernameError}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">Role</label>
                    <select value={role} onChange={e => setRole(e.target.value as Role)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white">
                        <option value="student">Student</option>
                        <option value="lecturer">Lecturer</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
                {role !== 'admin' && (
                  <div>
                      <label className="block text-sm font-medium text-slate-700">Enroll in Courses</label>
                      <div className="mt-2 space-y-2 border border-slate-200 rounded-md p-3 max-h-40 overflow-y-auto">
                          {allCourses.map(course => (
                              <label key={course.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-slate-50">
                                  <input
                                      type="checkbox"
                                      checked={enrolledCourseIds.includes(course.id)}
                                      onChange={() => handleCourseToggle(course.id)}
                                      className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span>
                                    <span className="font-semibold block text-slate-800">{course.code}</span>
                                    <span className="text-sm text-slate-500">{course.name}</span>
                                  </span>
                              </label>
                          ))}
                      </div>
                  </div>
                )}
            </div>
            <div className="flex justify-end pt-6 mt-4 border-t">
                <button onClick={onClose} className="text-slate-600 font-semibold py-2 px-4 rounded-lg mr-2">Cancel</button>
                <button onClick={handleSave} className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-indigo-700" disabled={!!nameError || !!usernameError || !name || !username}>{isEditing ? 'Save Changes' : 'Add User'}</button>
            </div>
        </Modal>
    );
};