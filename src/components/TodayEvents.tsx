import { useState } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { CalendarEvent } from "../types";
import Modal from "./Modal";

interface TodayEventsProps {
  userId: string;
  events: CalendarEvent[];
  onRefresh: () => void;
}

export default function TodayEvents({ userId, events, onRefresh }: TodayEventsProps) {
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  async function archiveTodayEvents() {
    if (events.length === 0 || archiving) return;
    setArchiving(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayMs = today.getTime();

      for (const event of events) {
        await addDoc(collection(db, "archives"), {
          userId,
          type: "event",
          name: event.title,
          weekStart: todayMs,
          weekEnd: todayMs,
          archivedAt: Timestamp.now(),
        });
        await deleteDoc(doc(db, "users", userId, "events", event.id!));
      }
      setShowArchiveConfirm(false);
      onRefresh();
    } finally {
      setArchiving(false);
    }
  }

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">Today's Events</h2>
        {events.length > 0 && (
          <button
            onClick={() => setShowArchiveConfirm(true)}
            className="bg-amber-500 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-amber-600 transition"
          >
            Archive Day
          </button>
        )}
      </div>

      <div className="space-y-0">
        {events.length > 0 ? (
          events.map((event) => (
            <div
              key={event.id}
              className="flex gap-2 py-1 border-b border-gray-50 last:border-0"
            >
              <span className="text-xs text-gray-400 min-w-[100px] flex-shrink-0 pt-px">
                {event.startTime}–{event.endTime}
              </span>
              <span className="text-sm text-gray-900 leading-snug">
                {event.title}
              </span>
            </div>
          ))
        ) : (
          <p className="text-gray-400 text-sm">No events today</p>
        )}
      </div>

      {/* Archive Confirmation Modal */}
      <Modal open={showArchiveConfirm} onClose={() => setShowArchiveConfirm(false)} title="Archive Today's Events">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to archive <strong>{events.length} event(s)</strong> from today ({todayLabel})?
          These events will be removed from your list.
        </p>
        <div className="flex gap-2">
          <button
            onClick={archiveTodayEvents}
            disabled={archiving}
            className="flex-1 bg-amber-500 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition"
          >
            {archiving ? "Archiving..." : "Archive"}
          </button>
          <button
            onClick={() => setShowArchiveConfirm(false)}
            className="flex-1 bg-gray-400 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-500 transition"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
