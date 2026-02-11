import type { FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import type { IconKey } from "../lib/habitIcons";
import { getIconByKey } from "../lib/habitIcons";

export type HabitFormValues = {
  name: string;
  description: string;
  colorHex: string;
  iconKey: string;
  isArchived: boolean;
  reminderEnabled: boolean;
  reminderFrequency: "daily" | "weekly";
  reminderTime: string;
  reminderDays: number[];
  reminderTimeZone: string;
};

export type HabitFormMode =
  | { type: "create" }
  | { type: "edit"; habitId: number };

type HabitFormModalProps = {
  mode: HabitFormMode;
  values: HabitFormValues;
  pending: boolean;
  error: string | null;
  colorOptions: { name: string; value: string }[];
  iconOptions: { key: IconKey; label: string }[];
  onChange: (values: HabitFormValues) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function HabitFormModal({
  mode,
  values,
  pending,
  error,
  colorOptions,
  iconOptions,
  onChange,
  onClose,
  onSubmit,
}: HabitFormModalProps) {
  return (
    <div className="habit-form-backdrop" role="presentation">
      <form className="habit-form" onSubmit={onSubmit}>
        <h2>{mode.type === "create" ? "Create Habit" : "Edit Habit"}</h2>

        <label>
          Name
          <input
            type="text"
            value={values.name}
            onChange={(e) => onChange({ ...values, name: e.target.value })}
            required
          />
        </label>

        <label>
          Description
          <textarea
            value={values.description}
            onChange={(e) =>
              onChange({ ...values, description: e.target.value })
            }
            placeholder="Optional description"
          />
        </label>

        <label>
          Color
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              value={values.colorHex}
              onChange={(e) =>
                onChange({ ...values, colorHex: e.target.value })
              }
            >
              <option value="">(None)</option>
              {colorOptions.map((c) => (
                <option key={c.value} value={c.value}>{c.name}</option>
              ))}
            </select>
            <span title={values.colorHex || "default"}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  display: "inline-block",
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: values.colorHex || "#1e1e1e",
                }}
              />
            </span>
          </div>
        </label>

        <label>
          Icon
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              value={values.iconKey}
              onChange={(e) =>
                onChange({ ...values, iconKey: e.target.value })
              }
            >
              <option value="">(None)</option>
              {iconOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span title={values.iconKey || "default"}>
              {(() => {
                const Preview: LucideIcon = getIconByKey(values.iconKey);
                return <Preview size={18} />;
              })()}
            </span>
          </div>
        </label>

        <div className="reminder-block">
          <label className="habit-form-checkbox" style={{ marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={values.reminderEnabled}
              onChange={(e) => onChange({ ...values, reminderEnabled: e.target.checked })}
            />
            <span>Enable reminder</span>
          </label>

          <div className="reminder-grid" aria-disabled={!values.reminderEnabled}>
            <label>
              Time of day (HH:mm)
              <input
                type="time"
                value={values.reminderTime}
                onChange={(e) => onChange({ ...values, reminderTime: e.target.value })}
                disabled={!values.reminderEnabled}
              />
            </label>

            <label>
              Frequency
              <select
                value={values.reminderFrequency}
                onChange={(e) => onChange({ ...values, reminderFrequency: e.target.value as any })}
                disabled={!values.reminderEnabled}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>

            {values.reminderFrequency === "weekly" && (
              <div className="reminder-days">
                <span>Days of week</span>
                <div className="reminder-day-buttons">
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((label, idx) => {
                    const selected = values.reminderDays.includes(idx);
                    return (
                      <button
                        key={label}
                        type="button"
                        className={selected ? "day-btn selected" : "day-btn"}
                        onClick={() => {
                          const set = new Set(values.reminderDays);
                          if (set.has(idx)) set.delete(idx); else set.add(idx);
                          onChange({ ...values, reminderDays: Array.from(set).sort() });
                        }}
                        disabled={!values.reminderEnabled}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <label>
              Timezone
              <input
                type="text"
                value={values.reminderTimeZone}
                onChange={(e) => onChange({ ...values, reminderTimeZone: e.target.value })}
                disabled={!values.reminderEnabled}
                placeholder="e.g. Pacific/Auckland"
              />
            </label>
          </div>
        </div>

        {mode.type === "edit" && (
          <label className="habit-form-checkbox">
            <input
              type="checkbox"
              checked={values.isArchived}
              onChange={(e) =>
                onChange({ ...values, isArchived: e.target.checked })
              }
            />
            <span>Mark as archived</span>
          </label>
        )}

        {error && <div className="habit-form-error">{error}</div>}

        <div className="habit-form-actions">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={pending}>
            {pending
              ? "Savingƒ?İ"
              : mode.type === "create"
                ? "Create Habit"
                : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
