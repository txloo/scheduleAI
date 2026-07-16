import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { CalendarEvent } from "../types";

interface EventListProps {
  userId: string;
  weekOf: string;
}

export default function EventList({ userId, weekOf }: EventListProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  useEffect(() => {
    fetchEvents();
  }, [userId, weekOf]);

  async function fetchEvents() {
    const q = query(
      collection(db, "events"),
      where("userId", "==", userId),
      where("date", ">=", weekOf),
    );
    const snap = await getDocs(q);
    const list: CalendarEvent[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<CalendarEvent, "id">;
      list.push({ id: d.id, ...data });
    });
    list.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    setEvents(list);
  }

  async function addEvent() {
    if (!title.trim() || !date) return;
    await addDoc(collection(db, "events"), {
      userId,
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
    fetchEvents();
  }

  async function removeEvent(id: string) {
    await deleteDoc(doc(db, "events", id));
    fetchEvents();
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h2 className="font-semibold text-lg mb-3">Events</h2>

      <div className="space-y-2 mb-4">
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
        <button
          onClick={addEvent}
          disabled={!title.trim() || !date}
          className="w-full bg-blue-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
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
              onClick={() => ev.id && removeEvent(ev.id)}
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
    </div>
  );
}
