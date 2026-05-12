// utils/calendar.js (MOBILE VERSION)
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