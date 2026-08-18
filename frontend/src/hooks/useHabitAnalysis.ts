import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentUserId } from "../lib/auth";
import { requestAiReply } from "../lib/chatApi";
import {
  buildHabitAnalysisContext,
  buildHabitAnalysisSourceSignature,
  buildHabitAnalysisTimeline,
} from "../lib/habitAiContext";
import type { Habit, Stats } from "../lib/localStore";
import { getHabitCheckInHistory } from "../lib/localStore";

const ANALYSIS_STORAGE_PREFIX = "habittracker:habit-analysis:";
const MAX_ANALYSIS_DAYS = 100;

export type HabitAnalysisState = {
  status: "loading" | "success" | "error";
  content: string;
  error: string | null;
  analyzedAt: string | null;
  saveWarning: string | null;
  sourceSignature: string;
};

type PersistedHabitAnalysis = {
  content: string;
  analyzedAt: string;
  sourceSignature: string;
};

type PersistedHabitAnalysisMap = Record<string, PersistedHabitAnalysis>;

type UseHabitAnalysisOptions = {
  functionsBase: string;
  ambientContext: string;
  analysisDate: string;
  habits: Habit[];
  statsById: Record<number, Stats | undefined>;
  ready: boolean;
};

function getStorageKey() {
  return `${ANALYSIS_STORAGE_PREFIX}${getCurrentUserId()}`;
}

function readPersistedAnalyses(storageKey: string): PersistedHabitAnalysisMap {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as PersistedHabitAnalysisMap;
  } catch {
    return {};
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Habit analysis failed.";
}

export function useHabitAnalysis({
  functionsBase,
  ambientContext,
  analysisDate,
  habits,
  statsById,
  ready,
}: UseHabitAnalysisOptions) {
  const [analysisByHabitId, setAnalysisByHabitId] = useState<
    Record<number, HabitAnalysisState | undefined>
  >({});
  const requestIdsRef = useRef<Record<number, number | undefined>>({});

  const sourceSignatures = useMemo(() => {
    const signatures: Record<number, string | undefined> = {};
    for (const habit of habits) {
      const stats = statsById[habit.id];
      if (!habit.isExample && stats) {
        signatures[habit.id] = buildHabitAnalysisSourceSignature(
          habit,
          stats,
          analysisDate,
        );
      }
    }
    return signatures;
  }, [analysisDate, habits, statsById]);
  const sourceSignaturesRef = useRef(sourceSignatures);
  sourceSignaturesRef.current = sourceSignatures;

  useEffect(() => {
    const realHabits = habits.filter((habit) => !habit.isExample);
    if (!ready || realHabits.some((habit) => !statsById[habit.id])) return;

    let storageKey: string;
    try {
      storageKey = getStorageKey();
    } catch {
      return;
    }

    const persisted = readPersistedAnalyses(storageKey);
    let persistenceChanged = false;

    for (const [habitIdText, saved] of Object.entries(persisted)) {
      const habitId = Number(habitIdText);
      const sourceSignature = sourceSignatures[habitId];
      if (
        !sourceSignature ||
        typeof saved?.content !== "string" ||
        typeof saved?.analyzedAt !== "string" ||
        saved?.sourceSignature !== sourceSignature
      ) {
        delete persisted[habitIdText];
        persistenceChanged = true;
      }
    }

    if (persistenceChanged) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(persisted));
      } catch {
        // The stale result remains hidden even if localStorage cleanup is unavailable.
      }
    }

    setAnalysisByHabitId((previous) => {
      const next = { ...previous };
      let stateChanged = false;

      for (const [habitIdText, state] of Object.entries(next)) {
        const habitId = Number(habitIdText);
        if (state && state.sourceSignature !== sourceSignatures[habitId]) {
          delete next[habitId];
          stateChanged = true;
        }
      }

      for (const [habitIdText, saved] of Object.entries(persisted)) {
        const habitId = Number(habitIdText);
        if (!next[habitId]) {
          next[habitId] = {
            status: "success",
            content: saved.content,
            error: null,
            analyzedAt: saved.analyzedAt,
            saveWarning: null,
            sourceSignature: saved.sourceSignature,
          };
          stateChanged = true;
        }
      }

      return stateChanged ? next : previous;
    });
  }, [habits, ready, sourceSignatures, statsById]);

  const analyseHabit = useCallback(
    async (habit: Habit) => {
      if (habit.isExample) return;
      const stats = statsById[habit.id];
      if (!stats?.startedOn) return;

      const sourceSignature = buildHabitAnalysisSourceSignature(
        habit,
        stats,
        analysisDate,
      );
      const requestId = (requestIdsRef.current[habit.id] ?? 0) + 1;
      requestIdsRef.current[habit.id] = requestId;

      setAnalysisByHabitId((previous) => {
        const current = previous[habit.id];
        return {
          ...previous,
          [habit.id]: {
            status: "loading",
            content: current?.content ?? "",
            error: null,
            analyzedAt: current?.analyzedAt ?? null,
            saveWarning: current?.saveWarning ?? null,
            sourceSignature,
          },
        };
      });

      try {
        const history = await getHabitCheckInHistory(habit.id);
        const timeline = buildHabitAnalysisTimeline(
          history,
          stats.startedOn,
          analysisDate,
          MAX_ANALYSIS_DAYS,
        );
        const habitContext = buildHabitAnalysisContext({
          ambientContext,
          analysisDate,
          habit,
          stats,
          timeline,
        });
        const content = await requestAiReply(functionsBase, {
          requestType: "habit-analysis",
          messages: [{ role: "user", content: "Analyse this habit." }],
          habitContext,
        });

        if (
          requestIdsRef.current[habit.id] !== requestId ||
          sourceSignaturesRef.current[habit.id] !== sourceSignature
        ) {
          return;
        }

        const analyzedAt = new Date().toISOString();
        let saveWarning: string | null = null;
        try {
          const storageKey = getStorageKey();
          const persisted = readPersistedAnalyses(storageKey);
          persisted[String(habit.id)] = { content, analyzedAt, sourceSignature };
          localStorage.setItem(storageKey, JSON.stringify(persisted));
        } catch {
          saveWarning = "This result could not be saved in this browser.";
        }

        setAnalysisByHabitId((previous) => ({
          ...previous,
          [habit.id]: {
            status: "success",
            content,
            error: null,
            analyzedAt,
            saveWarning,
            sourceSignature,
          },
        }));
      } catch (error: unknown) {
        if (
          requestIdsRef.current[habit.id] !== requestId ||
          sourceSignaturesRef.current[habit.id] !== sourceSignature
        ) {
          return;
        }

        setAnalysisByHabitId((previous) => {
          const current = previous[habit.id];
          return {
            ...previous,
            [habit.id]: {
              status: "error",
              content: current?.content ?? "",
              error: getErrorMessage(error),
              analyzedAt: current?.analyzedAt ?? null,
              saveWarning: current?.saveWarning ?? null,
              sourceSignature,
            },
          };
        });
      }
    },
    [ambientContext, analysisDate, functionsBase, statsById],
  );

  const visibleAnalysisByHabitId = useMemo(() => {
    const visible: Record<number, HabitAnalysisState | undefined> = {};
    for (const [habitIdText, analysis] of Object.entries(analysisByHabitId)) {
      const habitId = Number(habitIdText);
      if (analysis && analysis.sourceSignature === sourceSignatures[habitId]) {
        visible[habitId] = analysis;
      }
    }
    return visible;
  }, [analysisByHabitId, sourceSignatures]);

  return {
    analysisByHabitId: visibleAnalysisByHabitId,
    analyseHabit,
  };
}
