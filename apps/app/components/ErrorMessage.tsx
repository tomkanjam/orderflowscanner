
import React from 'react';

interface ErrorMessageProps {
  title?: string;
  message: string | null;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ title = "Error!", message }) => {
  if (!message) return null;

  return (
    <div className="bg-[var(--nt-error)]/10 border border-[var(--nt-error)] text-[var(--nt-error)] px-4 py-3 rounded-lg text-center mb-6">
      <h3 className="font-bold">{title}</h3>
      <p>{message}</p>
    </div>
  );
};

// Memoize pure presentational component  
export default React.memo(ErrorMessage);
