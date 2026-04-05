import { randomUUID } from "crypto";
import { db } from "../db";
import { getRedis } from "../db/redis";
import { ensureUsersTable } from "./authService";

export class PokerError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Suit = "S" | "H" | "D" | "C";
export type CardCode = `${string}${Suit}`;

type PokerStreet = "preflop" | "flop" | "turn" | "river" | "showdown";
type PokerTableStatus = "waiting" | "in_hand" | "showdown";
type PokerPlayerStatus = "active" | "folded" | "all_in" | "out";

type PokerLog = { id: string; text: string };

type PokerHandPayout = {
  userId: string;
  name: string;
  amount: number;
};

type PokerHandResult = {
  winners: PokerHandPayout[];
  totalPot: number;
  isSplit: boolean;
  at: string;
};

type PokerPlayer = {
  userId: string;
  name: string;
  handle: string;
  chips: number;
  seatIndex: number;
  inHand: boolean;
  status: PokerPlayerStatus;
  bet: number;
  totalBet: number;
  cards: CardCode[];
  pendingLeave?: boolean;
  lastSeenAt?: string;
  missedTurns?: number;
  showCards?: boolean;
};

type PokerTable = {
  id: string;
  maxSeats: number;
  seats: Array<PokerPlayer | null>;
  dealerIndex: number;
  smallBlindIndex?: number | null;
  bigBlindIndex?: number | null;
  smallBlind: number;
  bigBlind: number;
  deck: CardCode[];
  community: CardCode[];
  pot: number;
  currentBet: number;
  minRaise: number;
  currentPlayerIndex: number | null;
  pendingActionUserIds: string[];
  street: PokerStreet;
  status: PokerTableStatus;
  handId: string | null;
  log: PokerLog[];
  lastUpdatedAt: string;
  turnStartedAt: string | null;
  lastHandResult?: PokerHandResult | null;
  nextHandAt: string | null;
};

type PokerClientSeat = {
  seatIndex: number;
  userId: string;
  name: string;
  handle: string;
  chips: number;
  bet: number;
  status: PokerPlayerStatus;
  isDealer: boolean;
  cards?: CardCode[];
  showCards?: boolean;
};

export type PokerClientState = {
  tableId: string;
  maxSeats: number;
  status: PokerTableStatus;
  street: PokerStreet;
  pot: number;
  community: CardCode[];
  seats: Array<PokerClientSeat | null>;
  currentPlayerIndex: number | null;
  currentBet: number;
  minRaise: number;
  smallBlindIndex: number | null;
  bigBlindIndex: number | null;
  youSeatIndex: number | null;
  turnStartedAt: string | null;
  turnDurationSeconds: number;
  serverTime: string;
  lastHandResult?: PokerHandResult | null;
  actions?: {
    canCheck: boolean;
    canCall: boolean;
    canRaise: boolean;
    canBet: boolean;
    callAmount: number;
    minRaise: number;
    maxRaise: number;
  };
  log: PokerLog[];
};

export type PokerAction =
  | { action: "fold" }
  | { action: "check" }
  | { action: "call" }
  | { action: "bet"; amount: number }
  | { action: "raise"; amount: number };

type PokerHandRank = {
  category: number;
  tiebreaker: number[];
  label: string;
};

type SidePot = { amount: number; eligibleUserIds: string[] };

type PokerQueueEntry = {
  userId: string;
  name: string;
  handle: string;
  amount: number;
  enqueuedAt: number;
  prepaid?: boolean;
};

const MAX_SEATS = 10;
const MIN_PLAYERS = 2;
const MAX_TABLES = 25;
const MIN_BUYIN = 25;
const POKER_TURN_SECONDS = 20;
const POKER_HAND_PAUSE_MS = 5000;
const SESSION_TTL_SECONDS = 60 * 60 * 6;
const TABLES_KEY = "poker:tables";
const QUEUE_KEY = "poker:queue";
const QUEUE_DATA_KEY = "poker:queue:data";

const memoryTables = new Map<string, PokerTable>();
const memoryPlayerTable = new Map<string, string>();
const memoryTableIds = new Set<string>();
const memoryQueue: PokerQueueEntry[] = [];

const toLog = (text: string): PokerLog => ({ id: randomUUID(), text });

const normalizeHandle = (handle?: string | null) =>
  handle ? handle.replace(/^@/, "") : "";

const getTableKey = (id: string) => `poker:table:${id}`;
const getPlayerKey = (userId: string) => `poker:player:${userId}`;

const readTables = async () => {
  const redis = await getRedis();
  if (redis) {
    return redis.sMembers(TABLES_KEY);
  }
  return Array.from(memoryTableIds);
};

const saveTable = async (table: PokerTable) => {
  table.lastUpdatedAt = new Date().toISOString();
  const redis = await getRedis();
  if (redis) {
    await redis.set(getTableKey(table.id), JSON.stringify(table), {
      EX: SESSION_TTL_SECONDS,
    });
    await redis.sAdd(TABLES_KEY, table.id);
    return;
  }
  memoryTables.set(table.id, table);
  memoryTableIds.add(table.id);
};

const loadTable = async (id: string): Promise<PokerTable | null> => {
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.get(getTableKey(id));
    if (!raw) {
      return null;
    }
    try {
      const table = JSON.parse(raw) as PokerTable;
      if (table.maxSeats < MAX_SEATS) {
        table.maxSeats = MAX_SEATS;
        if (table.seats.length < MAX_SEATS) {
          table.seats = [
            ...table.seats,
            ...Array.from({ length: MAX_SEATS - table.seats.length }, () => null),
          ];
        }
      }
      return table;
    } catch {
      return null;
    }
  }
  const table = memoryTables.get(id) ?? null;
  if (!table) {
    return null;
  }
  if (table.maxSeats < MAX_SEATS) {
    table.maxSeats = MAX_SEATS;
    if (table.seats.length < MAX_SEATS) {
      table.seats = [
        ...table.seats,
        ...Array.from({ length: MAX_SEATS - table.seats.length }, () => null),
      ];
    }
  }
  return table;
};

const loadActiveTables = async () => {
  const tableIds = await readTables();
  const tables: PokerTable[] = [];
  for (const id of tableIds) {
    const table = await loadTable(id);
    if (!table) {
      await removeTableId(id);
      continue;
    }
    if (getPlayers(table).length === 0) {
      await removeTable(id);
      continue;
    }
    tables.push(table);
  }
  return tables;
};

const setPlayerTableId = async (userId: string, tableId: string) => {
  const redis = await getRedis();
  if (redis) {
    await redis.set(getPlayerKey(userId), tableId, { EX: SESSION_TTL_SECONDS });
    return;
  }
  memoryPlayerTable.set(userId, tableId);
};

const getPlayerTableId = async (userId: string): Promise<string | null> => {
  const redis = await getRedis();
  if (redis) {
    const tableId = await redis.get(getPlayerKey(userId));
    return tableId ?? null;
  }
  return memoryPlayerTable.get(userId) ?? null;
};

const clearPlayerTableId = async (userId: string) => {
  const redis = await getRedis();
  if (redis) {
    await redis.del(getPlayerKey(userId));
    return;
  }
  memoryPlayerTable.delete(userId);
};

const removeTableId = async (tableId: string) => {
  const redis = await getRedis();
  if (redis) {
    await redis.sRem(TABLES_KEY, tableId);
  }
  memoryTableIds.delete(tableId);
};

const removeTable = async (tableId: string) => {
  const redis = await getRedis();
  if (redis) {
    await redis.del(getTableKey(tableId));
    await redis.sRem(TABLES_KEY, tableId);
  }
  memoryTables.delete(tableId);
  memoryTableIds.delete(tableId);
};

const getQueuePosition = async (userId: string) => {
  const redis = await getRedis();
  if (redis) {
    const rank = await redis.zRank(QUEUE_KEY, userId);
    return rank === null ? null : rank + 1;
  }
  const index = memoryQueue.findIndex((entry) => entry.userId === userId);
  return index === -1 ? null : index + 1;
};

const getQueueLength = async () => {
  const redis = await getRedis();
  if (redis) {
    return Number(await redis.zCard(QUEUE_KEY));
  }
  return memoryQueue.length;
};

const getQueueEntryData = async (userId: string) => {
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.hGet(QUEUE_DATA_KEY, userId);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as { amount?: number; prepaid?: boolean };
      return {
        amount: Math.max(1, Math.floor(parsed.amount ?? 0)),
        prepaid: Boolean(parsed.prepaid),
      };
    } catch {
      return null;
    }
  }
  const entry = memoryQueue.find((queued) => queued.userId === userId);
  if (!entry) {
    return null;
  }
  return { amount: entry.amount, prepaid: Boolean(entry.prepaid) };
};

