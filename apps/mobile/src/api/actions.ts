import type {
  CreateEventRequest,
  EventWithDetails,
  FeedComment,
  FeedPost,
  PollOption,
  RequestCard,
} from "@lockedin/shared";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./client";

export type AuthUser = {
  id: string;
  name: string;
  handle: string;
  email: string;
  collegeName?: string | null;
  collegeDomain?: string | null;
  isAdmin?: boolean;
  coins?: number;
};

export type AuthPayload = {
  user: AuthUser;
  token: string;
};

export type FriendUser = {
  id: string;
  name: string;
  handle: string;
  collegeName?: string | null;
  collegeDomain?: string | null;
};

export type FriendRequest = {
  id: string;
  createdAt: string;
  requester: FriendUser;
  recipient: FriendUser;
};

export type FriendSummary = {
  friends: FriendUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocked: FriendUser[];
};

export type RelationshipStatus =
  | "none"
  | "friends"
  | "incoming"
  | "outgoing"
  | "blocked"
  | "self"
  | "unknown";

export type MessageUser = {
  id: string;
  name: string;
  handle: string;
};

export type DirectMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: MessageUser;
  recipient: MessageUser;
  edited?: boolean;
};

export type ThreadResponse = {
  user: MessageUser;
  messages: DirectMessage[];
};

export type NotificationItem = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  readAt?: string | null;
  actor?: {
    id: string;
    name: string;
    handle: string;
  } | null;
  metadata?: Record<string, unknown> | null;
};

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  category: "Textbooks" | "Electronics" | "Furniture" | "Clothing" | "Other";
  condition: "New" | "Like New" | "Good" | "Fair";
  location?: string | null;
  images: string[];
  status: "active" | "sold";
  seller: {
    id: string;
    username: string;
    name: string;
  };
  createdAt: string;
};

export type MarketplaceUser = {
  id: string;
  name: string;
  handle: string;
};

export type MarketplaceListingSummary = {
  id: string;
  title: string;
  price: number;
  images: string[];
  category: Listing["category"];
  condition: Listing["condition"];
  status: Listing["status"];
};

export type MarketplaceMessage = {
  id: string;
  content: string;
  createdAt: string;
  sender: MarketplaceUser;
  read: boolean;
};

