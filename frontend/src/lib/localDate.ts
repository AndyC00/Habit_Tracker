export function formatLocalISODate(localDate: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${localDate}T00:00:00`));
}

