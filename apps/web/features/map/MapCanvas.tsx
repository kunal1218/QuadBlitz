"use client";

import mapboxgl from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  CreateEventRequest,
  EventWithDetails,
  FriendLocation,
  PublicUserLocation,
} from "@lockedin/shared";
import { Card } from "@/components/Card";
import { Tag } from "@/components/Tag";
import { useAuth } from "@/features/auth";
import { EventCreationForm } from "@/features/map/components/EventCreationForm";
import { EventDetailCard } from "@/features/map/components/EventDetailCard";
import { EventMarker } from "@/features/map/components/EventMarker";
import { FriendPopup } from "@/features/map/components/FriendPopup";
import { MapControls } from "@/features/map/components/MapControls";
import { EventsSidebar } from "@/features/map/components/EventsSidebar";
import { PublicUserPopup } from "@/features/map/components/PublicUserPopup";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import {
  createEvent,
  deleteEvent,
  getEventDetails,
  getNearbyEvents,
} from "@/lib/api/events";
import {
  connectSocket,
  disconnectSocket,
  onFriendLocationUpdate,
  socket,
} from "@/lib/socket";
import { formatEventTooltipTime, getEventStatus } from "@/features/map/utils/eventHelpers";
import { formatRelativeTime } from "@/lib/time";
import { usePublicUsers } from "@/features/map/hooks/usePublicUsers";

type MapSettings = {
  shareLocation: boolean;
  ghostMode: boolean;
  publicMode: boolean;
};

type FriendsResponse = {
  friends: FriendLocation[];
  settings: MapSettings;
};

type FriendSummaryResponse = {
  friends: Array<{ id: string }>;
};

const mapColors = ["#fde68a", "#a7f3d0", "#fecdd3", "#bae6fd"];

const getMarkerColor = (name: string) =>
  mapColors[name.length % mapColors.length];

const getInitial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
const DEFAULT_CENTER: [number, number] = [-89.4012, 43.0731];
const DEFAULT_ZOOM = 14;
const UPDATE_INTERVAL_MS = 60000;
const LIVE_LOCATION_WINDOW_MINUTES = 30;
const RING_RECENT = "#10b981";
const RING_ACTIVE = "#f59e0b";
const RING_IDLE = "#6b7280";
const MARKER_ANIMATION_MS = 1200;
const EVENT_FETCH_RADIUS_KM = 5;
const EVENT_MOVE_THRESHOLD_KM = 1;

type MapCanvasVariant = "default" | "discovery";
type DiscoveryCategory = "sports" | "study" | "social";

const getMinutesAgo = (timestamp: string) =>
  (Date.now() - new Date(timestamp).getTime()) / 60000;

const getRingColor = (timestamp: string) => {
  const minutes = getMinutesAgo(timestamp);
  if (minutes < 5) return RING_RECENT;
  if (minutes < 15) return RING_ACTIVE;
  return RING_IDLE;
};

const distanceKmBetween = (from: mapboxgl.LngLat, to: mapboxgl.LngLat) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const getDiscoveryCategory = (
  category: EventWithDetails["category"]
): DiscoveryCategory => {
  if (category === "sports") {
    return "sports";
  }
  if (category === "study") {
    return "study";
  }
  return "social";
};

