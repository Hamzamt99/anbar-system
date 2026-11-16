export function addDepartureOffset(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "";
  const [hours, minutes] = value.split(":").map(Number);
  const total = (hours * 60 + minutes + 15) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
