import React from 'react';

interface ProgressBarProps {
  completed: number;
  total: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ completed, total }) => {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  
  return (
    <div className="progress-container">
      <div className="progress-header">
        <span className="progress-label">Progress</span>
        <span className="progress-count">
          {completed} / {total} files completed
        </span>
      </div>
      <div className="progress-bar-wrapper">
        <div className="progress-bar-bg">
          <div 
            className="progress-bar-fill"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="progress-percentage">{percentage.toFixed(1)}%</span>
      </div>
    </div>
  );
};

export default ProgressBar;