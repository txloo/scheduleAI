import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { onAuthChange } from "./lib/firebase";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import Notes from "./components/Notes";
import { AppView } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AppView>("dashboard");

  useEffect(() => {
    const unsub = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

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
    return <Notes userId={user.uid} onBack={() => setView("dashboard")} />;
  }

  return <Dashboard user={user} onNavigate={setView} />;
}
