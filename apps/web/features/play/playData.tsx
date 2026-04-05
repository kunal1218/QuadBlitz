"use client";

import type { PlayCharacterId } from "./types";

export const PLAY_CHARACTERS: Array<{
  id: PlayCharacterId;
  label: string;
  detail: string;
}> = [
  { id: "rook", label: "Chess Rook", detail: "Chunky tower" },
  { id: "penguin", label: "Penguin", detail: "Round little waddler" },
  { id: "businessman", label: "Businessman", detail: "Suit and briefcase" },
  { id: "dog", label: "Dog", detail: "Floppy-ear pup" },
  { id: "mug", label: "Mug", detail: "Steamy coffee cup" },
];

export const getCharacterLabel = (characterId: PlayCharacterId | null) =>
  PLAY_CHARACTERS.find((character) => character.id === characterId)?.label ?? "Unselected";

type CharacterAvatarProps = {
  characterId: PlayCharacterId;
  size?: number;
  className?: string;
};

const BODY_FILL = "#FFFFFF";
const SHADE_FILL = "#E9EEF5";
const OUTLINE = "#121212";
const FACE_FILL = "#D8EEF8";
const FACE_SHADE = "#90B3C7";
const FACE_HIGHLIGHT = "#FFFFFF";
const SHADOW = "#C9D0D7";
const ACCENT = "#F2B24B";
const ACCENT_DARK = "#2E4258";
const BLUSH = "#F6C5D0";

const Face = ({
  cx,
  cy,
  rx = 16,
  ry = 12,
}: {
  cx: number;
  cy: number;
  rx?: number;
  ry?: number;
}) => (
  <g>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={FACE_FILL} stroke={OUTLINE} strokeWidth="3.2" />
    <path
      d={`M${cx - rx * 0.55} ${cy - 2.5}c2.6-3.5 6.2-5.2 10.8-5.2h${Math.max(6, rx * 0.65)}c3.6 0 6.7 1 9.1 3.2`}
      fill="none"
      stroke={FACE_SHADE}
      strokeWidth="2.8"
      strokeLinecap="round"
    />
    <ellipse
      cx={cx - rx * 0.35}
      cy={cy - ry * 0.45}
      rx={rx * 0.42}
      ry={ry * 0.24}
      fill={FACE_HIGHLIGHT}
      opacity="0.95"
    />
  </g>
);

const SmileFace = ({ cx, cy }: { cx: number; cy: number }) => (
  <g>
    <circle cx={cx - 6} cy={cy - 1} r="2.3" fill={OUTLINE} />
    <circle cx={cx + 6} cy={cy - 1} r="2.3" fill={OUTLINE} />
    <path
      d={`M${cx - 6} ${cy + 5}c2.6 3.1 6.1 4.7 10.5 4.7 4.3 0 7.8-1.6 10.4-4.7`}
      fill="none"
      stroke={OUTLINE}
      strokeWidth="3"
      strokeLinecap="round"
    />
    <circle cx={cx - 12} cy={cy + 3} r="2.6" fill={BLUSH} opacity="0.7" />
    <circle cx={cx + 12} cy={cy + 3} r="2.6" fill={BLUSH} opacity="0.7" />
  </g>
);