export type MarketplaceConversation = {
  id: string;
  listing: MarketplaceListingSummary;
  buyer: MarketplaceUser;
  seller: MarketplaceUser;
  otherUser: MarketplaceUser;
  lastMessage: MarketplaceMessage | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type UploadableImage = {
  uri: string;
  name?: string;
  type?: string;
};

export const login = async (params: {
  email: string;
  password: string;
}): Promise<AuthPayload> => apiPost<AuthPayload>("/auth/login", params);

export const signup = async (params: {
  name: string;
  email: string;
  password: string;
  handle?: string;
}): Promise<AuthPayload> => apiPost<AuthPayload>("/auth/signup", params);

export const forgotPassword = async (email: string): Promise<void> => {
  await apiPost<{ ok: true }>("/auth/forgot", { email });
};

export const resetPassword = async (
  tokenValue: string,
  password: string
): Promise<void> => {
  await apiPost<{ ok: true }>("/auth/reset", { token: tokenValue, password });
};

export const getMe = async (token: string): Promise<{ user: AuthUser }> =>
  apiGet<{ user: AuthUser }>("/auth/me", token);

export const getProfile = async (): Promise<unknown> => apiGet<unknown>("/profile/me");

export const getPublicProfile = async (
  handle: string,
  token?: string | null,
  mode?: "default" | "compact"
): Promise<unknown> => {
  const params = new URLSearchParams();
  if (mode) {
    params.set("mode", mode);
  }

  const query = params.toString();
  return apiGet<unknown>(
    `/profile/public/${encodeURIComponent(handle)}${query ? `?${query}` : ""}`,
    token
  );
};

export const getProfileLayout = async (
  token: string,
  mode?: "default" | "compact"
): Promise<{ layout: Record<string, unknown> }> => {
  const params = new URLSearchParams();
  if (mode) {
    params.set("mode", mode);
  }

  const query = params.toString();
  return apiGet<{ layout: Record<string, unknown> }>(
    `/profile/layout${query ? `?${query}` : ""}`,
    token
  );
};

export const saveProfileLayout = async (
  token: string,
  payload: {
    positions: Record<string, unknown>;
    mode?: "default" | "compact";
  }
): Promise<{ layout: Record<string, unknown> }> =>
  apiPost<{ layout: Record<string, unknown> }>("/profile/layout", payload, token);

export const getFeed = async (
  sort: "fresh" | "top" = "fresh",
  token?: string | null
): Promise<FeedPost[]> => {
  const response = await apiGet<{ posts: FeedPost[] }>(
    `/feed?sort=${encodeURIComponent(sort)}`,
    token
  );
  return response.posts ?? [];
};

export const getFeedPost = async (
  postId: string,
  token?: string | null
): Promise<FeedPost> => {
  const response = await apiGet<{ post: FeedPost }>(
    `/feed/${encodeURIComponent(postId)}`,
    token
  );
  return response.post;
};

export const createFeedPost = async (
  payload: {
    type: "text" | "poll" | "prompt" | "update";
    content: string;
    tags?: string[];
    pollOptions?: string[];
  },
  token: string
): Promise<FeedPost> => {
  const response = await apiPost<{ post: FeedPost }>("/feed", payload, token);
  return response.post;
};

export const updateFeedPost = async (
  postId: string,
  payload: {
    content: string;
    tags?: string[];
    pollOptions?: string[];
  },
  token: string
): Promise<FeedPost> => {
  const response = await apiPatch<{ post: FeedPost }>(
    `/feed/${encodeURIComponent(postId)}`,
    payload,
    token
  );
  return response.post;
};

export const deleteFeedPost = async (postId: string, token: string): Promise<void> => {
  await apiDelete(`/feed/${encodeURIComponent(postId)}`, token);
};

export const toggleFeedLike = async (
  postId: string,
  token: string
): Promise<{ likeCount: number; liked: boolean }> =>
  apiPost<{ likeCount: number; liked: boolean }>(
    `/feed/${encodeURIComponent(postId)}/like`,
    {},
    token
  );

export const voteOnFeedPollOption = async (
  postId: string,
  optionId: string,
  token: string
): Promise<PollOption[]> => {
  const response = await apiPost<{ options: PollOption[] }>(
    `/feed/${encodeURIComponent(postId)}/poll/${encodeURIComponent(optionId)}/vote`,
    {},
    token
  );
  return response.options ?? [];
};

export const getFeedComments = async (
  postId: string,
  token?: string | null
): Promise<FeedComment[]> => {
  const response = await apiGet<{ comments: FeedComment[] }>(
    `/feed/${encodeURIComponent(postId)}/comments`,
    token
  );
  return response.comments ?? [];
};

export const createFeedComment = async (
  postId: string,
  content: string,
  token: string
): Promise<FeedComment> => {
  const response = await apiPost<{ comment: FeedComment }>(
    `/feed/${encodeURIComponent(postId)}/comments`,
    { content },
    token
  );
  return response.comment;
};

export const updateFeedComment = async (
  commentId: string,
  content: string,
  token: string
): Promise<FeedComment> => {
  const response = await apiPatch<{ comment: FeedComment }>(
    `/feed/comments/${encodeURIComponent(commentId)}`,
    { content },
    token
  );
  return response.comment;
};

export const deleteFeedComment = async (
  commentId: string,
  token: string
): Promise<void> => {
  await apiDelete(`/feed/comments/${encodeURIComponent(commentId)}`, token);
};

export const toggleFeedCommentLike = async (
  commentId: string,
  token: string
): Promise<{ likeCount: number; liked: boolean }> =>
  apiPost<{ likeCount: number; liked: boolean }>(
    `/feed/comments/${encodeURIComponent(commentId)}/like`,
    {},
    token
  );

export const getRequests = async (
  token?: string | null,
  params?: {
    sinceHours?: number;
    order?: "newest" | "oldest";
  }
): Promise<{ requests: RequestCard[]; meta?: { autoPruneActive?: boolean } }> => {
  const query = new URLSearchParams();
  if (params?.sinceHours && Number.isFinite(params.sinceHours)) {
    query.set("sinceHours", String(params.sinceHours));
  }
  if (params?.order) {
    query.set("order", params.order);
  }

  const response = await apiGet<
    | { requests: RequestCard[]; meta?: { autoPruneActive?: boolean } }
    | RequestCard[]
  >(`/requests${query.toString() ? `?${query.toString()}` : ""}`, token);

  if (Array.isArray(response)) {
    return { requests: response };
  }

  return {
    requests: response.requests ?? [],
    meta: response.meta,
  };
};

export const createRequest = async (
  payload: {
    title: string;
    description: string;
    location: string;
    city?: string;
    isRemote?: boolean;
    tags?: string[];
    urgency?: "low" | "medium" | "high";
  },
  token: string
): Promise<RequestCard> => {
  const response = await apiPost<{ request: RequestCard }>("/requests", payload, token);
  return response.request;
};

export const toggleRequestLike = async (
  requestId: string,
  token: string
): Promise<{ likeCount: number; liked: boolean }> =>
  apiPost<{ likeCount: number; liked: boolean }>(
    `/requests/${encodeURIComponent(requestId)}/like`,
    {},
    token
  );

export const helpWithRequest = async (
  requestId: string,
  token: string
): Promise<void> => {
  await apiPost(`/requests/${encodeURIComponent(requestId)}/help`, {}, token);
};

export const unhelpWithRequest = async (
  requestId: string,
  token: string
): Promise<void> => {
  await apiDelete(`/requests/${encodeURIComponent(requestId)}/help`, token);
};

export const deleteRequestById = async (
  requestId: string,
  token: string
): Promise<void> => {
  await apiDelete(`/requests/${encodeURIComponent(requestId)}`, token);
};

export const getFriendSummary = async (token: string): Promise<FriendSummary> =>
  apiGet<FriendSummary>("/friends/summary", token);

export const getFriendRelationship = async (
  handle: string,
  token: string
): Promise<{ status: RelationshipStatus }> =>
  apiGet<{ status: RelationshipStatus }>(
    `/friends/relationship/${encodeURIComponent(handle)}`,
    token
  );

export const sendFriendRequest = async (
  handle: string,
  token: string
): Promise<void> => {
  await apiPost("/friends/requests", { handle }, token);
};

export const acceptFriendRequest = async (
  handle: string,
  token: string
): Promise<void> => {
  await apiPost(`/friends/requests/accept/${encodeURIComponent(handle)}`, {}, token);
};

export const removePendingFriend = async (
  handle: string,
  token: string
): Promise<void> => {
  await apiDelete(`/friends/requests/with/${encodeURIComponent(handle)}`, token);
};

export const removeFriend = async (handle: string, token: string): Promise<void> => {
  await apiDelete(`/friends/${encodeURIComponent(handle)}`, token);
};

export const blockFriend = async (handle: string, token: string): Promise<void> => {
  await apiPost(`/friends/block/${encodeURIComponent(handle)}`, {}, token);
};

export const unblockFriend = async (
  handle: string,
  token: string
): Promise<void> => {
  await apiDelete(`/friends/block/${encodeURIComponent(handle)}`, token);
};

export const getMessagesWithUser = async (
  handle: string,
  token: string
): Promise<ThreadResponse> =>
  apiGet<ThreadResponse>(`/messages/with/${encodeURIComponent(handle)}`, token);

export const sendMessageToUser = async (
  handle: string,
  body: string,
  token: string
): Promise<{ message: DirectMessage }> =>
  apiPost<{ message: DirectMessage }>(
    `/messages/with/${encodeURIComponent(handle)}`,
    { body },
    token
  );

export const updateDirectMessage = async (
  messageId: string,
  body: string,
  token: string
): Promise<{ message: DirectMessage }> =>
  apiPatch<{ message: DirectMessage }>(
    `/messages/${encodeURIComponent(messageId)}`,
    { body },
    token
  );

export const deleteDirectMessage = async (
  messageId: string,
  token: string
): Promise<void> => {
  await apiDelete(`/messages/${encodeURIComponent(messageId)}`, token);
};

export const getNotifications = async (
  token: string
): Promise<{ notifications: NotificationItem[] }> =>
  apiGet<{ notifications: NotificationItem[] }>("/notifications", token);

export const getUnreadNotificationCount = async (
  token: string
): Promise<{ unreadCount: number }> =>
  apiGet<{ unreadCount: number }>("/notifications/unread-count", token);

export const markNotificationsRead = async (token: string): Promise<void> => {
  await apiPost("/notifications/read", {}, token);
};

export const createListing = async (
  data: {
    title: string;
    description: string;
    price: number;
    category: string;
    condition: string;
    images?: string[];
    location?: string;
  },
  token: string
): Promise<Listing> => {
  const response = await apiPost<{ listing: Listing }>(
    "/marketplace/listings",
    data,
    token
  );
  return response.listing;
};

export const fetchListings = async (params?: {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Listing[]> => {
  const queryParams = new URLSearchParams();
  if (params?.category && params.category !== "All") {
    queryParams.append("category", params.category);
  }
  if (params?.search && params.search.trim()) {
    queryParams.append("search", params.search.trim());
  }
  if (typeof params?.limit === "number") {
    queryParams.append("limit", String(params.limit));
  }
  if (typeof params?.offset === "number") {
    queryParams.append("offset", String(params.offset));
  }

  const query = queryParams.toString();
  const response = await apiGet<{ listings: Listing[] }>(
    `/marketplace/listings${query ? `?${query}` : ""}`
  );
  return response.listings ?? [];
};

export const fetchListingById = async (listingId: string): Promise<Listing> => {
  const response = await apiGet<{ listing: Listing }>(
    `/marketplace/listings/${encodeURIComponent(listingId)}`
  );
  return response.listing;
};

export const fetchMyListings = async (token: string): Promise<Listing[]> => {
  const response = await apiGet<{ listings: Listing[] }>(
    "/marketplace/my-listings",
    token
  );
  return response.listings ?? [];
};

export const updateListing = async (
  listingId: string,
  data: {
    title: string;
    description: string;
    price: number;
    category: string;
    condition: string;
    location?: string;
    images?: string[];
  },
  token: string
): Promise<Listing> => {
  const response = await apiPut<{ listing: Listing }>(
    `/marketplace/listings/${encodeURIComponent(listingId)}`,
    data,
    token
  );
  return response.listing;
};

export const updateListingStatus = async (
  listingId: string,
  status: "active" | "sold",
  token: string
): Promise<Listing> => {
  const response = await apiPatch<{ listing: Listing }>(
    `/marketplace/listings/${encodeURIComponent(listingId)}/status`,
    { status },
    token
  );
  return response.listing;
};

export const deleteListing = async (
  listingId: string,
  token: string
): Promise<void> => {
  await apiDelete(`/marketplace/listings/${encodeURIComponent(listingId)}`, token);
};

export const startMarketplaceConversation = async (
  listingId: string,
  content: string,
  token: string
): Promise<{ conversationId: string; message: MarketplaceMessage }> =>
  apiPost<{ conversationId: string; message: MarketplaceMessage }>(
    `/marketplace/listings/${encodeURIComponent(listingId)}/message`,
    { content },
    token
  );

export const getMarketplaceConversations = async (
  token: string
): Promise<MarketplaceConversation[]> => {
  const response = await apiGet<{ conversations: MarketplaceConversation[] }>(
    "/marketplace/conversations",
    token
  );
  return response.conversations ?? [];
};

export const getMarketplaceConversationMessages = async (
  conversationId: string,
  token: string
): Promise<{ conversation: MarketplaceConversation; messages: MarketplaceMessage[] }> =>
  apiGet<{ conversation: MarketplaceConversation; messages: MarketplaceMessage[] }>(
    `/marketplace/conversations/${encodeURIComponent(conversationId)}/messages`,
    token
  );

export const sendMarketplaceMessage = async (
  conversationId: string,
  content: string,
  token: string
): Promise<MarketplaceMessage> => {
  const response = await apiPost<{ message: MarketplaceMessage }>(
    `/marketplace/conversations/${encodeURIComponent(conversationId)}/messages`,
    { content },
    token
  );
  return response.message;
};

export const uploadListingImages = async (
  listingId: string,
  images: UploadableImage[],
  token: string
): Promise<string[]> => {
  if (!images.length) {
    return [];
  }

  const formData = new FormData();
  images.forEach((file, index) => {
    formData.append(
      "images",
      {
        uri: file.uri,
        name: file.name ?? `image-${index + 1}.jpg`,
        type: file.type ?? "image/jpeg",
      } as unknown as Blob
    );
  });

  const response = await apiPost<{ images: string[] }>(
    `/marketplace/listings/${encodeURIComponent(listingId)}/images`,
    formData,
    token
  );

  return response.images ?? [];
};

export const deleteListingImage = async (
  listingId: string,
  imageUrl: string,
  token: string
): Promise<string[]> => {
  const response = await apiDelete<{ images: string[] }>(
    `/marketplace/listings/${encodeURIComponent(listingId)}/images`,
    token,
    { imageUrl }
  );

  return response.images ?? [];
};

export const getNearbyEvents = async (
  latitude: number,
  longitude: number,
  radiusKm = 5,
  token?: string | null
): Promise<EventWithDetails[]> => {
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
    radius: String(radiusKm),
  });
  return apiGet<EventWithDetails[]>(`/events/nearby?${params.toString()}`, token);
};

export const getEventDetails = async (
  eventId: number,
  token?: string | null
): Promise<EventWithDetails> =>
  apiGet<EventWithDetails>(`/events/${eventId}`, token);

export const createEvent = async (
  payload: CreateEventRequest,
  token: string
): Promise<EventWithDetails> => apiPost<EventWithDetails>("/events", payload, token);

export const rsvpToEvent = async (
  eventId: number,
  status: "going" | "maybe" | "declined",
  token: string
): Promise<void> => {
  await apiPost(`/events/${eventId}/rsvp`, { status }, token);
};

export const checkInToEvent = async (eventId: number, token: string): Promise<void> => {
  await apiPost(`/events/${eventId}/checkin`, {}, token);
};

export const updateEvent = async (
  eventId: number,
  payload: Partial<CreateEventRequest>,
  token: string
): Promise<EventWithDetails> =>
  apiPatch<EventWithDetails>(`/events/${eventId}`, payload, token);

export const deleteEvent = async (eventId: number, token: string): Promise<void> => {
  await apiDelete(`/events/${eventId}`, token);
};

export const postMapLocation = async (
  payload: {
    latitude: number;
    longitude: number;
    isPublic?: boolean;
  },
  token: string
): Promise<void> => {
  await apiPost("/map/location", payload, token);
};

export const getFriendLocations = async (token: string): Promise<unknown> =>
  apiGet<unknown>("/map/friends", token);

export const getPublicNearby = async (
  params: { lat: number; lng: number; radiusKm?: number },
  token?: string | null
): Promise<unknown> => {
  const query = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    ...(params.radiusKm ? { radiusKm: String(params.radiusKm) } : {}),
  });
  return apiGet<unknown>(`/map/public-nearby?${query.toString()}`, token);
};

