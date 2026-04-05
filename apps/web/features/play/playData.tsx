"use client";

import type { PlayCharacterId } from "./types";

export const PLAY_CHARACTERS: Array<{
  id: PlayCharacterId;
  label: string;
  detail: string;
}> = [
  { id: "rook", label: "Chess Rook", detail: "Tower cap" },
  { id: "penguin", label: "Penguin", detail: "Beak + bow tie" },
  { id: "businessman", label: "Businessman", detail: "Tie + briefcase" },
  { id: "dog", label: "Dog", detail: "Ear + tail" },
  { id: "mug", label: "Mug", detail: "Handle + steam" },
];

export const getCharacterLabel = (characterId: PlayCharacterId | null) =>
  PLAY_CHARACTERS.find((character) => character.id === characterId)?.label ?? "Unselected";

type CharacterAvatarProps = {
  characterId: PlayCharacterId;
  size?: number;
  className?: string;
};

const BODY_FILL = "#FFFFFF";
const BODY_SHADE = "#E9EEF5";
const OUTLINE = "#111111";
const VISOR_FILL = "#CFEAFD";
const VISOR_SHADE = "#8AAFC8";
const SHADOW = "#C4CBD3";

const Accessory = ({ characterId }: { characterId: PlayCharacterId }) => {
  switch (characterId) {
    case "rook":
      return (
        <>
          <path
            d="M34 16h8v8h6v-8h8v8h6v-8h8v12H34Z"
            fill={BODY_FILL}
            stroke={OUTLINE}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M38 56h28" stroke={OUTLINE} strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case "penguin":
      return (
        <>
          <path
            d="M38 66 46 60 54 66 46 72Z"
            fill={BODY_FILL}
            stroke={OUTLINE}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M43 76h6l3 6h-12Z"
            fill={BODY_FILL}
            stroke={OUTLINE}
            strokeWidth="4"
            strokeLinejoin="round"
          />
        </>
      );
    case "businessman":
      return (
        <>
          <path d="M46 56h10v26l-5-6-5 6Z" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" strokeLinejoin="round" />
          <path d="M26 76h12v12H26Z" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" strokeLinejoin="round" />
          <path d="M31 72v5" stroke={OUTLINE} strokeWidth="4" strokeLinecap="round" />
          <path d="M35 72v5" stroke={OUTLINE} strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case "dog":
      return (
        <>
          <path
            d="M24 30c0-8 7-14 15-14h2v22h-6c-6 0-11-4-11-8Z"
            fill={BODY_FILL}
            stroke={OUTLINE}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M77 74c8 0 13 6 13 13"
            fill="none"
            stroke={OUTLINE}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="44" cy="67" r="2.5" fill={OUTLINE} />
        </>
      );
    case "mug":
      return (
        <>
          <path
            d="M76 42h10c4 0 8 4 8 9v7c0 5-4 9-8 9H76"
            fill="none"
            stroke={OUTLINE}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M42 12c0-6 8-6 8 0" fill="none" stroke={OUTLINE} strokeWidth="4" strokeLinecap="round" />
          <path d="M54 10c0-6 8-6 8 0" fill="none" stroke={OUTLINE} strokeWidth="4" strokeLinecap="round" />
        </>
      );
    default:
      return null;
  }
};

export const CharacterAvatar = ({
  characterId,
  size = 100,
  className,
}: CharacterAvatarProps) => (
  <svg
    viewBox="0 0 110 120"
    width={size}
    height={size}
    aria-hidden="true"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <ellipse cx="54" cy="108" rx="34" ry="9" fill={SHADOW} />
    <rect
      x="28"
      y="22"
      width="46"
      height="58"
      rx="22"
      fill={BODY_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
    />
    <rect
      x="75"
      y="38"
      width="13"
      height="33"
      rx="6.5"
      fill={BODY_SHADE}
      stroke={OUTLINE}
      strokeWidth="4"
    />
    <rect
      x="34"
      y="74"
      width="15"
      height="28"
      rx="7"
      fill={BODY_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
    />
    <rect
      x="54"
      y="74"
      width="15"
      height="28"
      rx="7"
      fill={BODY_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
    />
    <path
      d="M30 51c0-10 8-18 18-18h15c9 0 15 5 15 13 0 10-8 18-18 18H45c-9 0-15-5-15-13Z"
      fill={VISOR_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path
      d="M37 46c2-5 6-7 11-7h11c4 0 7 1 10 4-4-1-8-1-12-1H47c-4 0-7 1-10 4Z"
      fill={VISOR_SHADE}
      opacity="0.8"
    />
    <path
      d="M40 40h13c3 0 5 1 6 3H43c-2 0-3-1-3-3Z"
      fill="#FFFFFF"
      opacity="0.95"
    />
    <Accessory characterId={characterId} />
  </svg>
);
