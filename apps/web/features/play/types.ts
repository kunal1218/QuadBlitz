export type PlayCharacterId =
  | "rook"
  | "penguin"
  | "businessman"
  | "dog"
  | "mug";

export type PlayRoomPhase =
  | "lobby"
  | "character_select"
  | "shared_room"
  | "task_reveal";

export type PlayTaskCategory = "weekly" | "daily";

export type PlayTaskPayload = {
  id: string;
  category: PlayTaskCategory;
  text: string;
  hasPlaceholderSlot?: boolean;
  placeholderLabel?: string;
};

export type PlayJudgeDecision = "pass" | "fail";

export type PlayJudgeVerdict = {
  decision: PlayJudgeDecision;
  summary: string;
  feedback: string;
  judgedAt: string;
  model: string;
};

export type PlayVector2 = {
  x: number;
  y: number;
};

export type PlayRoomPlayerState = {
  userId: string;
  name: string;
  handle: string;
  joinedAt: string;
  isHost: boolean;
  selectedCharacter: PlayCharacterId | null;
  selectedAt: string | null;
  position: PlayVector2;
  isReadyAtPedestal: boolean;
  taskSubmission: {
    submittedAt: string | null;
    verdict: PlayJudgeVerdict | null;
  };
};

export type PlayRoomState = {
  roomCode: string;
  hostUserId: string;
  phase: PlayRoomPhase;
  minPlayersToStart: number;
  maxPlayers: number;
  createdAt: string;
  updatedAt: string;
  room: {
    width: number;
    height: number;
    pedestal: {
      x: number;
      y: number;
      interactionRadius: number;
    };
    judge: {
      x: number;
      y: number;
      interactionRadius: number;
    };
  };
  players: PlayRoomPlayerState[];
  selectedTask: PlayTaskPayload | null;
};

export type PlayRoomPositionsState = {
  roomCode: string;
  players: Array<{
    userId: string;
    position: PlayVector2;
  }>;
};

export type PlayRoomChatMessage = {
  id: string;
  roomCode: string;
  userId: string;
  text: string;
  createdAt: string;
  expiresAt: string;
};
