import { useState, useRef, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { MainGoal, MainGoalStatus } from "../types";
import Modal from "./Modal";

interface MainGoalListProps {
  userId: string;
  mainGoals: MainGoal[];
  onMainGoalsChange: () => void;
}

export default function MainGoalList({ userId, mainGoals, onMainGoalsChange }: MainGoalListProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState<MainGoalStatus>("not_started");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewGoal, setViewGoal] = useState<MainGoal | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTargetDate, setEditTargetDate] = useState("");
  const [editStatus, setEditStatus] = useState<MainGoalStatus>("not_started");
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const [deleteGoalName, setDeleteGoalName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, MainGoalStatus>>({});
  const optimisticStatusesRef = useRef<Record<string, MainGoalStatus>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const STATUS_CYCLE: Record<MainGoalStatus, MainGoalStatus> = {
    not_started: "in_progress",
    in_progress: "done",
    done: "not_started",
  };

  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

  async function addMainGoal() {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "users", userId, "goals"), {
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
      onMainGoalsChange();
    } finally {
      setSubmitting(false);
    }
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
    await updateDoc(doc(db, "users", userId, "goals", id), {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      targetDate: editTargetDate || null,
      status: editStatus,
    });
    setEditingId(null);
    onMainGoalsChange();
  }

  function confirmDelete(goal: MainGoal) {
    setDeleteGoalId(goal.id ?? null);
    setDeleteGoalName(goal.title);
  }

  function handleStatusCycle(goal: MainGoal) {
    const currentStatus = optimisticStatusesRef.current[goal.id!] || goal.status;
    const nextStatus = STATUS_CYCLE[currentStatus];
    optimisticStatusesRef.current[goal.id!] = nextStatus;

    setOptimisticStatuses({ ...optimisticStatusesRef.current });

    if (saveTimers.current[goal.id!]) {
      clearTimeout(saveTimers.current[goal.id!]);
    }

    saveTimers.current[goal.id!] = setTimeout(async () => {
      await updateDoc(doc(db, "users", userId, "goals", goal.id!), { status: nextStatus });
      await onMainGoalsChange();
      delete optimisticStatusesRef.current[goal.id!];
      setOptimisticStatuses((prev) => {
        const next = { ...prev };
        delete next[goal.id!];
        return next;
      });
      delete saveTimers.current[goal.id!];
    }, 2000);
  }

  async function executeDelete() {
    if (!deleteGoalId) return;
    await deleteDoc(doc(db, "users", userId, "goals", deleteGoalId));
    setDeleteGoalId(null);
    onMainGoalsChange();
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function statusBadge(status: MainGoalStatus, onClick?: () => void) {
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
      <span
        onClick={(e) => {
          e.stopPropagation();
          if (onClick) onClick();
        }}
        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${classes[status]}${onClick ? " cursor-pointer hover:opacity-80" : ""}`}
      >
        {labels[status]}
      </span>
    );
  }

  function goalAccent(status: MainGoalStatus) {
    const accents: Record<MainGoalStatus, string> = {
      not_started: "border-l-red-400",
      in_progress: "border-l-amber-400",
      done: "border-l-green-400",
    };
    return accents[status];
  }

  function renderGoalCard(goal: MainGoal) {
    const displayStatus = optimisticStatuses[goal.id!] || goal.status;
    return (
      <div
        key={goal.id}
        onClick={() => setViewGoal(goal)}
        className={`bg-white border border-l-4 ${goalAccent(displayStatus)} rounded-lg shadow-sm p-3 flex flex-col overflow-hidden select-none cursor-pointer min-h-[140px] md:min-w-[240px] md:max-w-[280px] md:h-[280px] md:p-4`}
      >
        <div className="flex items-start justify-between mb-2">
          <span className="font-semibold text-sm md:text-base leading-tight">{goal.title}</span>
          <div className="flex items-center gap-0.5 ml-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                startEdit(goal);
              }}
              className="text-gray-400 hover:text-gray-700 text-xs px-1"
              title="Edit"
            >
              ✎
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                confirmDelete(goal);
              }}
              className="text-gray-400 hover:text-red-600 text-xs px-1"
              title="Delete"
            >
              ✕
            </button>
          </div>
        </div>

        {statusBadge(displayStatus, () => handleStatusCycle(goal))}

        {goal.description && (
          <p className="text-xs md:text-sm text-gray-500 mt-2 overflow-y-auto hidden md:block">{goal.description}</p>
        )}

        {goal.targetDate && (
          <p className="text-xs text-gray-400 mt-auto pt-2">
            Target: {formatDate(goal.targetDate)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">Main Goals</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-green-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-green-700 transition"
        >
          + Add Main Goal
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:flex md:gap-4 md:overflow-x-auto md:pb-2">
        {mainGoals.map((goal) => renderGoalCard(goal))}
        {mainGoals.length === 0 && (
          <p className="text-gray-400 text-sm col-span-2 md:col-span-auto">
            No main goals yet. Add a long-term goal to get started!
          </p>
        )}
      </div>

      {/* Add Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Main Goal">
        <div className="space-y-3">
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
            rows={5}
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
              disabled={!title.trim() || submitting}
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
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editingId} onClose={cancelEdit} title="Edit Main Goal">
        <div className="space-y-3">
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
            rows={10}
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
              onClick={() => editingId && saveEdit(editingId)}
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
      </Modal>

      {/* View Goal Modal */}
      <Modal open={!!viewGoal} onClose={() => setViewGoal(null)} title={viewGoal?.title ?? "Goal"} maxWidth="max-w-3xl">
        {viewGoal && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-xl font-semibold">{viewGoal.title}</h4>
              {statusBadge(viewGoal.status)}
            </div>

            {viewGoal.targetDate && (
              <p className="text-sm text-gray-500">
                Target: <span className="font-medium">{formatDate(viewGoal.targetDate)}</span>
              </p>
            )}

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Description</p>
              {viewGoal.description ? (
                <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm text-gray-700 border rounded-lg p-3 bg-gray-50">
                  {viewGoal.description}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No description</p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  startEdit(viewGoal);
                  setViewGoal(null);
                }}
                className="flex-1 bg-blue-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-blue-700 transition"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  confirmDelete(viewGoal);
                  setViewGoal(null);
                }}
                className="flex-1 bg-red-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-red-700 transition"
              >
                Delete
              </button>
              <button
                onClick={() => setViewGoal(null)}
                className="flex-1 bg-gray-400 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-500 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteGoalId} onClose={() => setDeleteGoalId(null)} title="Confirm Delete">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete <strong>"{deleteGoalName}"</strong>?
        </p>
        <div className="flex gap-2">
          <button
            onClick={executeDelete}
            className="flex-1 bg-red-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-red-700 transition"
          >
            Delete
          </button>
          <button
            onClick={() => setDeleteGoalId(null)}
            className="flex-1 bg-gray-400 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-500 transition"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
