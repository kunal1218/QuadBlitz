import { Suspense } from "react";
import { PlayRoomExperience } from "@/features/play/PlayRoomExperience";

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <PlayRoomExperience />
    </Suspense>
  );
}
