import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { Note } from "../types";

interface NotesProps {
  userId: string;
  onBack: () => void;
}

export default function Notes({ userId, onBack }: NotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newBody, setNewBody] = useState("");

  useEffect(() => {
    fetchNotes();
  }, [userId]);

  async function fetchNotes() {
    setLoading(true);
    const snap = await getDocs(collection(db, "users", userId, "notes"));
    const list: Note[] = [];
    snap.forEach((d) => {
      if (d.id === "_meta") return;
      list.push({ id: d.id, body: d.data().body as string });
    });
    list.sort((a, b) => Number(a.id) - Number(b.id));
    setNotes(list);
    setLoading(false);
  }

  async function addNote() {
    const body = newBody.trim();
    if (!body) return;

    setAdding(true);
    const metaRef = doc(db, "users", userId, "notes", "_meta");

    const nextId = await runTransaction(db, async (tx) => {
      const metaSnap = await tx.get(metaRef);
      let next = 1;
      if (metaSnap.exists()) {
        next = (metaSnap.data().nextIndex as number) + 1;
      }
      tx.set(metaRef, { nextIndex: next });
      return next;
    });

    await runTransaction(db, async (tx) => {
      const noteRef = doc(db, "users", userId, "notes", String(nextId));
      tx.set(noteRef, { body, createdAt: serverTimestamp() });
    });

    setNewBody("");
    setAdding(false);
    fetchNotes();
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm border-b shrink-0">
        <div className="mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-sm text-blue-600 hover:text-blue-800 transition"
          >
            ← Back
          </button>
          <h1 className="text-lg font-bold">Notes</h1>
          <span className="text-sm text-gray-500">{notes.length} notes</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Write a note..."
              className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              disabled={adding}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={addNote}
                disabled={adding || !newBody.trim()}
                className="bg-blue-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
              >
                {adding ? "Saving..." : "Add note"}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-gray-400 py-8">Loading...</p>
          ) : notes.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No notes yet</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:flex md:gap-4 md:overflow-x-auto md:pb-2">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-white border border-l-4 border-l-blue-400 rounded-lg shadow-sm p-3 flex flex-col overflow-hidden min-h-[140px] md:min-w-[200px] md:max-w-[260px] md:h-[180px] md:p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-mono text-gray-400">#{note.id}</span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap overflow-y-auto">
                    {note.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
