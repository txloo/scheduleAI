export interface CalendarEvent {
  id?: string;
  title: string;
  date: string; // "2026-07-08"
  startTime: string; // "09:00"
  endTime: string; // "10:00"
  createdAt?: Date;
}

export type MainGoalStatus = "not_started" | "in_progress" | "done";

export interface MainGoal {
  id?: string;
  title: string;
  description?: string;
  targetDate?: string; // ISO date string (e.g. "2026-12-31")
  status: MainGoalStatus;
  createdAt?: Date;
}

export type TargetStatus = "current" | "upcoming" | "recurring";

export interface Target {
  id?: string;
  text: string;
  priority: number; // 1-5
  estimatedHours: number;
  status: TargetStatus;
  deadline?: string;
  mainGoalId?: string;
  weekOf?: string; // ISO Monday date for sort ordering
  createdAt?: Date;
}

export interface WeekRange {
  start: Date; // Monday
  end: Date; // Sunday
  label: string;
}

export type ViewMode = "targets-first" | "events-first" | "tabbed";

export type AppView = "dashboard" | "notes";

export interface Note {
  id: string;
  body: string;
}
