
import React from 'react';

interface LoaderProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}

const Loader: React.FC<LoaderProps> = ({ text, size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  return (
    <div className="text-center py-10">
      <div className={`animate-spin rounded-full ${sizeClasses[size]} border-b-2 border-yellow-400 mx-auto`}></div>
      {text && <p className="mt-4 text-lg text-gray-300">{text}</p>}
    </div>
  );
};

export default Loader;
