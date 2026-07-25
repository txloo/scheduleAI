import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { User } from "firebase/auth";
import { collection, getDocs, query, where, doc, updateDoc, deleteField } from "firebase/firestore";
import { signOutUser, db } from "../lib/firebase";
import { AppView, CalendarEvent, MainGoal, ViewMode, WeekRange } from "../types";
import WeekPicker from "./WeekPicker";
import EventList, { EventListHandle } from "./EventList";
import TargetList, { TargetListHandle } from "./TargetList";
import MainGoalList from "./MainGoalList";
import TodayEvents from "./TodayEvents";
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

function getViewFromURL(): ViewMode {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  if (view === "targets-first" || view === "events-first" || view === "tabbed") {
    return view;
  }
  return "targets-first";
}

function setViewInURL(mode: ViewMode) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", mode);
  window.history.pushState({}, "", url);
}

interface DashboardProps {
  user: User;
  onNavigate: (view: AppView) => void;
}

export default function Dashboard({ user, onNavigate }: DashboardProps) {
  const [weekRange, setWeekRange] = useState<WeekRange>(() => getWeekRange(new Date()));
  const [mainGoals, setMainGoals] = useState<MainGoal[]>([]);
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(getViewFromURL);
  const [activeTab, setActiveTab] = useState<"targets" | "events">("targets");
  const [pendingTelegramLinks, setPendingTelegramLinks] = useState<{ id: string; email: string }[]>([]);
  const eventListRef = useRef<EventListHandle>(null);
  const targetListRef = useRef<TargetListHandle>(null);

  const weekOf = formatDate(weekRange.start);
  const weekEnd = formatDate(weekRange.end);
  const today = formatDate(new Date());

  useEffect(() => {
    fetchMainGoals();
    fetchEvents();
    fetchPendingTelegramLinks();
  }, [user.uid]);

  async function fetchMainGoals() {
    const snap = await getDocs(collection(db, "users", user.uid, "goals"));
    const list: MainGoal[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<MainGoal, "id">;
      list.push({ id: d.id, ...data });
    });
    list.sort((a, b) => {
      const toMs = (v: unknown): number => {
        if (!v) return 0;
        if (v instanceof Date) return v.getTime();
        if (typeof v === "number") return v;
        if (typeof v === "string") return new Date(v).getTime() || 0;
        if (typeof v === "object" && typeof (v as { toDate?: () => Date }).toDate === "function") {
          return (v as { toDate: () => Date }).toDate().getTime();
        }
        return 0;
      };
      return toMs(a.createdAt) - toMs(b.createdAt);
    });
    setMainGoals(list);
  }

  async function fetchEvents() {
    const snap = await getDocs(collection(db, "users", user.uid, "events"));
    const list: CalendarEvent[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<CalendarEvent, "id">;
      list.push({ id: d.id, ...data });
    });
    setAllEvents(list);
  }

  async function fetchPendingTelegramLinks() {
    try {
      console.log("[fetchPendingTelegramLinks] querying for email:", user.email);
      const q = query(
        collection(db, "telegramUsers"),
        where("email", "==", user.email),
        where("pending", "==", true)
      );
      const snap = await getDocs(q);
      console.log("[fetchPendingTelegramLinks] result count:", snap.size);
      const links: { id: string; email: string }[] = [];
      snap.forEach((d) => {
        console.log("[fetchPendingTelegramLinks] found:", d.id, d.data());
        links.push({ id: d.id, email: d.data().email });
      });
      setPendingTelegramLinks(links);
    } catch (err) {
      console.error("[fetchPendingTelegramLinks] error:", err);
    }
  }

  async function approveLink(linkId: string) {
    try {
      await updateDoc(doc(db, "telegramUsers", linkId), {
        uid: user.uid,
        pending: deleteField(),
      });
      setPendingTelegramLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch {
      alert("Failed to approve link. Please try again.");
    }
  }

  function dismissLink(linkId: string) {
    setPendingTelegramLinks((prev) => prev.filter((l) => l.id !== linkId));
  }

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
      fetchEvents();
    }
    if (toolNames.some((t) => /MainGoal/i.test(t))) {
      fetchMainGoals();
    }
  }, []);

  function cycleViewMode() {
    const modes: ViewMode[] = ["targets-first", "events-first", "tabbed"];
    const next = modes[(modes.indexOf(viewMode) + 1) % modes.length];
    setViewMode(next);
    setViewInURL(next);
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm border-b shrink-0">
        <div className="mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">Schedule AI</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={cycleViewMode}
              className="text-sm text-gray-600 hover:text-gray-900 transition flex items-center gap-1"
              title="Toggle view mode"
            >
              {viewMode === "targets-first" && "↓ Targets"}
              {viewMode === "events-first" && "↓ Events"}
              {viewMode === "tabbed" && "≡ Tabs"}
            </button>
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
                  onClick={() => approveLink(pendingTelegramLinks[0].id)}
                  className="bg-green-500 text-white text-sm px-3 py-1 rounded hover:bg-green-600 transition"
                >
                  Approve
                </button>
                <button
                  onClick={() => dismissLink(pendingTelegramLinks[0].id)}
                  className="bg-gray-400 text-white text-sm px-3 py-1 rounded hover:bg-gray-500 transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          <TodayEvents userId={user.uid} events={todayEvents} onRefresh={fetchEvents} />
          <MainGoalList userId={user.uid} mainGoals={mainGoals} onMainGoalsChange={fetchMainGoals} />

          {viewMode === "tabbed" ? (
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <WeekPicker weekRange={weekRange} onChange={setWeekRange} getWeekRange={getWeekRange} />
              <div className="flex gap-2 mt-4 mb-4 border-b">
                <button
                  onClick={() => setActiveTab("targets")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                    activeTab === "targets"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Targets
                </button>
                <button
                  onClick={() => setActiveTab("events")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                    activeTab === "events"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Events
                </button>
              </div>
              <div className={activeTab === "targets" ? "" : "hidden"}>
                <TargetList ref={targetListRef} userId={user.uid} mainGoals={mainGoals} />
              </div>
              <div className={activeTab === "events" ? "" : "hidden"}>
                <EventList ref={eventListRef} userId={user.uid} events={weekEvents} onRefresh={fetchEvents} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* WeekPicker + Events */}
              <div className={`bg-white rounded-lg shadow-sm border p-4 ${
                viewMode === "targets-first"
                  ? "order-2 md:order-1"
                  : "order-1 md:order-1"
              }`}>
                <WeekPicker weekRange={weekRange} onChange={setWeekRange} getWeekRange={getWeekRange} />
                <div className="mt-4">
                  <EventList ref={eventListRef} userId={user.uid} events={weekEvents} onRefresh={fetchEvents} />
                </div>
              </div>

              {/* Targets */}
              <div className={`bg-white rounded-lg shadow-sm border p-4 ${
                viewMode === "targets-first"
                  ? "order-1 md:order-2"
                  : "order-2 md:order-2"
              }`}>
                <TargetList ref={targetListRef} userId={user.uid} mainGoals={mainGoals} />
              </div>
            </div>
          )}
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
