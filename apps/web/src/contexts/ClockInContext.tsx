import React, { createContext, useContext, useState, useCallback } from 'react';

export interface ClockEntry {
  id: string;
  task_name: string | null;
  is_billable: boolean;
  started_at: string;
  is_full_day: boolean;
  last_ack_at: string | null;
}

interface ClockInContextValue {
  isCheckedIn: boolean;
  currentEntry: ClockEntry | null;
  openTrigger: number;
  triggerOpen: () => void;
  setCheckedIn: (checked: boolean, entry?: ClockEntry | null) => void;
}

export const ClockInContext = createContext<ClockInContextValue>({
  isCheckedIn: false,
  currentEntry: null,
  openTrigger: 0,
  triggerOpen: () => {},
  setCheckedIn: () => {},
});

export const ClockInProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<ClockEntry | null>(null);
  const [openTrigger, setOpenTrigger] = useState(0);

  const triggerOpen = useCallback(() => setOpenTrigger(t => t + 1), []);

  const setCheckedIn = useCallback((checked: boolean, entry?: ClockEntry | null) => {
    setIsCheckedIn(checked);
    setCurrentEntry(entry ?? null);
  }, []);

  return (
    <ClockInContext.Provider value={{ isCheckedIn, currentEntry, openTrigger, triggerOpen, setCheckedIn }}>
      {children}
    </ClockInContext.Provider>
  );
};

export const useClockIn = () => useContext(ClockInContext);