const formatDistanceLabel = (distanceKm?: number | null) => {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) {
    return "Nearby";
  }
  if (distanceKm < 1) {
    return `${Math.max(50, Math.round(distanceKm * 1000))}m`;
  }
  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)}km`;
  }
  return `${Math.round(distanceKm)}km`;
};

const getDiscoveryPriority = (event: EventWithDetails) => {
  const status = getEventStatus(event.start_time, event.end_time).status;
  if (status === "happening-now") {
    return 0;
  }
  if (status === "starting-soon") {
    return 1;
  }
  return 2;
};

const formatAttendanceLabel = (event: EventWithDetails) => {
  const count = Math.max(0, Number(event.attendee_count ?? 0));
  if (typeof event.max_attendees === "number" && event.max_attendees > 0) {
    return `${count}/${event.max_attendees}`;
  }
  if (count <= 0) {
    return "New";
  }
  return `${count} joined`;
};

const SearchIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
    <circle cx="8.6" cy="8.6" r="5.4" stroke="currentColor" strokeWidth="1.9" />
    <path d="m12.8 12.8 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

const SportsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <circle cx="12" cy="12" r="8.3" stroke="currentColor" strokeWidth="2.1" />
    <path
      d="M3.9 12h16.2M12 3.9c2.3 2.15 3.45 4.86 3.45 8.1 0 3.24-1.15 5.95-3.45 8.1M12 3.9c-2.3 2.15-3.45 4.86-3.45 8.1 0 3.24 1.15 5.95 3.45 8.1"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const StudyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path
      d="M5.1 6.25 11 4.6l7.9 2.05v10.9L13 15.95l-7.9 1.65V6.25Z"
      stroke="currentColor"
      strokeWidth="1.95"
      strokeLinejoin="round"
    />
    <path d="M11 4.6v11.35" stroke="currentColor" strokeWidth="1.95" />
  </svg>
);

const SocialIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <circle cx="8" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="16.3" cy="9.2" r="2.2" stroke="currentColor" strokeWidth="1.9" />
    <path
      d="M4.8 18.2c.55-2.45 2.45-3.9 5.2-3.9 2.8 0 4.7 1.45 5.25 3.9M13.7 14.45c1.95.16 3.35 1.02 4.18 2.63"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
  </svg>
);

const TrophyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path
      d="M7.2 5.3h9.6v2.25a3.3 3.3 0 0 1-3.3 3.3h-3a3.3 3.3 0 0 1-3.3-3.3V5.3Z"
      stroke="currentColor"
      strokeWidth="1.95"
      strokeLinejoin="round"
    />
    <path
      d="M9.1 18.7h5.8M12 10.85v7.85M8 5.3V3.8M16 5.3V3.8"
      stroke="currentColor"
      strokeWidth="1.95"
      strokeLinecap="round"
    />
  </svg>
);

const DiningIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path
      d="M8.2 4.4v7.1M15.7 4.4v7.1M6.8 4.4h2.8M14.3 4.4h2.8M8.2 11.5v8.1M15.7 11.5v8.1"
      stroke="currentColor"
      strokeWidth="1.95"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PinIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path
      d="M12 20.2s5.5-5.38 5.5-10.05A5.5 5.5 0 0 0 6.5 10.15C6.5 14.82 12 20.2 12 20.2Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="10.15" r="1.95" fill="currentColor" />
  </svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <circle cx="8.1" cy="9.3" r="2.25" stroke="currentColor" strokeWidth="1.85" />
    <circle cx="15.95" cy="8.7" r="2" stroke="currentColor" strokeWidth="1.85" />
    <path
      d="M5.2 17.4c.52-2.2 2.24-3.48 4.75-3.48 2.57 0 4.3 1.28 4.8 3.48M13.65 13.95c1.62.14 2.8.85 3.5 2.17"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
    />
  </svg>
);

const PlusCircleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.85" />
    <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
  </svg>
);

const LocateIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <circle cx="12" cy="12" r="3.9" stroke="currentColor" strokeWidth="1.9" />
    <path
      d="M12 2.9v3.1M12 18v3.1M21.1 12H18M6 12H2.9"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
  </svg>
);

const getDiscoveryEventIcon = (category: EventWithDetails["category"]) => {
  switch (category) {
    case "sports":
      return <SportsIcon className="h-[22px] w-[22px]" />;
    case "study":
      return <StudyIcon className="h-[22px] w-[22px]" />;
    case "build":
      return <TrophyIcon className="h-[22px] w-[22px]" />;
    case "social":
      return <SocialIcon className="h-[22px] w-[22px]" />;
    default:
      return <DiningIcon className="h-[22px] w-[22px]" />;
  }
};

export const MapCanvas = ({
  embedded = false,
  variant = "default",
}: {
  embedded?: boolean;
  variant?: MapCanvasVariant;
}) => {
  const { token, isAuthenticated, openAuthModal, user } = useAuth();
  const isDiscovery = variant === "discovery";
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [events, setEvents] = useState<EventWithDetails[]>([]);
  const [settings, setSettings] = useState<MapSettings>({
    shareLocation: false,
    ghostMode: false,
    publicMode: false,
  });
  const [isMapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendLocation | null>(
    null
  );
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [selectedPublicUser, setSelectedPublicUser] = useState<PublicUserLocation | null>(
    null
  );
  const [selectedEvent, setSelectedEvent] = useState<EventWithDetails | null>(
    null
  );
  const userLocation = useMemo(() => {
    if (!user?.id) {
      return null;
    }
    const self = friends.find((friend) => friend.id === user.id);
    if (!self) {
      return null;
    }
    return { latitude: self.latitude, longitude: self.longitude };
  }, [friends, user?.id]);
  const { publicUsers, refetch: refetchPublicUsers } = usePublicUsers({
    token,
    center: userLocation,
    enabled: Boolean(token && userLocation),
    radiusMeters: 5000,
    refreshMs: 10000,
  });
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [showEventsSidebar, setShowEventsSidebar] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [newEventLocation, setNewEventLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [discoverySearch, setDiscoverySearch] = useState("");
  const [discoveryCategory, setDiscoveryCategory] =
    useState<DiscoveryCategory>("sports");
  const [showAllDiscoveryEvents, setShowAllDiscoveryEvents] = useState(false);
  const [, setTempMarker] = useState<mapboxgl.Marker | null>(null);
  const [eventClock, setEventClock] = useState(0);
  const [mapInstanceKey, setMapInstanceKey] = useState(0);
  const now = useMemo(() => {
    void eventClock;
    return new Date();
  }, [eventClock]);
  const discoveryEvents = useMemo(() => {
    const query = discoverySearch.trim().toLowerCase();

    return [...events]
      .filter((event) =>
        showAllDiscoveryEvents
          ? true
          : getDiscoveryCategory(event.category) === discoveryCategory
      )
      .filter((event) => {
        if (!query) {
          return true;
        }
        return [
          event.title,
          event.description ?? "",
          event.venue_name ?? "",
          event.creator?.name ?? "",
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => {
        const priorityDiff =
          getDiscoveryPriority(left) - getDiscoveryPriority(right);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        const leftDistance =
          typeof left.distance_km === "number" && Number.isFinite(left.distance_km)
            ? left.distance_km
            : Number.POSITIVE_INFINITY;
        const rightDistance =
          typeof right.distance_km === "number" && Number.isFinite(right.distance_km)
            ? right.distance_km
            : Number.POSITIVE_INFINITY;
        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }

        const attendeeDiff =
          Number(right.attendee_count ?? 0) - Number(left.attendee_count ?? 0);
        if (attendeeDiff !== 0) {
          return attendeeDiff;
        }

        return (
          new Date(left.start_time).getTime() - new Date(right.start_time).getTime()
        );
      });
  }, [
    discoveryCategory,
    discoverySearch,
    events,
    showAllDiscoveryEvents,
  ]);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const missingFieldsLoggedRef = useRef<Set<string>>(new Set());
  const [showPublicConfirm, setShowPublicConfirm] = useState(false);

  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const markerAnimationsRef = useRef<Map<string, number>>(new Map());
  const eventMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const eventMarkerRootsRef = useRef<Map<number, Root>>(new Map());
  const publicMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const lastEventCenterRef = useRef<mapboxgl.LngLat | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const tempMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const normalizeFriend = useCallback(
    (raw: FriendLocation & {
      profile_picture_url?: string | null;
      previous_latitude?: number | string | null;
      previous_longitude?: number | string | null;
      last_updated?: string;
      is_live?: boolean;
    }): FriendLocation => {
      const profilePictureUrl =
        raw.profilePictureUrl ?? raw.profile_picture_url ?? null;
      const bio = raw.bio ?? "";
      const previousLatitudeRaw =
        raw.previousLatitude ?? raw.previous_latitude ?? null;
      const previousLongitudeRaw =
        raw.previousLongitude ?? raw.previous_longitude ?? null;
      const lastUpdated =
        raw.lastUpdated ?? raw.last_updated ?? new Date().toISOString();
      const isLive =
        typeof raw.isLive === "boolean"
          ? raw.isLive
          : typeof raw.is_live === "boolean"
            ? raw.is_live
            : getMinutesAgo(lastUpdated) < LIVE_LOCATION_WINDOW_MINUTES;

      const friend: FriendLocation = {
        id: raw.id,
        name: raw.name ?? "Unknown",
        handle: raw.handle ?? "@unknown",
        latitude: Number(raw.latitude),
        longitude: Number(raw.longitude),
        lastUpdated,
        isLive,
        profilePictureUrl,
        bio,
        previousLatitude:
          previousLatitudeRaw != null ? Number(previousLatitudeRaw) : null,
        previousLongitude:
          previousLongitudeRaw != null ? Number(previousLongitudeRaw) : null,
      };

      if (process.env.NODE_ENV !== "production") {
        const missing: string[] = [];
        if (!("profilePictureUrl" in raw) && !("profile_picture_url" in raw)) {
          missing.push("profilePictureUrl");
        }
        if (!("bio" in raw)) {
          missing.push("bio");
        }
        if (!("previousLatitude" in raw) && !("previous_latitude" in raw)) {
          missing.push("previousLatitude");
        }
        if (!("previousLongitude" in raw) && !("previous_longitude" in raw)) {
          missing.push("previousLongitude");
        }
        if (!("isLive" in raw) && !("is_live" in raw)) {
          missing.push("isLive");
        }
        if (
          missing.length > 0 &&
          !missingFieldsLoggedRef.current.has(friend.id)
        ) {
          console.info("[map] friend missing fields", {
            id: friend.id,
            missing,
          });
          missingFieldsLoggedRef.current.add(friend.id);
        }
      }

      return friend;
    },
    []
  );

  const normalizeEvent = useCallback(
    (raw: EventWithDetails) => {
      const attendeeCount = Number(raw.attendee_count ?? 0);
      const attendees = raw.attendees ?? [];
      const creator =
        raw.creator ??
        (user && raw.creator_id === user.id
          ? {
              id: user.id,
              name: user.name ?? "You",
              handle: user.handle ?? "@you",
              profile_picture_url: null,
            }
          : {
              id: raw.creator_id ?? "",
              name: "Unknown",
              handle: "@unknown",
              profile_picture_url: null,
            });

      return {
        ...raw,
        category: raw.category ?? "other",
        attendee_count: attendeeCount,
        attendees,
        creator,
        user_status: raw.user_status ?? null,
        distance_km:
          raw.distance_km != null ? Number(raw.distance_km) : raw.distance_km,
      } as EventWithDetails;
    },
    [user]
  );

  const buildEventTooltip = useCallback((event: EventWithDetails) => {
    const count = Math.max(0, Number(event.attendee_count ?? 0));
    const timeLabel = formatEventTooltipTime(event.start_time);
    const status = getEventStatus(event.start_time, event.end_time);
    const statusLabel = status.label ? `${status.label} • ` : "";
    return `${statusLabel}${event.title} • ${timeLabel} • ${count} going`;
  }, []);

  const handleEventClick = useCallback(
    async (event: EventWithDetails) => {
      if (!token) {
        openAuthModal("login");
        return;
      }
      try {
        setSelectedEvent(event);
        const details = await getEventDetails(event.id, token);
        setSelectedEvent(details);

        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [details.longitude, details.latitude],
            zoom: Math.max(mapRef.current.getZoom(), 15),
            duration: 1000,
          });
        }
      } catch (loadError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[map] failed to load event details", loadError);
        }
      }
    },
    [openAuthModal, token]
  );

  const handleEventClickById = useCallback(
    async (eventId: number) => {
      const existing = events.find((event) => event.id === eventId);
      if (existing) {
        await handleEventClick(existing);
        return;
      }
      if (!token) {
        openAuthModal("login");
        return;
      }
      try {
        const details = await getEventDetails(eventId, token);
        setSelectedEvent(details);
        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [details.longitude, details.latitude],
            zoom: Math.max(mapRef.current.getZoom(), 15),
            duration: 1000,
          });
        }
      } catch (loadError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[map] failed to load event details", loadError);
        }
      }
    },
    [events, handleEventClick, openAuthModal, token]
  );

  const handleEventRSVP = useCallback(
    (eventId: number, status: "going" | "maybe" | "declined") => {
      const isAttending = (value: string | null | undefined) =>
        value === "going" || value === "maybe";
      setEvents((prev) =>
        prev.map((event) => {
          if (event.id !== eventId) {
            return event;
          }
          const prevAttending = isAttending(event.user_status);
          const nextAttending = isAttending(status);
          const delta = (nextAttending ? 1 : 0) - (prevAttending ? 1 : 0);
          return {
            ...event,
            attendee_count: Math.max(0, event.attendee_count + delta),
            user_status: status,
          };
        })
      );

      setSelectedEvent((current) => {
        if (!current || current.id !== eventId) {
          return current;
        }
        const prevAttending = isAttending(current.user_status);
        const nextAttending = isAttending(status);
        const delta = (nextAttending ? 1 : 0) - (prevAttending ? 1 : 0);
        return {
          ...current,
          attendee_count: Math.max(0, current.attendee_count + delta),
          user_status: status,
        };
      });
    },
    []
  );

  const handleDeleteEvent = useCallback(
    async (eventId: number) => {
      if (!token) {
        openAuthModal("login");
        throw new Error("Please log in to delete events.");
      }

      await deleteEvent(eventId, token);

      setEvents((prev) => prev.filter((event) => event.id !== eventId));
      setSelectedEvent((current) =>
        current?.id === eventId ? null : current
      );
    },
    [openAuthModal, token]
  );

  const closeEventForm = useCallback(() => {
    setShowEventForm(false);
    setNewEventLocation(null);
    setIsPlacingPin(false);
    setTempMarker((current) => {
      current?.remove();
      return null;
    });
    if (tempMarkerRef.current) {
      tempMarkerRef.current.remove();
      tempMarkerRef.current = null;
    }
  }, []);

  const handleDiscoveryCreateEvent = useCallback(() => {
    if (!token) {
      openAuthModal("login");
      return;
    }
    setSelectedEvent(null);
    setShowEventForm(false);
    setNewEventLocation(null);
    setIsPlacingPin((current) => !current);
  }, [openAuthModal, token]);

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (!token) {
        openAuthModal("login");
        return;
      }

      setSelectedEvent(null);
      setIsPlacingPin(false);
      const location = { latitude: lngLat.lat, longitude: lngLat.lng };
      setNewEventLocation(location);
      setShowEventForm(true);
      setTempMarker((current) => {
        current?.remove();
        const map = mapRef.current;
        if (!map) {
          return null;
        }
        const marker = new mapboxgl.Marker({ color: "#ef4444" })
          .setLngLat([lngLat.lng, lngLat.lat])
          .addTo(map);
        tempMarkerRef.current = marker;
        return marker;
      });
    },
    [openAuthModal, token]
  );

  const handleCreateEvent = useCallback(
    async (payload: CreateEventRequest) => {
      if (!newEventLocation) {
        return;
      }

      try {
        const created = await createEvent(
          {
            ...payload,
            latitude: newEventLocation.latitude,
            longitude: newEventLocation.longitude,
          },
          token ?? undefined
        );
        const normalized = normalizeEvent(created);

        setEvents((prev) => {
          const exists = prev.some((event) => event.id === normalized.id);
          if (exists) {
            return prev.map((event) =>
              event.id === normalized.id ? normalized : event
            );
          }
          return [...prev, normalized];
        });

        closeEventForm();
      } catch (creationError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[map] failed to create event", creationError);
        }
        window.alert("Failed to create event. Please try again.");
      }
    },
    [closeEventForm, newEventLocation, normalizeEvent, token]
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !mapboxToken) {
      return;
    }

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on("load", () => {
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken, mapInstanceKey]);

  const updateMarkerElement = useCallback(
    (element: HTMLElement, friend: FriendLocation, profilePictureUrl: string | null) => {
      const ring = element.querySelector<HTMLElement>("[data-role='ring']");
      const inner = element.querySelector<HTMLElement>("[data-role='inner']");
      const label = element.querySelector<HTMLElement>("[data-role='label']");
      const pulse = element.querySelector<HTMLElement>("[data-role='pulse']");

      const ringColor = getRingColor(friend.lastUpdated);
      if (ring) {
        ring.style.border = `4px solid ${ringColor}`;
      }
      if (pulse) {
        pulse.style.border = `4px solid ${ringColor}`;
      }
      if (label) {
        label.textContent =
          getMinutesAgo(friend.lastUpdated) < LIVE_LOCATION_WINDOW_MINUTES
            ? "Live now"
            : formatRelativeTime(friend.lastUpdated);
      }

      if (inner) {
        inner.style.backgroundColor = getMarkerColor(friend.name);
        const fallback = getInitial(friend.name);
        const existingImg = inner.querySelector("img");
        if (profilePictureUrl) {
          if (existingImg) {
            existingImg.setAttribute("src", profilePictureUrl);
            existingImg.setAttribute("alt", friend.name);
          } else {
            inner.textContent = "";
            const img = document.createElement("img");
            img.src = profilePictureUrl;
            img.alt = friend.name;
            img.className = "h-full w-full object-cover";
            img.loading = "lazy";
            img.onerror = () => {
              inner.textContent = fallback;
              img.remove();
            };
            inner.appendChild(img);
          }
        } else {
          if (existingImg) {
            existingImg.remove();
          }
          inner.textContent = fallback;
        }
      }
    },
    []
  );

  const buildMarker = useCallback(
    (friend: FriendLocation) => {
      const map = mapRef.current;
      if (!map) {
        return null;
      }

      if (!Number.isFinite(friend.latitude) || !Number.isFinite(friend.longitude)) {
        return null;
      }

      const profilePictureUrl =
        friend.profilePictureUrl ??
        (friend as FriendLocation & { profile_picture_url?: string | null })
          .profile_picture_url ??
        null;
      const safeBio = friend.bio ?? "";

      const wrapper = document.createElement("div");
      wrapper.className = "relative flex h-14 w-14 items-center justify-center";
      wrapper.style.cursor = "pointer";
      wrapper.style.pointerEvents = "auto";

      const ringColor = getRingColor(friend.lastUpdated);

      if (friend.id === user?.id) {
        const pulse = document.createElement("span");
        pulse.dataset.role = "pulse";
        pulse.className = "absolute inset-0 rounded-full animate-ping";
        pulse.style.border = `4px solid ${ringColor}`;
        pulse.style.opacity = "0.3";
        pulse.style.pointerEvents = "none";
        wrapper.appendChild(pulse);
      }

      const ring = document.createElement("div");
      ring.dataset.role = "ring";
      ring.className =
        "relative flex h-14 w-14 items-center justify-center rounded-full";
      ring.style.border = `4px solid ${ringColor}`;

      const inner = document.createElement("div");
      inner.dataset.role = "inner";
      inner.className =
        "relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-white text-sm font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.2)]";
      inner.style.backgroundColor = getMarkerColor(friend.name);

      const fallback = getInitial(friend.name);

      if (profilePictureUrl) {
        const img = document.createElement("img");
        img.src = profilePictureUrl;
        img.alt = friend.name;
        img.className = "h-full w-full object-cover";
        img.loading = "lazy";
        img.onerror = () => {
          inner.textContent = fallback;
          img.remove();
        };
        inner.appendChild(img);
      } else {
        inner.textContent = fallback;
      }

      ring.appendChild(inner);
      wrapper.appendChild(ring);

      const label = document.createElement("div");
      label.dataset.role = "label";
      label.className =
        "absolute left-1/2 top-full mt-1 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] backdrop-blur";
      label.textContent =
        getMinutesAgo(friend.lastUpdated) < LIVE_LOCATION_WINDOW_MINUTES
          ? "Live now"
          : formatRelativeTime(friend.lastUpdated);
      label.style.pointerEvents = "none";
      wrapper.appendChild(label);

      wrapper.addEventListener("click", () => {
        setSelectedFriend({ ...friend, bio: safeBio, profilePictureUrl });
      });

      const marker = new mapboxgl.Marker({ element: wrapper, anchor: "center" })
        .setLngLat([friend.longitude, friend.latitude])
        .addTo(map);

      updateMarkerElement(wrapper, friend, profilePictureUrl);

      return marker;
    },
    [updateMarkerElement, user?.id]
  );

  const updatePublicMarkerElement = useCallback(
    (element: HTMLElement, publicUser: PublicUserLocation) => {
      const inner = element.querySelector<HTMLElement>("[data-role='inner']");
      const label = element.querySelector<HTMLElement>("[data-role='label']");
      const profilePictureUrl = publicUser.profilePictureUrl ?? null;
      const fallback = getInitial(publicUser.name);

      if (label) {
        label.textContent = formatRelativeTime(publicUser.lastUpdated);
      }

      if (inner) {
        inner.style.backgroundColor = getMarkerColor(publicUser.name);
        const existingImg = inner.querySelector("img");
        if (profilePictureUrl) {
          if (existingImg) {
            existingImg.setAttribute("src", profilePictureUrl);
            existingImg.setAttribute("alt", publicUser.name);
          } else {
            inner.textContent = "";
            const img = document.createElement("img");
            img.src = profilePictureUrl;
            img.alt = publicUser.name;
            img.className = "h-full w-full object-cover";
            img.loading = "lazy";
            img.onerror = () => {
              inner.textContent = fallback;
              img.remove();
            };
            inner.appendChild(img);
          }
        } else {
          if (existingImg) {
            existingImg.remove();
          }
          inner.textContent = fallback;
        }
      }
    },
    []
  );

  const buildPublicMarker = useCallback(
    (publicUser: PublicUserLocation) => {
      const map = mapRef.current;
      if (!map) {
        return null;
      }

      if (!Number.isFinite(publicUser.latitude) || !Number.isFinite(publicUser.longitude)) {
        return null;
      }

      const profilePictureUrl = publicUser.profilePictureUrl ?? null;
      const fallback = getInitial(publicUser.name);

      const wrapper = document.createElement("div");
      wrapper.className = "relative flex h-12 w-12 items-center justify-center";
      wrapper.style.cursor = "pointer";
      wrapper.style.pointerEvents = "auto";
      wrapper.style.opacity = "0.8";

      const ring = document.createElement("div");
      ring.className = "relative flex h-12 w-12 items-center justify-center rounded-full";
      ring.style.border = "3px solid #f59e0b";
      ring.style.boxShadow = "0 0 12px rgba(245, 158, 11, 0.4)";

      const inner = document.createElement("div");
      inner.dataset.role = "inner";
      inner.className =
        "relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white text-[10px] font-semibold text-white";
      inner.style.backgroundColor = getMarkerColor(publicUser.name);

      if (profilePictureUrl) {
        const img = document.createElement("img");
        img.src = profilePictureUrl;
        img.alt = publicUser.name;
        img.className = "h-full w-full object-cover";
        img.loading = "lazy";
        img.onerror = () => {
          inner.textContent = fallback;
          img.remove();
        };
        inner.appendChild(img);
      } else {
        inner.textContent = fallback;
      }

      ring.appendChild(inner);
      wrapper.appendChild(ring);

      const label = document.createElement("div");
      label.dataset.role = "label";
      label.className =
        "absolute left-1/2 top-full mt-1 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] backdrop-blur";
      label.textContent = formatRelativeTime(publicUser.lastUpdated);
      label.style.pointerEvents = "none";
      wrapper.appendChild(label);

      wrapper.addEventListener("click", () => {
        setSelectedPublicUser(publicUser);
      });

      const marker = new mapboxgl.Marker({ element: wrapper, anchor: "center" })
        .setLngLat([publicUser.longitude, publicUser.latitude])
        .addTo(map);

      updatePublicMarkerElement(wrapper, publicUser);

      return marker;
    },
    [updatePublicMarkerElement]
  );

  const animateMarkerTo = useCallback(
    (id: string, marker: mapboxgl.Marker, target: [number, number]) => {
      if (!Number.isFinite(target[0]) || !Number.isFinite(target[1])) {
        return;
      }

      const start = marker.getLngLat();
      if (start.lng === target[0] && start.lat === target[1]) {
        return;
      }

      const existing = markerAnimationsRef.current.get(id);
      if (existing) {
        window.cancelAnimationFrame(existing);
      }

      const startTime = performance.now();
      const animate = (time: number) => {
        const progress = Math.min(1, (time - startTime) / MARKER_ANIMATION_MS);
        const lng = start.lng + (target[0] - start.lng) * progress;
        const lat = start.lat + (target[1] - start.lat) * progress;
        marker.setLngLat([lng, lat]);

        if (progress < 1) {
          const rafId = window.requestAnimationFrame(animate);
          markerAnimationsRef.current.set(id, rafId);
        } else {
          markerAnimationsRef.current.delete(id);
        }
      };

      const rafId = window.requestAnimationFrame(animate);
      markerAnimationsRef.current.set(id, rafId);
    },
    []
  );

  const renderEventMarker = useCallback(
    (event: EventWithDetails, isSelected: boolean) => {
      const tooltip = buildEventTooltip(event);
      const root = eventMarkerRootsRef.current.get(event.id);
      if (root) {
        root.render(
          <EventMarker
            event={event}
            isSelected={isSelected}
            tooltip={tooltip}
            onClick={handleEventClick}
            variant={variant}
          />
        );
      }
    },
    [buildEventTooltip, handleEventClick, variant]
  );

  useEffect(() => {
    if (!mapRef.current || !isMapReady) {
      return;
    }

    const markerMap = markersRef.current;
    const nextIds = new Set(friends.map((friend) => friend.id));

    friends.forEach((friend) => {
      const existing = markerMap.get(friend.id);
      if (existing) {
        const element = existing.getElement();
        const profilePictureUrl =
          friend.profilePictureUrl ??
          (friend as FriendLocation & { profile_picture_url?: string | null })
            .profile_picture_url ??
          null;
        updateMarkerElement(element, friend, profilePictureUrl);
        animateMarkerTo(friend.id, existing, [
          friend.longitude,
          friend.latitude,
        ]);
      } else {
        const marker = buildMarker(friend);
        if (marker) {
          markerMap.set(friend.id, marker);
        }
      }
    });

    markerMap.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        markerMap.delete(id);
      }
    });
  }, [animateMarkerTo, buildMarker, eventClock, friends, isMapReady, updateMarkerElement]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) {
      return;
    }

    const map = mapRef.current;
    const markerMap = eventMarkersRef.current;
    const rootMap = eventMarkerRootsRef.current;
    const nextIds = new Set(events.map((event) => event.id));

    events.forEach((event) => {
      const existing = markerMap.get(event.id);
      if (existing) {
        renderEventMarker(event, selectedEvent?.id === event.id);
        existing.setLngLat([event.longitude, event.latitude]);
      } else {
        const element = document.createElement("div");
        const root = createRoot(element);
        root.render(
          <EventMarker
            event={event}
            isSelected={selectedEvent?.id === event.id}
            tooltip={buildEventTooltip(event)}
            onClick={handleEventClick}
            variant={variant}
          />
        );
        rootMap.set(event.id, root);
        const marker = new mapboxgl.Marker({ element, anchor: "center" })
          .setLngLat([event.longitude, event.latitude])
          .addTo(map);
        markerMap.set(event.id, marker);
      }
    });

    markerMap.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        markerMap.delete(id);
        const root = rootMap.get(id);
        root?.unmount();
        rootMap.delete(id);
      }
    });
  }, [
    buildEventTooltip,
    eventClock,
    events,
    handleEventClick,
    isMapReady,
    renderEventMarker,
    selectedEvent,
    variant,
  ]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) {
      return;
    }

    const markerMap = publicMarkersRef.current;
    const nextIds = new Set(publicUsers.map((user) => user.userId));

    publicUsers.forEach((user) => {
      const existing = markerMap.get(user.userId);
      if (existing) {
        updatePublicMarkerElement(existing.getElement(), user);
        existing.setLngLat([user.longitude, user.latitude]);
      } else {
        const marker = buildPublicMarker(user);
        if (marker) {
          markerMap.set(user.userId, marker);
        }
      }
    });

    markerMap.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        markerMap.delete(id);
      }
    });
  }, [buildPublicMarker, isMapReady, publicUsers, updatePublicMarkerElement]);

  useEffect(() => {
    const markers = markersRef.current;
    const markerAnimations = markerAnimationsRef.current;
    const eventMarkers = eventMarkersRef.current;
    const eventMarkerRoots = eventMarkerRootsRef.current;
    const publicMarkers = publicMarkersRef.current;
    const tempMarker = tempMarkerRef;

    return () => {
      markers.forEach((marker) => marker.remove());
      markers.clear();
      markerAnimations.forEach((rafId) => {
        window.cancelAnimationFrame(rafId);
      });
      markerAnimations.clear();
      eventMarkers.forEach((marker) => marker.remove());
      eventMarkers.clear();
      eventMarkerRoots.forEach((root) => root.unmount());
      eventMarkerRoots.clear();
      publicMarkers.forEach((marker) => marker.remove());
      publicMarkers.clear();
      if (tempMarker.current) {
        tempMarker.current.remove();
        tempMarker.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setEventClock((prev) => prev + 1);
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedFriend) {
      return;
    }
    const updated = friends.find((friend) => friend.id === selectedFriend.id);
    if (!updated) {
      setSelectedFriend(null);
      return;
    }
    if (updated !== selectedFriend) {
      setSelectedFriend(updated);
    }
  }, [friends, selectedFriend]);

  useEffect(() => {
    if (!selectedPublicUser) {
      return;
    }
    const updated = publicUsers.find(
      (user) => user.userId === selectedPublicUser.userId
    );
    if (!updated) {
      setSelectedPublicUser(null);
      return;
    }
    if (updated !== selectedPublicUser) {
      setSelectedPublicUser(updated);
    }
  }, [publicUsers, selectedPublicUser]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }
    const updated = events.find((event) => event.id === selectedEvent.id);
    if (!updated) {
      setSelectedEvent(null);
      return;
    }
    if (updated !== selectedEvent) {
      setSelectedEvent((current) => {
        if (!current || current.id !== updated.id) {
          return current;
        }
        return {
          ...current,
          ...updated,
          description: current.description ?? updated.description,
          attendees:
            current.attendees?.length && current.attendees.length > 0
              ? current.attendees
              : updated.attendees,
          creator: current.creator ?? updated.creator,
          user_status: current.user_status ?? updated.user_status,
        };
      });
    }
  }, [events, selectedEvent]);

  const requestPosition = useCallback(
    async (options?: { suppressError?: boolean }) => {
      if (!navigator.geolocation) {
        const message = "Location services are not available in this browser.";
        if (!options?.suppressError) {
          setError(message);
        }
        throw new Error(message);
      }

      try {
        return await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 15000,
          });
        });
      } catch (err) {
        const message =
          err && typeof err === "object" && "message" in err
            ? String((err as { message?: unknown }).message)
            : "Location permission was denied.";
        if (!options?.suppressError) {
          setError(message || "Location permission was denied.");
        }
        if (process.env.NODE_ENV !== "production") {
          console.info("[map] geolocation error", err);
        }
        throw err;
      }
    },
    []
  );

  const refreshEvents = useCallback(
    async (options?: { force?: boolean; center?: mapboxgl.LngLat }) => {
      if (!token || !mapRef.current) {
        setEvents([]);
        return;
      }

      const map = mapRef.current;
      const center = options?.center ?? map.getCenter();
      const lastCenter = lastEventCenterRef.current;

      if (
        !options?.force &&
        lastCenter &&
        distanceKmBetween(lastCenter, center) < EVENT_MOVE_THRESHOLD_KM
      ) {
        return;
      }

      lastEventCenterRef.current = center;

      try {
        const nearby = await getNearbyEvents(
          center.lat,
          center.lng,
          EVENT_FETCH_RADIUS_KM,
          token
        );
        setEvents(nearby.map(normalizeEvent));
      } catch (loadError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[map] failed to load events", loadError);
        }
      }
    },
    [normalizeEvent, token]
  );

  const refreshFriends = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiGet<FriendsResponse | FriendLocation[]>(
        "/map/friends",
        token
      );
      const rawFriends = Array.isArray(response)
        ? response
        : response.friends ?? [];
      const normalized = rawFriends.map(normalizeFriend).filter((friend) =>
        Number.isFinite(friend.latitude) && Number.isFinite(friend.longitude)
      );

      // Keep one marker per user: prefer live entries, otherwise latest timestamp.
      const dedupedById = new Map<string, FriendLocation>();
      normalized.forEach((friend) => {
        const existing = dedupedById.get(friend.id);
        if (!existing) {
          dedupedById.set(friend.id, friend);
          return;
        }

        const existingIsLive =
          getMinutesAgo(existing.lastUpdated) < LIVE_LOCATION_WINDOW_MINUTES;
        const nextIsLive =
          getMinutesAgo(friend.lastUpdated) < LIVE_LOCATION_WINDOW_MINUTES;
        const existingTime = Date.parse(existing.lastUpdated);
        const nextTime = Date.parse(friend.lastUpdated);
        const safeExistingTime = Number.isFinite(existingTime) ? existingTime : 0;
        const safeNextTime = Number.isFinite(nextTime) ? nextTime : 0;

        if (
          (nextIsLive && !existingIsLive) ||
          (nextIsLive === existingIsLive && safeNextTime > safeExistingTime)
        ) {
          dedupedById.set(friend.id, friend);
        }
      });

      const deduped = Array.from(dedupedById.values()).sort((a, b) => {
        const aIsLive = getMinutesAgo(a.lastUpdated) < LIVE_LOCATION_WINDOW_MINUTES;
        const bIsLive = getMinutesAgo(b.lastUpdated) < LIVE_LOCATION_WINDOW_MINUTES;
        if (aIsLive !== bIsLive) {
          return aIsLive ? -1 : 1;
        }
        const aTime = Date.parse(a.lastUpdated);
        const bTime = Date.parse(b.lastUpdated);
        const safeATime = Number.isFinite(aTime) ? aTime : 0;
        const safeBTime = Number.isFinite(bTime) ? bTime : 0;
        return safeBTime - safeATime;
      });

      setFriends(deduped);
      if (!Array.isArray(response)) {
        setSettings(
          response.settings ?? {
            shareLocation: false,
            ghostMode: false,
            publicMode: false,
          }
        );
      }
    } catch (loadError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[map] failed to load friends", loadError);
      }
      setError("Can't load friend locations right now");

      if (user?.id) {
        try {
          const position = await requestPosition({ suppressError: true });
          const fallbackFriend = normalizeFriend({
            id: user.id,
            name: user.name ?? "You",
            handle: user.handle ?? "@you",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            lastUpdated: new Date().toISOString(),
          } as FriendLocation);
          setFriends([fallbackFriend]);
        } catch {
          // Ignore fallback errors; error message already set.
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [normalizeFriend, requestPosition, token, user?.handle, user?.id, user?.name]);

  const updateLocation = useCallback(async (publicOverride?: boolean) => {
    if (!token) {
      return;
    }

    const position = await requestPosition();

    if (process.env.NODE_ENV !== "production") {
      console.info("[map] location captured", {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    }

    await apiPost(
      "/map/location",
      {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        isPublic:
          typeof publicOverride === "boolean"
            ? publicOverride
            : settings.publicMode,
      },
      token
    );

    if (mapRef.current) {
      mapRef.current.easeTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: Math.max(mapRef.current.getZoom(), 13),
      });
    }
  }, [requestPosition, settings.publicMode, token]);

  const handleHomeClick = useCallback(() => {
    if (!mapRef.current) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 15,
          duration: 1500,
        });
      },
      () => {
        // Location denied/unavailable -> campus fallback.
        mapRef.current?.flyTo({
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          duration: 1500,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  }, []);

  const zoomIn = useCallback(() => {
    if (!mapRef.current) {
      return;
    }
    mapRef.current.zoomTo(mapRef.current.getZoom() + 1, { duration: 200 });
  }, []);

  const zoomOut = useCallback(() => {
    if (!mapRef.current) {
      return;
    }
    mapRef.current.zoomTo(mapRef.current.getZoom() - 1, { duration: 200 });
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    refreshFriends();
  }, [refreshFriends, token]);

  useEffect(() => {
    if (!token) {
      setFriendIds(new Set());
      return;
    }

    apiGet<FriendSummaryResponse>("/friends/summary", token)
      .then((response) => {
        setFriendIds(new Set(response.friends.map((friend) => friend.id)));
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.error("[map] failed to load friend summary", err);
        }
      });
  }, [token]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) {
      return;
    }

    if (!token) {
      setEvents([]);
      setSelectedEvent(null);
      closeEventForm();
      return;
    }

    const map = mapRef.current;
    const handleMoveEnd = () => {
      refreshEvents();
    };

    refreshEvents({ force: true, center: map.getCenter() });
    map.on("moveend", handleMoveEnd);

    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [closeEventForm, isMapReady, mapInstanceKey, refreshEvents, token]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) {
      return;
    }

    const map = mapRef.current;

    const handleContextMenu = (event: mapboxgl.MapMouseEvent) => {
      event.preventDefault();
      event.originalEvent?.preventDefault?.();
      handleMapClick(event.lngLat);
    };

    const handleTouchStart = (event: mapboxgl.MapTouchEvent) => {
      const touch = event.originalEvent.touches[0];
      if (!touch) {
        return;
      }
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
      }
      pressTimerRef.current = window.setTimeout(() => {
        const startPos = touchStartPosRef.current;
        if (!startPos) {
          return;
        }
        const lngLat = map.unproject([startPos.x, startPos.y]);
        handleMapClick(lngLat);
        navigator.vibrate?.(50);
      }, 600);
    };

    const handleTouchMove = (event: mapboxgl.MapTouchEvent) => {
      if (!pressTimerRef.current || !touchStartPosRef.current) {
        return;
      }
      const touch = event.originalEvent.touches[0];
      if (!touch) {
        return;
      }
      const dx = touch.clientX - touchStartPosRef.current.x;
      const dy = touch.clientY - touchStartPosRef.current.y;
      if (Math.hypot(dx, dy) > 10) {
        window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    };

    const clearPress = () => {
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      touchStartPosRef.current = null;
    };

    map.on("contextmenu", handleContextMenu);
    map.on("touchstart", handleTouchStart);
    map.on("touchend", clearPress);
    map.on("touchcancel", clearPress);
    map.on("touchmove", handleTouchMove);

    return () => {
      map.off("contextmenu", handleContextMenu);
      map.off("touchstart", handleTouchStart);
      map.off("touchend", clearPress);
      map.off("touchcancel", clearPress);
      map.off("touchmove", handleTouchMove);
      clearPress();
    };
  }, [handleMapClick, isMapReady]);

  useEffect(() => {
    if (isDiscovery || !mapRef.current || !isMapReady) {
      return;
    }
    const map = mapRef.current;
    const paddingLeft = showEventsSidebar && window.innerWidth >= 640 ? 400 : 0;
    map.easeTo({
      padding: { left: paddingLeft, right: 0 },
      duration: 300,
    });
  }, [isDiscovery, isMapReady, showEventsSidebar]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) {
      return;
    }

    const map = mapRef.current;
    const handleClick = (event: mapboxgl.MapMouseEvent) => {
      if (!isPlacingPin) {
        return;
      }
      handleMapClick(event.lngLat);
    };

    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
    };
  }, [handleMapClick, isMapReady, isPlacingPin]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) {
      return;
    }
    const canvas = mapRef.current.getCanvas();
    canvas.style.cursor = isPlacingPin ? "crosshair" : "";
  }, [isMapReady, isPlacingPin]);

  useEffect(() => {
    if (!token || !settings.shareLocation || settings.ghostMode) {
      return;
    }

    updateLocation().catch((err) => {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update your location."
      );
    });

    const interval = window.setInterval(() => {
      updateLocation().catch(() => {
        // Ignore silent update failures; we'll retry next cycle.
      });
    }, UPDATE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [settings.ghostMode, settings.shareLocation, token, updateLocation]);

  const handleToggleShare = async () => {
    if (!token) {
      openAuthModal("login");
      return;
    }

    try {
      const next = !settings.shareLocation;
      const response = await apiPatch<{ settings: MapSettings }>(
        "/map/settings",
        {
          shareLocation: next,
          publicMode: next ? settings.publicMode : false,
        },
        token
      );
      setSettings(response.settings);
      if (next) {
        await updateLocation(response.settings.publicMode);
      }
    } catch (toggleError) {
      setError(
        toggleError instanceof Error && toggleError.message
          ? toggleError.message
          : "Unable to update location settings."
      );
    }
  };

  const handleToggleGhost = async () => {
    if (!token) {
      openAuthModal("login");
      return;
    }

    try {
      const next = !settings.ghostMode;
      const response = await apiPatch<{ settings: MapSettings }>(
        "/map/settings",
        {
          ghostMode: next,
          publicMode: next ? false : settings.publicMode,
        },
        token
      );
      setSettings(response.settings);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Unable to update ghost mode."
      );
    }
  };

  const applyPublicMode = useCallback(
    async (next: boolean) => {
      if (!token) {
        openAuthModal("login");
        return;
      }

      try {
        const response = await apiPatch<{ settings: MapSettings }>(
          "/map/settings",
          {
            publicMode: next,
            ghostMode: next ? false : settings.ghostMode,
            shareLocation: next ? true : settings.shareLocation,
          },
          token
        );
        setSettings(response.settings);
        if (next) {
          await updateLocation(response.settings.publicMode);
        }
      } catch (toggleError) {
        setError(
          toggleError instanceof Error
            ? toggleError.message
            : "Unable to update public mode."
        );
      }
    },
    [openAuthModal, settings.ghostMode, settings.shareLocation, token, updateLocation]
  );

  const handleTogglePublic = () => {
    if (settings.publicMode) {
      applyPublicMode(false);
      return;
    }
    setShowPublicConfirm(true);
  };

  const handleConfirmPublic = () => {
    setShowPublicConfirm(false);
    applyPublicMode(true);
  };

  const handleRetry = useCallback(() => {
    setError(null);
    setSelectedFriend(null);
    setSelectedPublicUser(null);
    setSelectedEvent(null);
    setIsPlacingPin(false);
    setShowEventForm(false);
    setNewEventLocation(null);
    setShowPublicConfirm(false);
    setTempMarker((current) => {
      current?.remove();
      return null;
    });
    if (tempMarkerRef.current) {
      tempMarkerRef.current.remove();
      tempMarkerRef.current = null;
    }
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    markerAnimationsRef.current.forEach((rafId) => {
      window.cancelAnimationFrame(rafId);
    });
    markerAnimationsRef.current.clear();
    eventMarkersRef.current.forEach((marker) => marker.remove());
    eventMarkersRef.current.clear();
    eventMarkerRootsRef.current.forEach((root) => root.unmount());
    eventMarkerRootsRef.current.clear();
    publicMarkersRef.current.forEach((marker) => marker.remove());
    publicMarkersRef.current.clear();
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    setMapReady(false);
    setMapInstanceKey((prev) => prev + 1);
    refreshFriends();
    refreshEvents({ force: true });
    refetchPublicUsers();
  }, [refetchPublicUsers, refreshEvents, refreshFriends]);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    connectSocket(token);

    const unsubscribe = onFriendLocationUpdate((data) => {
      setFriends((prev) => {
        const hasFriend = prev.some((friend) => friend.id === data.userId);
        if (!hasFriend) {
          return prev;
        }
        return prev.map((friend) =>
          friend.id === data.userId
            ? {
                ...friend,
                latitude: data.latitude,
                longitude: data.longitude,
                lastUpdated: data.timestamp,
                isLive: true,
                previousLatitude: friend.latitude,
                previousLongitude: friend.longitude,
              }
            : friend
        );
      });
    });

    const handleRsvpUpdate = (data: {
      eventId: number;
      newAttendeeCount: number;
    }) => {
      setEvents((prev) =>
        prev.map((event) =>
          event.id === data.eventId
            ? { ...event, attendee_count: data.newAttendeeCount }
            : event
        )
      );
      setSelectedEvent((current) =>
        current && current.id === data.eventId
          ? { ...current, attendee_count: data.newAttendeeCount }
          : current
      );
    };

    const handleCheckin = (data: { userName?: string }) => {
      if (process.env.NODE_ENV !== "production") {
        console.info("[map] event check-in", data);
      }
    };

    const handleNewEvent = (data: { event: EventWithDetails }) => {
      if (!data?.event) {
        return;
      }
      const normalized = normalizeEvent(data.event);
      setEvents((prev) => {
        const exists = prev.some((event) => event.id === normalized.id);
        if (exists) {
          return prev.map((event) =>
            event.id === normalized.id ? normalized : event
          );
        }
        return [...prev, normalized];
      });
    };

    const handleConnect = () => {
      refreshFriends();
      refreshEvents({ force: true });
    };

    socket.on("connect", handleConnect);
    socket.on("event-rsvp-update", handleRsvpUpdate);
    socket.on("event-checkin", handleCheckin);
    socket.on("new-event-created", handleNewEvent);

    return () => {
      unsubscribe();
      socket.off("connect", handleConnect);
      socket.off("event-rsvp-update", handleRsvpUpdate);
      socket.off("event-checkin", handleCheckin);
      socket.off("new-event-created", handleNewEvent);
      disconnectSocket();
    };
  }, [normalizeEvent, refreshEvents, refreshFriends, token]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    socket.emit("join-event", selectedEvent.id);
    socket.emit("join-event-room", selectedEvent.id);

    return () => {
      socket.emit("leave-event", selectedEvent.id);
      socket.emit("leave-event-room", selectedEvent.id);
    };
  }, [selectedEvent]);

  const discoveryFilterButtons: Array<{
    id: DiscoveryCategory;
    label: string;
    icon: typeof SportsIcon;
  }> = [
    { id: "sports", label: "Sports", icon: SportsIcon },
    { id: "study", label: "Study", icon: StudyIcon },
    { id: "social", label: "Social", icon: SocialIcon },
  ];

  const sharedMapOverlays = (
    <>
      {selectedFriend && (
        <FriendPopup
          friend={selectedFriend}
          onClose={() => setSelectedFriend(null)}
        />
      )}
      {selectedPublicUser && (
        <PublicUserPopup
          user={selectedPublicUser}
          onClose={() => setSelectedPublicUser(null)}
          isFriend={friendIds.has(selectedPublicUser.userId)}
          onAddFriend={async (userId) => {
            if (!token) {
              openAuthModal("login");
              return;
            }
            try {
              const target =
                publicUsers.find((user) => user.userId === userId) ??
                selectedPublicUser;
              if (!target?.handle) {
                return;
              }
              await apiPost("/friends/requests", { handle: target.handle }, token);
              refetchPublicUsers();
            } catch (addError) {
              if (process.env.NODE_ENV !== "production") {
                console.error("[map] failed to add friend", addError);
              }
              window.alert("Unable to send friend request.");
            }
          }}
        />
      )}
      {showPublicConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur"
            onClick={() => setShowPublicConfirm(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-card-border/60 bg-white/95 p-6 text-center shadow-[0_24px_60px_rgba(27,26,23,0.25)] backdrop-blur">
            <h3 className="text-lg font-semibold text-ink">Go public?</h3>
            <p className="mt-2 text-sm text-muted">
              Going public lets anyone on campus see your location and profile.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-xl border border-card-border/70 px-4 py-3 text-sm font-semibold text-ink/70 transition hover:border-accent/40"
                onClick={() => setShowPublicConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90"
                onClick={handleConfirmPublic}
              >
                Go public
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedEvent && (
        <EventDetailCard
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onRSVP={(status) => handleEventRSVP(selectedEvent.id, status)}
          onDelete={() => handleDeleteEvent(selectedEvent.id)}
        />
      )}
      {showEventForm && newEventLocation && (
        <EventCreationForm
          location={newEventLocation}
          onClose={closeEventForm}
          onSubmit={handleCreateEvent}
        />
      )}
    </>
  );

  if (!mapboxToken) {
    return (
      <Card className="min-h-[420px]">
        <div className="space-y-3">
          <Tag tone="accent">Map setup needed</Tag>
          <p className="text-sm text-muted">
            Add `NEXT_PUBLIC_MAPBOX_TOKEN` to your web env to load the map.
          </p>
        </div>
      </Card>
    );
  }

  if (isDiscovery) {
    return (
      <div className="grid h-full w-full min-h-0 grid-cols-[320px_minmax(0,1fr)] bg-white xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex h-full min-h-0 flex-col border-r border-[#edf0f6] bg-[#fbfcff] px-8 py-10">
          <div>
            <h1 className="text-[26px] font-[700] tracking-[-0.055em] text-[#20242d]">
              Event Discovery
            </h1>
            <p className="mt-1 text-[14px] text-[#5f697b]">
              Find what&apos;s happening now
            </p>
          </div>

          <label className="mt-8 flex items-center gap-3 rounded-full border border-[#ebeff6] bg-white px-5 py-4 text-[#7a8598] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]">
            <SearchIcon className="h-[20px] w-[20px]" />
            <input
              type="text"
              value={discoverySearch}
              onChange={(event) => setDiscoverySearch(event.target.value)}
              placeholder="Search campus events..."
              className="w-full bg-transparent text-[14px] text-[#20242d] outline-none placeholder:text-[#9ba5b7]"
            />
          </label>

          <div className="mt-6 flex gap-3">
            {discoveryFilterButtons.map(({ id, label, icon: Icon }) => {
              const active = !showAllDiscoveryEvents && discoveryCategory === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setShowAllDiscoveryEvents(false);
                    setDiscoveryCategory(id);
                  }}
                  className={`flex h-[90px] w-[90px] shrink-0 flex-col items-center justify-center rounded-full border text-center transition ${
                    active
                      ? "border-[#1456f4] bg-[#1456f4] text-white shadow-[0_16px_30px_rgba(20,86,244,0.25)]"
                      : "border-[#ecf0f6] bg-white text-[#4d5668] shadow-[0_8px_18px_rgba(34,45,69,0.06)] hover:border-[#dbe3f0]"
                  }`}
                >
                  <Icon className="h-[22px] w-[22px]" />
                  <span className="mt-3 text-[13px] font-semibold uppercase tracking-[0.08em]">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#4a4f5b]">
                Trending Nearby
              </p>
              <button
                type="button"
                onClick={() => setShowAllDiscoveryEvents(true)}
                className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#1456f4]"
              >
                See All
              </button>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              {!token ? (
                <div className="rounded-[30px] border border-[#e8edf6] bg-white px-5 py-5 text-[14px] leading-[1.55] text-[#5f697b] shadow-[0_10px_24px_rgba(22,34,65,0.05)]">
                  Sign in to load your live nearby events and campus markers.
                </div>
              ) : discoveryEvents.length === 0 ? (
                <div className="rounded-[30px] border border-[#e8edf6] bg-white px-5 py-5 text-[14px] leading-[1.55] text-[#5f697b] shadow-[0_10px_24px_rgba(22,34,65,0.05)]">
                  {discoverySearch.trim()
                    ? "No nearby events match that search yet."
                    : "No nearby events in this lane right now."}
                </div>
              ) : (
                <div className="space-y-4 pb-4">
                  {discoveryEvents.map((event) => {
                    const status = getEventStatus(event.start_time, event.end_time);
                    const isSelected = selectedEvent?.id === event.id;

                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => {
                          void handleEventClickById(event.id);
                        }}
                        className={`w-full rounded-[30px] border px-5 py-5 text-left shadow-[0_10px_24px_rgba(22,34,65,0.05)] transition ${
                          isSelected
                            ? "border-[#cfe0ff] bg-[#f4f8ff]"
                            : "border-[#e8edf6] bg-white hover:border-[#d7e0ee]"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-[#edf3ff] text-[#1456f4]">
                            {getDiscoveryEventIcon(event.category)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-[700] tracking-[-0.045em] text-[#20242d]">
                              {event.title}
                            </p>
                            <div className="mt-[7px] flex flex-wrap items-center gap-3 text-[12.5px] font-medium text-[#5f697b]">
                              <span className="inline-flex items-center gap-1.5">
                                <PinIcon className="h-[14px] w-[14px]" />
                                {formatDistanceLabel(event.distance_km)}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <UsersIcon className="h-[14px] w-[14px]" />
                                {formatAttendanceLabel(event)}
                              </span>
                            </div>
                            <p className="mt-[7px] truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7e8797]">
                              {status.label ?? formatEventTooltipTime(event.start_time)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDiscoveryCreateEvent}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[linear-gradient(90deg,#1456f4_0%,#4d8cff_100%)] px-6 py-5 text-[13px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_18px_34px_rgba(20,86,244,0.22)] transition hover:brightness-[1.03]"
          >
            <PlusCircleIcon className="h-[18px] w-[18px]" />
            Create Event
          </button>
        </aside>

        <div className="relative min-h-0 min-w-0 overflow-hidden">
          <div
            ref={mapContainerRef}
            className="absolute inset-0 z-0 h-full w-full [filter:saturate(0.3)_brightness(1.08)_contrast(0.78)]"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(194,217,189,0.55)_0%,rgba(248,240,205,0.74)_49%,rgba(182,214,198,0.6)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(255,249,221,0.86),transparent_0%,transparent_44%),radial-gradient(circle_at_82%_34%,rgba(189,213,198,0.38),transparent_28%),radial-gradient(circle_at_18%_18%,rgba(162,192,174,0.22),transparent_26%)]" />

          {error && (
            <div className="absolute left-6 top-6 z-20 rounded-full bg-white/92 px-4 py-2 text-[12px] font-medium text-[#606b7d] shadow-[0_10px_24px_rgba(28,39,62,0.08)]">
              {error}
            </div>
          )}

          {isPlacingPin && (
            <div className="pointer-events-none absolute left-1/2 top-8 z-20 -translate-x-1/2 rounded-full bg-[#1456f4] px-6 py-3 text-[13px] font-semibold text-white shadow-[0_18px_34px_rgba(20,86,244,0.24)]">
              Click anywhere on the map to place your event
            </div>
          )}

          <div className="absolute bottom-10 right-10 z-20 flex flex-col items-end gap-4">
            <div className="overflow-hidden rounded-[18px] border border-black/5 bg-white/95 shadow-[0_16px_34px_rgba(35,48,79,0.12)] backdrop-blur">
              <button
                type="button"
                aria-label="Zoom in"
                className="flex h-[68px] w-[68px] items-center justify-center text-[36px] font-light text-[#20242d] transition hover:bg-[#f5f7fb]"
                onClick={zoomIn}
              >
                +
              </button>
              <div className="h-px w-full bg-[#edf1f6]" />
              <button
                type="button"
                aria-label="Zoom out"
                className="flex h-[68px] w-[68px] items-center justify-center text-[36px] font-light text-[#20242d] transition hover:bg-[#f5f7fb]"
                onClick={zoomOut}
              >
                −
              </button>
            </div>

            <button
              type="button"
              aria-label={userLocation ? "Go to my location" : "Go to campus"}
              className="flex h-[64px] w-[64px] items-center justify-center rounded-[18px] border border-black/5 bg-white/95 text-[#1456f4] shadow-[0_16px_34px_rgba(35,48,79,0.12)] backdrop-blur transition hover:bg-[#f5f7fb]"
              onClick={handleHomeClick}
            >
              <LocateIcon className="h-[28px] w-[28px]" />
            </button>
          </div>

          {sharedMapOverlays}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mapContainerRef} className="absolute inset-0 z-0 h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_55%),radial-gradient(circle_at_bottom,rgba(255,134,88,0.2),transparent_45%)] pointer-events-none" />
      <MapControls
        isAuthenticated={isAuthenticated}
        shareLocation={settings.shareLocation}
        ghostMode={settings.ghostMode}
        publicMode={settings.publicMode}
        isEmbedded={embedded}
        isPlacingPin={isPlacingPin}
        onToggleShare={handleToggleShare}
        onToggleGhost={handleToggleGhost}
        onTogglePublic={handleTogglePublic}
        onToggleCreateEvent={() => setIsPlacingPin((prev) => !prev)}
        showCreateEvent={!showEventForm}
        onLogin={() => openAuthModal("login")}
        onRetry={handleRetry}
        error={error}
        isLoading={isLoading}
      />
      {!showEventsSidebar && (
        <button
          type="button"
          onClick={() => setShowEventsSidebar(true)}
          className={`pointer-events-auto z-30 flex items-center gap-2 rounded-full bg-orange-500 text-white shadow-[0_4px_12px_rgba(255,107,53,0.3)] transition hover:bg-orange-600 ${
            embedded
              ? "absolute bottom-24 left-3 px-4 py-2 text-xs font-semibold"
              : "fixed bottom-6 left-6 px-6 py-3 text-sm font-semibold"
          }`}
        >
          <span className={embedded ? "text-base" : "text-xl"}>📍</span>
          View Events{events.length > 0 ? ` (${events.length})` : ""}
        </button>
      )}
      {isPlacingPin && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(27,26,23,0.25)] animate-bounce">
          📍 Click anywhere on the map to place your event
        </div>
      )}
      <div
        className={`absolute right-4 z-20 flex flex-col gap-2 pointer-events-none ${
          embedded ? "bottom-24" : "bottom-6"
        }`}
      >
        <div className="flex flex-col gap-2 pointer-events-auto">
          <button
            type="button"
            aria-label={userLocation ? "Go to my location" : "Go to campus"}
            className={`flex items-center justify-center rounded-full border border-black/10 bg-white text-[#374151] shadow-[0_2px_8px_rgba(0,0,0,0.12)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-[#F3F4F6] ${
              embedded ? "h-10 w-10" : "h-11 w-11"
            }`}
            onClick={handleHomeClick}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 21h18" />
              <path d="M4 21V9l8-4 8 4v12" />
              <path d="M9 21V12h6v9" />
            </svg>
          </button>
          <div className="mt-2 flex flex-col gap-2">
            <button
              type="button"
              aria-label="Zoom in"
              className={`flex items-center justify-center rounded-full border border-black/10 bg-white text-[#374151] shadow-[0_2px_8px_rgba(0,0,0,0.12)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-[#F3F4F6] ${
                embedded ? "h-10 w-10" : "h-11 w-11"
              }`}
              onClick={zoomIn}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              className={`flex items-center justify-center rounded-full border border-black/10 bg-white text-[#374151] shadow-[0_2px_8px_rgba(0,0,0,0.12)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-[#F3F4F6] ${
                embedded ? "h-10 w-10" : "h-11 w-11"
              }`}
              onClick={zoomOut}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {showEventsSidebar && (
        <EventsSidebar
          events={events}
          onClose={() => setShowEventsSidebar(false)}
          onEventClick={handleEventClickById}
          userLocation={userLocation}
          now={now}
        />
      )}
      {sharedMapOverlays}
    </div>
  );
};
