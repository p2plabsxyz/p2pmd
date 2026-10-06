# P2P Markdown

<div align="center">
    <img src="./demo.png" width="639" alt="Three synced devices (laptop, external monitor, and iPhone) running the PeerSky p2pmd editor showing shared markdown text ‘Hello from phone/Desktop/Laptop!’ and a dog photo inserted via IPFS.">
</div>

P2P Markdown is a real-time, peer-to-peer collaborative markdown editor built into [PeerSky Browser](https://github.com/p2plabsxyz/peersky-browser) on desktop and [PeerSky Mobile](https://github.com/p2plabsxyz/peersky-mobile) on iOS and Android, so a note can be edited from a laptop and a phone at the same time. How the phone side works is in [docs/p2pmd.md](https://github.com/p2plabsxyz/peersky-mobile/blob/main/docs/p2pmd.md). It connects peers directly using [Holesail](https://holesail.io/) keys, syncs edits live, and lets you publish or export your content without relying on centralized servers.

## What it does
- Real-time P2P collaboration over Holesail (direct, encrypted connections)
- Incremental CRDT document sync with Yjs (plus safe fallback sync path)
- Join or host rooms using `hs://` keys
- Local publishing to `hyper://` or `ipfs://`
- On `hyper://`, publish Public (anyone with the link) or Private (encrypted, so only your own linked devices can open it), as on the phone
- Optional HTTPS sharing for IPFS-published content via `dweb.link` URL mapping
- Presentation slides mode with speaker notes and navigation
- Drag-and-drop image upload to IPFS (auto-compressed, inserted as markdown)
- Draft storage using local Hyperdrive
- Content generation via local LLMs (with slides format support)
- Offline KaTeX math rendering for inline (`$...$`) and block (`$$...$$`) LaTeX notation
- Scientific writing templates (Research Paper with IEEE two-column preview/export, Technical Documentation)
- Export to HTML, PDF, or Slides, fully offline with no CDN dependencies (check [export examples](./examples))
- SSE keepalive + auto-reconnect for mobile/idle clients
- Peer visibility dashboard for connected peers, roles, live editing state, and edit history
- Colored cursor and line traces with hover name chips for collaborative context
- Your recent notes move with Link Device between PeerSky on your phone and desktop

## Features

### Slides Mode
Create presentations with markdown using `---` to separate slides:
```markdown
# Title Slide
Your opening content
<!-- Speaker notes: Introduce yourself and topic -->
---
# Key Points
- Point 1
- Point 2
<!-- Speaker notes: Elaborate on each point -->
```

**Navigation:**
- Arrow keys: `←` / `→` to navigate slides
- Click left/right half of screen to navigate
- Progress bar and slide counter at bottom
- Auto-detection: slides render automatically when `---` delimiters are present

**Features:**
- Speaker notes as HTML comments (hidden from slides, visible in markdown)
- Full-screen preview mode
- Export/publish as interactive HTML slides
- Footer with p2pmd and PeerSky branding

### Math & Scientific Writing

p2pmd supports offline LaTeX math rendering via [KaTeX](https://katex.org/), with no internet connection required.

**Enabling LaTeX mode:**
1. Click the **∞ (Infinity)** button in the toolbar to toggle LaTeX mode ON
2. The button turns **blue** when active (like slides mode)
3. Inline Math and Block Math buttons appear adjacent to the toggle
4. Research Paper and Technical Documentation options appear inline in the toolbar beside the ∞ mode toggle

**KaTeX syntax:**
- Inline math: `$E = mc^2$` renders as $E = mc^2$
- Block math:
  ```
  $$
  \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
  $$
  ```

**Templates:**

| Template | Description |
|----------|-------------|
| Research Paper | IEEE-style two-column paper with title, abstract, method, results, and references. Exports with A4 page, IEEE margins, two-column layout. |
| Technical Documentation | Implementation-focused template with API table, quick start, and throughput estimates. |

**IEEE export mode:**
When LaTeX mode is ON, the document contains a top marker `<!-- ieee -->`, and the Research Paper template is active, the live preview and exported HTML/PDF switch to IEEE-inspired formatting:
- A4 page with IEEE-standard margins (Top: 0.75in, Bottom: 1.0in, Left/Right: 0.625in)
- Two-column layout with 0.25in gap
- Structured title, author, and abstract front matter
- Times New Roman serif font at 10pt
- "made by p2pmd" footer at bottom right

**Offline exports:**
All exported HTML, PDF, and Slides inline KaTeX CSS and bundled font assets, so there are no CDN dependencies. Exported files render math correctly even without internet.

### Formatting Toolbar

![Formatting toolbar](./toolbar.png)

Quick formatting buttons with keyboard shortcuts:
- **Bold** (`Ctrl/Cmd+B`): `**text**`
- **Italic** (`Ctrl/Cmd+I`): `*text*`
- **Heading 1**: `# text`
- **Heading 2**: `## text`
- **Bullet List**: `- item`
- **Numbered List**: `1. item`
- **Link** (`Ctrl/Cmd+K`): `[text](url)`
- **Image**: `![alt](url)`
- **Inline Code**: `` `code` ``
- **Code Block**: ` ```language\ncode\n``` `
- **Quote**: `> text`
- **LaTeX Mode** (∞): Toggle the math/template toolbar; the icon turns blue when active
- **Inline Math**: `$expression$`
- **Block Math**: `$$expression$$`
- **Slides Mode**: Toggle presentation view

### Peers Dashboard

<img src="./peers-dashboard.png" width="500" alt="p2pmd peers dashboard showing connected peers and edit history">

- Peer count opens `./peers.html` with room context.
- Connected peers list with role badges (`host` / `client`) and live cursor status.
- "Currently Editing" panel for active typers.
- "Edit History" panel for join/leave/edit activity.

### In-Editor Visibility

<img src="./peers-visibility.png" width="500" alt="p2pmd editor showing host badge, peer count, and colored collaborative line traces">

- Host/client role badge next to the room key.
- Peer count with quick navigation to the peers dashboard.
- Colored cursor indicators for active collaborators.
- Persistent colored line traces with hover labels showing editor names.
- Fallback naming (`Peer #N`) for unnamed peers.

### Notes on your phone and desktop

PeerSky's Link Device brings your five most recent notes and your name along when you link your phone and desktop, in either direction. A note you host goes with its text; a note you joined goes as one to join.

A private note you host is then on both devices, and both open it the same way. If the other one has it open, you join it there, so both edit the same note live. If nobody does, after a few seconds of looking you host your own copy. Without a copy on that device (the text of the notes together has to fit in 3 MB), it says so rather than putting up an empty note.

That takes a private note (Private is ticked for every new note, and PeerSky Mobile only makes private ones): its key is what the host's keys are made from, so any device with the key hosts the same note. A note that is not private has the host's public key in its address, and only the device that made it can host it, so on your other device it is a note to join while this one has it open.

Only the key, the name and the text travel. A drive address, a port or a hosting seed belongs to the machine that made it, so none of them go, and nothing already on the other device is replaced. That code is in [`notes-transfer.js`](./notes-transfer.js), mirrored in PeerSky Mobile.

### Themes

<img src="./themes.png" width="639" alt="Different themes available in p2pmd">

## Security
P2PMD implements production-grade security measures:
- **Private by default**: Every new note is private. A private note's key is a secret its host's keys are made from, so the note's address on the DHT lets nobody in. A note made with Private unticked can be joined by anyone with its address, and the DHT nodes that store its announcement have it.
- **Sealed copies**: The desktop keeps its own copy of each note, its line authors and its draft on the `p2pmd-drafts` drive, never on the drive "Publish to hyper://" uses. Each one is sealed with AES-256-GCM under a key made from the note's key, and named by a hash of it ([`note-copies.js`](./note-copies.js)), so that drive's address alone gives away no note.
- **Encrypted Seeds**: Room keys encrypted at rest using Electron's `safeStorage` (OS-level keychain)
- **Rate Limiting**: DoS protection (5 room creations/min, 10 rehosts/min)
- **CORS Policy**: Protocol-level origin validation prevents external API access
- **Minimal Logging**: Sensitive data (keys, seeds) redacted from production logs
- **Modern API**: Uses Electron's `protocol.handle()` with native Request/Response objects

Before sealed copies, the desktop kept them in `rooms/` on the publish drive, each named after its note's key, so anyone with a link published from that drive could read every note and join the private ones. P2PMD now moves them to the drafts drive the first time it opens and deletes them there. A drive keeps its history, though, so whoever already has a link you published before can still read the copies written until then. Treat the notes from that time as shared with them, and start new ones for anything they should not see.

## How it works (high level)

One device hosts the note and everyone else joins it. All the editors, the host's included, talk to the same note server, so there is exactly one copy of the document everyone edits:

```mermaid
flowchart LR
  subgraph host["The device that hosts the note"]
    ED1["Editor"] <-->|"Yjs updates,<br>live events"| NS["Note server<br>one shared Yjs document"]
    NS --- HSS["Holesail server<br>keys made from the hs:// key"]
  end
  subgraph guest["Each person who joins"]
    ED2["Editor"] <-->|"the same calls,<br>to localhost"| HSC["Holesail client<br>a local proxy"]
  end
  HSS <==>|"encrypted tunnel over HyperDHT"| HSC
  ED1 -.->|"sealed copies"| DR[("p2pmd-drafts drive<br>on this device")]
  ED1 -.->|"Publish"| PUB[("hyper:// or ipfs://")]
```

On the host, the note server and the Holesail server run inside PeerSky (the main process on desktop, the Bare runtime on a phone). A guest's editor calls a `localhost` address that is really Holesail's end of the tunnel, so it never needs to know where the host is.

- The editor hosts a local HTTP session and syncs content using incremental Yjs CRDT updates (with a full-state fallback path when needed).
- On reconnect, CRDT state is merged so edits made during temporary disconnects are preserved.
- Hosting a private note again uses its key, so it comes back at its own address, with the draft, the copies and the line authors kept under it.
- Each edit goes to everyone as the change it made, never as the whole note. The people list (who is here, where their cursor is, who wrote which line) goes out a few times a second, and once a second at 100 people, with each person's line authors only when they change and in full to whoever joins. A note holds about 100 people this way: at 100 people with 10 typing, each device receives about 26 KB a second and the host sends about 2.5 MB a second. The host's upload is what limits a room.
- A note is live while its host has it open. Edits made in the meantime stay on each device and merge when it is back.
- Peer metadata (role, cursor, typing, and line hints) is shared via SSE + presence endpoints to power the peers page.
- Holesail creates a direct peer connection using a shared key.
- Publishing writes to Hyper/IPFS, making content shareable via P2P URLs.
- Drag an image onto the editor to upload it to IPFS. Images are compressed (resized to max 1920px, re-encoded at 0.8 quality) before upload. GIFs are uploaded as-is to preserve animation. The resulting markdown link uses a `dweb.link` gateway URL.

## Access 
### Desktop
Download [PeerSky Browser](https://peersky.p2plabs.xyz/) and open `peersky://p2p/p2pmd/` to access p2pmd.

### Mobile
[PeerSky Mobile](https://github.com/p2plabsxyz/peersky-mobile) has P2PMD built in at `peersky://p2p/p2pmd/`. It hosts and joins notes like the desktop does, and the same `hs://` key works across phones and desktops. Link Device brings your recent notes along between them.

Without PeerSky Mobile, you can still join a note from any phone:
1. Download the Holesail app ([iOS](https://apps.apple.com/us/app/holesail-go/id6503728841)/[Android](https://play.google.com/store/apps/details?id=io.holesail.holesail.go&hl=en_US&pli=1))
2. Enter the note's key (`hs://...`) in the app to connect as a client
3. Open the localhost URL it gives you (e.g., `http://127.0.0.1:8989`) in your phone's browser

## Build a similar P2P realtime app

### 1) Start a Holesail server
```js
import Holesail from "holesail";

const server = new Holesail({
  server: true,
  secure: true,
  port: 8989
});

await server.ready();
console.log("Share this key:", server.info.url);
```

To host the same note again later, pass its key. A private key (`hs://s000…`) is the secret the server's keys are hashed from, so the key alone brings the same note back:

```js
const again = new Holesail({ server: true, key: "hs://s000yourkeyhere", port: 8989 });
```

A public key (`hs://0000…`) is the server's public key and gives no seed, so keep `server.dht.seed` from the first run and set it on a server made without a key, before `ready()`. Never do that for a private key: Holesail then makes up a key of its own, and `info.url` names an address nobody can reach while the note is still served at its real one.

### 2) Connect a client
```js
import Holesail from "holesail";

const client = new Holesail({
  client: true,
  key: "hs://s000yourkeyhere"
});

await client.ready();
console.log("Connected:", client.info);
```

More: https://docs.holesail.io/

### 3) Sync realtime state
Use HTTP endpoints (GET/POST) plus SSE/WebSocket for live updates. In PeerSky, a custom [hs-handler](https://github.com/p2plabsxyz/peersky-browser/blob/main/src/protocols/hs-handler.js) can expose these endpoints while keeping the transport peer-to-peer. Incremental Yjs CRDT updates are exchanged over HTTP/SSE, while peer presence metadata is sent through presence endpoints.

With more than a few people, keep what goes out small. Send each change, not the whole state. Send presence, such as who is here and where their cursor is, on a timer a few times a second rather than on every keystroke. Send per-person data that rarely changes, such as who wrote which line, only when it changes, and in full to whoever joins.

### 4) Publish to Hyper
```js
async function publishToHyper(file) {
  const response = await fetch(`hyper://localhost/?key=myapp`, { 
    method: 'POST' 
  });
  const hyperdriveUrl = await response.text();
  
  const uploadUrl = `${hyperdriveUrl}${encodeURIComponent(file.name)}`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'text/html' }
  });
  
  if (uploadResponse.ok) {
    console.log('Published to:', uploadUrl);
    return uploadUrl;
  }
}
```

### 5) Publish to IPFS
```js
async function publishToIPFS(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('file', file, file.name);
  }
  
  const response = await fetch('ipfs://bafyaabakaieac/', {
    method: 'PUT',
    body: formData
  });
  
  if (response.ok) {
    const ipfsUrl = response.headers.get('Location');
    console.log('Published to:', ipfsUrl);
    return ipfsUrl;
  }
}
```

These examples show the core patterns used in p2pmd. You can adapt them to build your own P2P apps in PeerSky.