const enqueuePlayer = async (entry: PokerQueueEntry) => {
  const redis = await getRedis();
  if (redis) {
    const existingScore = await redis.zScore(QUEUE_KEY, entry.userId);
    if (existingScore === null) {
      await redis.zAdd(QUEUE_KEY, { score: entry.enqueuedAt, value: entry.userId });
    }
    await redis.hSet(
      QUEUE_DATA_KEY,
      entry.userId,
      JSON.stringify({
        name: entry.name,
        handle: entry.handle,
        amount: entry.amount,
        prepaid: Boolean(entry.prepaid),
      })
    );
    const rank = await redis.zRank(QUEUE_KEY, entry.userId);
    return rank === null ? null : rank + 1;
  }

  const existingIndex = memoryQueue.findIndex(
    (queued) => queued.userId === entry.userId
  );
  if (existingIndex >= 0) {
    memoryQueue[existingIndex] = {
      ...memoryQueue[existingIndex],
      name: entry.name,
      handle: entry.handle,
      amount: entry.amount,
      prepaid: entry.prepaid ?? memoryQueue[existingIndex].prepaid,
    };
    return existingIndex + 1;
  }
  memoryQueue.push(entry);
  return memoryQueue.length;
};

const dequeuePlayer = async (userId: string) => {
  const redis = await getRedis();
  if (redis) {
    await redis.zRem(QUEUE_KEY, userId);
    await redis.hDel(QUEUE_DATA_KEY, userId);
    return;
  }
  const index = memoryQueue.findIndex((entry) => entry.userId === userId);
  if (index >= 0) {
    memoryQueue.splice(index, 1);
  }
};

const dequeuePlayerAndRefundIfPrepaid = async (userId: string) => {
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.hGet(QUEUE_DATA_KEY, userId);
    await redis.zRem(QUEUE_KEY, userId);
    await redis.hDel(QUEUE_DATA_KEY, userId);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { amount?: number; prepaid?: boolean };
      if (parsed.prepaid) {
        await refundQueuedAmount(userId, parsed.amount ?? 0);
      }
    } catch {
      return;
    }
    return;
  }
  const index = memoryQueue.findIndex((entry) => entry.userId === userId);
  if (index >= 0) {
    const [entry] = memoryQueue.splice(index, 1);
    if (entry?.prepaid) {
      await refundQueuedAmount(userId, entry.amount);
    }
  }
};

