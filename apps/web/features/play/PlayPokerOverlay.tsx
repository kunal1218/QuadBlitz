"use client";

import { useMemo, useState } from "react";
import { CharacterAvatar } from "./playData";
import type { PlayRoomState, PokerClientState } from "./types";

const overlayPillClass =
  "rounded-full border border-white/60 bg-[rgba(255,255,255,0.88)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-[#6f84b6] shadow-[0_18px_42px_rgba(20,86,244,0.09)] backdrop-blur-xl";

const glassPanelClass =
  "rounded-[30px] border border-white/55 bg-[rgba(255,255,255,0.84)] shadow-[0_28px_72px_rgba(20,86,244,0.1)] backdrop-blur-xl";

const cardPanelClass =
  "rounded-[22px] border border-white/55 bg-[rgba(255,255,255,0.72)] shadow-[0_16px_38px_rgba(20,86,244,0.08)] backdrop-blur-lg";

const actionButtonBaseClass =
  "rounded-full px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_16px_32px_rgba(20,86,244,0.12)] active:translate-y-0 active:scale-[0.98] disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none";

const renderPokerCard = (
  card?: string,
  hidden = false,
  size: "table" | "hand" = "table"
) => {
  const rank = card?.[0] ?? "";
  const suit = card?.[1] ?? "";
  const suitSymbol =
    suit === "H" ? "♥" : suit === "D" ? "♦" : suit === "C" ? "♣" : suit === "S" ? "♠" : "";
  const face = rank === "T" ? "10" : rank;
  const content = hidden ? "🂠" : `${face}${suitSymbol}`.trim();
  const isRed = suit === "H" || suit === "D";
  const sizeClass =
    size === "hand"
      ? "h-14 w-10 rounded-[18px] text-sm"
      : "h-16 w-11 rounded-2xl text-base";

  return (
    <div
      className={`poker-card-enter flex items-center justify-center border font-semibold shadow-[0_12px_26px_rgba(23,37,84,0.08)] ${sizeClass} ${
        hidden
          ? "border-[#344465] bg-[#334466] text-white"
          : `border-[#dbe4f5] bg-[#fbfdff] ${isRed ? "text-[#d26a73]" : "text-[#263247]"}`
      }`}
    >
      {content}
    </div>
  );
};

const getSeatPositions = (seatCount: number, youSeatIndex: number | null) =>
  Array.from({ length: seatCount }, (_, seatIndex) => {
    const relativeIndex =
      youSeatIndex === null ? seatIndex : (seatIndex - youSeatIndex + seatCount) % seatCount;
    const angle = Math.PI / 2 + (relativeIndex / seatCount) * Math.PI * 2;
    return {
      seatIndex,
      style: {
        left: `${50 + Math.cos(angle) * 39}%`,
        top: `${52 + Math.sin(angle) * 30}%`,
      },
    };
  });

export const PlayPokerOverlay = ({
  roomState,
  pokerState,
  currentUserId,
  pokerError,
  pokerBusyAction,
  turnTimeLeft,
  turnProgress,
  onAct,
  onLeave,
  onRebuy,
  onShowCards,
}: {
  roomState: PlayRoomState;
  pokerState: PokerClientState;
  currentUserId: string | null | undefined;
  pokerError: string | null;
  pokerBusyAction: "action" | "leave" | "rebuy" | "show" | null;
  turnTimeLeft: number | null;
  turnProgress: number;
  onAct: (action: "fold" | "check" | "call" | "bet" | "raise", amount?: number) => void;
  onLeave: () => void;
  onRebuy: (amount?: number) => void;
  onShowCards: () => void;
}) => {
  const [raiseAmount, setRaiseAmount] = useState("");
  const [hideMyCards, setHideMyCards] = useState(false);
  const seatPositions = useMemo(
    () => getSeatPositions(pokerState.maxSeats, pokerState.youSeatIndex),
    [pokerState.maxSeats, pokerState.youSeatIndex]
  );
  const playerMap = useMemo(
    () => new Map(roomState.players.map((player) => [player.userId, player])),
    [roomState.players]
  );
  const youSeat =
    pokerState.youSeatIndex !== null ? pokerState.seats[pokerState.youSeatIndex] : null;
  const actions = pokerState.actions;
  const callAmount = actions?.callAmount ?? 0;
  const canRevealCards =
    Boolean(youSeat?.cards?.length) &&
    pokerState.status !== "in_hand" &&
    !youSeat?.showCards;
  const winnerIds = new Set(
    pokerState.lastHandResult?.winners?.map((winner) => winner.userId) ?? []
  );
  const tableStatusCopy =
    pokerState.lastHandResult?.winners?.length
      ? pokerState.lastHandResult.winners.length === 1
        ? `${pokerState.lastHandResult.winners[0]?.name ?? "Player"} won ${pokerState.lastHandResult.winners[0]?.amount ?? 0} chips`
        : `Split pot: ${pokerState.lastHandResult.winners.map((winner) => winner.name).join(", ")}`
      : pokerState.status === "in_hand"
        ? pokerState.log[pokerState.log.length - 1]?.text ?? "Hand in progress."
        : "Waiting for players at the table.";

  return (
    <section className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <style jsx>{`
        @keyframes poker-card-in {
          0% {
            opacity: 0;
            transform: scale(0.96) translateY(4px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes poker-log-in {
          0% {
            opacity: 0;
            transform: translateY(6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes poker-chip-pulse {
          0% {
            opacity: 0.72;
            transform: translateY(1px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .poker-card-enter {
          animation: poker-card-in 180ms ease-out;
        }

        .poker-log-entry {
          animation: poker-log-in 180ms ease-out;
        }

        .poker-chip-value {
          animation: poker-chip-pulse 180ms ease-out;
        }
      `}</style>

      <div className="absolute left-5 top-5 flex flex-wrap items-center gap-3">
        <div className={overlayPillClass}>Poker Arcade</div>
        <div className={overlayPillClass}>Table {pokerState.tableId.slice(0, 6)}</div>
      </div>

      <div className="absolute right-5 top-5 flex flex-wrap justify-end gap-3">
        <div className={overlayPillClass}>Pot {pokerState.pot}</div>
        <div className={overlayPillClass}>{pokerState.street}</div>
      </div>

      <div className="absolute bottom-24 left-1/2 top-24 w-[min(calc(100vw-2rem),980px)] -translate-x-1/2 lg:w-[min(calc(100vw-22rem),980px)] 2xl:w-[min(calc(100vw-22rem),1120px)]">
        <div
          className={`pointer-events-auto mx-auto w-full max-w-5xl px-5 py-4 text-sm font-normal leading-6 text-[#536178] ${glassPanelClass}`}
        >
          {tableStatusCopy}
        </div>

        <div className="relative mx-auto mt-4 h-[calc(100%-5.5rem)] w-full max-w-5xl">
          <div className="absolute inset-x-[8%] bottom-[10%] top-[12%] rounded-[999px] border border-[#a9d9ba]/70 bg-[radial-gradient(circle_at_top,#55c679_0%,#38b165_44%,#2d8f55_76%,#28784b_100%)] shadow-[inset_0_14px_34px_rgba(255,255,255,0.14),inset_0_-22px_42px_rgba(18,68,42,0.12),0_28px_60px_rgba(17,73,43,0.14)]" />
          <div className="absolute inset-x-[16%] bottom-[18%] top-[20%] rounded-[999px] border border-white/20 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_70%)] shadow-[inset_0_0_24px_rgba(255,255,255,0.05)]" />

          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4">
            <div className={overlayPillClass}>Community Cards</div>
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={`community-${index}`}>{renderPokerCard(pokerState.community[index])}</div>
              ))}
            </div>
          </div>

          {seatPositions.map((position) => {
            const seat = pokerState.seats[position.seatIndex];
            const isCurrent = pokerState.currentPlayerIndex === position.seatIndex;
            const isSmallBlind = pokerState.smallBlindIndex === position.seatIndex;
            const isBigBlind = pokerState.bigBlindIndex === position.seatIndex;

            if (!seat) {
              return (
                <div
                  key={`poker-seat-${position.seatIndex}`}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                  style={position.style}
                >
                  <div className="rounded-full border border-dashed border-[#d6e0f5]/85 bg-[rgba(255,255,255,0.56)] px-4 py-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9aa7bf] backdrop-blur-md">
                    Empty
                  </div>
                </div>
              );
            }

            const roomPlayer = playerMap.get(seat.userId);
            const characterId = roomPlayer?.selectedCharacter;
            const shouldHideCards =
              seat.userId === currentUserId ? hideMyCards : !seat.showCards;

            return (
              <div
                key={`poker-seat-${position.seatIndex}`}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={position.style}
              >
                <div className="relative">
                  <div className="absolute left-1/2 top-[46%] -z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[rgba(18,18,18,0.08)] blur-[4px]" />
                  {seat.cards?.length ? (
                    <div className="absolute left-[58%] top-[30%] z-20 flex items-center gap-1">
                      <div className="-rotate-12">
                        {renderPokerCard(seat.cards[0], shouldHideCards, "hand")}
                      </div>
                      <div className="rotate-12">
                        {renderPokerCard(seat.cards[1], shouldHideCards, "hand")}
                      </div>
                    </div>
                  ) : null}
                  {characterId ? (
                    <CharacterAvatar
                      characterId={characterId}
                      size={86}
                      className={
                        winnerIds.has(seat.userId)
                          ? "drop-shadow-[0_0_12px_rgba(57,211,83,0.42)]"
                          : ""
                      }
                    />
                  ) : (
                    <div className="flex h-[86px] w-[86px] items-center justify-center rounded-full border border-dashed border-[#cbd9f7] bg-white/76 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#93a0bb]">
                      Seat
                    </div>
                  )}
                </div>

                <div
                  className={`mt-1 min-w-[132px] border px-3 py-2.5 text-center backdrop-blur-lg ${cardPanelClass} ${
                    isCurrent
                      ? "border-[#c5d8ff] bg-[rgba(236,244,255,0.82)]"
                      : "border-white/55 bg-[rgba(255,255,255,0.68)]"
                  }`}
                >
                  <div className="text-sm font-medium text-[#253247]">{seat.name}</div>
                  <div className="poker-chip-value mt-1 text-[10px] uppercase tracking-[0.18em] text-[#8390a6]">
                    {seat.chips} chips
                  </div>
                  {seat.bet > 0 ? (
                    <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#4f74cc]">
                      Bet {seat.bet}
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.16em] text-[#7284ae]">
                    {seat.isDealer ? (
                      <span className="rounded-full bg-[#5a85ef] px-2 py-[5px] text-white">D</span>
                    ) : null}
                    {isSmallBlind ? (
                      <span className="rounded-full bg-[#f4c777] px-2 py-[5px] text-[#5c3e08]">SB</span>
                    ) : null}
                    {isBigBlind ? (
                      <span className="rounded-full bg-[#ffb18f] px-2 py-[5px] text-[#62321d]">BB</span>
                    ) : null}
                    {winnerIds.has(seat.userId) ? (
                      <span className="rounded-full bg-[#86dca2] px-2 py-[5px] text-[#1d4b28]">Win</span>
                    ) : null}
                  </div>
                </div>

                {isCurrent && turnTimeLeft !== null ? (
                  <div className="mt-2 w-24 overflow-hidden rounded-full border border-white/55 bg-[rgba(255,255,255,0.75)] p-1 shadow-[0_10px_20px_rgba(20,86,244,0.08)] backdrop-blur-md">
                    <div className="h-2 rounded-full bg-[#dbe4f7]">
                      <div
                        className={`h-full rounded-full transition-[width] duration-200 ${
                          turnTimeLeft <= 5 ? "bg-[#efbf6a]" : "bg-[#5b81e8]"
                        }`}
                        style={{ width: `${turnProgress * 100}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <aside className="pointer-events-auto absolute bottom-5 right-5 top-24 hidden w-[280px] flex-col gap-4 lg:flex">
        <section className={`${glassPanelClass} p-4`}>
          <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-[#6f84b6]">
            You
          </p>
          <div className="mt-4 space-y-3">
            <div className={`${cardPanelClass} px-4 py-3`}>
              <div className="text-sm font-medium text-[#253247]">
                {youSeat?.name ?? "Not seated"}
              </div>
              <div className="poker-chip-value mt-1 text-[10px] uppercase tracking-[0.16em] text-[#8390a6]">
                {youSeat ? `${youSeat.chips} chips` : "Waiting"}
              </div>
            </div>
            {turnTimeLeft !== null &&
            pokerState.currentPlayerIndex === pokerState.youSeatIndex ? (
              <div className="rounded-[24px] border border-white/55 bg-[rgba(236,244,255,0.76)] px-4 py-4 shadow-[0_16px_40px_rgba(20,86,244,0.08)] backdrop-blur-lg">
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6f84b6]">
                  Your turn
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#253247]">
                  {turnTimeLeft}s
                </div>
              </div>
            ) : null}
            {!actions && youSeat ? (
              <button
                type="button"
                onClick={() => onRebuy()}
                disabled={pokerBusyAction === "rebuy"}
                className={`w-full border border-white/55 bg-[rgba(255,255,255,0.84)] text-[#6f84b6] shadow-[0_14px_28px_rgba(20,86,244,0.09)] backdrop-blur-lg ${actionButtonBaseClass}`}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f3c56f] text-[10px] text-[#62420d]">
                    ◉
                  </span>
                  <span>{pokerBusyAction === "rebuy" ? "Rebuying..." : "Rebuy 100"}</span>
                </span>
              </button>
            ) : null}
          </div>
        </section>

        <section className={`flex min-h-0 flex-1 flex-col p-4 ${glassPanelClass}`}>
          <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-[#6f84b6]">
            Table Log
          </p>
          <div className="mt-4 max-h-full space-y-2 overflow-auto pr-1">
            {pokerState.log.map((entry) => (
              <div
                key={entry.id}
                className="poker-log-entry rounded-[18px] border border-white/55 bg-[rgba(255,255,255,0.7)] px-4 py-2.5 text-[13px] leading-5 text-[#667487] shadow-[0_12px_24px_rgba(20,86,244,0.06)] backdrop-blur-md"
              >
                {entry.text}
              </div>
            ))}
          </div>
        </section>

        {pokerError ? (
          <div className="rounded-[24px] border border-[#ffd9d9]/90 bg-[rgba(255,243,243,0.84)] px-4 py-4 text-sm leading-6 text-[#b86464] shadow-[0_18px_36px_rgba(223,76,76,0.08)] backdrop-blur-lg">
            {pokerError}
          </div>
        ) : null}
      </aside>

      <div className="pointer-events-auto absolute bottom-5 left-1/2 flex w-[min(calc(100vw-2rem),980px)] -translate-x-1/2 flex-wrap items-center justify-between gap-3 px-4 lg:w-[min(calc(100vw-22rem),980px)] 2xl:w-[min(calc(100vw-22rem),1120px)]">
        <div className="flex flex-wrap gap-2">
          {youSeat ? (
            <button
              type="button"
              onClick={() => setHideMyCards((current) => !current)}
              className={`border border-white/55 bg-[rgba(255,255,255,0.88)] text-[#6f84b6] shadow-[0_14px_28px_rgba(20,86,244,0.08)] backdrop-blur-lg ${actionButtonBaseClass}`}
            >
              {hideMyCards ? "Show Cards" : "Hide Cards"}
            </button>
          ) : null}
          {canRevealCards ? (
            <button
              type="button"
              onClick={onShowCards}
              disabled={pokerBusyAction === "show"}
              className={`border border-white/55 bg-[rgba(255,255,255,0.88)] text-[#6f84b6] shadow-[0_14px_28px_rgba(20,86,244,0.08)] backdrop-blur-lg ${actionButtonBaseClass}`}
            >
              {pokerBusyAction === "show" ? "Showing..." : "Show Cards"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onLeave}
            disabled={pokerBusyAction === "leave"}
            className={`border border-[#ffd8d8]/95 bg-[rgba(255,255,255,0.88)] text-[#cc6972] shadow-[0_14px_28px_rgba(20,86,244,0.08)] backdrop-blur-lg ${actionButtonBaseClass}`}
          >
            {pokerBusyAction === "leave" ? "Leaving..." : "Leave Table"}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {actions?.canCheck ? (
            <button
              type="button"
              onClick={() => onAct("check")}
              disabled={pokerBusyAction === "action"}
              className={`border border-white/55 bg-[rgba(255,255,255,0.88)] text-[#6f84b6] shadow-[0_14px_28px_rgba(20,86,244,0.08)] backdrop-blur-lg ${actionButtonBaseClass}`}
            >
              Check
            </button>
          ) : null}
          {actions?.canCall ? (
            <button
              type="button"
              onClick={() => onAct("call")}
              disabled={pokerBusyAction === "action"}
              className={`border border-[#6c92ef] bg-[#5f83e8] text-white shadow-[0_16px_32px_rgba(23,86,245,0.16)] ${actionButtonBaseClass}`}
            >
              Call {callAmount}
            </button>
          ) : null}
          {actions?.canBet || actions?.canRaise ? (
            <>
              <input
                type="number"
                min={actions?.minRaise ?? 1}
                step={1}
                value={raiseAmount}
                onChange={(event) => setRaiseAmount(event.target.value)}
                className="h-10 w-24 rounded-full border border-white/55 bg-[rgba(255,255,255,0.88)] px-4 text-[11px] font-medium uppercase tracking-[0.18em] text-[#253247] outline-none shadow-[0_14px_28px_rgba(20,86,244,0.08)] backdrop-blur-lg transition-all duration-200 focus:border-[#bfd0ff] focus:bg-[rgba(255,255,255,0.96)]"
                placeholder="Raise"
              />
              <button
                type="button"
                onClick={() => {
                  const amount = Number(raiseAmount);
                  if (!Number.isFinite(amount) || amount <= 0) {
                    return;
                  }
                  onAct(pokerState.currentBet === 0 ? "bet" : "raise", amount);
                }}
                disabled={pokerBusyAction === "action"}
                className={`${actionButtonBaseClass} shadow-[0_16px_32px_rgba(20,86,244,0.14)] ${
                  pokerState.currentBet === 0
                    ? "border border-[#efc980] bg-[#efc980] text-[#5a3c08]"
                    : "border border-[#7ad393] bg-[#72cc8b] text-[#173f20]"
                }`}
              >
                {pokerState.currentBet === 0 ? "Bet" : "Raise"}
              </button>
            </>
          ) : null}
          {actions ? (
            <button
              type="button"
              onClick={() => onAct("fold")}
              disabled={pokerBusyAction === "action"}
              className={`${actionButtonBaseClass} border border-[#eba8b0] bg-[#ea8d99] text-white shadow-[0_16px_32px_rgba(242,95,119,0.14)]`}
            >
              Fold
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
};
