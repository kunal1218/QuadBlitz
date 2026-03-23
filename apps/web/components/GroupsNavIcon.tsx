import type { SVGProps } from "react";

export const GroupsNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <circle cx="8" cy="4.35" r="2.05" fill="currentColor" />
    <circle cx="3.55" cy="5.2" r="1.7" fill="currentColor" opacity="0.82" />
    <circle cx="12.45" cy="5.2" r="1.7" fill="currentColor" opacity="0.82" />
    <path
      d="M5.18 10.05c0-1.45 1.26-2.63 2.82-2.63 1.56 0 2.82 1.18 2.82 2.63V12H5.18v-1.95Z"
      fill="currentColor"
    />
    <path
      d="M1.2 11.9c0-1.16.94-2.1 2.1-2.1.72 0 1.37.35 1.76.92-.45.43-.74 1.02-.82 1.68H1.2v-.5Z"
      fill="currentColor"
      opacity="0.82"
    />
    <path
      d="M11.76 12.4c-.08-.66-.37-1.25-.82-1.68.39-.57 1.04-.92 1.76-.92 1.16 0 2.1.94 2.1 2.1v.5h-3.04Z"
      fill="currentColor"
      opacity="0.82"
    />
  </svg>
);
