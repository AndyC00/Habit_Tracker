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
