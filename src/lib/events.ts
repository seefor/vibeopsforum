import { getCollection, type CollectionEntry } from "astro:content";

export type EventEntry = CollectionEntry<"events">;

export async function getAllEvents(): Promise<EventEntry[]> {
  return (await getCollection("events")).sort(
    (a, b) => a.data.date.getTime() - b.data.date.getTime(),
  );
}

export function isUpcoming(event: EventEntry, now = new Date()): boolean {
  return event.data.date.getTime() >= now.getTime();
}

export function getUpcomingEvents(events: EventEntry[], limit?: number): EventEntry[] {
  const upcoming = events.filter((event) => isUpcoming(event));
  return limit ? upcoming.slice(0, limit) : upcoming;
}

export function getPastEvents(events: EventEntry[], limit?: number): EventEntry[] {
  const past = events
    .filter((event) => !isUpcoming(event))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  return limit ? past.slice(0, limit) : past;
}

export function eventToJsonLd(event: EventEntry, siteUrl: string) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.data.title,
    description: event.data.description,
    startDate: event.data.date.toISOString(),
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: isUpcoming(event)
      ? "https://schema.org/EventScheduled"
      : "https://schema.org/EventCompleted",
    location: {
      "@type": "VirtualLocation",
      name: event.data.location,
      url: event.data.url || siteUrl,
    },
  };

  if (event.data.endDate) {
    return { ...data, endDate: event.data.endDate.toISOString() };
  }

  return data;
}
