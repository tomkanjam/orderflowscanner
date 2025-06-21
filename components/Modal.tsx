
import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out">
      <div className="bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-2xl mx-auto transform transition-all duration-300 ease-in-out scale-100 opacity-100">
        <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-4">
          <h3 className="text-2xl font-bold text-yellow-400">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-3xl font-light focus:outline-none"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>
        <div className="text-gray-300 max-h-[70vh] overflow-y-auto pr-2">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