const readQueueEntries = async (limit?: number): Promise<PokerQueueEntry[]> => {
  const redis = await getRedis();
  if (redis) {
    const stop = typeof limit === "number" ? Math.max(0, limit - 1) : -1;
    const entries = await redis.zRangeWithScores(QUEUE_KEY, 0, stop);
    if (!entries.length) {
      return [];
    }
    const ids = entries.map((entry) => entry.value);
    const rawData = await redis.hmGet(QUEUE_DATA_KEY, ids);
    return entries
      .map((entry, index) => {
        const raw = rawData[index];
        if (!raw) {
          return null;
        }
        try {
          const parsed = JSON.parse(raw) as {
            name?: string;
            handle?: string;
            amount?: number;
            prepaid?: boolean;
          };
          return {
            userId: entry.value,
            name: parsed.name ?? "Player",
            handle: normalizeHandle(parsed.handle),
            amount: Math.max(1, Math.floor(parsed.amount ?? 0)),
            enqueuedAt: entry.score,
            prepaid: Boolean(parsed.prepaid),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as PokerQueueEntry[];
  }

  return typeof limit === "number" ? memoryQueue.slice(0, limit) : [...memoryQueue];
};

const createDeck = (): CardCode[] => {
  const suits: Suit[] = ["S", "H", "D", "C"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const deck: CardCode[] = [];
  suits.forEach((suit) => {
    ranks.forEach((rank) => {
      deck.push(`${rank}${suit}` as CardCode);
    });
  });
  return deck;
};

const shuffleDeck = (deck: CardCode[]) => {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
};

const drawCard = (table: PokerTable): CardCode => {
  const card = table.deck.pop();
  if (!card) {
    throw new PokerError("The deck ran out of cards.", 500);
  }
  return card;
};

const parseRank = (card: CardCode) => {
  const rank = card[0];
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  if (rank === "T") return 10;
  return Number(rank);
};

const parseSuit = (card: CardCode) => card[1] as Suit;

const getStraightHigh = (ranks: number[]) => {
  const unique = Array.from(new Set(ranks)).sort((a, b) => b - a);
  if (unique.length < 5) return null;
  if (unique.includes(14)) {
    unique.push(1);
  }
  let run = 1;
  for (let i = 0; i < unique.length - 1; i += 1) {
    if (unique[i] - 1 === unique[i + 1]) {
      run += 1;
      if (run >= 5) {
        return unique[i - 3];
      }
    } else {
      run = 1;
    }
  }
  return null;
};

const evaluateFiveCardHand = (cards: CardCode[]): PokerHandRank => {
  const ranks = cards.map(parseRank).sort((a, b) => b - a);
  const suits = cards.map(parseSuit);
  const isFlush = suits.every((suit) => suit === suits[0]);
  const straightHigh = getStraightHigh(ranks);

  const counts = new Map<number, number>();
  ranks.forEach((rank) => counts.set(rank, (counts.get(rank) ?? 0) + 1));
  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (isFlush && straightHigh) {
    return { category: 8, tiebreaker: [straightHigh], label: "Straight Flush" };
  }

  if (groups[0][1] === 4) {
    const kicker = groups.find(([, count]) => count === 1)?.[0] ?? 0;
    return {
      category: 7,
      tiebreaker: [groups[0][0], kicker],
      label: "Four of a Kind",
    };
  }

  if (groups[0][1] === 3 && groups[1]?.[1] === 2) {
    return {
      category: 6,
      tiebreaker: [groups[0][0], groups[1][0]],
      label: "Full House",
    };
  }

  if (isFlush) {
    return { category: 5, tiebreaker: ranks, label: "Flush" };
  }

  if (straightHigh) {
    return { category: 4, tiebreaker: [straightHigh], label: "Straight" };
  }

  if (groups[0][1] === 3) {
    const kickers = groups.filter(([, count]) => count === 1).map(([rank]) => rank);
    return {
      category: 3,
      tiebreaker: [groups[0][0], ...kickers],
      label: "Three of a Kind",
    };
  }

  if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const highPair = Math.max(groups[0][0], groups[1][0]);
    const lowPair = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups.find(([, count]) => count === 1)?.[0] ?? 0;
    return {
      category: 2,
      tiebreaker: [highPair, lowPair, kicker],
      label: "Two Pair",
    };
  }

  if (groups[0][1] === 2) {
    const kickers = groups.filter(([, count]) => count === 1).map(([rank]) => rank);
    return {
      category: 1,
      tiebreaker: [groups[0][0], ...kickers],
      label: "One Pair",
    };
  }

  return { category: 0, tiebreaker: ranks, label: "High Card" };
};

const compareHands = (a: PokerHandRank, b: PokerHandRank) => {
  if (a.category !== b.category) {
    return a.category - b.category;
  }
  const max = Math.max(a.tiebreaker.length, b.tiebreaker.length);
  for (let i = 0; i < max; i += 1) {
    const diff = (a.tiebreaker[i] ?? 0) - (b.tiebreaker[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
};

const evaluateBestHand = (cards: CardCode[]): PokerHandRank => {
  if (cards.length < 5) {
    return {
      category: 0,
      tiebreaker: cards.map(parseRank).sort((a, b) => b - a),
      label: "High Card",
    };
  }
  let best: PokerHandRank | null = null;
  for (let i = 0; i < cards.length - 4; i += 1) {
    for (let j = i + 1; j < cards.length - 3; j += 1) {
      for (let k = j + 1; k < cards.length - 2; k += 1) {
        for (let l = k + 1; l < cards.length - 1; l += 1) {
          for (let m = l + 1; m < cards.length; m += 1) {
            const hand = evaluateFiveCardHand([
              cards[i],
              cards[j],
              cards[k],
              cards[l],
              cards[m],
            ]);
            if (!best || compareHands(hand, best) > 0) {
              best = hand;
            }
          }
        }
      }
    }
  }
  return best ?? evaluateFiveCardHand(cards.slice(0, 5));
};

const createTable = (smallBlind: number, bigBlind: number): PokerTable => {
  const id = randomUUID();
  return {
    id,
    maxSeats: MAX_SEATS,
    seats: Array.from({ length: MAX_SEATS }, () => null),
    dealerIndex: -1,
    smallBlindIndex: null,
    bigBlindIndex: null,
    smallBlind,
    bigBlind,
    deck: [],
    community: [],
    pot: 0,
    currentBet: 0,
    minRaise: bigBlind,
    currentPlayerIndex: null,
    pendingActionUserIds: [],
    street: "preflop",
    status: "waiting",
    handId: null,
    log: [toLog("Table created.")],
    lastUpdatedAt: new Date().toISOString(),
    turnStartedAt: null,
    lastHandResult: null,
    nextHandAt: null,
  };
};

const getAvailableSeatIndex = (table: PokerTable) =>
  table.seats.findIndex((seat) => seat === null);

const getPlayers = (table: PokerTable) =>
  table.seats.filter(Boolean) as PokerPlayer[];

const getActivePlayers = (table: PokerTable) =>
  getPlayers(table).filter(
    (player) => player.inHand && player.status !== "folded"
  );

const getEligiblePlayers = (table: PokerTable) =>
  getPlayers(table).filter((player) => player.chips > 0);

const getPlayerById = (table: PokerTable, userId: string) =>
  getPlayers(table).find((player) => player.userId === userId) ?? null;

const getSeatIndexByUserId = (table: PokerTable, userId: string) => {
  const player = getPlayerById(table, userId);
  return player ? player.seatIndex : null;
};

const markPlayerSeen = (table: PokerTable, userId: string) => {
  const player = getPlayerById(table, userId);
  if (!player) {
    return false;
  }
  player.lastSeenAt = new Date().toISOString();
  return true;
};

const nextOccupiedIndex = (table: PokerTable, fromIndex: number) => {
  for (let offset = 1; offset <= table.maxSeats; offset += 1) {
    const index = (fromIndex + offset) % table.maxSeats;
    const player = table.seats[index];
    if (player && player.chips > 0) {
      return index;
    }
  }
  return null;
};

const nextActiveIndex = (table: PokerTable, fromIndex: number) => {
  for (let offset = 1; offset <= table.maxSeats; offset += 1) {
    const index = (fromIndex + offset) % table.maxSeats;
    const player = table.seats[index];
    if (player && player.inHand && player.status === "active") {
      return index;
    }
  }
  return null;
};

const nextPendingIndex = (table: PokerTable, fromIndex: number) => {
  for (let offset = 1; offset <= table.maxSeats; offset += 1) {
    const index = (fromIndex + offset) % table.maxSeats;
    const player = table.seats[index];
    if (
      player &&
      player.inHand &&
      player.status === "active" &&
      table.pendingActionUserIds.includes(player.userId)
    ) {
      return index;
    }
  }
  return null;
};

const getBlindIndexes = (table: PokerTable) => {
  const activeSeats = getEligiblePlayers(table).map((player) => player.seatIndex);
  if (activeSeats.length === 2) {
    const dealerIndex = table.dealerIndex;
    const otherIndex = activeSeats.find((seat) => seat !== dealerIndex) ?? dealerIndex;
    return { smallBlindIndex: dealerIndex, bigBlindIndex: otherIndex };
  }

  const smallBlindIndex = nextOccupiedIndex(table, table.dealerIndex ?? -1);
  if (smallBlindIndex === null) {
    return { smallBlindIndex: null, bigBlindIndex: null };
  }
  const bigBlindIndex = nextOccupiedIndex(table, smallBlindIndex);
  return { smallBlindIndex, bigBlindIndex };
};

const resetBets = (table: PokerTable) => {
  getPlayers(table).forEach((player) => {
    player.bet = 0;
  });
};

const updatePendingActions = (table: PokerTable, raiserId?: string) => {
  const activePlayers = getPlayers(table).filter(
    (player) => player.inHand && player.status === "active"
  );
  if (raiserId) {
    table.pendingActionUserIds = activePlayers
      .filter((player) => player.userId !== raiserId)
      .map((player) => player.userId);
    return;
  }
  table.pendingActionUserIds = activePlayers.map((player) => player.userId);
};

const getCallAmount = (table: PokerTable, player: PokerPlayer) =>
  Math.max(0, table.currentBet - player.bet);

const postBlind = (table: PokerTable, seatIndex: number, amount: number) => {
  const player = table.seats[seatIndex];
  if (!player) {
    return;
  }
  const blind = Math.min(player.chips, amount);
  player.chips -= blind;
  player.bet += blind;
  player.totalBet += blind;
  table.pot += blind;
  if (player.chips === 0) {
    player.status = "all_in";
  }
};

const startHand = (table: PokerTable) => {
  const eligiblePlayers = getEligiblePlayers(table);
  if (eligiblePlayers.length < MIN_PLAYERS) {
    table.status = "waiting";
    table.smallBlindIndex = null;
    table.bigBlindIndex = null;
    table.turnStartedAt = null;
    return;
  }

  const nextDealer = nextOccupiedIndex(table, table.dealerIndex ?? -1);
  table.dealerIndex = nextDealer ?? eligiblePlayers[0].seatIndex;
  table.handId = randomUUID();
  table.status = "in_hand";
  table.nextHandAt = null;
  table.street = "preflop";
  table.community = [];
  table.deck = createDeck();
  shuffleDeck(table.deck);
  table.pot = 0;
  table.currentBet = 0;
  table.minRaise = table.bigBlind;

  table.seats.forEach((seat) => {
    if (!seat) {
      return;
    }
    seat.inHand = seat.chips > 0;
    seat.status = seat.inHand ? "active" : "out";
    seat.bet = 0;
    seat.totalBet = 0;
    seat.showCards = false;
    seat.cards = seat.inHand ? [drawCard(table), drawCard(table)] : [];
  });

  const { smallBlindIndex, bigBlindIndex } = getBlindIndexes(table);
  if (smallBlindIndex === null || bigBlindIndex === null) {
    table.status = "waiting";
    table.smallBlindIndex = null;
    table.bigBlindIndex = null;
    return;
  }
  table.smallBlindIndex = smallBlindIndex;
  table.bigBlindIndex = bigBlindIndex;

  postBlind(table, smallBlindIndex, table.smallBlind);
  postBlind(table, bigBlindIndex, table.bigBlind);

  table.currentBet = Math.max(
    table.seats[smallBlindIndex]?.bet ?? 0,
    table.seats[bigBlindIndex]?.bet ?? 0
  );
  table.minRaise = table.bigBlind;
  updatePendingActions(table);

  const headsUp = getEligiblePlayers(table).length === 2;
  const firstToAct = headsUp
    ? table.dealerIndex
    : nextActiveIndex(table, bigBlindIndex);
  table.currentPlayerIndex = firstToAct ?? table.dealerIndex;
  table.turnStartedAt = new Date().toISOString();

  table.log.push(toLog(`New hand started.`));
  table.log.push(toLog(`Dealer is seat ${table.dealerIndex + 1}.`));

  if (allPlayersAllIn(table)) {
    dealToShowdown(table);
    concludeHand(table);
  }
};

const advanceStreet = (table: PokerTable) => {
  if (table.street === "preflop") {
    const flop = [drawCard(table), drawCard(table), drawCard(table)];
    table.community.push(...flop);
    table.street = "flop";
    table.log.push(toLog(`Flop: ${flop.join(" ")}.`));
  } else if (table.street === "flop") {
    const turn = drawCard(table);
    table.community.push(turn);
    table.street = "turn";
    table.log.push(toLog(`Turn: ${turn}.`));
  } else if (table.street === "turn") {
    const river = drawCard(table);
    table.community.push(river);
    table.street = "river";
    table.log.push(toLog(`River: ${river}.`));
  }

  resetBets(table);
  table.currentBet = 0;
  table.minRaise = table.bigBlind;
  updatePendingActions(table);

  const nextIndex = nextActiveIndex(table, table.dealerIndex);
  table.currentPlayerIndex = nextIndex ?? table.dealerIndex;
  table.turnStartedAt = table.currentPlayerIndex !== null ? new Date().toISOString() : null;
};

const allPlayersAllIn = (table: PokerTable) => {
  const active = getActivePlayers(table);
  return active.length > 0 && active.every((player) => player.status === "all_in");
};

const dealToShowdown = (table: PokerTable) => {
  while (table.street !== "river") {
    advanceStreet(table);
  }
  table.street = "showdown";
};

const buildSidePots = (players: PokerPlayer[]): SidePot[] => {
  const eligible = players.filter((player) => player.totalBet > 0);
  if (!eligible.length) {
    return [];
  }
  const sorted = [...eligible].sort((a, b) => a.totalBet - b.totalBet);
  const uniqueLevels = Array.from(new Set(sorted.map((player) => player.totalBet)));
  let remaining = [...eligible];
  let previous = 0;
  const pots: SidePot[] = [];

  uniqueLevels.forEach((level) => {
    const increment = level - previous;
    const potAmount = increment * remaining.length;
    const eligibleUserIds = remaining
      .filter((player) => player.status !== "folded")
      .map((player) => player.userId);
    pots.push({ amount: potAmount, eligibleUserIds });
    remaining = remaining.filter((player) => player.totalBet > level);
    previous = level;
  });

  return pots;
};

const distributePot = (
  table: PokerTable,
  pot: SidePot,
  winners: PokerPlayer[],
  payouts?: Map<string, PokerHandPayout>
) => {
  if (!winners.length || pot.amount <= 0) {
    return;
  }
  const split = Math.floor(pot.amount / winners.length);
  const remainder = pot.amount - split * winners.length;
  winners.forEach((winner) => {
    winner.chips += split;
    if (payouts) {
      const existing = payouts.get(winner.userId);
      if (existing) {
        existing.amount += split;
      } else {
        payouts.set(winner.userId, {
          userId: winner.userId,
          name: winner.name,
          amount: split,
        });
      }
    }
  });
  if (remainder > 0) {
    const orderedWinners = [...winners].sort(
      (a, b) => a.seatIndex - b.seatIndex
    );
    orderedWinners[0].chips += remainder;
    if (payouts) {
      const existing = payouts.get(orderedWinners[0].userId);
      if (existing) {
        existing.amount += remainder;
      } else {
        payouts.set(orderedWinners[0].userId, {
          userId: orderedWinners[0].userId,
          name: orderedWinners[0].name,
          amount: remainder,
        });
      }
    }
  }
};

const resolveShowdown = (table: PokerTable) => {
  table.street = "showdown";
  const players = getPlayers(table);
  const activePlayers = players.filter((player) => player.status !== "folded");
  const totalPot = table.pot;
  const payouts = new Map<string, PokerHandPayout>();
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    winner.chips += table.pot;
    payouts.set(winner.userId, {
      userId: winner.userId,
      name: winner.name,
      amount: table.pot,
    });
    table.log.push(toLog(`${winner.name} wins ${table.pot}.`));
    table.pot = 0;
    table.lastHandResult = {
      winners: Array.from(payouts.values()),
      totalPot,
      isSplit: false,
      at: new Date().toISOString(),
    };
    return;
  }

  const pots = buildSidePots(players);
  if (!pots.length) {
    return;
  }

  pots.forEach((pot) => {
    const eligiblePlayers = players.filter((player) =>
      pot.eligibleUserIds.includes(player.userId)
    );
    const hands = eligiblePlayers.map((player) => ({
      player,
      hand: evaluateBestHand([...player.cards, ...table.community]),
    }));
    let best: PokerHandRank | null = null;
    hands.forEach(({ hand }) => {
      if (!best || compareHands(hand, best) > 0) {
        best = hand;
      }
    });
    const winners = hands
      .filter(({ hand }) => best && compareHands(hand, best) === 0)
      .map(({ player }) => player);
    distributePot(table, pot, winners, payouts);
    if (winners.length === 1) {
      table.log.push(toLog(`${winners[0].name} wins ${pot.amount}.`));
    } else {
      table.log.push(
        toLog(`Split pot (${pot.amount}) between ${winners.map((w) => w.name).join(", ")}.`)
      );
    }
  });

  table.pot = 0;
  if (payouts.size > 0) {
    table.lastHandResult = {
      winners: Array.from(payouts.values()),
      totalPot,
      isSplit: payouts.size > 1,
      at: new Date().toISOString(),
    };
  }
};

const concludeHand = (table: PokerTable) => {
  resolveShowdown(table);
  table.status = "waiting";
  table.handId = null;
  table.currentPlayerIndex = null;
  table.turnStartedAt = null;
  table.pendingActionUserIds = [];
  table.currentBet = 0;
  table.minRaise = table.bigBlind;
  table.smallBlindIndex = null;
  table.bigBlindIndex = null;

  table.seats = table.seats.map((seat) => {
    if (!seat) {
      return null;
    }
    if (seat.pendingLeave) {
      return null;
    }
    return seat;
  });

  table.seats.forEach((seat) => {
    if (!seat) {
      return;
    }
    seat.pendingLeave = undefined;
    seat.inHand = false;
    seat.bet = 0;
    seat.totalBet = 0;
    seat.status = seat.chips > 0 ? "active" : "out";
  });

  const eligible = getEligiblePlayers(table);
  if (eligible.length >= MIN_PLAYERS) {
    table.nextHandAt = new Date(Date.now() + POKER_HAND_PAUSE_MS).toISOString();
  } else {
    table.nextHandAt = null;
  }
};

const maybeAwardIfSingle = (table: PokerTable) => {
  const active = getActivePlayers(table);
  if (active.length === 1) {
    const winner = active[0];
    const potAmount = table.pot;
    winner.chips += potAmount;
    table.log.push(toLog(`${winner.name} wins ${potAmount}.`));
    table.lastHandResult = {
      winners: [
        {
          userId: winner.userId,
          name: winner.name,
          amount: potAmount,
        },
      ],
      totalPot: potAmount,
      isSplit: false,
      at: new Date().toISOString(),
    };
    table.pot = 0;
    concludeHand(table);
    return true;
  }
  return false;
};

const applyPlayerAction = (table: PokerTable, player: PokerPlayer, action: PokerAction) => {
  const callAmount = getCallAmount(table, player);
  if (action.action === "fold") {
    player.status = "folded";
    table.pendingActionUserIds = table.pendingActionUserIds.filter(
      (id) => id !== player.userId
    );
    table.log.push(toLog(`${player.name} folds.`));
    return;
  }

  if (action.action === "check") {
    if (callAmount > 0) {
      throw new PokerError("You cannot check when facing a bet.", 400);
    }
    table.pendingActionUserIds = table.pendingActionUserIds.filter(
      (id) => id !== player.userId
    );
    table.log.push(toLog(`${player.name} checks.`));
    return;
  }

  if (action.action === "call") {
    const toCall = Math.min(callAmount, player.chips);
    player.chips -= toCall;
    player.bet += toCall;
    player.totalBet += toCall;
    table.pot += toCall;
    if (player.chips === 0) {
      player.status = "all_in";
    }
    table.pendingActionUserIds = table.pendingActionUserIds.filter(
      (id) => id !== player.userId
    );
    table.log.push(toLog(`${player.name} calls ${toCall}.`));
    return;
  }

  if (action.action === "bet" || action.action === "raise") {
    const amount = action.amount;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new PokerError("Enter a valid bet amount.", 400);
    }
    if (action.action === "bet" && table.currentBet > 0) {
      throw new PokerError("You cannot bet after a raise. Try calling or raising.", 400);
    }
    if (action.action === "raise" && table.currentBet === 0) {
      throw new PokerError("You cannot raise without a bet.", 400);
    }

    const total = callAmount + amount;
    const wager = Math.min(total, player.chips);
    player.chips -= wager;
    player.bet += wager;
    player.totalBet += wager;
    table.pot += wager;

    if (player.chips === 0) {
      player.status = "all_in";
    }

    if (player.bet <= table.currentBet) {
      table.pendingActionUserIds = table.pendingActionUserIds.filter(
        (id) => id !== player.userId
      );
      table.log.push(toLog(`${player.name} calls all-in for ${wager}.`));
      return;
    }

    if (player.bet > table.currentBet) {
      const raiseAmount = player.bet - table.currentBet;
      if (raiseAmount >= table.minRaise) {
        table.minRaise = raiseAmount;
      }
      table.currentBet = player.bet;
      updatePendingActions(table, player.userId);
    }

    table.log.push(
      toLog(
        `${player.name} ${action.action === "bet" ? "bets" : "raises"} ${wager}.`
      )
    );
    return;
  }
};

const ensureBettingRound = (table: PokerTable) => {
  if (allPlayersAllIn(table)) {
    dealToShowdown(table);
    concludeHand(table);
    return { advanced: true };
  }

  if (!table.pendingActionUserIds.length) {
    if (table.street === "river") {
      table.street = "showdown";
      concludeHand(table);
      return { advanced: true };
    }
    advanceStreet(table);
    return { advanced: true };
  }

  return { advanced: false };
};

const updateCurrentPlayer = (table: PokerTable, fromIndex: number) => {
  const nextIndex = nextPendingIndex(table, fromIndex);
  table.currentPlayerIndex = nextIndex;
  table.turnStartedAt = nextIndex !== null ? new Date().toISOString() : null;
};

const ensureTurnState = (table: PokerTable) => {
  if (table.status !== "in_hand") {
    return false;
  }
  let changed = false;
  const filteredPending = table.pendingActionUserIds.filter((id) => {
    const player = getPlayerById(table, id);
    return Boolean(player && player.inHand && player.status === "active");
  });
  if (filteredPending.length !== table.pendingActionUserIds.length) {
    table.pendingActionUserIds = filteredPending;
    changed = true;
  }
  if (!table.pendingActionUserIds.length) {
    return changed;
  }
  const currentSeat =
    table.currentPlayerIndex !== null ? table.seats[table.currentPlayerIndex] : null;
  const isCurrentValid =
    currentSeat &&
    currentSeat.inHand &&
    currentSeat.status === "active" &&
    table.pendingActionUserIds.includes(currentSeat.userId);
  if (!isCurrentValid) {
    const fromIndex =
      table.currentPlayerIndex !== null ? table.currentPlayerIndex : table.dealerIndex ?? -1;
    updateCurrentPlayer(table, fromIndex);
    changed = true;
  } else if (!table.turnStartedAt) {
    table.turnStartedAt = new Date().toISOString();
    changed = true;
  }
  return changed;
};

const handleTurnTimeout = async (table: PokerTable) => {
  if (table.status !== "in_hand") {
    return false;
  }
  if (table.currentPlayerIndex === null || !table.turnStartedAt) {
    return false;
  }
  const startedMs = Date.parse(table.turnStartedAt);
  if (!Number.isFinite(startedMs)) {
    return false;
  }
  const elapsedSeconds = (Date.now() - startedMs) / 1000;
  if (elapsedSeconds < POKER_TURN_SECONDS) {
    return false;
  }

  const player = table.seats[table.currentPlayerIndex];
  if (!player) {
    updateCurrentPlayer(table, table.currentPlayerIndex);
    return true;
  }
  if (!player.inHand || player.status !== "active") {
    updateCurrentPlayer(table, player.seatIndex);
    return true;
  }

  player.missedTurns = (player.missedTurns ?? 0) + 1;
  table.log.push(toLog(`${player.name} timed out.`));

  if (player.missedTurns >= 2) {
    await refundPlayerChips(player);
    removePlayerFromTable(table, player, `${player.name} left the table (AFK).`);
    return true;
  }

  applyPlayerAction(table, player, { action: "fold" });

  if (!maybeAwardIfSingle(table)) {
    const roundResult = ensureBettingRound(table);
    if (
      !roundResult.advanced &&
      table.status === "in_hand" &&
      table.pendingActionUserIds.length
    ) {
      updateCurrentPlayer(table, player.seatIndex);
    }
  }

  return true;
};

const maybeStartNextHand = (table: PokerTable, nowMs: number) => {
  if (table.status !== "waiting") {
    return false;
  }
  const eligible = getEligiblePlayers(table);
  if (eligible.length < MIN_PLAYERS) {
    table.nextHandAt = null;
    return false;
  }
  if (!table.nextHandAt) {
    return false;
  }
  const nextAtMs = Date.parse(table.nextHandAt);
  if (!Number.isFinite(nextAtMs) || nowMs < nextAtMs) {
    return false;
  }
  startHand(table);
  return true;
};

const removePlayerFromTable = (table: PokerTable, player: PokerPlayer, reason: string) => {
  const wasCurrent = table.currentPlayerIndex === player.seatIndex;

  if (table.status === "in_hand" && player.inHand) {
    player.pendingLeave = true;
    if (player.status !== "folded") {
      player.status = "folded";
    }
    table.pendingActionUserIds = table.pendingActionUserIds.filter(
      (id) => id !== player.userId
    );
    table.log.push(toLog(reason));

    if (!maybeAwardIfSingle(table)) {
      const roundResult = ensureBettingRound(table);
      if (
        !roundResult.advanced &&
        table.status === "in_hand" &&
        table.pendingActionUserIds.length
      ) {
        updateCurrentPlayer(table, player.seatIndex);
      }
    }
  } else {
    table.seats[player.seatIndex] = null;
    table.log.push(toLog(reason));
  }

  if (wasCurrent && table.currentPlayerIndex === player.seatIndex) {
    updateCurrentPlayer(table, player.seatIndex);
  }
};

const buildClientState = (table: PokerTable, userId: string): PokerClientState => {
  const youSeatIndex = getSeatIndexByUserId(table, userId);
  const youSeat = youSeatIndex !== null ? table.seats[youSeatIndex] : null;
  const shouldHideSeat = (seat: PokerPlayer) =>
    (seat.pendingLeave && seat.status !== "all_in") ||
    seat.status === "out" ||
    (seat.chips <= 0 && !seat.inHand);
  const hideYouSeat = youSeat ? shouldHideSeat(youSeat) : false;
  const seats: Array<PokerClientSeat | null> = table.seats.map((seat, index) => {
    if (!seat) {
      return null;
    }
    if (shouldHideSeat(seat)) {
      return null;
    }
    const revealToTable = table.status !== "in_hand" && Boolean(seat.showCards);
    const showCards = seat.userId === userId || revealToTable;
    return {
      seatIndex: index,
      userId: seat.userId,
      name: seat.name,
      handle: seat.handle,
      chips: seat.chips,
      bet: seat.bet,
      status: seat.status,
      isDealer: index === table.dealerIndex,
      cards: showCards ? seat.cards : undefined,
      showCards: seat.showCards ?? false,
    };
  });

  const effectiveYouSeatIndex =
    youSeatIndex !== null && !hideYouSeat ? youSeatIndex : null;
  const you = effectiveYouSeatIndex !== null ? table.seats[effectiveYouSeatIndex] : null;
  const actions = (() => {
    if (!you || !you.inHand || you.status !== "active") {
      return undefined;
    }
    if (table.currentPlayerIndex !== you.seatIndex) {
      return undefined;
    }
    const callAmount = getCallAmount(table, you);
    const maxRaise = Math.max(0, you.chips - callAmount);
    return {
      canCheck: callAmount === 0,
      canCall: callAmount > 0 && you.chips > 0,
      canBet: table.currentBet === 0 && you.chips > 0,
      canRaise: table.currentBet > 0 && you.chips > callAmount,
      callAmount,
      minRaise: table.minRaise,
      maxRaise,
    };
  })();

  return {
    tableId: table.id,
    maxSeats: table.maxSeats,
    status: table.status,
    street: table.street,
    pot: table.pot,
    community: table.community,
    seats,
    currentPlayerIndex: table.currentPlayerIndex,
    currentBet: table.currentBet,
    minRaise: table.minRaise,
    smallBlindIndex: table.smallBlindIndex ?? null,
    bigBlindIndex: table.bigBlindIndex ?? null,
    youSeatIndex: effectiveYouSeatIndex,
    turnStartedAt: table.turnStartedAt ?? null,
    turnDurationSeconds: POKER_TURN_SECONDS,
    serverTime: new Date().toISOString(),
    lastHandResult: table.lastHandResult ?? null,
    actions,
    log: table.log.slice(-12),
  };
};

const ensureBuyIn = async (userId: string, amount: number) => {
  await ensureUsersTable();
  if (!Number.isFinite(amount) || amount < MIN_BUYIN) {
    throw new PokerError(`Minimum buy-in is ${MIN_BUYIN} coins.`, 400);
  }
  const result = await db.query(
    `UPDATE users
     SET coins = COALESCE(coins, 0) - $2
     WHERE id = $1
       AND COALESCE(coins, 0) >= $2
     RETURNING coins`,
    [userId, amount]
  );
  if ((result.rowCount ?? 0) === 0) {
    throw new PokerError("Not enough coins for that buy-in.", 400);
  }
  return Number(result.rows[0]?.coins ?? 0);
};

const refundPlayerChips = async (player: PokerPlayer) => {
  const amount = Math.floor(player.chips);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  await ensureUsersTable();
  await db.query(
    `UPDATE users
     SET coins = COALESCE(coins, 0) + $2
     WHERE id = $1`,
    [player.userId, amount]
  );
  player.chips = 0;
  return amount;
};

const refundQueuedAmount = async (userId: string, amount: number) => {
  const normalized = Math.floor(amount);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0;
  }
  await ensureUsersTable();
  await db.query(
    `UPDATE users
     SET coins = COALESCE(coins, 0) + $2
     WHERE id = $1`,
    [userId, normalized]
  );
  return normalized;
};

const seatPlayerAtTable = async (
  table: PokerTable,
  entry: PokerQueueEntry,
  amountOverride?: number,
  options: {
    suppressJoinLog?: boolean;
  } = {}
) => {
  const seatIndex = getAvailableSeatIndex(table);
  if (seatIndex === -1) {
    throw new PokerError("No seats available.", 409);
  }
  const buyInAmount = Math.floor(amountOverride ?? entry.amount);
  if (!Number.isFinite(buyInAmount) || buyInAmount <= 0) {
    throw new PokerError("Buy in to join a table.", 400);
  }
  if (!entry.prepaid) {
    await ensureBuyIn(entry.userId, buyInAmount);
  }
  const player: PokerPlayer = {
    userId: entry.userId,
    name: entry.name,
    handle: normalizeHandle(entry.handle),
    chips: buyInAmount,
    seatIndex,
    inHand: false,
    status: "active",
    bet: 0,
    totalBet: 0,
    cards: [],
    lastSeenAt: new Date().toISOString(),
    missedTurns: 0,
    showCards: false,
  };
  table.seats[seatIndex] = player;
  if (!options.suppressJoinLog) {
    table.log.push(toLog(`${player.name} joined the table.`));
  }
  await setPlayerTableId(entry.userId, table.id);
};

const closeWaitingTableIfTooSmall = async (table: PokerTable) => {
  if (table.status !== "waiting") {
    return {
      tableRemoved: false,
      removedUserIds: [] as string[],
      endedTableIds: [] as string[],
    };
  }

  const players = getPlayers(table);
  if (!players.length) {
    await removeTable(table.id);
    return {
      tableRemoved: true,
      removedUserIds: [] as string[],
      endedTableIds: [table.id],
    };
  }

  if (getEligiblePlayers(table).length >= MIN_PLAYERS) {
    return {
      tableRemoved: false,
      removedUserIds: [] as string[],
      endedTableIds: [] as string[],
    };
  }

  const removedUserIds: string[] = [];
  for (const player of players) {
    await refundPlayerChips(player);
    await clearPlayerTableId(player.userId);
    table.seats[player.seatIndex] = null;
    removedUserIds.push(player.userId);
  }

  await removeTable(table.id);
  return {
    tableRemoved: true,
    removedUserIds,
    endedTableIds: [table.id],
  };
};

const processQueue = async () => {
  let tables = await loadActiveTables();
  const updatedTableIds = new Set<string>();
  const failedUserIds: string[] = [];
  const requeuedUserIds: string[] = [];
  const removedUserIds = new Set<string>();
  const endedTableIds = new Set<string>();

  const activeTables: PokerTable[] = [];
  for (const table of tables) {
    const shortTableResult = await closeWaitingTableIfTooSmall(table);
    if (shortTableResult.tableRemoved) {
      shortTableResult.removedUserIds.forEach((userId) => removedUserIds.add(userId));
      shortTableResult.endedTableIds.forEach((tableId) => endedTableIds.add(tableId));
      continue;
    }
    activeTables.push(table);
  }
  tables = activeTables;

  const queueEntries = await readQueueEntries();
  if (!queueEntries.length) {
    return {
      updatedTableIds: [] as string[],
      failedUserIds,
      removedUserIds: Array.from(removedUserIds),
      endedTableIds: Array.from(endedTableIds),
      requeuedUserIds,
    };
  }

  let index = 0;
  for (; index < queueEntries.length; index += 1) {
    const entry = queueEntries[index];
    const existingTableId = await getPlayerTableId(entry.userId);
    if (existingTableId) {
      await dequeuePlayer(entry.userId);
      continue;
    }

    const table = tables.find(
      (candidate) =>
        getPlayers(candidate).length >= MIN_PLAYERS &&
        getAvailableSeatIndex(candidate) !== -1
    );
    if (!table) {
      break;
    }

    try {
      await seatPlayerAtTable(table, entry);
    } catch (error) {
      if (error instanceof PokerError && error.status === 409) {
        continue;
      }
      failedUserIds.push(entry.userId);
      await dequeuePlayer(entry.userId);
      continue;
    }

    if (table.status === "waiting") {
      const eligible = getEligiblePlayers(table);
      if (eligible.length >= MIN_PLAYERS) {
        if (table.nextHandAt) {
          const nextAtMs = Date.parse(table.nextHandAt);
          if (Number.isFinite(nextAtMs) && Date.now() >= nextAtMs) {
            startHand(table);
          }
        } else {
          startHand(table);
        }
      }
    }

    await saveTable(table);
    updatedTableIds.add(table.id);
    await dequeuePlayer(entry.userId);
  }

  const remaining = queueEntries.slice(index);
  let cursor = 0;
  while (remaining.length - cursor >= MIN_PLAYERS) {
    if (tables.length >= MAX_TABLES) {
      break;
    }
    const table = createTable(10, 25);
    tables.push(table);
    const seated: Array<{ entry: PokerQueueEntry; player: PokerPlayer }> = [];

    while (cursor < remaining.length && getAvailableSeatIndex(table) !== -1) {
      const entry = remaining[cursor];
      cursor += 1;
      const existingTableId = await getPlayerTableId(entry.userId);
      if (existingTableId) {
        await dequeuePlayer(entry.userId);
        continue;
      }

      try {
        await seatPlayerAtTable(table, entry);
        const player = getPlayerById(table, entry.userId);
        if (player) {
          seated.push({ entry, player });
        }
        await dequeuePlayer(entry.userId);
      } catch (error) {
        if (error instanceof PokerError && error.status === 409) {
          continue;
        }
        failedUserIds.push(entry.userId);
        await dequeuePlayer(entry.userId);
      }
    }

    if (getPlayers(table).length < MIN_PLAYERS) {
      for (const { entry, player } of seated) {
        if (!entry.prepaid) {
          await refundPlayerChips(player);
        }
        table.seats[player.seatIndex] = null;
        await clearPlayerTableId(entry.userId);
        await enqueuePlayer({
          userId: entry.userId,
          name: entry.name,
          handle: normalizeHandle(entry.handle),
          amount: entry.amount,
          enqueuedAt: entry.enqueuedAt,
          prepaid: entry.prepaid,
        });
      }
      await removeTable(table.id);
      tables.pop();
      continue;
    }

    if (table.status === "waiting") {
      const eligible = getEligiblePlayers(table);
      if (eligible.length >= MIN_PLAYERS) {
        startHand(table);
      }
    }

    await saveTable(table);
    updatedTableIds.add(table.id);
  }

  return {
    updatedTableIds: Array.from(updatedTableIds),
    failedUserIds,
    removedUserIds: Array.from(removedUserIds),
    endedTableIds: Array.from(endedTableIds),
    requeuedUserIds,
  };
};

export const queuePokerPlayer = async (params: {
  userId: string;
  name: string;
  handle?: string | null;
  amount?: number;
}) => {
  const normalizedAmount = params.amount ? Math.floor(params.amount) : 0;
  const existingTableId = await getPlayerTableId(params.userId);
  let table = existingTableId ? await loadTable(existingTableId) : null;

  if (table) {
    const player = getPlayerById(table, params.userId);
    if (!player) {
      await clearPlayerTableId(params.userId);
      table = null;
    } else {
      player.lastSeenAt = new Date().toISOString();
      player.missedTurns = 0;
      if (normalizedAmount) {
        await ensureBuyIn(params.userId, normalizedAmount);
        player.chips += normalizedAmount;
        if (player.status === "out" && player.chips > 0) {
          player.status = "active";
        }
        table.log.push(toLog(`${player.name} re-bought ${normalizedAmount} chips.`));
      }
      if (table.status === "waiting") {
        const shortTableResult = await closeWaitingTableIfTooSmall(table);
        if (shortTableResult.tableRemoved) {
          return {
            tableId: null,
            state: null,
            queued: false,
            queuePosition: null,
            updatedTableIds: [],
            removedUserIds: shortTableResult.removedUserIds,
            endedTableIds: shortTableResult.endedTableIds,
          };
        }
      }
      if (table.status === "waiting") {
        const eligible = getEligiblePlayers(table);
        if (eligible.length >= MIN_PLAYERS) {
          if (table.nextHandAt) {
            const nextAtMs = Date.parse(table.nextHandAt);
            if (Number.isFinite(nextAtMs) && Date.now() >= nextAtMs) {
              startHand(table);
            }
          } else {
            startHand(table);
          }
        }
      }
      await saveTable(table);
      return {
        tableId: table.id,
        state: buildClientState(table, params.userId),
        queued: false,
        queuePosition: null,
        updatedTableIds: [table.id],
      };
    }
  }

  const queuedEntry = await getQueueEntryData(params.userId);
  if (queuedEntry) {
    const queuePosition = await getQueuePosition(params.userId);
    if (queuedEntry.prepaid || !normalizedAmount) {
      return {
        tableId: null,
        state: null,
        queued: queuePosition !== null,
        queuePosition,
        updatedTableIds: [],
      };
    }
  }

  if (!normalizedAmount) {
    throw new PokerError("Buy in to join a table.", 400);
  }
  if (normalizedAmount < MIN_BUYIN) {
    throw new PokerError(`Minimum buy-in is ${MIN_BUYIN} coins.`, 400);
  }

  const queuePosition = await enqueuePlayer({
    userId: params.userId,
    name: params.name,
    handle: normalizeHandle(params.handle),
    amount: normalizedAmount,
    enqueuedAt: Date.now(),
    prepaid: false,
  });

  const { updatedTableIds, failedUserIds } = await processQueue();
  if (failedUserIds.includes(params.userId)) {
    throw new PokerError("Not enough coins for that buy-in.", 400);
  }

  const seatedTableId = await getPlayerTableId(params.userId);
  if (seatedTableId) {
    const seatedTable = await loadTable(seatedTableId);
    if (seatedTable) {
      return {
        tableId: seatedTableId,
        state: buildClientState(seatedTable, params.userId),
        queued: false,
        queuePosition: null,
        updatedTableIds,
      };
    }
  }

  const position = (await getQueuePosition(params.userId)) ?? queuePosition ?? null;
  return {
    tableId: null,
    state: null,
    queued: true,
    queuePosition: position,
    updatedTableIds,
  };
};

export const startPrivatePokerTable = async (params: {
  players: Array<{
    userId: string;
    name: string;
    handle?: string | null;
  }>;
  amount?: number;
}) => {
  const uniquePlayers = Array.from(
    new Map(
      params.players.map((player) => [
        player.userId,
        {
          userId: player.userId,
          name: player.name.trim() || "Player",
          handle: normalizeHandle(player.handle),
        },
      ])
    ).values()
  );

  if (uniquePlayers.length < MIN_PLAYERS) {
    throw new PokerError("At least two players are needed to start poker.", 400);
  }
  if (uniquePlayers.length > MAX_SEATS) {
    throw new PokerError("That poker group is too large for one table.", 400);
  }

  const buyInAmount = Math.floor(params.amount ?? 100);
  if (!Number.isFinite(buyInAmount) || buyInAmount < MIN_BUYIN) {
    throw new PokerError(`Minimum buy-in is ${MIN_BUYIN} coins.`, 400);
  }

  for (const player of uniquePlayers) {
    const activeTableId = await getPlayerTableId(player.userId);
    if (activeTableId) {
      throw new PokerError(`${player.name} is already seated at another poker table.`, 409);
    }
    const queued = await getQueuePosition(player.userId);
    if (queued !== null) {
      throw new PokerError(`${player.name} is already queued for poker.`, 409);
    }
  }

  const table = createTable(10, 25);
  const seatedPlayers: PokerPlayer[] = [];

  try {
    for (const player of uniquePlayers) {
      await seatPlayerAtTable(
        table,
        {
          userId: player.userId,
          name: player.name,
          handle: player.handle,
          amount: buyInAmount,
          enqueuedAt: Date.now(),
          prepaid: false,
        },
        buyInAmount
      );
      const seated = getPlayerById(table, player.userId);
      if (seated) {
        seatedPlayers.push(seated);
      }
    }

    startHand(table);
    await saveTable(table);

    return {
      tableId: table.id,
      updatedTableIds: [table.id],
    };
  } catch (error) {
    for (const seated of seatedPlayers) {
      await refundPlayerChips(seated);
      await clearPlayerTableId(seated.userId);
      table.seats[seated.seatIndex] = null;
    }
    throw error;
  }
};

export const joinPrivatePokerTable = async (params: {
  tableId: string;
  userId: string;
  name: string;
  handle?: string | null;
  amount?: number;
  suppressJoinLog?: boolean;
}) => {
  const activeTableId = await getPlayerTableId(params.userId);
  if (activeTableId) {
    if (activeTableId !== params.tableId) {
      throw new PokerError("You are already seated at another poker table.", 409);
    }
    const activeTable = await loadTable(activeTableId);
    if (!activeTable) {
      await clearPlayerTableId(params.userId);
    } else {
      const existingPlayer = getPlayerById(activeTable, params.userId);
      if (existingPlayer) {
        existingPlayer.lastSeenAt = new Date().toISOString();
        existingPlayer.missedTurns = 0;
        await saveTable(activeTable);
        return {
          tableId: activeTable.id,
          state: buildClientState(activeTable, params.userId),
          updatedTableIds: [activeTable.id],
        };
      }
      await clearPlayerTableId(params.userId);
    }
  }

  const table = await loadTable(params.tableId);
  if (!table) {
    throw new PokerError("Poker table not found.", 404);
  }

  if (getAvailableSeatIndex(table) === -1) {
    throw new PokerError("That poker table is full.", 409);
  }

  const buyInAmount = Math.floor(params.amount ?? 100);
  if (!Number.isFinite(buyInAmount) || buyInAmount < MIN_BUYIN) {
    throw new PokerError(`Minimum buy-in is ${MIN_BUYIN} coins.`, 400);
  }

  await seatPlayerAtTable(
    table,
    {
      userId: params.userId,
      name: params.name.trim() || "Player",
      handle: normalizeHandle(params.handle),
      amount: buyInAmount,
      enqueuedAt: Date.now(),
      prepaid: false,
    },
    buyInAmount,
    {
      suppressJoinLog: Boolean(params.suppressJoinLog),
    }
  );

  if (table.status === "waiting") {
    const eligible = getEligiblePlayers(table);
    if (eligible.length >= MIN_PLAYERS) {
      if (table.nextHandAt) {
        const nextAtMs = Date.parse(table.nextHandAt);
        if (Number.isFinite(nextAtMs) && Date.now() >= nextAtMs) {
          startHand(table);
        }
      } else {
        startHand(table);
      }
    }
  }

  await saveTable(table);
  return {
    tableId: table.id,
    state: buildClientState(table, params.userId),
    updatedTableIds: [table.id],
  };
};

export const getPokerStateForUser = async (userId: string) => {
  const tableId = await getPlayerTableId(userId);
  if (!tableId) {
    const queuePosition = await getQueuePosition(userId);
    return {
      tableId: null,
      state: null,
      queued: queuePosition !== null,
      queuePosition,
    } as const;
  }
  const table = await loadTable(tableId);
  if (!table) {
    await clearPlayerTableId(userId);
    await dequeuePlayerAndRefundIfPrepaid(userId);
    const queuePosition = await getQueuePosition(userId);
    return {
      tableId: null,
      state: null,
      queued: queuePosition !== null,
      queuePosition,
    } as const;
  }
  if (table.status === "waiting") {
    const shortTableResult = await closeWaitingTableIfTooSmall(table);
    if (shortTableResult.tableRemoved) {
      return {
        tableId: null,
        state: null,
        queued: false,
        queuePosition: null,
      } as const;
    }
  }
  const touched = markPlayerSeen(table, userId);
  const turnFixed = ensureTurnState(table);
  if (touched || turnFixed) {
    await saveTable(table);
  }
  return {
    tableId,
    state: buildClientState(table, userId),
    queued: false,
    queuePosition: null,
  } as const;
};

export const touchPokerPlayer = async (userId: string) => {
  const tableId = await getPlayerTableId(userId);
  if (!tableId) {
    return false;
  }
  const table = await loadTable(tableId);
  if (!table) {
    await clearPlayerTableId(userId);
    return false;
  }
  const touched = markPlayerSeen(table, userId);
  if (touched) {
    await saveTable(table);
  }
  return touched;
};

export const applyPokerAction = async (params: {
  userId: string;
  action: PokerAction;
}) => {
  const tableId = await getPlayerTableId(params.userId);
  if (!tableId) {
    throw new PokerError("Join a table first.", 400);
  }
  const table = await loadTable(tableId);
  if (!table) {
    await clearPlayerTableId(params.userId);
    throw new PokerError("Table not found.", 404);
  }

  if (ensureTurnState(table)) {
    await saveTable(table);
  }

  if (table.status !== "in_hand") {
    throw new PokerError("No active hand yet.", 400);
  }

  const player = getPlayerById(table, params.userId);
  if (!player || !player.inHand) {
    throw new PokerError("You are not in this hand.", 400);
  }
  if (player.status !== "active") {
    throw new PokerError("You cannot act right now.", 400);
  }

  if (table.turnStartedAt) {
    const startedMs = Date.parse(table.turnStartedAt);
    if (Number.isFinite(startedMs)) {
      const elapsedSeconds = (Date.now() - startedMs) / 1000;
      if (elapsedSeconds >= POKER_TURN_SECONDS) {
        throw new PokerError("Your turn timed out.", 400);
      }
    }
  }

  if (table.currentPlayerIndex !== player.seatIndex) {
    throw new PokerError("Waiting for your turn.", 400);
  }

  player.lastSeenAt = new Date().toISOString();
  player.missedTurns = 0;
  applyPlayerAction(table, player, params.action);

  if (!maybeAwardIfSingle(table)) {
    const roundResult = ensureBettingRound(table);
    if (
      !roundResult.advanced &&
      table.status === "in_hand" &&
      table.pendingActionUserIds.length
    ) {
      updateCurrentPlayer(table, player.seatIndex);
    }
  }

  const shortTableResult = await closeWaitingTableIfTooSmall(table);

  let updatedTableIds = shortTableResult.tableRemoved ? [] : [table.id];
  if (!shortTableResult.tableRemoved) {
    await saveTable(table);
  }
  let failedUserIds: string[] = [];
  const removedUserIds = new Set<string>(shortTableResult.removedUserIds);
  const endedTableIds = new Set<string>(shortTableResult.endedTableIds);
  if ((await getQueueLength()) > 0) {
    const queueResult = await processQueue();
    updatedTableIds = Array.from(
      new Set([...updatedTableIds, ...queueResult.updatedTableIds])
    );
    failedUserIds = queueResult.failedUserIds;
    queueResult.removedUserIds?.forEach((userId) => removedUserIds.add(userId));
    queueResult.endedTableIds?.forEach((tableId) => endedTableIds.add(tableId));
  }

  const refreshedTable =
    updatedTableIds.includes(table.id) ? await loadTable(table.id) : table;
  const state =
    !shortTableResult.tableRemoved && refreshedTable
      ? buildClientState(refreshedTable, params.userId)
      : null;

  return {
    tableId: table.id,
    state,
    updatedTableIds,
    failedUserIds,
    removedUserIds: Array.from(removedUserIds),
    endedTableIds: Array.from(endedTableIds),
  };
};

export const showPokerCards = async (userId: string) => {
  const tableId = await getPlayerTableId(userId);
  if (!tableId) {
    throw new PokerError("Join a table first.", 400);
  }
  const table = await loadTable(tableId);
  if (!table) {
    await clearPlayerTableId(userId);
    throw new PokerError("Table not found.", 404);
  }
  const player = getPlayerById(table, userId);
  if (!player) {
    throw new PokerError("Player not seated.", 400);
  }
  if (table.status === "in_hand") {
    throw new PokerError("Cards can only be shown after the hand ends.", 400);
  }
  player.lastSeenAt = new Date().toISOString();
  if (player.cards?.length) {
    player.showCards = true;
  }
  await saveTable(table);
  return { tableId: table.id, updatedTableIds: [table.id] };
};

export const rebuyPoker = async (params: {
  userId: string;
  amount: number;
}) => {
  const tableId = await getPlayerTableId(params.userId);
  if (!tableId) {
    throw new PokerError("Join a table before re-buying.", 400);
  }
  const table = await loadTable(tableId);
  if (!table) {
    await clearPlayerTableId(params.userId);
    throw new PokerError("Table not found.", 404);
  }

  const player = getPlayerById(table, params.userId);
  if (!player) {
    throw new PokerError("Player not seated.", 400);
  }

  player.lastSeenAt = new Date().toISOString();
  player.missedTurns = 0;
  const amount = Math.floor(params.amount);
  await ensureBuyIn(params.userId, amount);
  player.chips += amount;
  if (player.status === "out" && player.chips > 0) {
    player.status = "active";
  }
  table.log.push(toLog(`${player.name} re-bought ${amount} chips.`));

  if (table.status === "waiting") {
    const eligible = getEligiblePlayers(table);
    if (eligible.length >= MIN_PLAYERS) {
      if (table.nextHandAt) {
        const nextAtMs = Date.parse(table.nextHandAt);
        if (Number.isFinite(nextAtMs) && Date.now() >= nextAtMs) {
          startHand(table);
        }
      } else {
        startHand(table);
      }
    }
  }

  await saveTable(table);
  return { tableId: table.id, state: buildClientState(table, params.userId) };
};

export const leavePokerTable = async (userId: string) => {
  const tableId = await getPlayerTableId(userId);
  if (!tableId) {
    await dequeuePlayerAndRefundIfPrepaid(userId);
    const queuePosition = await getQueuePosition(userId);
    return {
      tableId: null,
      state: null,
      queued: queuePosition !== null,
      queuePosition,
      updatedTableIds: [],
      failedUserIds: [],
    } as const;
  }

  const table = await loadTable(tableId);
  if (!table) {
    await clearPlayerTableId(userId);
    const queuePosition = await getQueuePosition(userId);
    return {
      tableId: null,
      state: null,
      queued: queuePosition !== null,
      queuePosition,
      updatedTableIds: [],
      failedUserIds: [],
    } as const;
  }

  const player = getPlayerById(table, userId);
  if (!player) {
    await clearPlayerTableId(userId);
    await dequeuePlayerAndRefundIfPrepaid(userId);
    const queuePosition = await getQueuePosition(userId);
    return {
      tableId: null,
      state: null,
      queued: queuePosition !== null,
      queuePosition,
      updatedTableIds: [],
      failedUserIds: [],
    } as const;
  }

  await dequeuePlayer(userId);
  await refundPlayerChips(player);
  removePlayerFromTable(table, player, `${player.name} left the table.`);
  await clearPlayerTableId(userId);

  const shortTableResult = await closeWaitingTableIfTooSmall(table);
  if (!shortTableResult.tableRemoved) {
    await saveTable(table);
  }

  let updatedTableIds = shortTableResult.tableRemoved ? [] : [table.id];
  let failedUserIds: string[] = [];
  const removedUserIds = new Set<string>(shortTableResult.removedUserIds);
  const endedTableIds = new Set<string>(shortTableResult.endedTableIds);
  if ((await getQueueLength()) > 0) {
    const queueResult = await processQueue();
    updatedTableIds = Array.from(
      new Set([...updatedTableIds, ...queueResult.updatedTableIds])
    );
    failedUserIds = queueResult.failedUserIds;
    queueResult.removedUserIds?.forEach((targetUserId) => removedUserIds.add(targetUserId));
    queueResult.endedTableIds?.forEach((targetTableId) => endedTableIds.add(targetTableId));
  }

  return {
    tableId: null,
    state: null,
    queued: false,
    queuePosition: null,
    updatedTableIds,
    failedUserIds,
    removedUserIds: Array.from(removedUserIds),
    endedTableIds: Array.from(endedTableIds),
  } as const;
};

export const forceRemovePokerUser = async (userId: string, reason?: string) => {
  const tableId = await getPlayerTableId(userId);
  if (tableId) {
    return leavePokerTable(userId);
  }

  const tables = await loadActiveTables();
  for (const table of tables) {
    const player = getPlayerById(table, userId);
    if (!player) {
      continue;
    }
    await refundPlayerChips(player);
    removePlayerFromTable(
      table,
      player,
      reason ?? `${player.name} left the table.`
    );
    await clearPlayerTableId(userId);
    const shortTableResult = await closeWaitingTableIfTooSmall(table);
    if (!shortTableResult.tableRemoved) {
      await saveTable(table);
    }

    let updatedTableIds = shortTableResult.tableRemoved ? [] : [table.id];
    let failedUserIds: string[] = [];
    const removedUserIds = new Set<string>(shortTableResult.removedUserIds);
    const endedTableIds = new Set<string>(shortTableResult.endedTableIds);
    if ((await getQueueLength()) > 0) {
      const queueResult = await processQueue();
      updatedTableIds = Array.from(
        new Set([...updatedTableIds, ...queueResult.updatedTableIds])
      );
      failedUserIds = queueResult.failedUserIds;
      queueResult.removedUserIds?.forEach((targetUserId) => removedUserIds.add(targetUserId));
      queueResult.endedTableIds?.forEach((targetTableId) => endedTableIds.add(targetTableId));
    }

    return {
      tableId: null,
      state: null,
      queued: false,
      queuePosition: null,
      updatedTableIds,
      failedUserIds,
      removedUserIds: Array.from(removedUserIds),
      endedTableIds: Array.from(endedTableIds),
    } as const;
  }

  await dequeuePlayerAndRefundIfPrepaid(userId);
  return {
    tableId: null,
    state: null,
    queued: false,
    queuePosition: null,
    updatedTableIds: [],
    failedUserIds: [],
  } as const;
};

export const prunePokerTables = async (params: {
  inactivityMs: number;
  isUserActive?: (userId: string) => boolean;
}) => {
  const { inactivityMs, isUserActive } = params;
  const now = Date.now();
  const tables = await loadActiveTables();
  const updatedTableIds = new Set<string>();
  const removedUserIds: string[] = [];
  const endedTableIds = new Set<string>();
  const requeuedUserIds: string[] = [];

  for (const table of tables) {
    let changed = false;
    if (await handleTurnTimeout(table)) {
      changed = true;
    }
    const staleTargets: Array<{ userId: string; reason: string }> = [];
    for (const seat of table.seats) {
      if (!seat) {
        continue;
      }
      const lastSeenMs = seat.lastSeenAt ? Date.parse(seat.lastSeenAt) : Number.NaN;
      const active = isUserActive ? isUserActive(seat.userId) : false;
      const hasSeen = Number.isFinite(lastSeenMs);
      const isStale =
        !active && (hasSeen ? now - lastSeenMs > inactivityMs : true);
      const isBroke = seat.chips <= 0 && (!seat.inHand || table.status !== "in_hand");
      if (isStale || isBroke) {
        staleTargets.push({
          userId: seat.userId,
          reason: isBroke
            ? `${seat.name} busted out.`
            : `${seat.name} left the table.`,
        });
      }
    }

    if (!staleTargets.length) {
      if (table.status === "waiting") {
        const shortTableResult = await closeWaitingTableIfTooSmall(table);
        if (shortTableResult.tableRemoved) {
          shortTableResult.removedUserIds.forEach((userId) =>
            removedUserIds.push(userId)
          );
          shortTableResult.endedTableIds.forEach((tableId) => endedTableIds.add(tableId));
          continue;
        }
      }
      const started = maybeStartNextHand(table, now);
      if (started) {
        changed = true;
      }
      if (changed) {
        await saveTable(table);
        updatedTableIds.add(table.id);
      }
      continue;
    }

    for (const target of staleTargets) {
      const player = getPlayerById(table, target.userId);
      if (!player) {
        continue;
      }
      await refundPlayerChips(player);
      removePlayerFromTable(table, player, target.reason);
      await clearPlayerTableId(target.userId);
      removedUserIds.push(target.userId);
      changed = true;
    }

    if (table.status === "waiting") {
      const shortTableResult = await closeWaitingTableIfTooSmall(table);
      if (shortTableResult.tableRemoved) {
        shortTableResult.removedUserIds.forEach((userId) =>
          removedUserIds.push(userId)
        );
        shortTableResult.endedTableIds.forEach((tableId) => endedTableIds.add(tableId));
        continue;
      }
    }

    if (changed && table.status === "waiting") {
      maybeStartNextHand(table, now);
    }

    if (changed) {
      await saveTable(table);
      updatedTableIds.add(table.id);
    }
  }

  let failedUserIds: string[] = [];
  if ((await getQueueLength()) > 0) {
    const queueResult = await processQueue();
    queueResult.updatedTableIds.forEach((id) => updatedTableIds.add(id));
    failedUserIds = queueResult.failedUserIds;
    queueResult.removedUserIds?.forEach((userId) => removedUserIds.push(userId));
    queueResult.endedTableIds?.forEach((tableId) => endedTableIds.add(tableId));
  }

  return {
    updatedTableIds: Array.from(updatedTableIds),
    failedUserIds,
    removedUserIds,
    endedTableIds: Array.from(endedTableIds),
    requeuedUserIds,
  };
};

export const getPokerStatesForTable = async (tableId: string) => {
  const table = await loadTable(tableId);
  if (!table) {
    return [] as Array<{ userId: string; state: PokerClientState }>;
  }
  if (ensureTurnState(table)) {
    await saveTable(table);
  }
  return getPlayers(table).map((player) => ({
    userId: player.userId,
    state: buildClientState(table, player.userId),
  }));
};
