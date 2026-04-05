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

export type PlayRoomPokerArcadeState = {
  status: "idle" | "voting";
  requestedByUserId: string | null;
  requestedAt: string | null;
  acceptedUserIds: string[];
  buyIn: number | null;
  activeTableId: string | null;
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
  lastEnteredAt: string | null;
  lastLeftAt: string | null;
  isHost: boolean;
  isPresent: boolean;
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
  roomId: string;
  roomCode: string;
  roomName: string;
  hostUserId: string;
  phase: PlayRoomPhase;
  minPlayersToStart: number;
  maxPlayers: number;
  createdAt: string;
  updatedAt: string;
  aliveSince: string;
  lastActivityAt: string;
  totalScore: number;
  weeksAlive: number;
  memberCount: number;
  presentCount: number;
  room: {
    width: number;
    height: number;
    wall: {
      height: number;
      boundaryY: number;
      playerMinY: number;
    };
    pedestal: {
      x: number;
      y: number;
      interactionRadius: number;
    };
    judge: {
      x: number;
      y: number;
      interactionRadius: number;
      visible: boolean;
      carriedByUserId: string | null;
    };
    arcade: {
      x: number;
      y: number;
      interactionRadius: number;
      visible: boolean;
      carriedByUserId: string | null;
    };
  };
  players: PlayRoomPlayerState[];
  selectedTask: PlayTaskPayload | null;
  pokerArcade: PlayRoomPokerArcadeState;
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

export type PokerClientState = {
  tableId: string;
  maxSeats: number;
  status: "waiting" | "in_hand" | "showdown";
  street: "preflop" | "flop" | "turn" | "river" | "showdown";
  pot: number;
  community: string[];
  seats: Array<
    | {
        seatIndex: number;
        userId: string;
        name: string;
        handle: string;
        chips: number;
        bet: number;
        status: "active" | "folded" | "all_in" | "out";
        isDealer: boolean;
        cards?: string[];
        showCards?: boolean;
      }
    | null
  >;
  currentPlayerIndex: number | null;
  currentBet: number;
  minRaise: number;
  smallBlindIndex: number | null;
  bigBlindIndex: number | null;
  youSeatIndex: number | null;
  turnStartedAt: string | null;
  turnDurationSeconds: number;
  serverTime: string;
  lastHandResult?: {
    winners: Array<{ userId: string; name: string; amount: number }>;
    totalPot: number;
    isSplit: boolean;
    at: string;
  } | null;
  actions?: {
    canCheck: boolean;
    canCall: boolean;
    canRaise: boolean;
    canBet: boolean;
    callAmount: number;
    minRaise: number;
    maxRaise: number;
  };
  log: Array<{ id: string; text: string }>;
};
