import { getIconByKey } from "../lib/habitIcons";
import type { Habit, Stats } from "../lib/localStore";

type ArchivedHabitsModalProps = {
  habits: Habit[];
  statsById: Record<number, Stats | undefined>;
  onClose: () => void;
  error?: string | null;
};

export function ArchivedHabitsModal({ habits, statsById, onClose, error }: ArchivedHabitsModalProps) {
  return (
    <div className="habit-form-backdrop" role="presentation">
      <div className="habit-form habit-form-archived">
        <h2>Archived Habits</h2>
        {error && <div className="habit-form-error">{error}</div>}
        <div className="habit-archived-content">
          {habits.length === 0 ? (
            <div>No archived habits.</div>
          ) : (
            <ul className="habits">
              {habits.map((h) => {
                const stats = statsById[h.id];
                const bg = h.colorHex ?? "#1e1e1e";
                return (
                  <li key={h.id} className="habit-item" style={{ ["--bg" as any]: bg }}>
                    <div className="habit-info">
                      <div className="habit-title">
                        {(() => {
                          const Icon = getIconByKey(h.iconKey);
                          return <Icon className="habit-icon" size={18} />;
                        })()}
                        {h.name}
                        {h.isArchived && <span className="habit-archived">Archived</span>}
                      </div>
                      {h.description && <div className="habit-desc">{h.description}</div>}
                      <div className="habit-stats">
                        <p>Completed (total): {stats?.completedTotal ?? 0} days</p>
                        <p>Longest streak: {stats?.longestStreak ?? 0}</p>
                        <p>Total minutes: {stats?.totalDurationMinutes ?? 0}</p>
                        <p>This month minutes: {stats?.durationThisMonth ?? 0}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="habit-form-actions">
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
