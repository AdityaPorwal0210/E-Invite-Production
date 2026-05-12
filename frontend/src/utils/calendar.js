// src/utils/calendar.js

export const generateGoogleCalendarLink = (event) => {
  const { title, description, location, eventDate } = event;
  const startDate = new Date(eventDate);
  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); 
  
  const formatDate = (date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.append("action", "TEMPLATE");
  url.searchParams.append("text", title || "Event Invitation");
  url.searchParams.append("dates", `${formatDate(startDate)}/${formatDate(endDate)}`);
  url.searchParams.append("details", description || "Join us for this event!");
  url.searchParams.append("location", location || "");

  return url.toString();
};

export const downloadICS = (event) => {
  const { title, description, location, eventDate } = event;
  const startDate = new Date(eventDate);
  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

  const formatDate = (date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART:${formatDate(startDate)}`,
    `DTEND:${formatDate(endDate)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description || ''}`,
    `LOCATION:${location || ''}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\n");

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = "event.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};