const RookCharacter = () => (
  <>
    <ellipse cx="60" cy="109" rx="31" ry="8" fill={SHADOW} />
    <path
      d="M31 34h58v44c0 12.7-10.3 23-23 23H54c-12.7 0-23-10.3-23-23V34Z"
      fill={BODY_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path
      d="M28 23h12v11h10V23h10v11h10V23h12v18H28Z"
      fill={BODY_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <rect x="43" y="46" width="34" height="26" rx="12" fill={SHADE_FILL} stroke={OUTLINE} strokeWidth="3.2" />
    <Face cx={60} cy={59} rx={15} ry={10.5} />
    <rect x="38" y="95" width="16" height="12" rx="6" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" />
    <rect x="66" y="95" width="16" height="12" rx="6" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" />
  </>
);

const PenguinCharacter = () => (
  <>
    <ellipse cx="60" cy="109" rx="29" ry="8" fill={SHADOW} />
    <path
      d="M37 32c0-10.5 10.4-19 23-19s23 8.5 23 19v46c0 13.3-10.7 24-24 24H61c-13.3 0-24-10.7-24-24V32Z"
      fill={BODY_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path
      d="M34 50c-6 1-10 6.6-10 13.5 0 6.4 3.4 11.2 9 13.1l5-17.7Z"
      fill={SHADE_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path
      d="M86 50c6 1 10 6.6 10 13.5 0 6.4-3.4 11.2-9 13.1l-5-17.7Z"
      fill={SHADE_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <ellipse cx="60" cy="64" rx="18" ry="22" fill={SHADE_FILL} opacity="0.75" />
    <Face cx={60} cy={41} rx={16} ry={11} />
    <path
      d="M54 54h12l-6 8Z"
      fill={ACCENT}
      stroke={OUTLINE}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path d="M46 101h12l-4 7H42Z" fill={ACCENT} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M62 101h12l4 7H66Z" fill={ACCENT} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
  </>
);

const BusinessmanCharacter = () => (
  <>
    <ellipse cx="60" cy="109" rx="30" ry="8" fill={SHADOW} />
    <circle cx="59" cy="28" r="17" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" />
    <path
      d="M43 25c1-8 7.5-13 16-13 8.2 0 14.3 4.4 16 11.5-6-1.6-10.6-2.3-15.4-2.3-5 0-10.5 1.2-16.6 3.8Z"
      fill={ACCENT_DARK}
      stroke={OUTLINE}
      strokeWidth="3.4"
      strokeLinejoin="round"
    />
    <circle cx="53" cy="29" r="2.1" fill={OUTLINE} />
    <circle cx="65" cy="29" r="2.1" fill={OUTLINE} />
    <path
      d="M52 36c1.9 2.4 4.3 3.6 7.1 3.6 2.9 0 5.2-1.2 7.1-3.6"
      fill="none"
      stroke={OUTLINE}
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path
      d="M37 44h44l8 13v26c0 10.5-8.5 19-19 19H56c-10.5 0-19-8.5-19-19V57Z"
      fill={BODY_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path d="M49 44 60 58 71 44" fill={SHADE_FILL} stroke={OUTLINE} strokeWidth="3.2" strokeLinejoin="round" />
    <path d="M56 58h8l-4 20Z" fill="#5B7CFA" stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M33 65h12v24H33Z" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" strokeLinejoin="round" />
    <path d="M37 61h4" stroke={OUTLINE} strokeWidth="3.4" strokeLinecap="round" />
    <path d="M46 95h12v12H46Z" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" strokeLinejoin="round" />
    <path d="M62 95h12v12H62Z" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" strokeLinejoin="round" />
  </>
);

const DogCharacter = () => (
  <>
    <ellipse cx="60" cy="109" rx="31" ry="8" fill={SHADOW} />
    <path
      d="M39 40c0-13 9.8-22 22-22 11.7 0 21 8.6 21 22v19c0 11.6-9.4 21-21 21h-1c-11.6 0-21-9.4-21-21V40Z"
      fill={BODY_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path
      d="M37 31c-7 0-12 5.1-12 12 0 5.4 3.1 9.6 8 11.1l8-15.9C40 34 39 31 37 31Z"
      fill={SHADE_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path
      d="M83 31c7 0 12 5.1 12 12 0 5.4-3.1 9.6-8 11.1l-8-15.9c1-4.2 2-7.2 4-7.2Z"
      fill={SHADE_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <ellipse cx="60" cy="62" rx="16" ry="14" fill={SHADE_FILL} stroke={OUTLINE} strokeWidth="3.2" />
    <circle cx="54" cy="59" r="2.2" fill={OUTLINE} />
    <circle cx="66" cy="59" r="2.2" fill={OUTLINE} />
    <path d="M57 66c1.4 1.7 3 2.5 4.9 2.5 2 0 3.6-.8 5-2.5" fill="none" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" />
    <circle cx="60" cy="63.5" r="2.8" fill={OUTLINE} />
    <path
      d="M84 76c8 0 13 6.2 13 13.5"
      fill="none"
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path d="M45 95h13v12H45Z" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" strokeLinejoin="round" />
    <path d="M61 95h13v12H61Z" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" strokeLinejoin="round" />
  </>
);

const MugCharacter = () => (
  <>
    <ellipse cx="60" cy="109" rx="31" ry="8" fill={SHADOW} />
    <path
      d="M34 30h48v44c0 15-10.7 27-24 27s-24-12-24-27V30Z"
      fill={BODY_FILL}
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path
      d="M82 42h11c8 0 14 6.1 14 14s-6 14-14 14H82"
      fill="none"
      stroke={OUTLINE}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M46 17c0-7 8-7 8 0" fill="none" stroke={OUTLINE} strokeWidth="3.4" strokeLinecap="round" />
    <path d="M58 14c0-7 8-7 8 0" fill="none" stroke={OUTLINE} strokeWidth="3.4" strokeLinecap="round" />
    <path d="M70 17c0-7 8-7 8 0" fill="none" stroke={OUTLINE} strokeWidth="3.4" strokeLinecap="round" />
    <Face cx={58} cy={52} rx={16} ry={11} />
    <SmileFace cx={58} cy={72} />
    <rect x="44" y="95" width="12" height="12" rx="6" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" />
    <rect x="62" y="95" width="12" height="12" rx="6" fill={BODY_FILL} stroke={OUTLINE} strokeWidth="4" />
  </>
);

export const CharacterAvatar = ({
  characterId,
  size = 100,
  className,
}: CharacterAvatarProps) => {
  const renderCharacter = () => {
    switch (characterId) {
      case "rook":
        return <RookCharacter />;
      case "penguin":
        return <PenguinCharacter />;
      case "businessman":
        return <BusinessmanCharacter />;
      case "dog":
        return <DogCharacter />;
      case "mug":
        return <MugCharacter />;
      default:
        return null;
    }
  };

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderCharacter()}
    </svg>
  );
};