export const patchMapSettings = async (
  payload: { publicMode?: boolean },
  token: string
): Promise<unknown> => apiPatch<unknown>("/map/settings", payload, token);

export const getDailyChallenge = async (token?: string | null): Promise<unknown> =>
  apiGet<unknown>("/challenge/today", token);

export const getChallengeAttempts = async (token: string): Promise<unknown> =>
  apiGet<unknown>("/challenge/attempts", token);

export const submitChallengeAttempt = async (
  imageData: string,
  token: string
): Promise<void> => {
  await apiPost("/challenge/attempts", { imageData }, token);
};

export const getLeaderboard = async (token?: string | null): Promise<unknown> =>
  apiGet<unknown>("/leaderboard", token);

export const getPublicLeaderboard = async (): Promise<unknown> =>
  apiGet<unknown>("/leaderboard/public");

export const getClubs = async (token?: string | null): Promise<unknown> =>
  apiGet<unknown>("/clubs", token);

export const getClub = async (
  clubId: string,
  token?: string | null
): Promise<unknown> => apiGet<unknown>(`/clubs/${encodeURIComponent(clubId)}`, token);

export const createClub = async (payload: unknown, token: string): Promise<unknown> =>
  apiPost<unknown>("/clubs", payload, token);

export const joinClub = async (clubId: string, token: string): Promise<void> => {
  await apiPost(`/clubs/${encodeURIComponent(clubId)}/join`, {}, token);
};

