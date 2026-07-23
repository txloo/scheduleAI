import { useEffect, useState, useMemo, forwardRef, useImperativeHandle } from "react";
import {
  collection,
  getDocs,
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
  weekOf: string;
  weekEnd: string;
}

export interface EventListHandle {
  refresh: () => void;
}

const EventList = forwardRef<EventListHandle, EventListProps>(({ userId, weekOf, weekEnd }, ref) => {
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [showForm, setShowForm] = useState(false);
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  const [deleteEventName, setDeleteEventName] = useState("");

  async function fetchEvents() {
    const snap = await getDocs(collection(db, "users", userId, "events"));
    const list: CalendarEvent[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<CalendarEvent, "id">;
      list.push({ id: d.id, ...data });
    });
    setAllEvents(list);
  }

  useImperativeHandle(ref, () => ({ refresh: fetchEvents }));

  useEffect(() => {
    fetchEvents();
  }, [userId]);

  const events = useMemo(() => {
    return allEvents
      .filter((e) => e.date >= weekOf && e.date <= weekEnd)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [allEvents, weekOf, weekEnd]);

  async function addEvent() {
    if (!title.trim() || !date) return;
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
    fetchEvents();
  }

  function confirmDelete(event: CalendarEvent) {
    setDeleteEventId(event.id ?? null);
    setDeleteEventName(event.title);
  }

  async function executeDelete() {
    if (!deleteEventId) return;
    await deleteDoc(doc(db, "users", userId, "events", deleteEventId));
    setDeleteEventId(null);
    fetchEvents();
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

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {events.map((ev) => (
          <div key={ev.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
            <div>
              <span className="font-medium">{ev.title}</span>
              <span className="text-gray-500 ml-2">
                {ev.date} {ev.startTime}–{ev.endTime}
              </span>
            </div>
            <button
              onClick={() => confirmDelete(ev)}
              className="text-red-500 hover:text-red-700 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
        {events.length === 0 && (
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
              disabled={!title.trim() || !date}
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
