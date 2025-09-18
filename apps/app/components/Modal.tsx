
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
    <div className="fixed inset-0 tm-modal-overlay flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out">
      <div className="tm-modal-content p-6 w-full max-w-2xl mx-auto transform transition-all duration-300 ease-in-out scale-100 opacity-100">
        <div className="flex justify-between items-center border-b border-[var(--tm-border)] pb-3 mb-4">
          <h3 className="text-2xl font-bold text-[var(--tm-accent)] tm-heading-lg">{title}</h3>
          <button
            onClick={onClose}
            className="text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] text-3xl font-light focus:outline-none tm-focus-ring"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>
        <div className="text-[var(--tm-text-secondary)] max-h-[70vh] overflow-y-auto pr-2">
          {children}
        </div>
      </div>
    </div>
  );
};

// Memoize Modal since props rarely change
export default React.memo(Modal);
