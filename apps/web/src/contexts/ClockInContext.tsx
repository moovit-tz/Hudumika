import React, { createContext, useContext, useState, useCallback } from 'react';

export interface ClockEntry {
  id: string;
  task_name: string | null;
  is_billable: boolean;
  started_at: string;
  is_full_day: boolean;
  last_ack_at: string | null;
}

/** Optional context passed to triggerOpen() so the widget can pre-select what page you were on. */
export interface ClockOpenContext {
  shipmentId?: string;
  shipmentRef?: string;
  taskId?: string;
  taskName?: string;
}

interface ClockInContextValue {
  isCheckedIn: boolean;
  currentEntry: ClockEntry | null;
  openTrigger: number;
  openContext: ClockOpenContext | null;
  triggerOpen: (ctx?: ClockOpenContext) => void;
  setCheckedIn: (checked: boolean, entry?: ClockEntry | null) => void;
}

export const ClockInContext = createContext<ClockInContextValue>({
  isCheckedIn: false,
  currentEntry: null,
  openTrigger: 0,
  openContext: null,
  triggerOpen: () => {},
  setCheckedIn: () => {},
});

export const ClockInProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<ClockEntry | null>(null);
  const [openTrigger, setOpenTrigger] = useState(0);
  const [openContext, setOpenContext] = useState<ClockOpenContext | null>(null);

  const triggerOpen = useCallback((ctx?: ClockOpenContext) => {
    setOpenContext(ctx ?? null);
    setOpenTrigger(t => t + 1);
  }, []);

  const setCheckedIn = useCallback((checked: boolean, entry?: ClockEntry | null) => {
    setIsCheckedIn(checked);
    setCurrentEntry(entry ?? null);
  }, []);

  return (
    <ClockInContext.Provider value={{ isCheckedIn, currentEntry, openTrigger, openContext, triggerOpen, setCheckedIn }}>
      {children}
    </ClockInContext.Provider>
  );
};

export const useClockIn = () => useContext(ClockInContext);
