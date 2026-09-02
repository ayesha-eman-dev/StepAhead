export const LOCATIONS = [
  "Remote",
  "Lahore",
  "Karachi",
  "Islamabad",
  "Ahmedabad",
  "Bengaluru",
  "Chennai",
  "Delhi",
  "Hyderabad",
  "Jaipur",
  "Kanpur",
  "Kolkata",
  "London",
  "Mumbai",
  "Pune",
  "Singapore",
  "United States (NASA centers)",
] as const;

export type Location = (typeof LOCATIONS)[number];
