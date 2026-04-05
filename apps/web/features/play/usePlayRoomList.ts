"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlayRoomListEntry } from "@lockedin/shared";
import { apiGet } from "@/lib/api";

type UsePlayRoomListParams = {
  isAuthenticated: boolean;
  token: string | null;
  enabled?: boolean;
};

export const usePlayRoomList = ({
  isAuthenticated,
  token,
  enabled = true,
}: UsePlayRoomListParams) => {
  const [rooms, setRooms] = useState<PlayRoomListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    if (!enabled || !isAuthenticated || !token) {
      setRooms([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiGet<{ rooms: PlayRoomListEntry[] }>("/playrooms", token);
      setRooms(response.rooms ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your rooms."
      );
    } finally {
      setIsLoading(false);
    }
  }, [enabled, isAuthenticated, token]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  return {
    rooms,
    isLoading,
    error,
    refresh: loadRooms,
    clearError: () => setError(null),
  };
};
