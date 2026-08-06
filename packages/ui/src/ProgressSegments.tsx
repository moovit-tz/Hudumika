import React from 'react';
import { CLEARANCE_STAGES } from '@hudumika/types';

export interface ProgressSegmentsProps {
  currentStage: string;
  // Set only for shipments governed by a tenant-defined custom workflow
  // (stage is then a workflow_steps.id, meaningless as a CLEARANCE_STAGES
  // index) — when both are present, render stepCount segments with
  // stepOrder marking progress instead of iterating the fixed 18 stages.
  workflowStepOrder?: number;
  workflowStepCount?: number;
}

export const ProgressSegments: React.FC<ProgressSegmentsProps> = ({ currentStage, workflowStepOrder, workflowStepCount }) => {
  if (workflowStepCount !== undefined && workflowStepOrder !== undefined) {
    return (
      <div className="progress-segments" style={{ display: 'flex', width: '100%' }}>
        {Array.from({ length: workflowStepCount }, (_, idx) => {
          let stateClass = 'ps-pending';
          if (idx < workflowStepOrder) stateClass = 'ps-done';
          else if (idx === workflowStepOrder) stateClass = 'ps-active';
          return <div key={idx} className={`progress-segment-item ${stateClass}`} />;
        })}
      </div>
    );
  }

  const currentIndex = CLEARANCE_STAGES.indexOf(currentStage as any);

  return (
    <div className="progress-segments" style={{ display: 'flex', width: '100%' }}>
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
