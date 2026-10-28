/**
 * Shared HTML email layout. Table-based with inline styles so it renders the
 * same in Gmail, Outlook and Apple Mail. Pure (no server-only import) so the
 * Supabase auth templates can be generated from the same code.
 */

export const EMAIL_SITE = "https://lastshot.app";

const C = {
  paper: "#f3f4f0",
  ink: "#16171a",
  body: "#1d1e21",
  cobalt: "#2546d8",
  flash: "#ffd23f",
  cream: "#f1ecdf",
  creamDim: "#b9b4a7",
  graphite: "#565962",
  line: "#dfe1da",
  stamp: "#ff8a2b",
};

const FONT = "'Archivo','Helvetica Neue',Helvetica,Arial,sans-serif";

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type EmailBlock =
  | { kind: "p"; html: string }
  | { kind: "counter"; value: string; label: string }
  | { kind: "code"; value: string }
  | { kind: "details"; rows: [string, string][] };

export type LayoutInput = {
  /** Inbox preview text. */
  preheader: string;
  /** Small label above the heading, e.g. the event name. Escaped HTML. */
  eyebrow?: string;
  /** Escaped HTML. */
  heading: string;
  blocks: EmailBlock[];
  button?: { label: string; url: string };
  /** Small print under the button. Escaped HTML. */
  note?: string;
  /** Small print under the card. Escaped HTML. */
  footer?: string;
  /** Dark card (guest emails) or light card (account and organiser emails). */
  theme?: "dark" | "light";
};

/** A row of film-strip sprocket holes. */
function filmStrip(bg: string, hole: string) {
  const cells = Array.from({ length: 14 })
    .map(
      () =>
        `<td align="center" style="padding:7px 0"><div style="width:16px;height:9px;border-radius:2px;background:${hole};font-size:0;line-height:0">&nbsp;</div></td>`,
    )
    .join("");
  return `<tr><td style="background:${bg};padding:0 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr>`;
}

function block(b: EmailBlock, dark: boolean) {
  const text = dark ? C.cream : C.ink;
  const muted = dark ? C.creamDim : C.graphite;
  switch (b.kind) {
    case "p":
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${text}">${b.html}</p>`;
    case "counter":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr>
<td style="background:#000000;border-radius:10px;padding:10px 16px;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;line-height:1;color:${C.stamp};letter-spacing:2px">${esc(b.value)}</td>
<td style="padding-left:14px;font-size:15px;line-height:1.35;color:${muted}">${b.label}</td>
</tr></table>`;
    case "code":
      return `<p style="margin:4px 0 22px"><span style="display:inline-block;background:${dark ? "#000000" : C.paper};border:1px solid ${dark ? "#33353a" : C.line};border-radius:10px;padding:12px 18px;font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:bold;letter-spacing:6px;color:${dark ? C.stamp : C.ink}">${esc(b.value)}</span></p>`;
    case "details":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${dark ? "#33353a" : C.line};border-radius:12px">${b.rows
        .map(
          ([k, v], i) =>
            `<tr><td style="padding:10px 14px;font-size:14px;color:${muted};${i ? `border-top:1px solid ${dark ? "#33353a" : C.line};` : ""}width:38%;vertical-align:top">${k}</td><td style="padding:10px 14px;font-size:14px;color:${text};${i ? `border-top:1px solid ${dark ? "#33353a" : C.line};` : ""}word-break:break-word">${v}</td></tr>`,
        )
        .join("")}</table>`;
  }
}

/** Bulletproof pill button. */
function button(label: string, url: string, dark: boolean) {
  const bg = dark ? C.flash : C.cobalt;
  const fg = dark ? C.body : "#ffffff";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px"><tr>
<td align="center" bgcolor="${bg}" style="border-radius:999px">
<a href="${url}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:16px;font-weight:bold;color:${fg};text-decoration:none;border-radius:999px">${label}&nbsp;&rarr;</a>
</td></tr></table>`;
}

export function renderEmail(input: LayoutInput) {
  const dark = input.theme === "dark";
  const card = dark ? C.body : "#ffffff";
  const text = dark ? C.cream : C.ink;
  const muted = dark ? C.creamDim : C.graphite;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${input.heading}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%}
  a{color:${C.cobalt}}
  @media (max-width:560px){ .px{padding-left:22px!important;padding-right:22px!important} .h1{font-size:28px!important} }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};font-family:${FONT};color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper}">${esc(input.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}">
<tr><td align="center" style="padding:28px 12px 36px">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:${card};border-radius:22px;overflow:hidden;${dark ? "" : `border:1px solid ${C.line};`}">
  <tr><td class="px" style="background:${C.cobalt};padding:18px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle"><img src="${EMAIL_SITE}/icon-192.png" width="34" height="34" alt="" style="display:block;border:0;border-radius:8px"></td>
      <td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff">lastshot</td>
    </tr></table>
  </td></tr>
  ${filmStrip(C.ink, "#3a3c42")}
  <tr><td class="px" style="padding:34px 32px 6px">
    ${input.eyebrow ? `<p style="margin:0 0 8px;font-size:13px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:${dark ? C.flash : C.cobalt}">${input.eyebrow}</p>` : ""}
    <h1 class="h1" style="margin:0 0 18px;font-family:${FONT};font-size:32px;line-height:1.08;font-weight:800;letter-spacing:-0.8px;color:${text}">${input.heading}</h1>
    ${input.blocks.map((b) => block(b, dark)).join("\n")}
  </td></tr>
  ${
    input.button || input.note
      ? `<tr><td class="px" style="padding:0 32px 34px">
    ${input.button ? button(input.button.label, input.button.url, dark) : ""}
    ${input.note ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.55;color:${muted}">${input.note}</p>` : ""}
  </td></tr>`
      : `<tr><td style="padding:0 0 18px"></td></tr>`
  }
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px">
  <tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:${C.graphite}">
    ${input.footer ? `${input.footer}<br><br>` : ""}
    <a href="${EMAIL_SITE}" style="color:${C.graphite};font-weight:bold;text-decoration:none">Lastshot</a> &middot; A disposable camera for every guest
  </td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}
