import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  deleteField,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { Target, TargetStatus, MainGoal } from "../types";
import Modal from "./Modal";

interface TargetListProps {
  userId: string;
  mainGoals: MainGoal[];
}

export interface TargetListHandle {
  refresh: () => void;
}

const STATUS_OPTIONS: { value: TargetStatus; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "upcoming", label: "Upcoming" },
  { value: "recurring", label: "Recurring" },
];

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

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const TargetList = forwardRef<TargetListHandle, TargetListProps>(({ userId, mainGoals }, ref) => {
  const [targets, setTargets] = useState<Target[]>([]);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState(3);
  const [estimatedHours, setEstimatedHours] = useState(1);
  const [status, setStatus] = useState<TargetStatus>("current");
  const [selectedMainGoalId, setSelectedMainGoalId] = useState("");
  const [weekOf, setWeekOf] = useState(getCurrentMonday);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPriority, setEditPriority] = useState(3);
  const [editEstimatedHours, setEditEstimatedHours] = useState(1);
  const [editStatus, setEditStatus] = useState<TargetStatus>("current");
  const [editMainGoalId, setEditMainGoalId] = useState("");
  const [editWeekOf, setEditWeekOf] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fetchTargets() {
    const snap = await getDocs(collection(db, "users", userId, "targets"));
    const list: Target[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<Target, "id">;
      list.push({ id: d.id, ...data });
    });
    list.sort((a, b) => {
      const currentMonday = getCurrentMonday();
      const aPassed = a.status !== "recurring" && (a.weekOf || currentMonday) < currentMonday;
      const bPassed = b.status !== "recurring" && (b.weekOf || currentMonday) < currentMonday;
      if (aPassed !== bPassed) return aPassed ? 1 : -1;
      const aWeek = a.weekOf || currentMonday;
      const bWeek = b.weekOf || currentMonday;
      if (aWeek !== bWeek) return aWeek.localeCompare(bWeek);
      return b.priority - a.priority;
    });
    setTargets(list);
  }

  useImperativeHandle(ref, () => ({ refresh: fetchTargets }));

  useEffect(() => {
    fetchTargets();
  }, [userId]);

  async function addTarget() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const data: Record<string, unknown> = {
        text: text.trim(),
        priority,
        estimatedHours,
        status,
        weekOf: weekOf || getCurrentMonday(),
        createdAt: Timestamp.now(),
      };
      if (selectedMainGoalId) {
        data.mainGoalId = selectedMainGoalId;
      }
      await addDoc(collection(db, "users", userId, "targets"), data);
      setText("");
      setPriority(3);
      setEstimatedHours(1);
      setStatus("current");
      setSelectedMainGoalId("");
      setWeekOf(getCurrentMonday());
      fetchTargets();
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(target: Target) {
    setEditingId(target.id ?? null);
    setEditText(target.text);
    setEditPriority(target.priority);
    setEditEstimatedHours(target.estimatedHours);
    setEditStatus(target.status);
    setEditMainGoalId(target.mainGoalId || "");
    setEditWeekOf(target.weekOf || getCurrentMonday());
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
    setEditPriority(3);
    setEditEstimatedHours(1);
    setEditStatus("current");
    setEditMainGoalId("");
    setEditWeekOf("");
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    const updates: Record<string, unknown> = {
      text: editText.trim(),
      priority: editPriority,
      estimatedHours: editEstimatedHours,
      status: editStatus,
      weekOf: editWeekOf || getCurrentMonday(),
    };
    if (editMainGoalId) {
      updates.mainGoalId = editMainGoalId;
    } else {
      updates.mainGoalId = deleteField();
    }
    await updateDoc(doc(db, "users", userId, "targets", id), updates);
    setEditingId(null);
    fetchTargets();
  }

  function confirmDelete(target: Target) {
    setDeleteTargetId(target.id ?? null);
    setDeleteTargetName(target.text);
  }

  async function executeDelete() {
    if (!deleteTargetId) return;
    await deleteDoc(doc(db, "users", userId, "targets", deleteTargetId));
    setDeleteTargetId(null);
    fetchTargets();
  }

  function getMainGoalTitle(goalId: string): string | undefined {
    return mainGoals.find((mg) => mg.id === goalId)?.title;
  }

  const currentTargets = targets.filter((t) => t.status === "current");
  const recurringTargets = targets.filter((t) => t.status === "recurring");
  const upcomingTargets = targets.filter((t) => t.status === "upcoming");

  function renderTarget(target: Target) {
    return (
      <div
        key={target.id}
        className="flex items-start justify-between text-sm py-1.5 border-b last:border-0"
      >
        <div className="flex-1">
          <span className="font-medium">
            {target.text}
          </span>
          <span className="text-gray-500 ml-2">
            P{target.priority} · {target.estimatedHours}h
          </span>
          {target.mainGoalId && getMainGoalTitle(target.mainGoalId) && (
            <div className="text-xs text-gray-400 mt-0.5">
              → {getMainGoalTitle(target.mainGoalId)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <select
            value={target.status}
            onChange={(e) => target.id && updateDoc(doc(db, "users", userId, "targets", target.id), { status: e.target.value }).then(fetchTargets)}
            className="text-xs border rounded px-1 py-0.5 text-gray-600"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => startEdit(target)}
            className="text-gray-400 hover:text-gray-700 text-xs px-1"
            title="Edit"
          >
            ✎
          </button>
          <button
            onClick={() => confirmDelete(target)}
            className="text-red-500 hover:text-red-700 text-xs"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h2 className="font-semibold text-lg mb-3">Targets</h2>

      <div className="space-y-2 mb-4">
        <textarea
          placeholder="e.g. Finish project report, exercise 3x, buy groceries"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm resize-none"
          rows={2}
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-500">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500">Est. hours</label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(Number(e.target.value))}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TargetStatus)}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="current">Current</option>
              <option value="upcoming">Upcoming</option>
              <option value="recurring">Recurring</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Linked Main Goal (optional)</label>
          <select
            value={selectedMainGoalId}
            onChange={(e) => setSelectedMainGoalId(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            <option value="">None</option>
            {mainGoals.map((mg) => (
              <option key={mg.id} value={mg.id}>{mg.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Target week (optional)</label>
          <input
            type="date"
            value={weekOf}
            onChange={(e) => setWeekOf(getMondayOf(e.target.value))}
            className="w-full border rounded px-2 py-1 text-sm"
          />
          <p className="text-xs text-gray-400 mt-0.5">Defaults to this week. Used for sort order within same priority.</p>
        </div>
        <button
          onClick={addTarget}
          disabled={!text.trim() || submitting}
          className="w-full bg-green-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
        >
          + Add Target
        </button>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {/* Current Targets */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
            Current ({currentTargets.length})
          </h3>
          <div className="space-y-0">
            {currentTargets.map((t) => renderTarget(t))}
            {currentTargets.length === 0 && (
              <p className="text-gray-400 text-sm">No current targets</p>
            )}
          </div>
        </div>

        {/* Recurring Targets */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
            Recurring ({recurringTargets.length})
          </h3>
          <div className="space-y-0">
            {recurringTargets.map((t) => renderTarget(t))}
            {recurringTargets.length === 0 && (
              <p className="text-gray-400 text-sm">No recurring targets</p>
            )}
          </div>
        </div>

        {/* Upcoming Targets */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
            Upcoming ({upcomingTargets.length})
          </h3>
          <div className="space-y-0">
            {upcomingTargets.map((t) => renderTarget(t))}
            {upcomingTargets.length === 0 && (
              <p className="text-gray-400 text-sm">No upcoming targets</p>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal open={!!editingId} onClose={cancelEdit} title="Edit Target">
        <div className="space-y-3">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm resize-none"
            rows={2}
            placeholder="Target description"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Priority</label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(Number(e.target.value))}
                className="w-full border rounded px-2 py-1 text-sm"
              >
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Est. hours</label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={editEstimatedHours}
                onChange={(e) => setEditEstimatedHours(Number(e.target.value))}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as TargetStatus)}
                className="w-full border rounded px-2 py-1 text-sm"
              >
                <option value="current">Current</option>
                <option value="upcoming">Upcoming</option>
                <option value="recurring">Recurring</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Linked Main Goal (optional)</label>
            <select
              value={editMainGoalId}
              onChange={(e) => setEditMainGoalId(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="">None</option>
              {mainGoals.map((mg) => (
                <option key={mg.id} value={mg.id}>{mg.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Target week</label>
            <input
              type="date"
              value={editWeekOf}
              onChange={(e) => setEditWeekOf(getMondayOf(e.target.value))}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => editingId && saveEdit(editingId)}
              disabled={!editText.trim()}
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

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteTargetId} onClose={() => setDeleteTargetId(null)} title="Confirm Delete">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete <strong>"{deleteTargetName}"</strong>?
        </p>
        <div className="flex gap-2">
          <button
            onClick={executeDelete}
            className="flex-1 bg-red-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-red-700 transition"
          >
            Delete
          </button>
          <button
            onClick={() => setDeleteTargetId(null)}
            className="flex-1 bg-gray-400 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-500 transition"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
});

TargetList.displayName = "TargetList";
export default TargetList;
