import { useEffect, useState, useRef, useCallback } from "react";
import { User } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { signOutUser, db } from "../lib/firebase";
import { MainGoal, WeekRange } from "../types";
import WeekPicker from "./WeekPicker";
import EventList, { EventListHandle } from "./EventList";
import TargetList, { TargetListHandle } from "./TargetList";
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
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const [weekRange, setWeekRange] = useState<WeekRange>(() => getWeekRange(new Date()));
  const [mainGoals, setMainGoals] = useState<MainGoal[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const eventListRef = useRef<EventListHandle>(null);
  const targetListRef = useRef<TargetListHandle>(null);

  const weekOf = formatDate(weekRange.start);

  useEffect(() => {
    fetchMainGoals();
  }, [user.uid]);

  async function fetchMainGoals() {
    const snap = await getDocs(collection(db, "users", user.uid, "goals"));
    const list: MainGoal[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<MainGoal, "id">;
      list.push({ id: d.id, ...data });
    });
    setMainGoals(list);
  }

  const handleToolAction = useCallback((toolNames: string[]) => {
    if (toolNames.some((t) => /Target/i.test(t))) {
      targetListRef.current?.refresh();
    }
    if (toolNames.some((t) => /Event/i.test(t))) {
      eventListRef.current?.refresh();
    }
    if (toolNames.some((t) => /MainGoal/i.test(t))) {
      fetchMainGoals();
    }
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm border-b shrink-0">
        <div className="mx-auto px-4 py-3 flex items-center justify-between">
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

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <MainGoalList userId={user.uid} mainGoals={mainGoals} onMainGoalsChange={fetchMainGoals} />
          <WeekPicker weekRange={weekRange} onChange={setWeekRange} getWeekRange={getWeekRange} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <EventList ref={eventListRef} userId={user.uid} weekOf={weekOf} weekEnd={formatDate(weekRange.end)} />
            <TargetList ref={targetListRef} userId={user.uid} mainGoals={mainGoals} />
          </div>
        </main>
      </div>

      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-blue-500 text-white rounded-full p-3 shadow-lg hover:bg-blue-600 transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      <>
        {chatOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setChatOpen(false)}
          />
        )}
        <div className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-50 w-[380px] h-[500px] bg-white rounded-xl shadow-2xl border flex flex-col overflow-hidden ${chatOpen ? "" : "hidden"}`}>
          <ChatPanel userId={user.uid} onClose={() => setChatOpen(false)} onToolAction={handleToolAction} />
        </div>
      </>
    </div>
  );
}
