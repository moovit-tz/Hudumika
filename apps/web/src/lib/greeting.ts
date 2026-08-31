/**
 * Time-of-day greeting/mood, centralized. Was independently duplicated in
 * ComplyTopbar.tsx, CloudHome.tsx and OnsiteOverview.tsx — none shared, all
 * slightly different. New call sites (AgenticHome.tsx) use this one instead
 * of adding a fourth copy; the existing three are left as they are.
 */
export type Mood = 'morning' | 'midday' | 'evening';

export interface MoodTokens {
  mood: Mood;
  greeting: string;
  accent: string;
  accentSoft: string;
}

const MOODS: Record<Mood, { greeting: string; accent: string; accentSoft: string }> = {
  morning: { greeting: 'Good morning', accent: '#f0a53f', accentSoft: '#fdf1e2' },
  midday:  { greeting: 'Good afternoon', accent: '#4a90c4', accentSoft: '#e9f2f9' },
  evening: { greeting: 'Good evening', accent: '#6a5fae', accentSoft: '#efedf9' },
};

export function getMood(now: Date = new Date()): MoodTokens {
  const h = now.getHours();
  const mood: Mood = h < 12 ? 'morning' : h < 17 ? 'midday' : 'evening';
  return { mood, ...MOODS[mood] };
}
