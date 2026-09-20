"use client";

import { useCallback, useEffect, useState } from "react";
import { PlayerProfile, PuzzleResult } from "@/lib/types";
import { applyResult, defaultProfile, loadProfile } from "@/lib/storage";

export function usePlayerProfile() {
  const [profile, setProfile] = useState<PlayerProfile>(defaultProfile());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setHydrated(true);
  }, []);

  const submitResult = useCallback(
    (result: PuzzleResult) => {
      const outcome = applyResult(profile, result);
      setProfile(outcome.profile);
      return outcome;
    },
    [profile]
  );

  return { profile, hydrated, submitResult, setProfile };
}
