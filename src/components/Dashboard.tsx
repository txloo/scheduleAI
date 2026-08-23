import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { User } from "firebase/auth";
import { signOutUser } from "../lib/firebase";
import { AppView, CalendarEvent, MainGoal, WeekRange } from "../types";
import WeekPicker from "./WeekPicker";
import EventList, { EventListHandle } from "./EventList";
import TargetList, { TargetListHandle } from "./TargetList";
import MainGoalList from "./MainGoalList";
import TodayEvents from "./TodayEvents";
import ChatPanel from "./ChatPanel";
import WeekOverview from "./WeekOverview";

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
  onNavigate: (view: AppView) => void;
  mainGoals: MainGoal[];
  allEvents: CalendarEvent[];
  pendingTelegramLinks: { id: string; email: string }[];
  onFetchMainGoals: () => void;
  onFetchEvents: () => void;
  onFetchNotes: () => void;
  onApproveLink: (linkId: string) => void;
  onDismissLink: (linkId: string) => void;
}

export default function Dashboard({
  user,
  onNavigate,
  mainGoals,
  allEvents,
  pendingTelegramLinks,
  onFetchMainGoals,
  onFetchEvents,
  onFetchNotes,
  onApproveLink,
  onDismissLink,
}: DashboardProps) {
  const [weekRange, setWeekRange] = useState<WeekRange>(() => getWeekRange(new Date()));
  const [chatOpen, setChatOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const eventListRef = useRef<EventListHandle>(null);
  const targetListRef = useRef<TargetListHandle>(null);

  useEffect(() => {
    function onPopState() {
      setChatOpen(false);
      setOverviewOpen(false);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (overviewOpen) {
        setOverviewOpen(false);
        return;
      }
      if (chatOpen) {
        setChatOpen(false);
        return;
      }
      if (document.querySelector(".fixed.inset-0.z-50")) return;
      setChatOpen(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chatOpen, overviewOpen]);

  const weekOf = formatDate(weekRange.start);
  const weekEnd = formatDate(weekRange.end);
  const today = formatDate(new Date());

  const todayEvents = useMemo(
    () => allEvents
      .filter((e) => e.date === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [allEvents, today]
  );

  const weekEvents = useMemo(
    () => allEvents
      .filter((e) => e.date >= weekOf && e.date <= weekEnd)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [allEvents, weekOf, weekEnd]
  );

  const handleToolAction = useCallback((toolNames: string[]) => {
    if (toolNames.some((t) => /Target/i.test(t))) {
      targetListRef.current?.refresh();
    }
    if (toolNames.some((t) => /Event/i.test(t))) {
      onFetchEvents();
    }
    if (toolNames.some((t) => /MainGoal/i.test(t))) {
      onFetchMainGoals();
    }
    if (toolNames.some((t) => /Note/i.test(t))) {
      onFetchNotes();
    }
  }, [onFetchEvents, onFetchMainGoals, onFetchNotes]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm border-b shrink-0">
        <div className="mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">Schedule AI</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate("notes")}
              className="text-sm text-gray-600 hover:text-gray-900 transition"
            >
              Notes
            </button>
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
          {pendingTelegramLinks.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                🔗 Telegram link request from <strong>{pendingTelegramLinks[0].email}</strong>
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onApproveLink(pendingTelegramLinks[0].id)}
                  className="bg-green-500 text-white text-sm px-3 py-1 rounded hover:bg-green-600 transition"
                >
                  Approve
                </button>
                <button
                  onClick={() => onDismissLink(pendingTelegramLinks[0].id)}
                  className="bg-gray-400 text-white text-sm px-3 py-1 rounded hover:bg-gray-500 transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          <TodayEvents userId={user.uid} events={todayEvents} onRefresh={onFetchEvents} />
          <MainGoalList userId={user.uid} mainGoals={mainGoals} onMainGoalsChange={onFetchMainGoals} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Events (right on desktop, below on mobile) */}
            <div className="order-2 md:order-1 bg-white rounded-lg shadow-sm border p-4">
              <WeekPicker weekRange={weekRange} onChange={setWeekRange} getWeekRange={getWeekRange} />
              <div className="mt-4">
                <EventList ref={eventListRef} userId={user.uid} events={weekEvents} onRefresh={onFetchEvents} />
              </div>
            </div>

            {/* Targets (left on desktop, above on mobile) */}
            <div className="order-1 md:order-2 bg-white rounded-lg shadow-sm border p-4">
              <TargetList ref={targetListRef} userId={user.uid} mainGoals={mainGoals} />
            </div>
          </div>
        </main>
      </div>

      <button
        onClick={() => {
          setOverviewOpen(false);
          if (!chatOpen) {
            history.pushState({ chat: true }, "");
          }
          setChatOpen(!chatOpen);
        }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-blue-500 text-white rounded-full p-3 shadow-lg hover:bg-blue-600 transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      <WeekOverview
        userId={user.uid}
        allEvents={allEvents}
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        onToggle={() => {
          if (!overviewOpen) {
            setChatOpen(false);
          }
          setOverviewOpen(!overviewOpen);
        }}
      />

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
