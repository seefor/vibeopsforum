import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db, firebaseConfigured } from "../lib/firebase";

const adminEmails = new Set(["sif@sifbaksh.com", "ptcapo@gmail.com"]);

type HostEvent = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  capacity: number;
  customQuestion: string;
  requireCompany: boolean;
  hostEmail?: string;
};

type Registration = {
  id: string;
  name: string;
  email: string;
  company?: string;
  role?: string;
  question?: string;
  createdAt?: unknown;
};

const initialEvent = {
  title: "VibeOps Builder Clinic",
  description: "A practical session for builders shipping agent workflows, demos, and live questions.",
  meetUrl: "https://meet.google.com/abc-defg-hij",
  startsAt: "2026-08-14T13:00",
  endsAt: "2026-08-14T14:00",
  timezone: "America/New_York",
  capacity: 40,
  requireCompany: false,
  customQuestion: "What do you want help with during the meeting?",
};

function formatForDisplay(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function escapeCalendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toUtcStamp(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function downloadFile(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildCalendarFile(event: HostEvent, meetUrl: string) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VibeOps Forum//Meeting Registration//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@vibeopsforum.com`,
    `DTSTAMP:${toUtcStamp(new Date().toISOString())}`,
    `DTSTART:${toUtcStamp(event.startsAt)}`,
    `DTEND:${toUtcStamp(event.endsAt)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `DESCRIPTION:${escapeCalendarText(`${event.description}\n\nJoin: ${meetUrl}`)}`,
    `LOCATION:${escapeCalendarText(meetUrl)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function buildCalendarUrl(event: HostEvent, meetUrl: string) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toUtcStamp(event.startsAt)}/${toUtcStamp(event.endsAt)}`,
    details: `${event.description}\n\nJoin: ${meetUrl}`,
    location: meetUrl,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toCsv(registrations: Registration[]) {
  const header = ["Name", "Email", "Company", "Role", "Question"];
  const rows = registrations.map((registration) => [
    registration.name,
    registration.email,
    registration.company ?? "",
    registration.role ?? "",
    registration.question ?? "",
  ]);

  return [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export default function MeetingRegistration() {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<HostEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [hostEvent, setHostEvent] = useState(initialEvent);
  const [attendee, setAttendee] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    question: "",
    consent: false,
  });
  const [joinUrl, setJoinUrl] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy Meet link");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? events[0],
    [events, selectedEventId],
  );
  const isAdmin = Boolean(user?.email && adminEmails.has(user.email));
  const seatsRemaining = selectedEvent ? Math.max(selectedEvent.capacity - registrations.length, 0) : 0;
  const calendarUrl = selectedEvent && joinUrl ? buildCalendarUrl(selectedEvent, joinUrl) : "";

  useEffect(() => {
    if (!auth || !db) return;

    const stopAuth = onAuthStateChanged(auth, setUser);
    const eventsQuery = query(collection(db, "meetingEvents"), orderBy("startsAt", "asc"));
    const stopEvents = onSnapshot(eventsQuery, (snapshot) => {
      const nextEvents = snapshot.docs.map((eventDoc) => ({
        id: eventDoc.id,
        ...(eventDoc.data() as Omit<HostEvent, "id">),
      }));
      setEvents(nextEvents);
      setSelectedEventId((current) => current || nextEvents[0]?.id || "");
    });

    return () => {
      stopAuth();
      stopEvents();
    };
  }, []);

  useEffect(() => {
    if (!db || !selectedEvent || !isAdmin) {
      setRegistrations([]);
      return;
    }

    return onSnapshot(collection(db, "meetingEvents", selectedEvent.id, "registrations"), (snapshot) => {
      setRegistrations(
        snapshot.docs.map((registrationDoc) => ({
          id: registrationDoc.id,
          ...(registrationDoc.data() as Omit<Registration, "id">),
        })),
      );
    });
  }, [selectedEvent, isAdmin]);

  async function signInHost() {
    if (!auth) return;

    setError("");
    if (auth.currentUser?.isAnonymous) {
      await signOut(auth);
    }

    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    if (!result.user.email || !adminEmails.has(result.user.email)) {
      await signOut(auth);
      setError("This Google account is not allowed to create host events.");
    }
  }

  async function createHostEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !user?.email || !isAdmin) return;

    setError("");
    setStatus("Creating event...");

    const createdEvent = await addDoc(collection(db, "meetingEvents"), {
      title: hostEvent.title.trim(),
      description: hostEvent.description.trim(),
      startsAt: hostEvent.startsAt,
      endsAt: hostEvent.endsAt,
      timezone: hostEvent.timezone.trim(),
      capacity: hostEvent.capacity,
      customQuestion: hostEvent.customQuestion.trim(),
      requireCompany: hostEvent.requireCompany,
      hostEmail: user.email,
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, "meetingEvents", createdEvent.id, "private", "join"), {
      meetUrl: hostEvent.meetUrl.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setSelectedEventId(createdEvent.id);
    setStatus("Host event created. Registrants can now sign up.");
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !db || !selectedEvent) return;

    const email = attendee.email.trim().toLowerCase();
    if (!attendee.name.trim() || !email) {
      setError("Name and email are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (selectedEvent.requireCompany && !attendee.company.trim()) {
      setError("Company is required for this meeting.");
      return;
    }
    if (!attendee.consent) {
      setError("Confirm that we can send meeting details to this email.");
      return;
    }

    setError("");
    setStatus("Registering...");

    const attendeeUser = auth.currentUser ?? (await signInAnonymously(auth)).user;
    await setDoc(doc(db, "meetingEvents", selectedEvent.id, "registrations", attendeeUser.uid), {
      name: attendee.name.trim(),
      email,
      company: attendee.company.trim(),
      role: attendee.role.trim(),
      question: attendee.question.trim(),
      createdAt: serverTimestamp(),
    });

    const joinSnapshot = await getDoc(doc(db, "meetingEvents", selectedEvent.id, "private", "join"));
    const nextJoinUrl = joinSnapshot.data()?.meetUrl;
    if (typeof nextJoinUrl !== "string") {
      setError("Registration was saved, but the private Meet link is missing.");
      return;
    }

    setJoinUrl(nextJoinUrl);
    setAttendee({ name: "", email: "", company: "", role: "", question: "", consent: false });
    setStatus("Registration confirmed.");
  }

  async function copyMeetLink() {
    await navigator.clipboard.writeText(joinUrl);
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy Meet link"), 1600);
  }

  if (!firebaseConfigured) {
    return (
      <div className="rounded-lg border border-[#f6ff6a]/30 bg-[#f6ff6a]/10 p-5 text-sm leading-6 text-[#fff7b0]">
        Firebase is not configured yet. Add the public Firebase web app values to `.env` using `.env.example`, then enable Google
        sign-in, anonymous sign-in, and Firestore for this project.
      </div>
    );
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[0.82fr_1.18fr]">
      <section className="glass rounded-lg p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mono text-xs uppercase text-[#38e8ff]">Host console</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Create host events</h2>
            <p className="mt-2 text-sm text-zinc-400">Only sif@sifbaksh.com and ptcapo@gmail.com can create meetings.</p>
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => auth && signOut(auth)}
              className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white transition hover:border-[#38e8ff]"
            >
              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={signInHost}
              className="rounded-md bg-[#ff2d9f] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_34px_rgba(255,45,159,0.38)] transition hover:bg-[#ff5fba]"
            >
              Admin sign in
            </button>
          )}
        </div>

        {isAdmin ? (
          <form className="mt-6 grid gap-4" onSubmit={createHostEvent}>
            <label className="grid gap-2 text-sm font-medium text-zinc-200">
              Meeting title
              <input
                className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#38e8ff]"
                value={hostEvent.title}
                onChange={(event) => setHostEvent((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-zinc-200">
              Private Google Meet link
              <input
                className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#38e8ff]"
                value={hostEvent.meetUrl}
                onChange={(event) => setHostEvent((current) => ({ ...current, meetUrl: event.target.value }))}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-zinc-200">
              Description
              <textarea
                className="min-h-24 rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#38e8ff]"
                value={hostEvent.description}
                onChange={(event) => setHostEvent((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-zinc-200">
                Starts
                <input
                  type="datetime-local"
                  className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#38e8ff]"
                  value={hostEvent.startsAt}
                  onChange={(event) => setHostEvent((current) => ({ ...current, startsAt: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-zinc-200">
                Ends
                <input
                  type="datetime-local"
                  className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#38e8ff]"
                  value={hostEvent.endsAt}
                  onChange={(event) => setHostEvent((current) => ({ ...current, endsAt: event.target.value }))}
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <label className="grid gap-2 text-sm font-medium text-zinc-200">
                Time zone
                <input
                  className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#38e8ff]"
                  value={hostEvent.timezone}
                  onChange={(event) => setHostEvent((current) => ({ ...current, timezone: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-zinc-200">
                Capacity
                <input
                  type="number"
                  min="1"
                  className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#38e8ff]"
                  value={hostEvent.capacity}
                  onChange={(event) => setHostEvent((current) => ({ ...current, capacity: Number(event.target.value) }))}
                />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-medium text-zinc-200">
              Custom question
              <input
                className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#38e8ff]"
                value={hostEvent.customQuestion}
                onChange={(event) => setHostEvent((current) => ({ ...current, customQuestion: event.target.value }))}
              />
            </label>
            <label className="flex items-center gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={hostEvent.requireCompany}
                onChange={(event) => setHostEvent((current) => ({ ...current, requireCompany: event.target.checked }))}
                className="h-4 w-4 accent-[#ff2d9f]"
              />
              Require company or organization
            </label>
            <button
              type="submit"
              className="rounded-md bg-[#ff2d9f] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_34px_rgba(255,45,159,0.38)] transition hover:bg-[#ff5fba]"
            >
              Create host event
            </button>
          </form>
        ) : (
          <div className="mt-6 rounded-lg border border-white/10 bg-white/6 p-4 text-sm leading-6 text-zinc-400">
            Sign in with an approved Google account to create host events. Attendees can register without creating a visible account.
          </div>
        )}
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0d0710]/86 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.34)] md:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.82fr]">
          <div>
            <p className="mono text-xs uppercase text-[#ff8ccd]">Registrant view</p>
            {events.length > 0 ? (
              <>
                <label className="mt-3 grid gap-2 text-sm font-medium text-zinc-200">
                  Choose a meeting
                  <select
                    className="rounded-md border border-white/10 bg-[#160b18] px-3 py-3 text-white outline-none transition focus:border-[#ff2d9f]"
                    value={selectedEvent?.id ?? ""}
                    onChange={(event) => {
                      setSelectedEventId(event.target.value);
                      setJoinUrl("");
                    }}
                  >
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedEvent && (
                  <>
                    <h2 className="mt-5 text-3xl font-semibold text-white">{selectedEvent.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">{selectedEvent.description}</p>

                    <dl className="mt-5 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
                      <div className="rounded-md border border-white/10 bg-white/6 p-3">
                        <dt className="mono text-xs uppercase text-zinc-500">Starts</dt>
                        <dd className="mt-1 text-white">{formatForDisplay(selectedEvent.startsAt, selectedEvent.timezone)}</dd>
                      </div>
                      <div className="rounded-md border border-white/10 bg-white/6 p-3">
                        <dt className="mono text-xs uppercase text-zinc-500">Access</dt>
                        <dd className="mt-1 text-white">Meet link after signup</dd>
                      </div>
                    </dl>

                    <form className="mt-6 grid gap-4" onSubmit={submitRegistration}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-zinc-200">
                          Name
                          <input
                            className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#ff2d9f]"
                            value={attendee.name}
                            onChange={(event) => setAttendee((current) => ({ ...current, name: event.target.value }))}
                          />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-zinc-200">
                          Email
                          <input
                            type="email"
                            className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#ff2d9f]"
                            value={attendee.email}
                            onChange={(event) => setAttendee((current) => ({ ...current, email: event.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-zinc-200">
                          Company{selectedEvent.requireCompany ? "" : " optional"}
                          <input
                            className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#ff2d9f]"
                            value={attendee.company}
                            onChange={(event) => setAttendee((current) => ({ ...current, company: event.target.value }))}
                          />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-zinc-200">
                          Role optional
                          <input
                            className="rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#ff2d9f]"
                            value={attendee.role}
                            onChange={(event) => setAttendee((current) => ({ ...current, role: event.target.value }))}
                          />
                        </label>
                      </div>
                      <label className="grid gap-2 text-sm font-medium text-zinc-200">
                        {selectedEvent.customQuestion}
                        <textarea
                          className="min-h-24 rounded-md border border-white/10 bg-white/8 px-3 py-3 text-white outline-none transition focus:border-[#ff2d9f]"
                          value={attendee.question}
                          onChange={(event) => setAttendee((current) => ({ ...current, question: event.target.value }))}
                        />
                      </label>
                      <label className="flex items-start gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-300">
                        <input
                          type="checkbox"
                          checked={attendee.consent}
                          onChange={(event) => setAttendee((current) => ({ ...current, consent: event.target.checked }))}
                          className="mt-1 h-4 w-4 accent-[#ff2d9f]"
                        />
                        Send me the meeting details and calendar information for this session.
                      </label>
                      <button
                        type="submit"
                        className="rounded-md bg-[#ff2d9f] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_34px_rgba(255,45,159,0.38)] transition hover:bg-[#ff5fba]"
                      >
                        Register and reveal link
                      </button>
                    </form>
                  </>
                )}
              </>
            ) : (
              <div className="mt-5 rounded-lg border border-white/10 bg-white/6 p-4 text-sm leading-6 text-zinc-400">
                No host events have been created yet.
              </div>
            )}
          </div>

          <aside className="grid content-start gap-4">
            {error && <p className="rounded-md border border-red-400/30 bg-red-500/12 px-3 py-2 text-sm text-red-100">{error}</p>}
            {status && <p className="rounded-md border border-[#38e8ff]/30 bg-[#38e8ff]/10 px-3 py-2 text-sm text-[#d8fbff]">{status}</p>}

            {joinUrl && selectedEvent ? (
              <div className="rounded-lg border border-[#38e8ff]/40 bg-[#38e8ff]/10 p-4">
                <p className="mono text-xs uppercase text-[#38e8ff]">Confirmed</p>
                <h3 className="mt-2 text-xl font-semibold text-white">You are registered.</h3>
                <p className="mt-3 break-all rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white">{joinUrl}</p>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={copyMeetLink}
                    className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#38e8ff]"
                  >
                    {copyLabel}
                  </button>
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white transition hover:border-[#f6ff6a]"
                  >
                    Add to Google Calendar
                  </a>
                  <button
                    type="button"
                    onClick={() => downloadFile("meeting-invite.ics", buildCalendarFile(selectedEvent, joinUrl), "text/calendar;charset=utf-8")}
                    className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#ff2d9f]"
                  >
                    Download calendar file
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/6 p-4">
                <p className="mono text-xs uppercase text-zinc-500">Locked until registration</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Meet link hidden</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  The public event document does not include the Meet URL. Firestore only exposes the private join document after registration.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-white/10 bg-white/6 p-4">
              <p className="mono text-xs uppercase text-zinc-500">Host roster</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p className="text-3xl font-semibold text-white">{isAdmin ? registrations.length : "-"}</p>
                  <p className="text-sm text-zinc-400">{isAdmin ? `${seatsRemaining} seats remaining` : "admin only"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadFile("meeting-registrations.csv", toCsv(registrations), "text/csv;charset=utf-8")}
                  disabled={!isAdmin || registrations.length === 0}
                  className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white transition hover:border-[#38e8ff] disabled:cursor-not-allowed disabled:text-zinc-600"
                >
                  Export CSV
                </button>
              </div>
              <div className="mt-4 max-h-72 overflow-auto">
                {isAdmin && registrations.length > 0 ? (
                  <ul className="divide-y divide-white/10">
                    {registrations.slice(0, 8).map((item) => (
                      <li key={item.id} className="py-3">
                        <p className="text-sm font-semibold text-white">{item.name}</p>
                        <p className="text-xs text-zinc-500">{item.email}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-6 text-zinc-500">Sign in as an admin to view registrations.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
