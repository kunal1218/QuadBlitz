import { Ionicons } from "@expo/vector-icons";
import type { CreateEventRequest, EventWithDetails } from "@lockedin/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { createEvent, getEventDetails, getNearbyEvents, rsvpToEvent } from "../../api/actions";
import { formatError, isAuthError } from "../../lib/errors";
import type { SessionProps } from "../../types/session";

const MAPBOX_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ??
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
  "";

const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";
const DEFAULT_CENTER = { lng: -89.4012, lat: 43.0731, zoom: 14 };

const buildMapHtml = (mapboxToken: string) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
    />
    <link
      href="https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css"
      rel="stylesheet"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #dfe7ef;
      }

      #map {
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js"></script>
    <script>
      mapboxgl.accessToken = "${mapboxToken}";
      const map = new mapboxgl.Map({
        container: "map",
        style: "${MAPBOX_STYLE}",
        center: [${DEFAULT_CENTER.lng}, ${DEFAULT_CENTER.lat}],
        zoom: ${DEFAULT_CENTER.zoom},
        attributionControl: false
      });

      map.touchZoomRotate.enable();
      map.dragRotate.disable();
      map.keyboard.disable();

      let placementMode = false;
      let tempMarker = null;
      const eventMarkers = new Map();

      const categoryIcons = {
        study: "🎓",
        social: "🎉",
        build: "💻",
        sports: "🏀",
        other: "📍"
      };

      const categoryColors = {
        study: "#3b82f6",
        social: "#a855f7",
        build: "#10b981",
        sports: "#f97316",
        other: "#6b7280"
      };

      const setPlacementMode = (nextValue) => {
        placementMode = Boolean(nextValue);
        map.getCanvas().style.cursor = placementMode ? "crosshair" : "";
      };

      const clearTempMarker = () => {
        if (tempMarker) {
          tempMarker.remove();
          tempMarker = null;
        }
      };

      const setTempMarker = (latitude, longitude) => {
        clearTempMarker();
        tempMarker = new mapboxgl.Marker({ color: "#ef4444" })
          .setLngLat([longitude, latitude])
          .addTo(map);
      };

      const getEventStatus = (startTime, endTime) => {
        const now = new Date();
        const start = new Date(startTime);
        const end = new Date(endTime);
        const minutesUntilStart = Math.floor((start.getTime() - now.getTime()) / (1000 * 60));

        if (now >= start && now <= end) {
          return { urgent: true };
        }

        if (minutesUntilStart > 0 && minutesUntilStart <= 30) {
          return { urgent: true };
        }

        return { urgent: false };
      };

      const buildEventMarkerElement = (event) => {
        const wrapper = document.createElement("button");
        wrapper.type = "button";
        wrapper.setAttribute("aria-label", event.title || "Campus event");
        wrapper.style.position = "relative";
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.justifyContent = "center";
        wrapper.style.padding = "0";
        wrapper.style.border = "0";
        wrapper.style.background = "transparent";
        wrapper.style.cursor = "pointer";

        const count = Math.max(0, Number(event.attendee_count || 0));
        const size = 40 + Math.min(20, count);
        const status = getEventStatus(event.start_time, event.end_time);
        const color = categoryColors[event.category] || categoryColors.other;
        const icon = categoryIcons[event.category] || categoryIcons.other;

        if (status.urgent) {
          const halo = document.createElement("span");
          halo.style.position = "absolute";
          halo.style.inset = "-4px";
          halo.style.borderRadius = "999px";
          halo.style.border = "1px solid rgba(244, 63, 94, 0.35)";
          halo.style.background = "rgba(244, 63, 94, 0.12)";
          wrapper.appendChild(halo);
        }

        const bubble = document.createElement("span");
        bubble.textContent = icon;
        bubble.style.width = size + "px";
        bubble.style.height = size + "px";
        bubble.style.display = "flex";
        bubble.style.alignItems = "center";
        bubble.style.justifyContent = "center";
        bubble.style.borderRadius = "999px";
        bubble.style.background = color;
        bubble.style.color = "#ffffff";
        bubble.style.fontSize = "18px";
        bubble.style.boxShadow = "0 8px 20px rgba(0,0,0,0.28)";
        wrapper.appendChild(bubble);

        if (count > 0) {
          const badge = document.createElement("span");
          badge.textContent = String(count);
          badge.style.position = "absolute";
          badge.style.top = "-2px";
          badge.style.right = "-4px";
          badge.style.minWidth = "20px";
          badge.style.height = "20px";
          badge.style.padding = "0 5px";
          badge.style.display = "flex";
          badge.style.alignItems = "center";
          badge.style.justifyContent = "center";
          badge.style.borderRadius = "999px";
          badge.style.background = "#ffffff";
          badge.style.color = "#0f172a";
          badge.style.fontSize = "10px";
          badge.style.fontWeight = "700";
          badge.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
          wrapper.appendChild(badge);
        }

        return wrapper;
      };

      const renderEvents = (events) => {
        const nextIds = new Set(events.map((event) => String(event.id)));

        events.forEach((event) => {
          const markerId = String(event.id);
          const existing = eventMarkers.get(markerId);

          if (existing) {
            existing.setLngLat([event.longitude, event.latitude]);
          } else {
            const element = buildEventMarkerElement(event);
            element.addEventListener("click", function() {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(
                  JSON.stringify({
                    type: "event-marker-pressed",
                    payload: { eventId: event.id }
                  })
                );
              }
            });
            const marker = new mapboxgl.Marker({ element, anchor: "center" })
              .setLngLat([event.longitude, event.latitude])
              .addTo(map);
            eventMarkers.set(markerId, marker);
          }
        });

        eventMarkers.forEach((marker, id) => {
          if (!nextIds.has(id)) {
            marker.remove();
            eventMarkers.delete(id);
          }
        });
      };

      const handleMessage = (rawData) => {
        try {
          const message = JSON.parse(rawData);
          if (message.type === "set-placement-mode") {
            setPlacementMode(message.payload && message.payload.active);
          }
          if (message.type === "clear-temp-marker") {
            clearTempMarker();
            setPlacementMode(false);
          }
          if (message.type === "set-events") {
            renderEvents(message.payload && Array.isArray(message.payload.events) ? message.payload.events : []);
          }
          if (message.type === "focus-map") {
            if (message.payload) {
              map.easeTo({
                center: [message.payload.longitude, message.payload.latitude],
                duration: 700
              });
            }
          }
        } catch (error) {}
      };

      const postCenter = () => {
        if (!window.ReactNativeWebView) {
          return;
        }
        const center = map.getCenter();
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "map-center-changed",
            payload: { latitude: center.lat, longitude: center.lng }
          })
        );
      };

      map.on("click", function(event) {
        if (!placementMode) {
          return;
        }
        placementMode = false;
        map.getCanvas().style.cursor = "";
        const latitude = event.lngLat.lat;
        const longitude = event.lngLat.lng;
        setTempMarker(latitude, longitude);
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: "map-pin-selected",
              payload: { latitude, longitude }
            })
          );
        }
      });

      map.on("load", function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "map-ready" }));
        }
        postCenter();
      });

      map.on("moveend", function() {
        postCenter();
      });

      document.addEventListener("message", function(event) {
        handleMessage(event.data);
      });
      window.addEventListener("message", function(event) {
        handleMessage(event.data);
      });
    </script>
  </body>
