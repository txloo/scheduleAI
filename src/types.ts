export interface CalendarEvent {
  id?: string;
  userId: string;
  title: string;
  date: string; // "2026-07-08"
  startTime: string; // "09:00"
  endTime: string; // "10:00"
  createdAt?: Date;
}

export type MainGoalStatus = "not_started" | "in_progress" | "done";

export interface MainGoal {
  id?: string;
  userId: string;
  title: string;
  description?: string;
  targetDate?: string; // ISO date string (e.g. "2026-12-31")
  status: MainGoalStatus;
  createdAt?: Date;
}

export interface Goal {
  id?: string;
  userId: string;
  text: string;
  priority: number; // 1-5
  estimatedHours: number;
  weekOf: string; // ISO Monday date of the week
  deadline?: string;
  mainGoalId?: string;
  createdAt?: Date;
}

export interface PlanSlot {
  day: string; // "Monday"
  date: string; // "2026-07-08"
  startTime: string;
  endTime: string;
  goalId: string;
  goalText: string;
}

export interface WeeklyPlan {
  id?: string;
  userId: string;
  weekOf: string;
  generatedAt?: Date;
  accepted: boolean;
  slots: PlanSlot[];
}

export interface WeekRange {
  start: Date; // Monday
  end: Date; // Sunday
  label: string;
}
