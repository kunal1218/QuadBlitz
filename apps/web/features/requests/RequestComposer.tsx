"use client";

import { useState } from "react";

export type RequestComposerPayload = {
  title: string;
  description: string;
  city: string | null;
  isRemote: boolean;
  urgency: "low" | "medium" | "high";
};

type RequestComposerProps = {
  onSubmit: (payload: RequestComposerPayload) => Promise<void> | void;
  isSaving?: boolean;
  disabled?: boolean;
};

const labelClasses =
  "text-[11px] font-bold uppercase tracking-[0.24em] text-[#7f8eab]";
const inputClasses =
  "w-full rounded-[22px] border border-[#d9e4fb] bg-white px-4 py-3 text-[14px] text-[#1d2432] placeholder:text-[#9aa6bb] focus:border-[#8fb0ff] focus:outline-none focus:ring-4 focus:ring-[#dce8ff]";

export const RequestComposer = ({
  onSubmit,
  isSaving = false,
  disabled = false,
}: RequestComposerProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<RequestComposerPayload["urgency"]>("low");
  const [city, setCity] = useState("");
  const [isRemote, setIsRemote] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    (isRemote || city.trim().length > 0) &&
    !isSaving &&
    !disabled;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!canSubmit) {
      setError("Add a title, description, and a city or mark it remote.");
      return;
    }

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        city: isRemote ? null : city.trim(),
        isRemote,
        urgency,
      });
      setTitle("");
      setDescription("");
      setUrgency("low");
      setCity("");
      setIsRemote(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post request.");
    }
  };

  const handleLocate = () => {
    if (disabled || isLocating) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation not available.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCity(`${latitude.toFixed(3)}, ${longitude.toFixed(3)}`);
        setIsLocating(false);
        setError(null);
      },
      (geoError) => {
        setIsLocating(false);
        setError(geoError.message || "Unable to detect location.");
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  };

  return (
    <form
      className="rounded-[34px] border border-[#d9e4fb] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,255,0.95)_100%)] p-6 shadow-[0_28px_70px_rgba(35,72,152,0.12)] sm:p-7"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#7f8eab]">
          New Request
        </p>
        <h3 className="text-[28px] font-[800] tracking-[-0.06em] text-[#1b2230]">
          Ask for help
        </h3>
        <p className="max-w-[540px] text-[14px] leading-[1.8] text-[#647187]">
          Share what you need, where it is happening, and how quickly someone should
          jump in.
        </p>
      </div>

      <div className="mt-6 space-y-5">
        <label className="block space-y-2">
          <span className={labelClasses}>Title</span>
          <input
            className={inputClasses}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Need a hand with..."
            disabled={disabled}
            required
          />
        </label>

        <label className="block space-y-2">
          <span className={labelClasses}>Description</span>
          <textarea
            className={`${inputClasses} min-h-[150px] resize-none`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Give a quick rundown so helpers know what they are stepping into."
            disabled={disabled}
            required
          />
        </label>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-2">
            <span className={labelClasses}>Location</span>
            <input
              className={inputClasses}
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="City, building, or area"
              disabled={disabled || isRemote}
              required={!isRemote}
            />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                className="rounded-full border border-[#d9e4fb] bg-white px-3 py-2 text-[11px] font-semibold text-[#627086] transition hover:border-[#c8d8fb] hover:text-[#1456f4] disabled:opacity-60"
                onClick={handleLocate}
                disabled={disabled || isRemote || isLocating}
              >
                {isLocating ? "Detecting..." : "Use my location"}
              </button>
              <label className="inline-flex items-center gap-2 rounded-full border border-[#d9e4fb] bg-white px-3 py-2 text-[11px] font-semibold text-[#627086]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[#cfd9ea] text-[#1456f4] focus:ring-[#b9ceff]"
                  checked={isRemote}
                  onChange={(event) => setIsRemote(event.target.checked)}
                  disabled={disabled}
                />
                Remote request
              </label>
            </div>
          </div>

          <label className="block space-y-2">
            <span className={labelClasses}>Urgency</span>
            <select
              className={`${inputClasses} appearance-none`}
              value={urgency}
              onChange={(event) =>
                setUrgency(event.target.value as RequestComposerPayload["urgency"])
              }
              disabled={disabled}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">Urgent</option>
            </select>
          </label>
        </div>

        {error && (
          <p className="rounded-[22px] border border-[#ffd5e0] bg-[#fff2f6] px-4 py-3 text-[13px] font-medium text-[#cc3d67]">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit || isSaving}
            className="rounded-full bg-[#1456f4] px-6 py-3 text-[13px] font-semibold text-white shadow-[0_18px_34px_rgba(20,86,244,0.26)] transition hover:bg-[#0e4bd9] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Posting..." : "Post Request"}
          </button>
        </div>
      </div>
    </form>
  );
};
