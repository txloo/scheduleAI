import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { CalendarEvent, Target } from "../types";

interface WeekOverviewProps {
  userId: string;
  allEvents: CalendarEvent[];
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
}

function getCurrentMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function WeekOverview({ userId, allEvents, open, onClose, onToggle }: WeekOverviewProps) {
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const snap = await getDocs(collection(db, "users", userId, "targets"));
      if (cancelled) return;
      const currentMonday = getCurrentMonday();
      const list: Target[] = [];
      snap.forEach((d) => {
        const data = d.data() as Omit<Target, "id">;
        const t: Target = { id: d.id, ...data };
        if (t.status === "current" && (t.weekOf || currentMonday) === currentMonday) {
          list.push(t);
        }
      });
      list.sort((a, b) => b.priority - a.priority);
      setTargets(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const now = new Date();
  const nowMs = now.getTime();
  const laterMs = nowMs + 3 * 60 * 60 * 1000;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const upcomingEvents = allEvents
    .filter((e) => e.date === todayStr)
    .map((e) => ({
      e,
      startMs: new Date(`${e.date}T${e.startTime}`).getTime(),
      endMs: new Date(`${e.date}T${e.endTime}`).getTime(),
    }))
    .filter((x) => x.startMs < laterMs && x.endMs > nowMs)
    .sort((a, b) => a.startMs - b.startMs);

  return (
    <>
      <button
        onClick={onToggle}
        title="Week overview"
        aria-label="Week overview"
        className="fixed bottom-6 left-1/2 ml-9 z-50 bg-white text-blue-600 rounded-full p-3 shadow-lg border hover:bg-blue-50 transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 w-[380px] max-h-[500px] bg-white rounded-xl shadow-2xl border flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold">Week Overview</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm" aria-label="Close overview">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">This Week's Targets</h4>
                {targets.length > 0 ? (
                  targets.map((t) => (
                    <div key={t.id} className="flex justify-between items-start text-sm py-1 border-b last:border-0">
                      <span className="flex-1">{t.text}</span>
                      <span className="text-gray-500 ml-2 flex-shrink-0">P{t.priority} · {t.estimatedHours}h</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 text-sm">No targets this week</p>
                )}
              </section>
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Next 3 Hours</h4>
                {upcomingEvents.length > 0 ? (
                  upcomingEvents.map(({ e }) => (
                    <div key={e.id} className="flex gap-2 text-sm py-1 border-b last:border-0">
                      <span className="text-xs text-gray-400 min-w-[100px] flex-shrink-0 pt-px">{e.startTime}–{e.endTime}</span>
                      <span className="text-gray-900 leading-snug">{e.title}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 text-sm">No events in the next 3 hours</p>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
