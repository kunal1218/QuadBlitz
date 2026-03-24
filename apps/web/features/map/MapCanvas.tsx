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

export const MapCanvas = ({
  embedded = false,
  mobileMinimal = false,
}: {
  embedded?: boolean;
  mobileMinimal?: boolean;
}) => {
  const { token, isAuthenticated, openAuthModal, user } = useAuth();
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
  const [, setTempMarker] = useState<mapboxgl.Marker | null>(null);
  const [eventClock, setEventClock] = useState(0);
  const [mapInstanceKey, setMapInstanceKey] = useState(0);
  const now = useMemo(() => {
    void eventClock;
    return new Date();
  }, [eventClock]);
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
          />
        );
      }
    },
    [buildEventTooltip, handleEventClick]
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
    if (!mapRef.current || !isMapReady) {
      return;
    }
    const map = mapRef.current;
    const paddingLeft = showEventsSidebar && window.innerWidth >= 640 ? 400 : 0;
    map.easeTo({
      padding: { left: paddingLeft, right: 0 },
      duration: 300,
    });
  }, [isMapReady, showEventsSidebar]);

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

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mapContainerRef} className="absolute inset-0 z-0 h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_55%),radial-gradient(circle_at_bottom,rgba(255,134,88,0.2),transparent_45%)] pointer-events-none" />
      {!mobileMinimal ? (
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
      ) : null}
      {!mobileMinimal && !showEventsSidebar ? (
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
      ) : null}
      {!mobileMinimal && isPlacingPin ? (
        <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(27,26,23,0.25)] animate-bounce">
          📍 Click anywhere on the map to place your event
        </div>
      ) : null}
      {!mobileMinimal ? (
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
      ) : null}
      {!mobileMinimal && selectedFriend ? (
        <FriendPopup
          friend={selectedFriend}
          onClose={() => setSelectedFriend(null)}
        />
      ) : null}
      {!mobileMinimal && selectedPublicUser ? (
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
      ) : null}
      {!mobileMinimal && showPublicConfirm ? (
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
      ) : null}
      {!mobileMinimal && showEventsSidebar ? (
        <EventsSidebar
          events={events}
          onClose={() => setShowEventsSidebar(false)}
          onEventClick={handleEventClickById}
          userLocation={userLocation}
          now={now}
        />
      ) : null}
      {!mobileMinimal && selectedEvent ? (
        <EventDetailCard
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onRSVP={(status) => handleEventRSVP(selectedEvent.id, status)}
          onDelete={() => handleDeleteEvent(selectedEvent.id)}
        />
      ) : null}
      {!mobileMinimal && showEventForm && newEventLocation ? (
        <EventCreationForm
          location={newEventLocation}
          onClose={closeEventForm}
          onSubmit={handleCreateEvent}
        />
      ) : null}
    </div>
  );
};
