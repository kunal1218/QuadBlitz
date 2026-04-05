export type User = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string;
  collegeName?: string;
  collegeDomain?: string;
  campus?: string;
  year?: string;
  vibes?: string[];
  coins?: number;
};

export type FeedPostType = "text" | "poll" | "prompt" | "update";

export type PollOption = {
  id: string;
  label: string;
  votes: number;
};

export type FeedPost = {
  id: string;
  author: User;
  type: FeedPostType;
  content: string;
  createdAt: string;
  tags?: string[];
  pollOptions?: PollOption[];
  likeCount: number;
  likedByUser?: boolean;
  commentCount?: number;
};

export type FeedComment = {
  id: string;
  postId: string;
  author: User;
  content: string;
  createdAt: string;
  likeCount: number;
  likedByUser?: boolean;
};

export type DailyChallenge = {
  id: string;
  title: string;
  description: string;
  endsAt: string;
  participants: number;
};

export type ChatMessage = {
  id: string;
  author: User;
  message: string;
  createdAt: string;
};

export type RequestCreator = {
  id: string;
  name: string;
  handle: string;
  collegeName?: string | null;
  collegeDomain?: string | null;
};

export type RequestCard = {
  id: string;
  title: string;
  description: string;
  location: string;
  createdAt: string;
  tags: string[];
  urgency?: "low" | "medium" | "high";
  creator: RequestCreator;
  likeCount: number;
  likedByUser?: boolean;
  helpedByUser?: boolean;
  city?: string | null;
  isRemote?: boolean;
};

export type PlayRoomPhase =
  | "lobby"
  | "character_select"
  | "shared_room"
  | "task_reveal";

export type PlayRoomListEntry = {
  roomCode: string;
  roomName: string;
  phase: PlayRoomPhase;
  memberCount: number;
  presentCount: number;
  totalScore: number;
  weeksAlive: number;
  createdAt: string;
  lastEnteredAt: string | null;
  lastLeftAt: string | null;
  lastActivityAt: string;
  hasNewActivity: boolean;
  newActivityCount: number;
  isHost: boolean;
};

export type MapEvent = {
  id: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt?: string;
  category: string;
  attendees: number;
  vibe: string;
};

export type Profile = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatarUrl?: string;
  interests: string[];
  downTo: string[];
  needsHelpWith: string[];
  vibes: string[];
  badges: string[];
};
