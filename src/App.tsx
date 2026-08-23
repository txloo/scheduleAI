import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteField,
} from "firebase/firestore";
import { onAuthChange, db } from "./lib/firebase";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import Notes from "./components/Notes";
import { AppView, CalendarEvent, MainGoal, Note } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AppView>("dashboard");

  const [mainGoals, setMainGoals] = useState<MainGoal[]>([]);
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [pendingTelegramLinks, setPendingTelegramLinks] = useState<{ id: string; email: string }[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    const unsub = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchMainGoals();
    fetchEvents();
    fetchPendingTelegramLinks();
    fetchNotes();
  }, [user?.uid]);

  useEffect(() => {
    if (view === "notes") {
      history.pushState({ view: "notes" }, "");
    }
  }, [view]);

  useEffect(() => {
    function onPopState() {
      setView("dashboard");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function fetchMainGoals() {
    if (!user) return;
    const snap = await getDocs(collection(db, "users", user.uid, "goals"));
    const list: MainGoal[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<MainGoal, "id">;
      list.push({ id: d.id, ...data });
    });
    list.sort((a, b) => {
      const toMs = (v: unknown): number => {
        if (!v) return 0;
        if (v instanceof Date) return v.getTime();
        if (typeof v === "number") return v;
        if (typeof v === "string") return new Date(v).getTime() || 0;
        if (typeof v === "object" && typeof (v as { toDate?: () => Date }).toDate === "function") {
          return (v as { toDate: () => Date }).toDate().getTime();
        }
        return 0;
      };
      const statusRank: Record<string, number> = {
        in_progress: 0,
        not_started: 1,
        done: 2,
      };
      const rankDiff = (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3);
      if (rankDiff !== 0) return rankDiff;
      return toMs(a.createdAt) - toMs(b.createdAt);
    });
    setMainGoals(list);
  }

  async function fetchEvents() {
    if (!user) return;
    const snap = await getDocs(collection(db, "users", user.uid, "events"));
    const list: CalendarEvent[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<CalendarEvent, "id">;
      list.push({ id: d.id, ...data });
    });
    setAllEvents(list);
  }

  async function fetchPendingTelegramLinks() {
    if (!user) return;
    try {
      const q = query(
        collection(db, "telegramUsers"),
        where("email", "==", user.email),
        where("pending", "==", true)
      );
      const snap = await getDocs(q);
      const links: { id: string; email: string }[] = [];
      snap.forEach((d) => {
        links.push({ id: d.id, email: d.data().email });
      });
      setPendingTelegramLinks(links);
    } catch (err) {
      console.error("[fetchPendingTelegramLinks] error:", err);
    }
  }

  async function fetchNotes() {
    if (!user) return;
    const snap = await getDocs(collection(db, "users", user.uid, "notes"));
    const list: Note[] = [];
    snap.forEach((d) => {
      if (d.id === "_meta") return;
      list.push({ id: d.id, body: d.data().body as string });
    });
    list.sort((a, b) => Number(a.id) - Number(b.id));
    setNotes(list);
  }

  async function approveLink(linkId: string) {
    if (!user) return;
    try {
      await updateDoc(doc(db, "telegramUsers", linkId), {
        uid: user.uid,
        pending: deleteField(),
      });
      setPendingTelegramLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch {
      alert("Failed to approve link. Please try again.");
    }
  }

  function dismissLink(linkId: string) {
    setPendingTelegramLinks((prev) => prev.filter((l) => l.id !== linkId));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (view === "notes") {
    return (
      <Notes
        userId={user.uid}
        notes={notes}
        onFetchNotes={fetchNotes}
        onBack={() => setView("dashboard")}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      onNavigate={setView}
      mainGoals={mainGoals}
      allEvents={allEvents}
      pendingTelegramLinks={pendingTelegramLinks}
      onFetchMainGoals={fetchMainGoals}
      onFetchEvents={fetchEvents}
      onFetchNotes={fetchNotes}
      onApproveLink={approveLink}
      onDismissLink={dismissLink}
    />
  );
}
