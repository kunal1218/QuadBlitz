"use client";

import { useMemo, useState } from "react";
import type { PokerClientState } from "./types";

const renderPokerCard = (card?: string, hidden = false) => {
  const rank = card?.[0] ?? "";
  const suit = card?.[1] ?? "";
  const suitSymbol =
    suit === "H" ? "♥" : suit === "D" ? "♦" : suit === "C" ? "♣" : suit === "S" ? "♠" : "";
  const face = rank === "T" ? "10" : rank;
  const content = hidden ? "🂠" : `${face}${suitSymbol}`.trim();
  const isRed = suit === "H" || suit === "D";

  return (
    <div
      className={`flex h-16 w-11 items-center justify-center rounded-2xl border text-base font-semibold shadow-[0_10px_24px_rgba(18,18,18,0.08)] ${
        hidden
          ? "border-[#22314d] bg-[#22314d] text-white"
          : `border-[#d7e2f9] bg-white ${isRed ? "text-[#d45766]" : "text-[#1f2430]"}`
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
        top: `${50 + Math.sin(angle) * 33}%`,
      },
    };
  });

export const PlayPokerOverlay = ({
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
  const youSeat =
    pokerState.youSeatIndex !== null ? pokerState.seats[pokerState.youSeatIndex] : null;
  const actions = pokerState.actions;
  const callAmount = actions?.callAmount ?? 0;
  const showLeave = Boolean(youSeat);
  const canRevealCards =
    Boolean(pokerState && youSeat?.cards?.length) &&
    pokerState.status !== "in_hand" &&
    !youSeat?.showCards;
  const winnerIds = new Set(
    pokerState.lastHandResult?.winners?.map((winner) => winner.userId) ?? []
  );
  const statusCopy =
    pokerState.lastHandResult?.winners?.length
      ? pokerState.lastHandResult.winners.length === 1
        ? `${pokerState.lastHandResult.winners[0]?.name ?? "Player"} won ${pokerState.lastHandResult.winners[0]?.amount ?? 0} chips`
        : `Split pot: ${pokerState.lastHandResult.winners.map((winner) => winner.name).join(", ")}`
      : pokerState.status === "in_hand"
        ? pokerState.log[pokerState.log.length - 1]?.text ?? "Hand in progress."
        : "Waiting for players at the table.";

  return (
    <section className="absolute inset-0 z-50 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.98),_rgba(239,245,255,0.98)_35%,_rgba(232,239,250,1)_100%)]">
      <div className="absolute inset-0 opacity-45" style={{ backgroundImage: "linear-gradient(rgba(20,86,244,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(20,86,244,0.05) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />

      <div className="relative flex h-full flex-col px-4 pb-5 pt-4 sm:px-6">
        <div className="grid grid-cols-[1fr_auto] items-start gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-[#dbe5ff] bg-white/92 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3] shadow-[0_12px_28px_rgba(20,86,244,0.08)]">
              Poker Arcade
            </div>
            <div className="rounded-full border border-[#dbe5ff] bg-white/92 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5d73b3] shadow-[0_12px_28px_rgba(20,86,244,0.08)]">
              Table {pokerState.tableId.slice(0, 6)}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <div className="rounded-full border border-[#dbe5ff] bg-white/92 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5d73b3] shadow-[0_12px_28px_rgba(20,86,244,0.08)]">
              Pot {pokerState.pot}
            </div>
            <div className="rounded-full border border-[#dbe5ff] bg-white/92 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5d73b3] shadow-[0_12px_28px_rgba(20,86,244,0.08)]">
              {pokerState.street}
            </div>
          </div>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_280px]">
          <div className="relative min-h-[520px] overflow-hidden rounded-[34px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.9)_0%,rgba(245,248,255,0.88)_100%)] p-4 shadow-[0_28px_80px_rgba(20,86,244,0.14)]">
            <div className="rounded-[26px] border border-[#dbe5ff] bg-white/82 px-4 py-3 text-sm text-[#445066] shadow-[0_12px_28px_rgba(20,86,244,0.08)]">
              {statusCopy}
            </div>

            <div className="relative mt-5 h-[calc(100%-10.75rem)] min-h-[390px]">
              <div className="absolute inset-[12%] rounded-[999px] border border-[#8fd0aa] bg-[radial-gradient(circle_at_top,#47c76d_0%,#2ea35b_58%,#257e48_100%)] shadow-[inset_0_0_48px_rgba(255,255,255,0.16),0_30px_70px_rgba(17,73,43,0.22)]" />
              <div className="absolute inset-[18%] rounded-[999px] border border-white/25 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_70%)]" />

              <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4">
                <div className="rounded-full border border-[#dbe5ff] bg-white/92 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5d73b3] shadow-[0_10px_24px_rgba(20,86,244,0.08)]">
                  Community Cards
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={`community-${index}`}>
                      {renderPokerCard(pokerState.community[index])}
                    </div>
                  ))}
                </div>
              </div>

              {seatPositions.map((position) => {
                const seat = pokerState.seats[position.seatIndex];
                const isCurrent = pokerState.currentPlayerIndex === position.seatIndex;
                const isSmallBlind = pokerState.smallBlindIndex === position.seatIndex;
                const isBigBlind = pokerState.bigBlindIndex === position.seatIndex;

                return (
                  <div
                    key={`poker-seat-${position.seatIndex}`}
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
                    style={position.style}
                  >
                    {seat ? (
                      <>
                        <div className="relative flex flex-col items-center">
                          {seat.cards?.length ? (
                            <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 translate-y-[-42%] items-center gap-1">
                              <div className="-rotate-8">
                                {renderPokerCard(
                                  seat.cards[0],
                                  seat.userId === currentUserId ? hideMyCards : !seat.showCards && seat.userId !== currentUserId
                                )}
                              </div>
                              <div className="rotate-8">
                                {renderPokerCard(
                                  seat.cards[1],
                                  seat.userId === currentUserId ? hideMyCards : !seat.showCards && seat.userId !== currentUserId
                                )}
                              </div>
                            </div>
                          ) : null}

                          <div
                            className={`relative z-10 rounded-[28px] border px-4 py-4 text-center shadow-[0_12px_24px_rgba(20,86,244,0.1)] ${
                              isCurrent
                                ? "border-[#9bc0ff] bg-[#edf4ff]"
                                : "border-[#dbe5ff] bg-white/94"
                            }`}
                          >
                            <div className="text-sm font-semibold text-[#1f2430]">{seat.name}</div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-[#6d7890]">
                              {seat.chips} chips
                            </div>
                            {seat.bet > 0 ? (
                              <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1456f4]">
                                Bet {seat.bet}
                              </div>
                            ) : null}
                            <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5d73b3]">
                              {seat.isDealer ? <span className="rounded-full bg-[#1456f4] px-2 py-1 text-white">D</span> : null}
                              {isSmallBlind ? <span className="rounded-full bg-[#f3b84f] px-2 py-1 text-[#442200]">SB</span> : null}
                              {isBigBlind ? <span className="rounded-full bg-[#ff8d63] px-2 py-1 text-[#4f1700]">BB</span> : null}
                              {winnerIds.has(seat.userId) ? <span className="rounded-full bg-[#39d353] px-2 py-1 text-[#10240d]">Win</span> : null}
                            </div>
                          </div>
                        </div>

                        {isCurrent && turnTimeLeft !== null ? (
                          <div className="w-24 overflow-hidden rounded-full border border-[#dbe5ff] bg-white/88 p-1 shadow-[0_8px_18px_rgba(20,86,244,0.08)]">
                            <div className="h-2 rounded-full bg-[#dbe5ff]">
                              <div
                                className={`h-full rounded-full transition-[width] duration-200 ${
                                  turnTimeLeft <= 5 ? "bg-[#f3b84f]" : "bg-[#1456f4]"
                                }`}
                                style={{ width: `${turnProgress * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="rounded-full border border-dashed border-[#cbd9f7] bg-white/70 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#93a0bb]">
                        Empty
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pointer-events-auto absolute bottom-4 left-4 flex flex-wrap gap-2">
              {youSeat ? (
                <button
                  type="button"
                  onClick={() => setHideMyCards((current) => !current)}
                  className="rounded-full border border-[#dbe5ff] bg-white/92 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5d73b3] shadow-[0_10px_24px_rgba(20,86,244,0.08)]"
                >
                  {hideMyCards ? "Show Cards" : "Hide Cards"}
                </button>
              ) : null}
              {canRevealCards ? (
                <button
                  type="button"
                  onClick={onShowCards}
                  disabled={pokerBusyAction === "show"}
                  className="rounded-full border border-[#dbe5ff] bg-white/92 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5d73b3] shadow-[0_10px_24px_rgba(20,86,244,0.08)] disabled:opacity-60"
                >
                  {pokerBusyAction === "show" ? "Showing..." : "Show Cards"}
                </button>
              ) : null}
            </div>

            <div className="pointer-events-auto absolute bottom-4 right-4 flex flex-wrap items-center justify-end gap-2">
              {actions?.canCheck ? (
                <button
                  type="button"
                  onClick={() => onAct("check")}
                  disabled={pokerBusyAction === "action"}
                  className="rounded-full border border-[#dbe5ff] bg-white/92 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5d73b3] shadow-[0_10px_24px_rgba(20,86,244,0.08)] disabled:opacity-60"
                >
                  Check
                </button>
              ) : null}
              {actions?.canCall ? (
                <button
                  type="button"
                  onClick={() => onAct("call")}
                  disabled={pokerBusyAction === "action"}
                  className="rounded-full border border-[#1756f5] bg-[#1756f5] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow-[0_12px_24px_rgba(23,86,245,0.18)] disabled:opacity-60"
                >
                  Call {callAmount}
                </button>
              ) : null}
              {(actions?.canBet || actions?.canRaise) ? (
                <>
                  <input
                    type="number"
                    min={actions?.minRaise ?? 1}
                    step={1}
                    value={raiseAmount}
                    onChange={(event) => setRaiseAmount(event.target.value)}
                    className="h-10 w-24 rounded-full border border-[#dbe5ff] bg-white/92 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1f2430] outline-none shadow-[0_10px_24px_rgba(20,86,244,0.08)]"
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
                    className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow-[0_12px_24px_rgba(20,86,244,0.16)] disabled:opacity-60 ${
                      pokerState.currentBet === 0 ? "bg-[#f3b84f] text-[#4b2a00]" : "bg-[#39d353] text-[#10240d]"
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
                  className="rounded-full border border-[#ef9ca7] bg-[#f25f77] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow-[0_12px_24px_rgba(242,95,119,0.18)] disabled:opacity-60"
                >
                  Fold
                </button>
              ) : null}
              {showLeave ? (
                <button
                  type="button"
                  onClick={onLeave}
                  disabled={pokerBusyAction === "leave"}
                  className="rounded-full border border-[#ffd3d3] bg-white/92 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d45766] shadow-[0_10px_24px_rgba(20,86,244,0.08)] disabled:opacity-60"
                >
                  {pokerBusyAction === "leave" ? "Leaving..." : "Leave Table"}
                </button>
              ) : null}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col gap-4">
            <section className="rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(245,248,255,0.96)_100%)] p-5 shadow-[0_18px_56px_rgba(20,86,244,0.12)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
                You
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-[22px] border border-[#dbe5ff] bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-[#1f2430]">
                    {youSeat?.name ?? "Not seated"}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#7c869a]">
                    {youSeat ? `${youSeat.chips} chips` : "Waiting"}
                  </div>
                </div>
                {turnTimeLeft !== null && pokerState.currentPlayerIndex === pokerState.youSeatIndex ? (
                  <div className="rounded-[22px] border border-[#dbe5ff] bg-[#eef4ff] px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5d73b3]">
                      Your turn
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#1f2430]">
                      {turnTimeLeft}s
                    </div>
                  </div>
                ) : null}
                {!actions && youSeat ? (
                  <button
                    type="button"
                    onClick={() => onRebuy()}
                    disabled={pokerBusyAction === "rebuy"}
                    className="w-full rounded-full border border-[#dbe5ff] bg-white px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5d73b3] shadow-[0_10px_24px_rgba(20,86,244,0.08)] disabled:opacity-60"
                  >
                    {pokerBusyAction === "rebuy" ? "Rebuying..." : "Rebuy 100"}
                  </button>
                ) : null}
              </div>
            </section>

            <section className="min-h-0 flex-1 rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(245,248,255,0.96)_100%)] p-5 shadow-[0_18px_56px_rgba(20,86,244,0.12)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
                Table Log
              </p>
              <div className="mt-4 max-h-[320px] space-y-2 overflow-auto pr-1">
                {pokerState.log.map((entry) => (
                  <div key={entry.id} className="rounded-[20px] border border-[#dbe5ff] bg-white px-4 py-3 text-sm leading-6 text-[#445066]">
                    {entry.text}
                  </div>
                ))}
              </div>
            </section>

            {pokerError ? (
              <div className="rounded-[24px] border border-[#ffd4d4] bg-[#fff3f3] px-4 py-4 text-sm leading-6 text-[#b45151] shadow-[0_14px_32px_rgba(223,76,76,0.08)]">
                {pokerError}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
};
