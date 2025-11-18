import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Course } from '../types';

interface CreateCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (course: Omit<Course, 'id'> | Course) => void;
  courseToEdit: Course | null;
}

export const CreateCourseModal: React.FC<CreateCourseModalProps> = ({ isOpen, onClose, onSave, courseToEdit }) => {
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [codeError, setCodeError] = useState<string | null>(null);
    const [nameError, setNameError] = useState<string | null>(null);

    const isEditing = courseToEdit !== null;

    useEffect(() => {
        if (isOpen) {
            setCodeError(null);
            setNameError(null);
            if (isEditing && courseToEdit) {
                setCode(courseToEdit.code);
                setName(courseToEdit.name);
            } else {
                setCode('');
                setName('');
            }
        }
    }, [isOpen, courseToEdit, isEditing]);
    
    const validateCode = (val: string) => /^[A-Z]{3}\d{3}$/.test(val.trim());
    const validateName = (val: string) => {
        const s = val.trim();
        return s.length >= 5 && s.length <= 100;
    };

    const handleSave = () => {
        setCodeError(null);
        setNameError(null);
        const normalizedCode = code.trim().toUpperCase();
        const normalizedName = name.trim();

        const isCodeValid = validateCode(normalizedCode);
        const isNameValid = validateName(normalizedName);

        if (!isCodeValid || !isNameValid) {
            if (!isCodeValid) setCodeError('Use format ABC123: 3 letters + 3 digits');
            if (!isNameValid) setNameError('Name must be 5–100 characters');
            return;
        }

        if (isEditing) {
            onSave({ ...courseToEdit, code: normalizedCode, name: normalizedName });
        } else {
            onSave({ code: normalizedCode, name: normalizedName });
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Course' : 'Create New Course'}>
            <div className="space-y-6">
                <div>
                    <label className="block text-base font-medium text-slate-700 mb-2">Course Code</label>
                    <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g., ABC123" className={`mt-1 block w-full px-4 py-3 text-base border rounded-none shadow-sm ${codeError ? 'border-red-500 focus:ring-red-500' : 'border-slate-300'}`} />
                    {codeError && <p className="mt-2 text-sm text-red-600">{codeError}</p>}
                </div>
                <div>
                    <label className="block text-base font-medium text-slate-700 mb-2">Course Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Web Application Development" className={`mt-1 block w-full px-4 py-3 text-base border rounded-none shadow-sm ${nameError ? 'border-red-500 focus:ring-red-500' : 'border-slate-300'}`} />
                    {nameError && <p className="mt-2 text-sm text-red-600">{nameError}</p>}
                </div>
            </div>
            <div className="flex justify-end pt-6 mt-6 border-t space-x-4">
                <button onClick={onClose} className="px-6 py-3 text-base text-slate-600 font-semibold rounded-none hover:bg-slate-100">Cancel</button>
                <button onClick={handleSave} className="px-8 py-3 text-base bg-indigo-600 text-white font-bold rounded-none shadow-md hover:bg-indigo-700">{isEditing ? 'Save Changes' : 'Save Course'}</button>
            </div>
        </Modal>
    )
}