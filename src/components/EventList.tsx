import { useState, useMemo, forwardRef, useImperativeHandle } from "react";
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

interface EventListProps {
  userId: string;
  events: CalendarEvent[];
  onRefresh: () => void;
}

export interface EventListHandle {
  refresh: () => void;
}

const EventList = forwardRef<EventListHandle, EventListProps>(({ userId, events, onRefresh }, ref) => {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [showForm, setShowForm] = useState(false);
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  const [deleteEventName, setDeleteEventName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useImperativeHandle(ref, () => ({ refresh: onRefresh }));

  const groupedEvents = useMemo(() => {
    const groups: { date: string; label: string; events: CalendarEvent[] }[] = [];
    const dateMap = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (!dateMap.has(ev.date)) dateMap.set(ev.date, []);
      dateMap.get(ev.date)!.push(ev);
    }
    for (const [date, evts] of dateMap) {
      const d = new Date(date + "T00:00:00");
      const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      groups.push({ date, label, events: evts });
    }
    return groups;
  }, [events]);

  async function addEvent() {
    if (!title.trim() || !date || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "users", userId, "events"), {
        title: title.trim(),
        date,
        startTime,
        endTime,
        createdAt: Timestamp.now(),
      });
      setTitle("");
      setDate("");
      setStartTime("09:00");
      setEndTime("10:00");
      setShowForm(false);
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDelete(event: CalendarEvent) {
    setDeleteEventId(event.id ?? null);
    setDeleteEventName(event.title);
  }

  async function executeDelete() {
    if (!deleteEventId) return;
    await deleteDoc(doc(db, "users", userId, "events", deleteEventId));
    setDeleteEventId(null);
    onRefresh();
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">Events</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-blue-700 transition"
        >
          + Add Event
        </button>
      </div>

      <div className="space-y-3 max-h-[36rem] overflow-y-auto">
        {groupedEvents.map((group) => (
          <div key={group.date}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {group.label}
            </h3>
            <div className="space-y-0">
              {group.events.map((ev) => (
                <div
                  key={ev.id}
                  className="group flex gap-2 py-1 border-b border-gray-50 last:border-0 relative"
                >
                  <span className="text-xs text-gray-400 min-w-[80px] flex-shrink-0 pt-px">
                    {ev.startTime}–{ev.endTime}
                  </span>
                  <span className="text-sm text-gray-900 leading-snug">
                    {ev.title}
                  </span>
                  <button
                    onClick={() => confirmDelete(ev)}
                    className="absolute right-0 top-1 text-red-500 hover:text-red-700 text-sm opacity-0 group-hover:opacity-100 transition-opacity px-0.5"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {groupedEvents.length === 0 && (
          <p className="text-gray-400 text-sm">No events this week</p>
        )}
      </div>

      {/* Add Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Event">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="flex-1 border rounded px-2 py-1 text-sm"
            />
            <span className="self-center text-gray-400">to</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="flex-1 border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={addEvent}
              disabled={!title.trim() || !date || submitting}
              className="flex-1 bg-blue-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              Save
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 bg-gray-400 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-500 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteEventId} onClose={() => setDeleteEventId(null)} title="Confirm Delete">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete <strong>"{deleteEventName}"</strong>?
        </p>
        <div className="flex gap-2">
          <button
            onClick={executeDelete}
            className="flex-1 bg-red-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-red-700 transition"
          >
            Delete
          </button>
          <button
            onClick={() => setDeleteEventId(null)}
            className="flex-1 bg-gray-400 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-500 transition"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
});

EventList.displayName = "EventList";
export default EventList;