export const leaveClub = async (clubId: string, token: string): Promise<void> => {
  await apiPost(`/clubs/${encodeURIComponent(clubId)}/leave`, {}, token);
};

export const getClubChat = async (clubId: string, token: string): Promise<unknown> =>
  apiGet<unknown>(`/clubs/${encodeURIComponent(clubId)}/chat`, token);

export const postClubChat = async (
  clubId: string,
  body: string,
  token: string
): Promise<unknown> =>
  apiPost<unknown>(`/clubs/${encodeURIComponent(clubId)}/chat`, { body }, token);

export const decideClubApplication = async (
  clubId: string,
  applicantId: string,
  decision: "approve" | "deny",
  token: string
): Promise<void> => {
  await apiPost(
    `/clubs/${encodeURIComponent(clubId)}/applications/${encodeURIComponent(applicantId)}/${decision}`,
    {},
    token
  );
};

export const updateUserBan = async (
  userId: string,
  duration: "24h" | "72h" | "7d" | "unban",
  token: string
): Promise<unknown> =>
  apiPost<unknown>(`/admin/users/${encodeURIComponent(userId)}/ban`, { duration }, token);

export const grantUserCoins = async (
  userId: string,
  amount: number,
  token: string
): Promise<void> => {
  await apiPost(`/admin/users/${encodeURIComponent(userId)}/coins`, { amount }, token);
};
