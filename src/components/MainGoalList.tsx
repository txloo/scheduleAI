import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { MainGoal, MainGoalStatus } from "../types";

interface MainGoalListProps {
  userId: string;
}

export default function MainGoalList({ userId }: MainGoalListProps) {
  const [mainGoals, setMainGoals] = useState<MainGoal[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState<MainGoalStatus>("not_started");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTargetDate, setEditTargetDate] = useState("");
  const [editStatus, setEditStatus] = useState<MainGoalStatus>("not_started");

  useEffect(() => {
    fetchMainGoals();
  }, [userId]);

  async function fetchMainGoals() {
    const q = query(
      collection(db, "mainGoals"),
      where("userId", "==", userId),
    );
    const snap = await getDocs(q);
    const list: MainGoal[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<MainGoal, "id">;
      list.push({ id: d.id, ...data });
    });
    setMainGoals(list);
  }

  async function addMainGoal() {
    if (!title.trim()) return;
    await addDoc(collection(db, "mainGoals"), {
      userId,
      title: title.trim(),
      description: description.trim() || null,
      targetDate: targetDate || null,
      status,
      createdAt: Timestamp.now(),
    });
    setTitle("");
    setDescription("");
    setTargetDate("");
    setStatus("not_started");
    setShowForm(false);
    fetchMainGoals();
  }

  function startEdit(goal: MainGoal) {
    setEditingId(goal.id ?? null);
    setEditTitle(goal.title);
    setEditDescription(goal.description ?? "");
    setEditTargetDate(goal.targetDate ?? "");
    setEditStatus(goal.status);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditTargetDate("");
    setEditStatus("not_started");
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await updateDoc(doc(db, "mainGoals", id), {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      targetDate: editTargetDate || null,
      status: editStatus,
    });
    setEditingId(null);
    fetchMainGoals();
  }

  async function removeMainGoal(id: string) {
    if (!window.confirm("Are you sure?")) return;
    await deleteDoc(doc(db, "mainGoals", id));
    fetchMainGoals();
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function statusBadge(status: MainGoalStatus) {
    const classes: Record<MainGoalStatus, string> = {
      not_started: "bg-red-100 text-red-800",
      in_progress: "bg-amber-100 text-amber-800",
      done: "bg-green-100 text-green-800",
    };
    const labels: Record<MainGoalStatus, string> = {
      not_started: "Not Started",
      in_progress: "In Progress",
      done: "Done",
    };
    return (
      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${classes[status]}`}>
        {labels[status]}
      </span>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">Main Goals</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-green-700 transition"
        >
          {showForm ? "Cancel" : "+ Add Main Goal"}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="space-y-2 mb-4 border rounded p-3 bg-gray-50">
          <input
            type="text"
            placeholder="Goal title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm resize-none"
            rows={2}
          />
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as MainGoalStatus)}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={addMainGoal}
              disabled={!title.trim()}
              className="flex-1 bg-green-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
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
      )}

      {/* Goal Cards */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {mainGoals.map((goal) => (
          <div key={goal.id} className="border rounded p-3">
            {editingId === goal.id ? (
              /* Edit Mode */
              <div className="space-y-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder="Goal title"
                />
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm resize-none"
                  rows={2}
                  placeholder="Description (optional)"
                />
                <input
                  type="date"
                  value={editTargetDate}
                  onChange={(e) => setEditTargetDate(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as MainGoalStatus)}
                  className="w-full border rounded px-2 py-1 text-sm"
                >
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => goal.id && saveEdit(goal.id)}
                    disabled={!editTitle.trim()}
                    className="flex-1 bg-green-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex-1 bg-gray-400 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-500 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Display Mode */
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-base">{goal.title}</span>
                      {statusBadge(goal.status)}
                    </div>
                    {goal.description && (
                      <p className="text-sm text-gray-600 truncate">{goal.description}</p>
                    )}
                    {goal.targetDate && (
                      <p className="text-xs text-gray-500 mt-1">
                        Target: {formatDate(goal.targetDate)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => startEdit(goal)}
                      className="text-gray-500 hover:text-gray-700 text-xs px-1"
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => goal.id && removeMainGoal(goal.id)}
                      className="text-red-500 hover:text-red-700 text-xs"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {mainGoals.length === 0 && (
          <p className="text-gray-400 text-sm">
            No main goals yet. Add a long-term goal to get started!
          </p>
        )}
      </div>
    </div>
  );
}
