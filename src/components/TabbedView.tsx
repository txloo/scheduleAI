import { useState } from "react";
import { CalendarEvent, MainGoal } from "../types";
import EventList, { EventListHandle } from "./EventList";
import TargetList, { TargetListHandle } from "./TargetList";
import { RefObject } from "react";

interface TabbedViewProps {
  userId: string;
  mainGoals: MainGoal[];
  events: CalendarEvent[];
  onEventsRefresh: () => void;
  eventListRef: RefObject<EventListHandle | null>;
  targetListRef: RefObject<TargetListHandle | null>;
}

type Tab = "targets" | "events";

export default function TabbedView({
  userId,
  mainGoals,
  events,
  onEventsRefresh,
  eventListRef,
  targetListRef,
}: TabbedViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("targets");

  return (
    <div className="mt-4">
      {/* Tab Buttons */}
      <div className="flex gap-2 mb-4 border-b">
        <button
          onClick={() => setActiveTab("targets")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === "targets"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Targets
        </button>
        <button
          onClick={() => setActiveTab("events")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === "events"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Events
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "targets" && (
          <TargetList ref={targetListRef} userId={userId} mainGoals={mainGoals} />
        )}
        {activeTab === "events" && (
          <EventList ref={eventListRef} userId={userId} events={events} onRefresh={onEventsRefresh} />
        )}
      </div>
    </div>
  );
}
