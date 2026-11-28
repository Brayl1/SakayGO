import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Send, Trash2 } from "lucide-react";
import type { Place, Trip } from "../shared/trip-types";
import FareCard from "./FareCard";
import "./kasakay.css";

type Choices = { token: string; origins: Place[]; destinations: Place[] };
type Answer = { text: string; source: string; choices?: Choices; trips?: Trip[]; origin?: Place; destination?: Place; passenger?: string; caveats?: string[]; transferNote?: string };
type Message = { role: "user" | "assistant"; text: string; answer?: Answer };
type RequestBody = { messages: { role: "user" | "assistant"; text: string }[]; choice?: { token: string; origin: number; destination: number } };
const greeting = "Maayong adlaw! Asa ka padulong? Tell me where you’re starting and where you want to go.";
const starters = ["Help me plan a trip", "How do I use the route planner?", "What fare information is available?"];

function ConfirmPlaces({ choices, disabled, onConfirm }: { choices: Choices; disabled: boolean; onConfirm: (origin: number, destination: number) => void }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  return <form className="kasakay-choices" onSubmit={(event) => { event.preventDefault(); onConfirm(Number(origin), Number(destination)); }}>
    <label>Starting place<select aria-label="Starting place" value={origin} disabled={disabled} onChange={(event) => setOrigin(event.target.value)} required>
      <option value="">Choose your starting place</option>
      {choices.origins.map((place, index) => <option key={index} value={index}>{place.label}</option>)}
    </select></label>
    <label>Destination<select aria-label="Destination" value={destination} disabled={disabled} onChange={(event) => setDestination(event.target.value)} required>
      <option value="">Choose your destination</option>
      {choices.destinations.map((place, index) => <option key={index} value={index}>{place.label}</option>)}
    </select></label>
    <small>Place search: Photon / OpenStreetMap contributors. Confirm the matching location; these are not verified stops.</small>
    <button className="primary" disabled={disabled || origin === "" || destination === ""}>Confirm places and find routes <ArrowRight size={16} /></button>
  </form>;
}
export default function KaSakay({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chosen, setChosen] = useState<{ origin: Place; destination: Place } | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<RequestBody | null>(null);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  async function request(body: RequestBody) {
    const seq = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    const timeout = setTimeout(() => controller.current?.abort(), 25000);
    setLoading(true); setError(""); setRetry(body); setNotice("");
    try {
      const response = await fetch("/api/kasakay", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.current.signal,
      });
      if (!response.ok) {
        const value = await response.json().catch(() => null);
        throw new Error(value?.error || "KaSakay AI is temporarily unavailable. The regular planner is still available.");
      }
      const answer: Answer = await response.json();
      if (!answer || typeof answer.text !== "string") throw new Error("KaSakay AI is temporarily unavailable. Please use the planner or retry.");
      if (seq !== generation.current) return;
      setMessages((current) => [...current, { role: "assistant", text: answer.text, answer }]);
      setRetry(null);
    } catch (cause) {
      if (seq === generation.current) setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "KaSakay AI is temporarily unavailable. Please retry or use the regular planner.");
    } finally {
      clearTimeout(timeout);
      if (seq === generation.current) { setLoading(false); if (input.current?.getClientRects().length) input.current.focus(); }
    }
  }
  function send(text: string, choice?: RequestBody["choice"]) {
    if (loading || !text.trim() || text.trim().length > 1000) return;
    const next: Message[] = [...messages, { role: "user", text: text.trim() }];
    const history = next.slice(-10).map(({ role, text }) => ({ role, text: text.slice(0, 1000) }));
    while (history.reduce((sum, message) => sum + message.text.length, 0) > 6000) history.shift();
    setMessages(next); setDraft("");
    void request({ messages: history, ...(choice ? { choice } : {}) });
  }
  function clear() {
    generation.current++; controller.current?.abort();
    setChosen(null); setMessages([]); setDraft(""); setError(""); setRetry(null); setLoading(false);
    setNotice("Conversation cleared."); input.current?.focus();
  }
  return <div className="kasakay-page">
    {!compact && <div className="kasakay-heading">
      <img src="/images/kasakay.png" alt="KaSakay, a friendly sage-green jeepney" width="128" height="120" />
      <div><span className="eyebrow">YOUR COMMUTE COMPANION</span><h1>Ask KaSakay</h1><p>A little help for your next sakay in Cagayan de Oro.</p></div>
    </div>}
    <div className="kasakay-layout">
      <section className="kasakay-chat" aria-label="KaSakay conversation">
        <div className="kasakay-toolbar"><span>English · Filipino · Cebuano</span><button onClick={clear}><Trash2 size={16} /> Clear conversation</button></div>
        <p className="kasakay-greeting">{greeting}</p>
        <div className="kasakay-starters">{starters.map((starter) => <button key={starter} disabled={loading} onClick={() => send(starter)}>{starter}<ArrowRight size={15} /></button>)}</div>
        <div className="kasakay-messages" role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions">
          {messages.map((message, index) => <article className={"kasakay-message " + message.role} key={index}>
            <small>{message.role === "user" ? "You" : message.answer?.source || "KaSakay"}</small>
            <p>{message.text}</p>
            {message.answer?.choices && <ConfirmPlaces choices={message.answer.choices} disabled={loading || index !== messages.length - 1}
              onConfirm={(origin, destination) => {
                const choices = message.answer!.choices!;
                setChosen({ origin: choices.origins[origin], destination: choices.destinations[destination] });
                send("Plan my trip from " + choices.origins[origin].label + " to " + choices.destinations[destination].label + ".", { token: choices.token, origin, destination });
              }} />}
            {message.answer?.trips && <div className="kasakay-results">
              {message.answer.trips.map((trip) => <section className="kasakay-route" key={trip.id}>
                <h2>{trip.legs.map((leg) => leg.codes.length ? leg.codes.join(" / ") : leg.label).join(" → ")}</h2>
                <p>{trip.transfers} transfer{trip.transfers === 1 ? "" : "s"} · {Math.round(trip.walkingMeters)} m walking · Approximate route</p>
                {trip.legs.map((leg, legIndex) => <p key={legIndex}><Link to={"/routes/" + encodeURIComponent(leg.routeId)}>{leg.label}</Link> · {leg.direction}{!leg.codes.length && " · Signboard code unverified"}</p>)}
                <FareCard breakdownId={"kasakay-fare-" + index + "-" + trip.id} trip={trip} passenger={message.answer?.passenger || "regular"} />
              </section>)}
              {message.answer.caveats?.map((caveat, i) => <p key={i} className="kasakay-caveat">{caveat}</p>)}
              {message.answer.transferNote && <p>{message.answer.transferNote}</p>}
              <Link className="primary" to="/planner" state={{ origin: message.answer.origin, destination: message.answer.destination, passenger: message.answer.passenger }}>Open these places in the planner <ArrowRight size={16} /></Link>
            </div>}
          </article>)}
        </div>
        <div role="status" className="kasakay-status">{loading ? "KaSakay is checking your request…" : notice}</div>
        {error && <div className="kasakay-error" role="alert"><strong>{error}</strong><p>These are regular SakayGo tools, not AI answers. You can use them below while AI is unavailable.</p>{retry && <button disabled={loading} onClick={() => void request(retry)}>Retry request</button>}</div>}
        <form className="kasakay-compose" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
          <label htmlFor="kasakay-message">Your message to KaSakay</label>
          <textarea ref={input} id="kasakay-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} rows={3}
            placeholder="Unsa akong sakyan gikan Centrio padulong Carmen Market?" required />
          <div><small>{draft.length}/1000</small><button className="primary" disabled={loading || !draft.trim()}><Send size={17} /> Send message</button></div>
        </form>
      </section>
      <aside className="kasakay-tools" aria-label="Regular SakayGo tools">
        <span className="eyebrow">ALWAYS ANOTHER WAY</span><h2>Your trip, your choice.</h2>
        <p>These SakayGo tools work independently of KaSakay AI.</p>
        <Link to="/planner" state={chosen}><strong>Guided trip planning</strong><span>Choose your start and destination on the map.</span><ArrowRight size={18} /></Link>
        <Link to="/explore"><strong>Route search</strong><span>Browse the existing route directory.</span><ArrowRight size={18} /></Link>
        <Link to="/fares"><strong>Fare guide</strong><span>Check what is verified, estimated, or unavailable.</span><ArrowRight size={18} /></Link>
        <p className="kasakay-caveat">AI understands your question. SakayGo supplies route and fare data. Routes are approximate; confirm service and fares with the driver.</p>
      </aside>
    </div>
  </div>;
}
