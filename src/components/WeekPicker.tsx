import { WeekRange } from "../types";

interface WeekPickerProps {
  weekRange: WeekRange;
  onChange: (range: WeekRange) => void;
  getWeekRange: (date: Date) => WeekRange;
}

export default function WeekPicker({ weekRange, onChange, getWeekRange }: WeekPickerProps) {
  function goBack() {
    const d = new Date(weekRange.start);
    d.setDate(d.getDate() - 7);
    onChange(getWeekRange(d));
  }

  function goForward() {
    const d = new Date(weekRange.start);
    d.setDate(d.getDate() + 7);
    onChange(getWeekRange(d));
  }

  function goToday() {
    onChange(getWeekRange(new Date()));
  }

  return (
    <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border p-4">
      <button onClick={goBack} className="text-gray-600 hover:text-gray-900 px-2">&larr; Prev</button>
      <div className="flex items-center gap-3">
        <span className="font-medium">{weekRange.label}</span>
        <button onClick={goToday} className="text-sm text-blue-600 hover:text-blue-800">Today</button>
      </div>
      <button onClick={goForward} className="text-gray-600 hover:text-gray-900 px-2">Next &rarr;</button>
    </div>
  );
}
