export const SITE = {
  name: "VibeOps Forum",
  domain: "vibeopsforum.com",
  url: "https://vibeopsforum.com",
  description:
    "A builder community for AI-native development, agent operations, A2A protocol work, and MCP tooling.",
  slackUrl:
    "https://join.slack.com/t/vibeopsforum/shared_invite/zt-3pgetqklv-_F1SDrDVKEFinIRg9PlQ3Q",
};

export const navItems = [
  { href: "/about/", label: "About" },
  { href: "/events/", label: "Events" },
  { href: "/resources/", label: "Resources" },
  { href: "/projects/", label: "Projects" },
];

export const topics = [
  {
    label: "Vibecoding",
    href: "/resources/vibecoding/",
    kicker: "AI-assisted product work",
    description:
      "Patterns for planning, prompting, reviewing, and shipping software with coding agents.",
  },
  {
    label: "Agent Operations",
    href: "/resources/agent-operations/",
    kicker: "Autonomous workflows",
    description:
      "How teams run agents in production workflows with handoffs, guardrails, and review loops.",
  },
  {
    label: "A2A Protocol",
    href: "/resources/a2a-protocol/",
    kicker: "Agent interoperability",
    description:
      "Practical notes on agent discovery, messaging, delegation, and multi-agent systems.",
  },
  {
    label: "MCP Tooling",
    href: "/resources/mcp-tooling/",
    kicker: "Tools for model context",
    description:
      "Servers, clients, schemas, and security practices for connecting models to real systems.",
  },
];

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
