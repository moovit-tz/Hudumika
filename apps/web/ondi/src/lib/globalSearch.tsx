"use client";

import { createContext, useContext } from "react";

// The single search surface for the whole app lives in the topbar
// (DashboardShell). Dashboard pages used to each carry their own "Search
// members" / "Search activity" input, which meant N different search boxes
// doing N different things. Those have been removed in favor of reading the
// live topbar query here and filtering the page's own list against it, so
// there's exactly one search box and it does something real everywhere.
export interface GlobalSearchValue {
  query: string;
  /** Clears the topbar search box from anywhere it's being filtered against
   * — e.g. a page's own "no results, clear search" affordance. */
  clear: () => void;
}

const GlobalSearchContext = createContext<GlobalSearchValue>({
  query: "",
  clear: () => {},
});

export const GlobalSearchProvider = GlobalSearchContext.Provider;

/** The live query typed into the topbar's global search. */
export function useGlobalSearch(): string {
  return useContext(GlobalSearchContext).query;
}

/** Clears the topbar search box. */
export function useClearGlobalSearch(): () => void {
  return useContext(GlobalSearchContext).clear;
}
