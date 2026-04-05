export type RecencyFilter = "all" | "1h" | "24h" | "168h";
export type UrgencyFilter = "all" | "low" | "medium" | "high";
export type SortOption = "recency" | "likes" | "urgency";
export type ProximityFilter = "all" | "remote" | "local";

const sectionTitleClasses =
  "text-[10px] font-bold uppercase tracking-[0.28em] text-[#7687a3]";

const panelClasses =
  "rounded-[28px] border border-[#d9e4fb] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,249,255,0.94)_100%)] p-5 shadow-[0_20px_55px_rgba(39,78,162,0.08)]";

const urgencyOptions: Array<{
  label: string;
  value: Exclude<UrgencyFilter, "all">;
  dotClassName: string;
  activeClassName: string;
}> = [
  {
    label: "Urgent",
    value: "high",
    dotClassName: "bg-[#dc2f68]",
    activeClassName: "border-[#ffd5e4] bg-[#fff0f6] text-[#cb2960]",
  },
  {
    label: "Medium",
    value: "medium",
    dotClassName: "bg-[#1456f4]",
    activeClassName: "border-[#d7e4ff] bg-[#edf3ff] text-[#1456f4]",
  },
  {
    label: "Low",
    value: "low",
    dotClassName: "bg-[#d6dde9]",
    activeClassName: "border-[#eef2f8] bg-[#fafcff] text-[#7f8ba0]",
  },
];

const proximityOptions: Array<{
  label: string;
  value: ProximityFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Remote", value: "remote" },
  { label: "In-person", value: "local" },
];

const recencyOptions: Array<{ label: string; value: RecencyFilter }> = [
  { label: "Any time", value: "all" },
  { label: "Past hour", value: "1h" },
  { label: "Today", value: "24h" },
  { label: "This week", value: "168h" },
];

const sortOptions: Array<{ label: string; value: SortOption }> = [
  { label: "Recent", value: "recency" },
  { label: "Liked", value: "likes" },
  { label: "Urgency", value: "urgency" },
];

type RequestFiltersProps = {
  recency: RecencyFilter;
  onRecencyChange: (value: RecencyFilter) => void;
  urgency: UrgencyFilter;
  onUrgencyChange: (value: UrgencyFilter) => void;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
  proximity: ProximityFilter;
  onProximityChange: (value: ProximityFilter) => void;
  categories: string[];
  selectedCategory: string | null;
  onCategoryChange: (value: string | null) => void;
};

export const RequestFilters = ({
  recency,
  onRecencyChange,
  urgency,
  onUrgencyChange,
  sortBy,
  onSortChange,
  proximity,
  onProximityChange,
  categories,
  selectedCategory,
  onCategoryChange,
}: RequestFiltersProps) => {
  return (
    <aside className="space-y-4">
      <section className={panelClasses}>
        <div className="flex items-center justify-between gap-3">
          <p className={sectionTitleClasses}>Urgency Level</p>
          {urgency !== "all" && (
            <button
              type="button"
              className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7b8cab] transition hover:text-[#1456f4]"
              onClick={() => onUrgencyChange("all")}
            >
              Reset
            </button>
          )}
        </div>
        <div className="mt-4 space-y-3">
          {urgencyOptions.map((option) => {
            const active = urgency === option.value;

            return (
              <button
                key={option.value}
                type="button"
                className={`flex w-full items-center justify-between rounded-full border px-4 py-[11px] text-left text-[13px] font-semibold transition ${
                  active
                    ? option.activeClassName
                    : "border-[#ebf0fa] bg-white text-[#4f5d72] hover:border-[#d7e4ff] hover:text-[#1456f4]"
                }`}
                onClick={() => onUrgencyChange(active ? "all" : option.value)}
              >
                <span>{option.label}</span>
                <span className={`h-[7px] w-[7px] rounded-full ${option.dotClassName}`} />
              </button>
            );
          })}
        </div>
      </section>

      <section className={panelClasses}>
        <p className={sectionTitleClasses}>Proximity</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {proximityOptions.map((option) => {
            const active = proximity === option.value;

            return (
              <button
                key={option.value}
                type="button"
                className={`rounded-full px-3 py-[11px] text-[13px] font-semibold transition ${
                  active
                    ? "bg-[#1456f4] text-white shadow-[0_14px_28px_rgba(20,86,244,0.24)]"
                    : "border border-[#ebf0fa] bg-white text-[#627086] hover:border-[#d7e4ff] hover:text-[#1456f4]"
                }`}
                onClick={() => onProximityChange(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className={panelClasses}>
        <p className={sectionTitleClasses}>Categories</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full px-3 py-[9px] text-[11px] font-semibold transition ${
              selectedCategory === null
                ? "bg-[#1456f4] text-white shadow-[0_12px_24px_rgba(20,86,244,0.2)]"
                : "border border-[#e6ecf8] bg-white text-[#627086] hover:border-[#d7e4ff] hover:text-[#1456f4]"
            }`}
            onClick={() => onCategoryChange(null)}
          >
            All
          </button>
          {categories.map((category) => {
            const active = selectedCategory === category;

            return (
              <button
                key={category}
                type="button"
                className={`rounded-full px-3 py-[9px] text-[11px] font-semibold transition ${
                  active
                    ? "bg-[#edf3ff] text-[#1456f4]"
                    : "border border-[#e6ecf8] bg-white text-[#627086] hover:border-[#d7e4ff] hover:text-[#1456f4]"
                }`}
                onClick={() => onCategoryChange(active ? null : category)}
              >
                {category}
              </button>
            );
          })}
        </div>
      </section>

      <section className={panelClasses}>
        <p className={sectionTitleClasses}>Feed Settings</p>
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a0acc1]">
            Recency
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {recencyOptions.map((option) => {
              const active = recency === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-full px-3 py-[9px] text-[11px] font-semibold transition ${
                    active
                      ? "bg-[#edf3ff] text-[#1456f4]"
                      : "border border-[#e6ecf8] bg-white text-[#627086] hover:border-[#d7e4ff] hover:text-[#1456f4]"
                  }`}
                  onClick={() => onRecencyChange(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a0acc1]">
            Sort
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sortOptions.map((option) => {
              const active = sortBy === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-full px-3 py-[9px] text-[11px] font-semibold transition ${
                    active
                      ? "bg-[#edf3ff] text-[#1456f4]"
                      : "border border-[#e6ecf8] bg-white text-[#627086] hover:border-[#d7e4ff] hover:text-[#1456f4]"
                  }`}
                  onClick={() => onSortChange(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[32px] border border-[#d9e4fb] bg-[linear-gradient(180deg,rgba(232,240,255,0.92)_0%,rgba(244,247,255,0.98)_100%)] p-5 shadow-[0_20px_55px_rgba(39,78,162,0.09)]">
        <div className="rounded-[24px] bg-[radial-gradient(circle_at_top,rgba(20,86,244,0.16),transparent_68%)] px-4 py-6">
          <p className="max-w-[180px] text-[14px] font-semibold leading-[1.7] text-[#1456f4]">
            Feeling helpful? Active responders earn Nexus Credits toward campus
            merch.
          </p>
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 text-[12px] font-semibold text-[#1456f4] transition hover:text-[#0d43c6]"
          >
            Learn more
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </aside>
  );
};
