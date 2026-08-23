import { useState } from "react";
import {
  doc,
  runTransaction,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { Note } from "../types";
import Modal from "./Modal";

interface NotesProps {
  userId: string;
  notes: Note[];
  onFetchNotes: () => void;
  onBack: () => void;
}

export default function Notes({ userId, notes, onFetchNotes, onBack }: NotesProps) {
  const [adding, setAdding] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [deleteNoteLabel, setDeleteNoteLabel] = useState("");

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
    onFetchNotes();
  }

  function handleCopy(noteId: string, body: string) {
    navigator.clipboard.writeText(body);
    setCopiedIdx(noteId);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  function confirmDelete(note: Note) {
    setDeleteNoteId(note.id ?? null);
    setDeleteNoteLabel(note.body.length > 40 ? note.body.slice(0, 40) + "..." : note.body);
  }

  async function executeDelete() {
    if (!deleteNoteId) return;
    await deleteDoc(doc(db, "users", userId, "notes", deleteNoteId));
    setDeleteNoteId(null);
    onFetchNotes();
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

          {notes.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No notes yet</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => handleCopy(note.id!, note.body)}
                  className="bg-white border border-l-4 border-l-blue-400 rounded-lg shadow-sm p-3 flex flex-col overflow-hidden cursor-pointer select-none hover:shadow-md transition min-h-[140px] w-[calc(50%-0.375rem)] md:w-[calc(33.333%-0.5rem)]"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-mono text-gray-400">#{note.id}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); confirmDelete(note); }}
                      className="text-red-400 hover:text-red-600 text-xs px-1"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap overflow-y-auto">
                    {note.body}
                  </p>
                  {copiedIdx === note.id && (
                    <div className="text-xs text-blue-500 mt-1">Copied!</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Modal open={!!deleteNoteId} onClose={() => setDeleteNoteId(null)} title="Confirm Delete">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete this note?
        </p>
        <p className="text-sm text-gray-500 bg-gray-50 rounded p-2 mb-4 truncate">
          "{deleteNoteLabel}"
        </p>
        <div className="flex gap-2">
          <button
            onClick={executeDelete}
            className="flex-1 bg-red-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-red-700 transition"
          >
            Delete
          </button>
          <button
            onClick={() => setDeleteNoteId(null)}
            className="flex-1 bg-gray-400 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-500 transition"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
