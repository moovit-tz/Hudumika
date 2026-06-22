import React from 'react';
import type { ClearanceStage } from '@clearos/types';
import { CLEARANCE_STAGES } from '@clearos/types';

export interface ProgressSegmentsProps {
  currentStage: ClearanceStage;
}

export const ProgressSegments: React.FC<ProgressSegmentsProps> = ({ currentStage }) => {
  const currentIndex = CLEARANCE_STAGES.indexOf(currentStage);

  return (
    <div className="progress-segments" style={{ display: 'flex', gap: '3px', width: '100%' }}>
      {CLEARANCE_STAGES.map((stage, idx) => {
        let stateClass = 'ps-pending';

        if (idx < currentIndex) {
          stateClass = 'ps-done';
        } else if (idx === currentIndex) {
          stateClass = 'ps-active';
        }

        return (
          <div
            key={stage}
            className={`progress-segment-item ${stateClass}`}
            title={stage.replace(/_/g, ' ')}
          />
        );
      })}
    </div>
  );
};
