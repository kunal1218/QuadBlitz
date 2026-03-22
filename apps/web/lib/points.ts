export const formatHeaderPoints = (value: number) => {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B PTS`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M PTS`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K PTS`;
  }
  return `${value} PTS`;
};
