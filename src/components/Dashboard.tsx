import { useState } from "react";
import { User } from "firebase/auth";
import { signOutUser } from "../lib/firebase";
import { WeekRange } from "../types";
import WeekPicker from "./WeekPicker";
import EventList from "./EventList";
import GoalList from "./GoalList";
import WeeklyPlan from "./WeeklyPlan";
import MainGoalList from "./MainGoalList";
import ChatPanel from "./ChatPanel";

function getWeekRange(date: Date): WeekRange {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const label = `${monday.toLocaleDateString("en-US", options)} – ${sunday.toLocaleDateString("en-US", options)}`;

  return { start: monday, end: sunday, label };
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const [weekRange, setWeekRange] = useState<WeekRange>(() => getWeekRange(new Date()));

  const weekOf = formatDate(weekRange.start);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">Schedule AI</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user.displayName || user.email}</span>
            <button
              onClick={signOutUser}
              className="text-sm text-red-600 hover:text-red-800 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <MainGoalList userId={user.uid} />
        <WeekPicker weekRange={weekRange} onChange={setWeekRange} getWeekRange={getWeekRange} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <EventList userId={user.uid} weekOf={weekOf} />
          <GoalList userId={user.uid} weekOf={weekOf} />
        </div>

        <WeeklyPlan userId={user.uid} weekOf={weekOf} />
        <ChatPanel userId={user.uid} />
      </main>
    </div>
  );
}
