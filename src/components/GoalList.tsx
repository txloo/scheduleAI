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
import { Goal, MainGoal } from "../types";

interface GoalListProps {
  userId: string;
  weekOf: string;
}

export default function GoalList({ userId, weekOf }: GoalListProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState(3);
  const [estimatedHours, setEstimatedHours] = useState(1);
  const [mainGoals, setMainGoals] = useState<MainGoal[]>([]);
  const [selectedMainGoalId, setSelectedMainGoalId] = useState("");

  useEffect(() => {
    fetchGoals();
  }, [userId, weekOf]);

  async function fetchGoals() {
    const q = query(
      collection(db, "goals"),
      where("userId", "==", userId),
      where("weekOf", "==", weekOf),
    );
    const snap = await getDocs(q);
    const list: Goal[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<Goal, "id">;
      list.push({ id: d.id, ...data });
    });
    list.sort((a, b) => b.priority - a.priority);
    setGoals(list);
  }

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

  async function addGoal() {
    if (!text.trim()) return;
    await addDoc(collection(db, "goals"), {
      userId,
      text: text.trim(),
      priority,
      estimatedHours,
      weekOf,
      mainGoalId: selectedMainGoalId || undefined,
      createdAt: Timestamp.now(),
    });
    setText("");
    setPriority(3);
    setEstimatedHours(1);
    setSelectedMainGoalId("");
    fetchGoals();
  }

  async function removeGoal(id: string) {
    await deleteDoc(doc(db, "goals", id));
    fetchGoals();
  }

  function getMainGoalTitle(goalId: string): string | undefined {
    return mainGoals.find((mg) => mg.id === goalId)?.title;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h2 className="font-semibold text-lg mb-3">Goals</h2>

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
        <button
          onClick={addGoal}
          disabled={!text.trim()}
          className="w-full bg-green-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
        >
          + Add Goal
        </button>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {goals.map((g) => (
          <div key={g.id} className="flex items-start justify-between text-sm py-1 border-b last:border-0">
            <div className="flex-1">
              <span className="font-medium">{g.text}</span>
              <span className="text-gray-500 ml-2">
                P{g.priority} · {g.estimatedHours}h
              </span>
              {g.mainGoalId && getMainGoalTitle(g.mainGoalId) && (
                <div className="text-xs text-gray-400 mt-0.5">
                  → {getMainGoalTitle(g.mainGoalId)}
                </div>
              )}
            </div>
            <button
              onClick={() => g.id && removeGoal(g.id)}
              className="text-red-500 hover:text-red-700 text-xs ml-2"
            >
              ✕
            </button>
          </div>
        ))}
        {goals.length === 0 && (
          <p className="text-gray-400 text-sm">No goals this week</p>
        )}
      </div>
    </div>
  );
}
