import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import type { WeeklyPlan, PlanSlot } from "../types";

interface WeeklyPlanProps {
  userId: string;
  weekOf: string;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function WeeklyPlan({ userId, weekOf }: WeeklyPlanProps) {
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchExistingPlan();
  }, [userId, weekOf]);

  async function fetchExistingPlan() {
    const q = query(
      collection(db, "plans"),
      where("userId", "==", userId),
      where("weekOf", "==", weekOf),
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data() as Omit<WeeklyPlan, "id">;
      setPlan({ id: snap.docs[0].id, ...data });
    } else {
      setPlan(null);
    }
  }

  async function generatePlan() {
    setLoading(true);
    setError("");

    try {
      const generateFn = httpsCallable<{ weekOf: string }, { slots: PlanSlot[] }>(
        functions,
        "generateWeeklyPlan",
      );
      const result = await generateFn({ weekOf });
      const slots = result.data.slots;

      const newPlan: WeeklyPlan = {
        userId,
        weekOf,
        accepted: false,
        slots,
      };

      const docRef = await addDoc(collection(db, "plans"), {
        ...newPlan,
        generatedAt: Timestamp.now(),
      });
      setPlan({ ...newPlan, id: docRef.id });
    } catch (err) {
      console.error(err);
      setError("Failed to generate plan. Is the Cloud Function deployed?");
    } finally {
      setLoading(false);
    }
  }

  async function acceptPlan() {
    if (!plan) return;

    for (const slot of plan.slots) {
      await addDoc(collection(db, "events"), {
        userId,
        title: slot.goalText,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        createdAt: Timestamp.now(),
      });
    }

    setPlan({ ...plan, accepted: true });
  }

  function groupByDay(slots: PlanSlot[]): Map<string, PlanSlot[]> {
    const map = new Map<string, PlanSlot[]>();
    for (const slot of slots) {
      const existing = map.get(slot.day) || [];
      existing.push(slot);
      map.set(slot.day, existing);
    }
    return map;
  }

  if (plan && plan.accepted) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <h2 className="font-semibold text-lg mb-2">Weekly Plan</h2>
        <p className="text-green-600 text-sm">✓ Plan accepted! Tasks added to your schedule.</p>
      </div>
    );
  }

  if (plan) {
    const grouped = groupByDay(plan.slots);

    return (
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <h2 className="font-semibold text-lg mb-3">Your AI-Generated Plan</h2>

        <div className="space-y-3 mb-4">
          {DAYS.map((day) => {
            const daySlots = grouped.get(day) || [];
            if (daySlots.length === 0) return null;

            return (
              <div key={day}>
                <h3 className="font-medium text-sm text-gray-700 mb-1">{day}</h3>
                <div className="space-y-1">
                  {daySlots.map((slot, i) => (
                    <div key={i} className="flex items-center text-sm bg-blue-50 rounded px-3 py-1.5">
                      <span className="text-blue-800 font-medium">{slot.startTime}–{slot.endTime}</span>
                      <span className="text-gray-600 ml-3">{slot.goalText}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={acceptPlan}
            className="flex-1 bg-green-600 text-white rounded px-3 py-2 text-sm font-medium hover:bg-green-700 transition"
          >
            Accept Plan & Add to Events
          </button>
          <button
            onClick={generatePlan}
            disabled={loading}
            className="bg-gray-200 text-gray-700 rounded px-3 py-2 text-sm font-medium hover:bg-gray-300 disabled:opacity-50 transition"
          >
            Regenerate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
      <h2 className="font-semibold text-lg mb-2">Weekly Plan</h2>
      <p className="text-gray-500 text-sm mb-4">
        Add events and goals, then generate your AI-powered weekly plan.
      </p>
      <button
        onClick={generatePlan}
        disabled={loading}
        className="bg-blue-600 text-white rounded px-6 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {loading ? "Generating..." : "Generate Weekly Plan"}
      </button>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