</html>
`;

type EventCategory = "all" | "sports" | "study" | "social";

const CATEGORY_ICONS: Record<string, string> = {
  study: "🎓",
  social: "🎉",
  build: "💻",
  sports: "🏀",
  other: "📍",
};

const CATEGORY_COLORS: Record<string, string> = {
  study: "#3b82f6",
  social: "#a855f7",
  build: "#10b981",
  sports: "#f97316",
  other: "#6b7280",
};

const categoryOptions: Array<{ id: EventCategory; label: string }> = [
  { id: "sports", label: "Sports" },
  { id: "study", label: "Study" },
  { id: "social", label: "Social" },
];

const MAX_PANEL_HEIGHT = 276;

const formatEventDistance = (distanceKm?: number | null) => {
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return "Nearby";
  }
  if (distanceKm < 1) {
    return `${Math.max(1, Math.round(distanceKm * 1000))}m away`;
  }
  return `${distanceKm.toFixed(distanceKm >= 10 ? 0 : 1)}km away`;
};

const formatEventDateTime = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const mergeEvent = (current: EventWithDetails[], nextEvent: EventWithDetails) => {
  const existingIndex = current.findIndex((event) => event.id === nextEvent.id);
  if (existingIndex === -1) {
    return [nextEvent, ...current];
  }

  const updated = [...current];
  updated[existingIndex] = {
    ...updated[existingIndex],
    ...nextEvent,
  };
  return updated;
};

const ensureEventDetailsShape = (event: EventWithDetails): EventWithDetails => ({
  ...event,
  creator: event.creator ?? {
    id: event.creator_id,
    name: "Host",
    handle: "@host",
    profile_picture_url: null,
  },
  attendee_count: Number(event.attendee_count ?? 0),
  attendees: Array.isArray(event.attendees) ? event.attendees : [],
  user_status: event.user_status ?? null,
  distance_km: event.distance_km ?? null,
});

const toLocalInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

const parseLocalInputValue = (value: string) => new Date(value.replace(" ", "T"));

export const MapTab = ({ token, user, onAuthExpired }: SessionProps) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<EventCategory>("all");
  const [events, setEvents] = useState<EventWithDetails[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapCenter, setMapCenter] = useState({
    latitude: DEFAULT_CENTER.lat,
    longitude: DEFAULT_CENTER.lng,
  });
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventWithDetails | null>(null);
  const [isDetailModalOpen, setDetailModalOpen] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setDetailLoading] = useState(false);
  const [isRsvping, setRsvping] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const defaultStart = useMemo(() => new Date(Date.now() + 60 * 60 * 1000), []);
  const defaultEnd = useMemo(() => new Date(Date.now() + 2 * 60 * 60 * 1000), []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [createCategory, setCreateCategory] = useState<CreateEventRequest["category"]>("study");
  const [venue, setVenue] = useState("");
  const [startTime, setStartTime] = useState(toLocalInputValue(defaultStart));
  const [endTime, setEndTime] = useState(toLocalInputValue(defaultEnd));
  const [maxAttendees, setMaxAttendees] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends-only">("public");
  const source = useMemo(() => ({ html: buildMapHtml(MAPBOX_TOKEN) }), []);
  const webViewRef = useRef<WebView>(null);
  const panelHeight = useRef(new Animated.Value(0)).current;
  const panelHeightRef = useRef(0);
  const dragStartHeightRef = useRef(0);
  const handleHeight = useMemo(
    () =>
      panelHeight.interpolate({
        inputRange: [0, MAX_PANEL_HEIGHT],
        outputRange: [14, 32],
        extrapolate: "clamp",
      }),
    [panelHeight]
  );
  const handleMarginTop = useMemo(
    () =>
      panelHeight.interpolate({
        inputRange: [0, MAX_PANEL_HEIGHT],
        outputRange: [-2, -4],
        extrapolate: "clamp",
      }),
    [panelHeight]
  );
  const handleBarWidth = useMemo(
    () =>
      panelHeight.interpolate({
        inputRange: [0, MAX_PANEL_HEIGHT],
        outputRange: [34, 42],
        extrapolate: "clamp",
      }),
    [panelHeight]
  );
  const handleBarHeight = useMemo(
    () =>
      panelHeight.interpolate({
        inputRange: [0, MAX_PANEL_HEIGHT],
        outputRange: [4, 5],
        extrapolate: "clamp",
      }),
    [panelHeight]
  );

  useEffect(() => {
    const id = panelHeight.addListener(({ value }) => {
      panelHeightRef.current = value;
    });
    return () => {
      panelHeight.removeListener(id);
    };
  }, [panelHeight]);

  const animatePanelTo = useCallback(
    (toValue: number, velocity = 0) => {
      Animated.spring(panelHeight, {
        toValue,
        velocity,
        stiffness: 180,
        damping: 26,
        mass: 0.9,
        overshootClamping: false,
        restDisplacementThreshold: 0.5,
        restSpeedThreshold: 0.5,
        useNativeDriver: false,
      }).start();
    },
    [panelHeight]
  );

  const handleResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: () => {
          panelHeight.stopAnimation((value) => {
            dragStartHeightRef.current = value;
            panelHeightRef.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextHeight = Math.max(
            0,
            Math.min(MAX_PANEL_HEIGHT, dragStartHeightRef.current + gestureState.dy)
          );
          panelHeight.setValue(nextHeight);
        },
        onPanResponderRelease: (_, gestureState) => {
          const currentHeight = Math.max(
            0,
            Math.min(MAX_PANEL_HEIGHT, dragStartHeightRef.current + gestureState.dy)
          );
          const shouldOpen =
            gestureState.vy > 0.15 ||
            (gestureState.vy > -0.15 && currentHeight > MAX_PANEL_HEIGHT * 0.42);

          animatePanelTo(shouldOpen ? MAX_PANEL_HEIGHT : 0, gestureState.vy);
        },
        onPanResponderTerminate: () => {
          animatePanelTo(panelHeightRef.current > MAX_PANEL_HEIGHT * 0.42 ? MAX_PANEL_HEIGHT : 0);
        },
      }),
    [animatePanelTo, panelHeight]
  );
  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesCategory =
        activeCategory === "all" || event.category === activeCategory;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${event.title} ${event.venue_name ?? ""}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, events, query]);

  const sendMapMessage = useCallback((message: unknown) => {
    const serialized = JSON.stringify(message);
    webViewRef.current?.injectJavaScript(`
      window.postMessage(${JSON.stringify(serialized)}, "*");
      true;
    `);
  }, []);

  const openEventDetails = useCallback(
    async (eventId: number) => {
      setDetailModalOpen(true);
      setDetailError(null);
      setDetailLoading(true);

      const cached = events.find((event) => event.id === eventId) ?? null;
      if (cached) {
        setSelectedEvent(ensureEventDetailsShape(cached));
      } else {
        setSelectedEvent(null);
      }

      try {
        const detailedEvent = await getEventDetails(eventId, token);
        setSelectedEvent(ensureEventDetailsShape(detailedEvent));
        setEvents((current) => mergeEvent(current, detailedEvent));
      } catch (loadError) {
        if (isAuthError(loadError)) {
          onAuthExpired();
          return;
        }
        setDetailError(formatError(loadError));
      } finally {
        setDetailLoading(false);
      }
    },
    [events, onAuthExpired, token]
  );

  const closeEventDetails = useCallback(() => {
    setDetailModalOpen(false);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  const syncVisibleEventsToMap = useCallback(
    (nextEvents: EventWithDetails[]) => {
      if (!mapReady) {
        return;
      }
      sendMapMessage({
        type: "set-events",
        payload: {
          events: nextEvents.map((event) => ({
            id: event.id,
            title: event.title,
            category: event.category,
            latitude: event.latitude,
            longitude: event.longitude,
            attendee_count: event.attendee_count,
            start_time: event.start_time,
            end_time: event.end_time,
          })),
        },
      });
    },
    [mapReady, sendMapMessage]
  );

  useEffect(() => {
    let cancelled = false;

    const loadNearbyEvents = async () => {
      try {
        const nextEvents = await getNearbyEvents(
          mapCenter.latitude,
          mapCenter.longitude,
          5,
          token
        );
        if (!cancelled) {
          setEvents(nextEvents);
        }
      } catch (loadError) {
        if (isAuthError(loadError)) {
          onAuthExpired();
          return;
        }
        if (!cancelled) {
          setEvents([]);
        }
      }
    };

    void loadNearbyEvents();

    return () => {
      cancelled = true;
    };
  }, [mapCenter.latitude, mapCenter.longitude, onAuthExpired, token]);

  useEffect(() => {
    syncVisibleEventsToMap(filteredEvents);
  }, [filteredEvents, syncVisibleEventsToMap]);

  const resetCreateForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setCreateCategory("study");
    setVenue("");
    setStartTime(toLocalInputValue(defaultStart));
    setEndTime(toLocalInputValue(defaultEnd));
    setMaxAttendees("");
    setVisibility("public");
    setFormError(null);
    setSubmitting(false);
  }, [defaultEnd, defaultStart]);

  const closeCreateModal = useCallback(() => {
    setCreateModalOpen(false);
    setSelectedLocation(null);
    setIsPlacingPin(false);
    setFormError(null);
    sendMapMessage({ type: "clear-temp-marker" });
  }, [sendMapMessage]);

  const handleToggleCreateMode = useCallback(() => {
    if (isPlacingPin) {
      setIsPlacingPin(false);
      sendMapMessage({ type: "clear-temp-marker" });
      return;
    }

    setCreateModalOpen(false);
    setSelectedLocation(null);
    setFormError(null);
    setIsPlacingPin(true);
    sendMapMessage({ type: "set-placement-mode", payload: { active: true } });
  }, [isPlacingPin, sendMapMessage]);

  const handleMapMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.type === "map-ready") {
          setMapReady(true);
          return;
        }
        if (message.type === "event-marker-pressed" && message.payload?.eventId) {
          void openEventDetails(Number(message.payload.eventId));
          return;
        }
        if (message.type === "map-center-changed" && message.payload) {
          const latitude = Number(message.payload.latitude);
          const longitude = Number(message.payload.longitude);
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            setMapCenter((current) => {
              const hasMeaningfulChange =
                Math.abs(current.latitude - latitude) > 0.0015 ||
                Math.abs(current.longitude - longitude) > 0.0015;
              return hasMeaningfulChange ? { latitude, longitude } : current;
            });
          }
          return;
        }
        if (message.type === "map-pin-selected" && message.payload) {
          setIsPlacingPin(false);
          setSelectedLocation({
            latitude: Number(message.payload.latitude),
            longitude: Number(message.payload.longitude),
          });
          resetCreateForm();
          setCreateModalOpen(true);
        }
      } catch {
        return;
      }
    },
    [openEventDetails, resetCreateForm]
  );

  const handleEventRsvp = useCallback(
    async (status: "going" | "maybe" | "declined") => {
      if (!selectedEvent) {
        return;
      }

      setRsvping(true);
      setDetailError(null);

      try {
        await rsvpToEvent(selectedEvent.id, status, token);
        const refreshed = await getEventDetails(selectedEvent.id, token);
        setSelectedEvent(ensureEventDetailsShape(refreshed));
        setEvents((current) => mergeEvent(current, refreshed));
      } catch (rsvpError) {
        if (isAuthError(rsvpError)) {
          onAuthExpired();
          return;
        }
        setDetailError(formatError(rsvpError));
      } finally {
        setRsvping(false);
      }
    },
    [onAuthExpired, selectedEvent, token]
  );

  const handleCreateSubmit = useCallback(async () => {
    if (!selectedLocation) {
      setFormError("Pick a location on the map first.");
      return;
    }

    if (!title.trim()) {
      setFormError("Event title is required.");
      return;
    }

    const parsedStart = parseLocalInputValue(startTime);
    const parsedEnd = parseLocalInputValue(endTime);
    if (!Number.isFinite(parsedStart.getTime()) || !Number.isFinite(parsedEnd.getTime())) {
      setFormError("Start and end times are required.");
      return;
    }
    if (parsedStart.getTime() <= Date.now()) {
      setFormError("Start time must be in the future.");
      return;
    }
    if (parsedEnd.getTime() <= parsedStart.getTime()) {
      setFormError("End time must be after start time.");
      return;
    }
    if (maxAttendees) {
      const parsedCapacity = Number(maxAttendees);
      if (!Number.isFinite(parsedCapacity) || parsedCapacity <= 0) {
        setFormError("Max attendees must be a positive number.");
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const payload: CreateEventRequest = {
        title: title.trim(),
        description: description.trim() || undefined,
        category: createCategory,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        venue_name: venue.trim() || undefined,
        start_time: parsedStart.toISOString(),
        end_time: parsedEnd.toISOString(),
        max_attendees: maxAttendees ? Number(maxAttendees) : undefined,
        visibility,
      };

      const createdEvent = await createEvent(payload, token);
      setEvents((current) => {
        const next = [createdEvent, ...current.filter((event) => event.id !== createdEvent.id)];
        return next;
      });
      sendMapMessage({
        type: "focus-map",
        payload: {
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        },
      });
      setCreateModalOpen(false);
      setSelectedLocation(null);
      resetCreateForm();
    } catch (createError) {
      if (isAuthError(createError)) {
        onAuthExpired();
        return;
      }
      setFormError(formatError(createError));
    } finally {
      setSubmitting(false);
    }
  }, [
    createCategory,
    description,
    endTime,
    maxAttendees,
    onAuthExpired,
    resetCreateForm,
    selectedLocation,
    sendMapMessage,
    startTime,
    title,
    token,
    venue,
    visibility,
  ]);

  return (
    <View style={styles.root}>
      <WebView
        ref={webViewRef}
        style={styles.webview}
        source={source}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        onMessage={handleMapMessage}
      />

      <View style={[styles.searchBarOuter, { top: insets.top + 12 }]}>
        <View style={styles.panelShell}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#7e8799" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => animatePanelTo(MAX_PANEL_HEIGHT)}
              placeholder="Search campus events..."
              placeholderTextColor="#9ba3b3"
              style={styles.searchInput}
            />
          </View>

          <Animated.View style={[styles.dropdownPanel, { height: panelHeight }]}>
            <View style={styles.dropdownInner}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
            >
              <Pressable
                onPress={() => setActiveCategory("all")}
                style={[
                  styles.categoryChip,
                  activeCategory === "all" ? styles.categoryChipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    activeCategory === "all" ? styles.categoryChipTextActive : null,
                  ]}
                >
                  All
                </Text>
              </Pressable>
              {categoryOptions.map((category) => {
                const isActive = activeCategory === category.id;
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => setActiveCategory(category.id)}
                    style={[styles.categoryChip, isActive ? styles.categoryChipActive : null]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isActive ? styles.categoryChipTextActive : null,
                      ]}
                    >
                      {category.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Trending Nearby</Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.eventList}
            >
              {filteredEvents.map((event) => (
                <Pressable
                  key={event.id}
                  style={styles.eventCard}
                  onPress={() => {
                    sendMapMessage({
                      type: "focus-map",
                      payload: {
                        latitude: event.latitude,
                        longitude: event.longitude,
                      },
                    });
                    void openEventDetails(event.id);
                  }}
                >
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventMeta}>
                    {event.venue_name ?? "Campus"} • {formatEventDistance(event.distance_km)}
                  </Text>
                </Pressable>
              ))}
              {filteredEvents.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No nearby events found.</Text>
                </View>
              ) : null}
            </ScrollView>
            </View>
          </Animated.View>

          <Animated.View
            style={[styles.handleDock, { height: handleHeight, marginTop: handleMarginTop }]}
            {...handleResponder.panHandlers}
          >
            <Pressable
              onPress={() =>
                animatePanelTo(panelHeightRef.current > MAX_PANEL_HEIGHT * 0.42 ? 0 : MAX_PANEL_HEIGHT)
              }
              style={styles.handleButton}
            >
              <Animated.View
                style={[
                  styles.handleBar,
                  { width: handleBarWidth, height: handleBarHeight },
                ]}
              />
            </Pressable>
          </Animated.View>
        </View>
      </View>

      <Pressable
        onPress={handleToggleCreateMode}
        style={[
          styles.fab,
          { bottom: insets.bottom + 88 },
          isPlacingPin ? styles.fabActive : null,
        ]}
      >
        <Ionicons name={isPlacingPin ? "close" : "add"} size={28} color="#ffffff" />
      </Pressable>

      <Modal
        visible={isDetailModalOpen}
        transparent
        animationType="slide"
        onRequestClose={closeEventDetails}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeEventDetails} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalShell}
          >
            <View style={[styles.modalCard, { paddingBottom: insets.bottom + 18 }]}>
              <View style={styles.modalHeader}>
                <View style={styles.detailHeaderCopy}>
                  <View
                    style={[
                      styles.detailCategoryPill,
                      {
                        backgroundColor: selectedEvent
                          ? CATEGORY_COLORS[selectedEvent.category] ?? CATEGORY_COLORS.other
                          : CATEGORY_COLORS.other,
                      },
                    ]}
                  >
                    <Text style={styles.detailCategoryPillText}>
                      {selectedEvent
                        ? CATEGORY_ICONS[selectedEvent.category] ?? CATEGORY_ICONS.other
                        : CATEGORY_ICONS.other}{" "}
                      {selectedEvent?.category ?? "event"}
                    </Text>
                  </View>
                  <Text style={styles.modalTitle}>
                    {selectedEvent?.title ?? "Event Details"}
                  </Text>
                </View>
                <Pressable style={styles.modalCloseButton} onPress={closeEventDetails}>
                  <Text style={styles.modalCloseLabel}>×</Text>
                </Pressable>
              </View>

              {detailError ? <Text style={styles.modalError}>{detailError}</Text> : null}

              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                keyboardShouldPersistTaps="handled"
              >
                {isDetailLoading && !selectedEvent ? (
                  <View style={styles.detailLoadingCard}>
                    <Text style={styles.detailLoadingText}>Loading event...</Text>
                  </View>
                ) : selectedEvent ? (
                  <>
                    <View style={styles.detailSummaryCard}>
                      <View style={styles.detailStatRow}>
                        <Text style={styles.detailStatLabel}>Host</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedEvent.creator?.name ?? "Host"}
                        </Text>
                      </View>
                      <View style={styles.detailStatRow}>
                        <Text style={styles.detailStatLabel}>Time</Text>
                        <Text style={styles.detailStatValue}>
                          {formatEventDateTime(selectedEvent.start_time)}
                        </Text>
                      </View>
                      <View style={styles.detailStatRow}>
                        <Text style={styles.detailStatLabel}>Ends</Text>
                        <Text style={styles.detailStatValue}>
                          {formatEventDateTime(selectedEvent.end_time)}
                        </Text>
                      </View>
                      <View style={styles.detailStatRow}>
                        <Text style={styles.detailStatLabel}>Venue</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedEvent.venue_name ?? "Campus"}
                        </Text>
                      </View>
                      <View style={styles.detailStatRow}>
                        <Text style={styles.detailStatLabel}>Distance</Text>
                        <Text style={styles.detailStatValue}>
                          {formatEventDistance(selectedEvent.distance_km)}
                        </Text>
                      </View>
                      <View style={styles.detailStatRow}>
                        <Text style={styles.detailStatLabel}>Attendance</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedEvent.attendee_count}
                          {selectedEvent.max_attendees ? ` / ${selectedEvent.max_attendees}` : ""}
                        </Text>
                      </View>
                    </View>

                    {selectedEvent.description ? (
                      <View style={styles.detailDescriptionCard}>
                        <Text style={styles.detailSectionLabel}>About</Text>
                        <Text style={styles.detailDescriptionText}>
                          {selectedEvent.description}
                        </Text>
                      </View>
                    ) : null}

                    {selectedEvent.attendees?.length > 0 ? (
                      <View style={styles.detailDescriptionCard}>
                        <Text style={styles.detailSectionLabel}>Going</Text>
                        <Text style={styles.detailAttendeeText}>
                          {selectedEvent.attendees
                            .slice(0, 8)
                            .map((attendee) => attendee.name)
                            .join(", ")}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.detailLoadingCard}>
                    <Text style={styles.detailLoadingText}>No event selected.</Text>
                  </View>
                )}
              </ScrollView>

              {selectedEvent && selectedEvent.creator?.id !== user.id ? (
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => void handleEventRsvp("maybe")}
                    style={[styles.actionButton, styles.actionButtonSecondary]}
                    disabled={isRsvping}
                  >
                    <Text style={styles.actionButtonSecondaryText}>Maybe</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleEventRsvp("going")}
                    style={[styles.actionButton, styles.actionButtonPrimary]}
                    disabled={isRsvping}
                  >
                    <Text style={styles.actionButtonPrimaryText}>
                      {isRsvping ? "Updating..." : "Join"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={isCreateModalOpen}
        transparent
        animationType="slide"
        onRequestClose={closeCreateModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeCreateModal} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalShell}
          >
            <View style={[styles.modalCard, { paddingBottom: insets.bottom + 18 }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Create Event</Text>
                  {selectedLocation ? (
                    <Text style={styles.modalSubtitle}>
                      Pin set at {selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}
                    </Text>
                  ) : null}
                </View>
                <Pressable style={styles.modalCloseButton} onPress={closeCreateModal}>
                  <Text style={styles.modalCloseLabel}>×</Text>
                </Pressable>
              </View>

              {formError ? <Text style={styles.modalError}>{formError}</Text> : null}

              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Title *</Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Event title"
                    placeholderTextColor="#9ca3af"
                    style={styles.fieldInput}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Description</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Add details (optional)"
                    placeholderTextColor="#9ca3af"
                    style={[styles.fieldInput, styles.fieldTextarea]}
                    multiline
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Category *</Text>
                  <View style={styles.choiceRow}>
                    {(["study", "social", "build", "sports", "other"] as const).map((value) => {
                      const isActive = createCategory === value;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => setCreateCategory(value)}
                          style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
                        >
                          <Text
                            style={[
                              styles.choiceChipText,
                              isActive ? styles.choiceChipTextActive : null,
                            ]}
                          >
                            {value}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Venue</Text>
                  <TextInput
                    value={venue}
                    onChangeText={setVenue}
                    placeholder="Memorial Union"
                    placeholderTextColor="#9ca3af"
                    style={styles.fieldInput}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Start time *</Text>
                  <TextInput
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="YYYY-MM-DD HH:mm"
                    placeholderTextColor="#9ca3af"
                    style={styles.fieldInput}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>End time *</Text>
                  <TextInput
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="YYYY-MM-DD HH:mm"
                    placeholderTextColor="#9ca3af"
                    style={styles.fieldInput}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Max attendees</Text>
                  <TextInput
                    value={maxAttendees}
                    onChangeText={setMaxAttendees}
                    placeholder="Unlimited"
                    placeholderTextColor="#9ca3af"
                    style={styles.fieldInput}
                    keyboardType="number-pad"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Visibility</Text>
                  <View style={styles.choiceRow}>
                    {(["public", "friends-only"] as const).map((value) => {
                      const isActive = visibility === value;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => setVisibility(value)}
                          style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
                        >
                          <Text
                            style={[
                              styles.choiceChipText,
                              isActive ? styles.choiceChipTextActive : null,
                            ]}
                          >
                            {value}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={closeCreateModal}
                  style={[styles.actionButton, styles.actionButtonSecondary]}
                  disabled={isSubmitting}
                >
                  <Text style={styles.actionButtonSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleCreateSubmit()}
                  style={[styles.actionButton, styles.actionButtonPrimary]}
                  disabled={isSubmitting}
                >
                  <Text style={styles.actionButtonPrimaryText}>
                    {isSubmitting ? "Creating..." : "Create event"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#dfe7ef",
  },
  webview: {
    flex: 1,
    backgroundColor: "#dfe7ef",
  },
  searchBarOuter: {
    position: "absolute",
    left: 12,
    right: 12,
  },
  panelShell: {
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.98)",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  searchBar: {
    height: 52,
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    paddingVertical: 0,
  },
  dropdownPanel: {
    overflow: "hidden",
    minHeight: 0,
  },
  dropdownInner: {
    paddingTop: 4,
    paddingBottom: 10,
  },
  handleDock: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  handleButton: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  handleBar: {
    borderRadius: 999,
    backgroundColor: "#cfd6e2",
  },
  fab: {
    position: "absolute",
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1263ff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1263ff",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  fabActive: {
    backgroundColor: "#ef4444",
    shadowColor: "#ef4444",
  },
  categoryRow: {
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    alignItems: "center",
  },
  categoryChip: {
    borderRadius: 999,
    backgroundColor: "#eef2f7",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  categoryChipActive: {
    backgroundColor: "#2164ff",
  },
  categoryChipText: {
    color: "#5f6878",
    fontSize: 14,
    fontWeight: "700",
  },
  categoryChipTextActive: {
    color: "#ffffff",
  },
  dropdownHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  dropdownTitle: {
    color: "#171c24",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  eventList: {
    gap: 10,
    paddingHorizontal: 14,
  },
  eventCard: {
    borderRadius: 18,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  eventTitle: {
    color: "#171c24",
    fontSize: 15,
    fontWeight: "700",
  },
  eventMeta: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 18,
  },
  emptyState: {
    borderRadius: 18,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyStateText: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
  },
  modalShell: {
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "84%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "#faf8f3",
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  modalTitle: {
    color: "#171c24",
    fontSize: 26,
    fontWeight: "800",
  },
  detailHeaderCopy: {
    flex: 1,
    gap: 10,
  },
  detailCategoryPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  detailCategoryPillText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  modalSubtitle: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 4,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d8dde6",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  modalCloseLabel: {
    color: "#4b5563",
    fontSize: 24,
    lineHeight: 24,
  },
  modalError: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  modalBody: {
    flexGrow: 0,
  },
  modalBodyContent: {
    gap: 14,
    paddingBottom: 18,
  },
  detailLoadingCard: {
    borderRadius: 22,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  detailLoadingText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "600",
  },
  detailSummaryCard: {
    borderRadius: 22,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 12,
  },
  detailStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  detailStatLabel: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "700",
  },
  detailStatValue: {
    flex: 1,
    textAlign: "right",
    color: "#171c24",
    fontSize: 14,
    fontWeight: "700",
  },
  detailDescriptionCard: {
    borderRadius: 22,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8,
  },
  detailSectionLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  detailDescriptionText: {
    color: "#334155",
    fontSize: 15,
    lineHeight: 22,
  },
  detailAttendeeText: {
    color: "#334155",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  fieldInput: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d9dee7",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: "#111827",
  },
  fieldTextarea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  choiceChip: {
    borderRadius: 999,
    backgroundColor: "#eef2f7",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  choiceChipActive: {
    backgroundColor: "#2164ff",
  },
  choiceChipText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  choiceChipTextActive: {
    color: "#ffffff",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonSecondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d8dde6",
  },
  actionButtonPrimary: {
    backgroundColor: "#2164ff",
  },
  actionButtonSecondaryText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "700",
  },
  actionButtonPrimaryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
});
