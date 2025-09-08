import React from 'react';
import { render, screen } from '@testing-library/react';
import { ActivityIndicator } from './ActivityIndicator';
import { activityTracker } from '../../services/activityTracker';

// Mock the activity tracker
jest.mock('../../services/activityTracker', () => ({
  activityTracker: {
    getActivityState: jest.fn(),
  },
}));

describe('ActivityIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with default props', () => {
    render(<ActivityIndicator />);
    const indicator = screen.getByLabelText('Activity: idle');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass('w-2', 'h-2'); // 8x8px medium size
  });

  it('should show triggered state when triggered prop is true', () => {
    render(<ActivityIndicator triggered={true} />);
    const indicator = screen.getByLabelText('Activity: triggered');
    expect(indicator).toHaveClass('bg-lime-500');
    expect(indicator).toHaveAttribute('data-activity', 'triggered');
  });

  it('should show active state when isActive prop is true', () => {
    render(<ActivityIndicator isActive={true} />);
    const indicator = screen.getByLabelText('Activity: active');
    expect(indicator).toHaveClass('bg-green-500');
  });

  it('should show recent state for activity within 5 minutes', () => {
    const recentTime = Date.now() - (2 * 60 * 1000); // 2 minutes ago
    render(<ActivityIndicator lastActivity={recentTime} />);
    const indicator = screen.getByLabelText('Activity: recent');
    expect(indicator).toHaveClass('bg-yellow-500');
  });

  it('should show triggered state for activity within 1 minute', () => {
    const justNow = Date.now() - (30 * 1000); // 30 seconds ago
    render(<ActivityIndicator lastActivity={justNow} />);
    const indicator = screen.getByLabelText('Activity: triggered');
    expect(indicator).toHaveClass('bg-lime-500');
  });

  it('should show idle state for old activity', () => {
    const oldTime = Date.now() - (10 * 60 * 1000); // 10 minutes ago
    render(<ActivityIndicator lastActivity={oldTime} />);
    const indicator = screen.getByLabelText('Activity: idle');
    expect(indicator).toHaveClass('bg-gray-500');
  });

  it('should use activity tracker when signalId is provided', () => {
    const mockGetActivityState = activityTracker.getActivityState as jest.Mock;
    mockGetActivityState.mockReturnValue('triggered');

    render(<ActivityIndicator signalId="signal-123" />);
    
    expect(mockGetActivityState).toHaveBeenCalledWith('signal-123');
    const indicator = screen.getByLabelText('Activity: triggered');
    expect(indicator).toHaveClass('bg-lime-500');
  });

  it('should apply different sizes correctly', () => {
    const { rerender } = render(<ActivityIndicator size="small" />);
    let indicator = screen.getByLabelText('Activity: idle');
    expect(indicator).toHaveClass('w-1.5', 'h-1.5'); // 6x6px

    rerender(<ActivityIndicator size="medium" />);
    indicator = screen.getByLabelText('Activity: idle');
    expect(indicator).toHaveClass('w-2', 'h-2'); // 8x8px

    rerender(<ActivityIndicator size="large" />);
    indicator = screen.getByLabelText('Activity: idle');
    expect(indicator).toHaveClass('w-3', 'h-3'); // 12x12px
  });

  it('should add pulse animation classes when appropriate', () => {
    render(<ActivityIndicator triggered={true} animate={true} />);
    const indicator = screen.getByLabelText('Activity: triggered');
    expect(indicator).toHaveClass('signal-card__status-dot--triggered');
  });

  it('should not add pulse animation when animate is false', () => {
    render(<ActivityIndicator triggered={true} animate={false} />);
    const indicator = screen.getByLabelText('Activity: triggered');
    expect(indicator).not.toHaveClass('signal-card__status-dot--triggered');
  });

  it('should accept custom className', () => {
    render(<ActivityIndicator className="custom-class" />);
    const indicator = screen.getByLabelText('Activity: idle');
    expect(indicator).toHaveClass('custom-class');
  });

  it('should prioritize triggered over other states', () => {
    render(<ActivityIndicator triggered={true} isActive={true} />);
    const indicator = screen.getByLabelText('Activity: triggered');
    expect(indicator).toHaveClass('bg-lime-500');
  });

  it('should prioritize active over recent activity', () => {
    const recentTime = Date.now() - (2 * 60 * 1000);
    render(<ActivityIndicator isActive={true} lastActivity={recentTime} />);
    const indicator = screen.getByLabelText('Activity: active');
    expect(indicator).toHaveClass('bg-green-500');
  });
});